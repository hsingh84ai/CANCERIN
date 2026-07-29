package cancerin;

import org.openscience.cdk.CDKConstants;
import org.openscience.cdk.DefaultChemObjectBuilder;
import org.openscience.cdk.aromaticity.CDKHueckelAromaticityDetector;
import org.openscience.cdk.graph.ConnectivityChecker;
import org.openscience.cdk.interfaces.IAtom;
import org.openscience.cdk.interfaces.IAtomContainer;
import org.openscience.cdk.interfaces.IBond;
import org.openscience.cdk.interfaces.IMolecule;
import org.openscience.cdk.interfaces.IMoleculeSet;
import org.openscience.cdk.layout.StructureDiagramGenerator;
import org.openscience.cdk.smiles.SmilesParser;
import org.openscience.cdk.tools.CDKHydrogenAdder;
import org.openscience.cdk.tools.manipulator.AtomContainerManipulator;

import javax.vecmath.Point2d;

/**
 * 2D coordinates for drawing a molecule, from CDK's own layout engine.
 *
 * Using CDK rather than a separate JavaScript depiction library means the
 * picture is generated from the same parse of the same SMILES that was scored,
 * so it cannot disagree with the result beside it.
 *
 * Returns compact JSON; the SVG is drawn in Svelte:
 *   {"atoms":[{"s":"O","x":1.5,"y":-0.9,"c":-1,"h":0}, ...],
 *    "bonds":[{"a":0,"b":1,"o":2,"r":true}, ...]}
 *   s symbol, c formal charge (omitted when 0), h implicit hydrogens,
 *   o bond order, r aromatic.
 *
 * This is depiction only and deliberately separate from Fingerprint108 — it
 * perceives aromaticity (so rings can be drawn as such), which the scoring
 * path must NOT do. Nothing here can affect a score.
 */
public final class Depict {

    private Depict() {}

    public static String depict(String smiles) throws Exception {
        SmilesParser sp = new SmilesParser(DefaultChemObjectBuilder.getInstance());
        sp.setPreservingAromaticity(false);
        IAtomContainer mol = sp.parseSmiles(smiles);

        AtomContainerManipulator.percieveAtomTypesAndConfigureAtoms(mol);
        CDKHydrogenAdder.getInstance(mol.getBuilder()).addImplicitHydrogens(mol);
        try {
            CDKHueckelAromaticityDetector.detectAromaticity(mol);
        } catch (Exception ignored) {
            // Aromatic rings will just be drawn as alternating bonds.
        }

        // Salts and mixtures are common in this dataset and CDK lays out one
        // connected fragment at a time, so place fragments side by side.
        IMoleculeSet parts = ConnectivityChecker.partitionIntoMolecules(mol);
        double xOffset = 0;
        StringBuilder atoms = new StringBuilder();
        StringBuilder bonds = new StringBuilder();
        int atomBase = 0;

        for (int p = 0; p < parts.getMoleculeCount(); p++) {
            IMolecule part = parts.getMolecule(p);
            StructureDiagramGenerator sdg = new StructureDiagramGenerator();
            sdg.setUseTemplates(false);   // templates load a classpath resource TeaVM cannot read
            sdg.setMolecule(part, false);
            sdg.generateCoordinates();
            IMolecule laid = sdg.getMolecule();

            double minX = Double.MAX_VALUE, maxX = -Double.MAX_VALUE;
            for (IAtom a : laid.atoms()) {
                Point2d pt = a.getPoint2d();
                if (pt == null) continue;
                minX = Math.min(minX, pt.x);
                maxX = Math.max(maxX, pt.x);
            }
            if (minX == Double.MAX_VALUE) { minX = 0; maxX = 0; }
            double shift = xOffset - minX;

            for (int i = 0; i < laid.getAtomCount(); i++) {
                IAtom a = laid.getAtom(i);
                Point2d pt = a.getPoint2d();
                if (atoms.length() > 0) atoms.append(',');
                atoms.append("{\"s\":\"").append(a.getSymbol()).append('"')
                     .append(",\"x\":").append(round(pt == null ? 0 : pt.x + shift))
                     .append(",\"y\":").append(round(pt == null ? 0 : pt.y));
                Integer charge = a.getFormalCharge();
                if (charge != null && charge != 0) atoms.append(",\"c\":").append(charge.intValue());
                Integer h = a.getImplicitHydrogenCount();
                if (h != null && h != 0) atoms.append(",\"h\":").append(h.intValue());
                atoms.append('}');
            }

            for (IBond b : laid.bonds()) {
                int a1 = laid.getAtomNumber(b.getAtom(0));
                int a2 = laid.getAtomNumber(b.getAtom(1));
                if (a1 < 0 || a2 < 0) continue;
                if (bonds.length() > 0) bonds.append(',');
                bonds.append("{\"a\":").append(atomBase + a1)
                     .append(",\"b\":").append(atomBase + a2)
                     .append(",\"o\":").append(orderOf(b));
                if (b.getFlag(CDKConstants.ISAROMATIC)) bonds.append(",\"r\":true");
                bonds.append('}');
            }

            atomBase += laid.getAtomCount();
            xOffset = shift + maxX + 2.0;   // gap between fragments
        }

        return "{\"atoms\":[" + atoms + "],\"bonds\":[" + bonds + "]}";
    }

    private static int orderOf(IBond b) {
        IBond.Order o = b.getOrder();
        if (o == IBond.Order.DOUBLE) return 2;
        if (o == IBond.Order.TRIPLE) return 3;
        if (o == IBond.Order.QUADRUPLE) return 4;
        return 1;
    }

    /** Two decimals is ample for a drawing and keeps the payload small. */
    private static String round(double v) {
        long scaled = Math.round(v * 100.0);
        return String.valueOf(scaled / 100.0);
    }
}
