package org.openscience.cdk.config;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.openscience.cdk.exception.CDKException;
import org.openscience.cdk.exception.NoSuchAtomTypeException;
import org.openscience.cdk.interfaces.IAtom;
import org.openscience.cdk.interfaces.IAtomType;
import org.openscience.cdk.interfaces.IChemObjectBuilder;

/**
 * TeaVM-safe replacement for CDK 1.4.6's AtomTypeFactory.
 *
 * The original selects a reader with ClassLoader.loadClass and parses XML/OWL
 * with SAX -- neither of which TeaVM supports. This serves the same atom types
 * from GeneratedAtomTypeData, which cancerin.build.GenerateTables produced by
 * running the real CDK and round-trip verifying all 264 entries.
 *
 * Public API is unchanged. Only cdk-atom-types.owl is supported, which is the
 * only table CDKAtomTypeMatcher and CDKHydrogenAdder ask for; any other
 * configuration file is rejected loudly rather than silently returning wrong
 * atom types.
 *
 * Part of the patched cdk-teavm jar; see tools/build-cdk-teavm.sh.
 */
public class AtomTypeFactory {

    public static final String ATOMTYPE_ID_STRUCTGEN = "structgen";
    public static final String ATOMTYPE_ID_MODELING = "modeling";
    public static final String ATOMTYPE_ID_JMOL = "jmol";

    private static final String SUPPORTED = "org/openscience/cdk/dict/data/cdk-atom-types.owl";
    private static final String LONE_PAIR = "cdk:Lone Pair Count";
    private static final String PI_BOND = "cdk:Pi Bond Count";

    private static final Map<IChemObjectBuilder, AtomTypeFactory> CACHE = new HashMap<IChemObjectBuilder, AtomTypeFactory>();

    private final Map<String, IAtomType> byName = new LinkedHashMap<String, IAtomType>();
    private final List<IAtomType> all = new ArrayList<IAtomType>();

    private AtomTypeFactory(IChemObjectBuilder builder) {
        for (String line : GeneratedAtomTypeData.DATA) {
            IAtomType t = decode(line, builder);
            byName.put(t.getAtomTypeName(), t);
            all.add(t);
        }
    }

    private static IAtomType decode(String line, IChemObjectBuilder builder) {
        String[] p = line.split(";", -1);
        IAtomType t = builder.newInstance(IAtomType.class, p[1]);
        t.setAtomTypeName(p[0]);
        if (p[2].length() > 0) t.setFormalCharge(Integer.valueOf(p[2]));
        if (p[3].length() > 0) t.setFormalNeighbourCount(Integer.valueOf(p[3]));
        if (p[4].length() > 0) t.setHybridization(IAtomType.Hybridization.valueOf(p[4]));
        if (p[5].length() > 0) t.setProperty(LONE_PAIR, Integer.valueOf(p[5]));
        if (p[6].length() > 0) t.setProperty(PI_BOND, Integer.valueOf(p[6]));
        return t;
    }

    public static AtomTypeFactory getInstance(IChemObjectBuilder builder) {
        return getInstance(SUPPORTED, builder);
    }

    public static AtomTypeFactory getInstance(String configFile, IChemObjectBuilder builder) {
        if (!SUPPORTED.equals(configFile)) {
            throw new IllegalArgumentException(
                    "the TeaVM build of CDK only carries " + SUPPORTED + ", not " + configFile);
        }
        synchronized (CACHE) {
            AtomTypeFactory f = CACHE.get(builder);
            if (f == null) {
                f = new AtomTypeFactory(builder);
                CACHE.put(builder, f);
            }
            return f;
        }
    }

    public static AtomTypeFactory getInstance(InputStream ins, String format, IChemObjectBuilder builder) {
        throw new UnsupportedOperationException(
                "the TeaVM build of CDK cannot read atom types from a stream");
    }

    public int getSize() {
        return all.size();
    }

    public IAtomType getAtomType(String identifier) throws NoSuchAtomTypeException {
        IAtomType t = byName.get(identifier);
        if (t == null) throw new NoSuchAtomTypeException("The AtomType " + identifier + " could not be found");
        return t;
    }

    public IAtomType[] getAtomTypes(String symbol) {
        List<IAtomType> hits = new ArrayList<IAtomType>();
        for (IAtomType t : all) if (symbol.equals(t.getSymbol())) hits.add(t);
        return hits.toArray(new IAtomType[hits.size()]);
    }

    public IAtomType[] getAllAtomTypes() {
        return all.toArray(new IAtomType[all.size()]);
    }

    public IAtom configure(IAtom atom) throws CDKException {
        if (atom.getAtomTypeName() == null) return atom;
        IAtomType t = getAtomType(atom.getAtomTypeName());
        atom.setSymbol(t.getSymbol());
        atom.setFormalCharge(t.getFormalCharge());
        atom.setHybridization(t.getHybridization());
        atom.setFormalNeighbourCount(t.getFormalNeighbourCount());
        Object lp = t.getProperty(LONE_PAIR);
        if (lp != null) atom.setProperty(LONE_PAIR, lp);
        Object pb = t.getProperty(PI_BOND);
        if (pb != null) atom.setProperty(PI_BOND, pb);
        return atom;
    }
}
