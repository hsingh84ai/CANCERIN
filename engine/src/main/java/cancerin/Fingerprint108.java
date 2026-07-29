package cancerin;

import java.util.BitSet;

import org.openscience.cdk.aromaticity.CDKHueckelAromaticityDetector;
import org.openscience.cdk.fingerprint.ExtendedFingerprinter;
import org.openscience.cdk.fingerprint.Fingerprinter;
import org.openscience.cdk.fingerprint.GraphOnlyFingerprinter;
import org.openscience.cdk.interfaces.IAtomContainer;
import org.openscience.cdk.CDKConstants;
import org.openscience.cdk.exception.CDKException;
import org.openscience.cdk.interfaces.IBond;
import org.openscience.cdk.interfaces.IRingSet;
import org.openscience.cdk.ringsearch.AllRingsFinder;
import org.openscience.cdk.smiles.SmilesParser;
import org.openscience.cdk.tools.CDKHydrogenAdder;
import org.openscience.cdk.tools.manipulator.AtomContainerManipulator;
import org.openscience.cdk.DefaultChemObjectBuilder;

/**
 * Computes the 108 CANCERIN fingerprint bits for a SMILES string.
 *
 * Mirrors PaDEL 2011's pipeline exactly (established by disassembling
 * libpadeldescriptor.libPaDELDescriptorWorker):
 *
 *   SmilesParser.parseSmiles
 *   -> AtomContainerManipulator.percieveAtomTypesAndConfigureAtoms
 *   -> CDKHydrogenAdder.addImplicitHydrogens
 *   -> [convertImplicitToExplicitHydrogens]      if addHydrogens
 *   -> [CDKHueckelAromaticityDetector.detectAromaticity]  if detectAromaticity
 *
 * Four of the five blocks use CDK's own fingerprinters; PubchemFP uses PaDEL's
 * reimplementation (libpadeldescriptor.PubchemFingerprinter), which is NOT the
 * same class as CDK's.
 *
 * PaDEL column layout (1-based, "Name" is column 0):
 *   FP        1-1024    ExtFP  1025-2048   EStateFP 2049-2127
 *   GraphFP   2128-3151 MACCSFP 3152-3317  PubchemFP 3318-4198
 * Column n of a block is bit n-1 of that block's BitSet.
 */
public final class Fingerprint108 {

    public static final int FP_START = 1, FP_END = 1024;
    public static final int EXT_START = 1025, EXT_END = 2048;
    public static final int GRAPH_START = 2128, GRAPH_END = 3151;
    public static final int MACCS_START = 3152, MACCS_END = 3317;
    public static final int PUBCHEM_START = 3318, PUBCHEM_END = 4198;

    /** PaDEL's molecule-preparation switches. */
    public static final class Options {
        public boolean preserveAromaticity;
        public boolean detectAromaticity;
        public boolean addHydrogens;

        public Options(boolean preserve, boolean detect, boolean addH) {
            this.preserveAromaticity = preserve;
            this.detectAromaticity = detect;
            this.addHydrogens = addH;
        }

        @Override public String toString() {
            return "preserveAromaticity=" + preserveAromaticity
                 + " detectAromaticity=" + detectAromaticity
                 + " addHydrogens=" + addHydrogens;
        }
    }

    private Fingerprint108() {}

    /**
     * The MACCS bits, computed only for the keys actually selected.
     *
     * CDK's MACCSFingerprinter loads maccs.txt with getResourceAsStream, which
     * returns null under TeaVM and NPEs. It is not needed: imp-no selects a
     * single MACCS column, 3276 = bit 124 = key 125 "Aromatic Ring > 1", and
     * that is one of the "?" keys CDK computes in code rather than by SMARTS.
     *
     * The logic below mirrors CDK 1.4.6's MACCSFingerprinter.getFingerprint:
     * all rings via AllRingsFinder, count those whose bonds are all flagged
     * aromatic, set the bit when more than one. Verified by cancerin.Validate
     * against PaDEL's own output.
     *
     * Any other MACCS bit throws rather than silently returning 0 -- if the
     * column selection ever changes, this must be revisited.
     */
    private static BitSet maccsBits(IAtomContainer mol, int[] padelColumns) throws Exception {
        BitSet bits = new BitSet(MACCS_END - MACCS_START + 1);
        for (int c : padelColumns) {
            if (c < MACCS_START || c > MACCS_END) continue;
            int bit = c - MACCS_START;
            if (bit != 124) {
                throw new UnsupportedOperationException(
                        "MACCS bit " + bit + " (PaDEL column " + c + ") is not implemented; "
                        + "only key 125 / bit 124 is needed by imp-no");
            }
            bits.set(bit, aromaticRingCountAboveOne(mol));
        }
        return bits;
    }

    private static boolean aromaticRingCountAboveOne(IAtomContainer mol) throws CDKException {
        IRingSet rings = new AllRingsFinder().findAllRings(mol);
        int aromatic = 0;
        for (IAtomContainer ring : rings.atomContainers()) {
            boolean allAromatic = true;
            for (IBond bond : ring.bonds()) {
                if (!bond.getFlag(CDKConstants.ISAROMATIC)) { allAromatic = false; break; }
            }
            if (allAromatic && ++aromatic > 1) return true;
        }
        return false;
    }

    public static IAtomContainer prepare(String smiles, Options o) throws Exception {
        SmilesParser sp = new SmilesParser(DefaultChemObjectBuilder.getInstance());
        sp.setPreservingAromaticity(o.preserveAromaticity);
        IAtomContainer mol = sp.parseSmiles(smiles);

        AtomContainerManipulator.percieveAtomTypesAndConfigureAtoms(mol);
        CDKHydrogenAdder.getInstance(mol.getBuilder()).addImplicitHydrogens(mol);
        if (o.addHydrogens) {
            AtomContainerManipulator.convertImplicitToExplicitHydrogens(mol);
        }
        if (o.detectAromaticity) {
            CDKHueckelAromaticityDetector.detectAromaticity(mol);
        }
        return mol;
    }

    /**
     * Returns the value of each requested PaDEL column, in the order given.
     * Blocks are computed lazily so an unused fingerprinter is never run.
     */
    public static int[] columns(String smiles, int[] padelColumns, Options o) throws Exception {
        return columns(smiles, padelColumns, o, o);
    }

    /**
     * PubchemFP needs different molecule preparation from the path-based blocks:
     * the CACTVS ring and neighbourhood rules assume explicit hydrogens and
     * perceived aromaticity, whereas explicit hydrogens change every hashed path
     * and destroy FP/ExtFP/GraphFP. So the two are prepared independently.
     */
    public static int[] columns(String smiles, int[] padelColumns, Options o, Options pubchemOpts) throws Exception {
        IAtomContainer mol = prepare(smiles, o);

        BitSet fp = null, ext = null, graph = null, maccs = null, pubchem = null;
        boolean needFp = false, needExt = false, needGraph = false, needMaccs = false, needPub = false;
        for (int c : padelColumns) {
            if (c >= FP_START && c <= FP_END) needFp = true;
            else if (c >= EXT_START && c <= EXT_END) needExt = true;
            else if (c >= GRAPH_START && c <= GRAPH_END) needGraph = true;
            else if (c >= MACCS_START && c <= MACCS_END) needMaccs = true;
            else if (c >= PUBCHEM_START && c <= PUBCHEM_END) needPub = true;
            else throw new IllegalArgumentException("column " + c + " is outside the five supported blocks");
        }

        if (needFp) fp = new Fingerprinter().getFingerprint(mol);
        if (needExt) ext = new ExtendedFingerprinter().getFingerprint(mol);
        if (needGraph) graph = new GraphOnlyFingerprinter().getFingerprint(mol);
        if (needMaccs) maccs = maccsBits(mol, padelColumns);
        if (needPub) {
            IAtomContainer pmol = (pubchemOpts == o) ? mol : prepare(smiles, pubchemOpts);
            pubchem = new libpadeldescriptor.PubchemFingerprinter().getFingerprint(pmol);
        }

        int[] out = new int[padelColumns.length];
        for (int i = 0; i < padelColumns.length; i++) {
            int c = padelColumns[i];
            boolean v;
            if (c <= FP_END) v = fp.get(c - FP_START);
            else if (c <= EXT_END) v = ext.get(c - EXT_START);
            else if (c <= GRAPH_END) v = graph.get(c - GRAPH_START);
            else if (c <= MACCS_END) v = maccs.get(c - MACCS_START);
            else v = pubchem.get(c - PUBCHEM_START);
            out[i] = v ? 1 : 0;
        }
        return out;
    }
}
