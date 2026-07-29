package cancerin.build;

import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.openscience.cdk.DefaultChemObjectBuilder;
import org.openscience.cdk.config.AtomTypeFactory;
import org.openscience.cdk.interfaces.IAtomType;
import org.openscience.cdk.interfaces.IChemObjectBuilder;

/**
 * Build-time only. Reports exactly which IAtomType fields and property keys the
 * CDK atom-type data actually populates, so the generated TeaVM table can be
 * proven complete rather than assumed so.
 */
public final class Discover {

    static final String OWL = "org/openscience/cdk/dict/data/cdk-atom-types.owl";

    public static void main(String[] args) throws Exception {
        IChemObjectBuilder builder = DefaultChemObjectBuilder.getInstance();
        AtomTypeFactory f = AtomTypeFactory.getInstance(OWL, builder);
        IAtomType[] types = f.getAllAtomTypes();
        System.out.println("atom types loaded: " + types.length);

        Set<String> nonNullFields = new LinkedHashSet<>();
        Set<String> propKeys = new TreeSet<>();
        Set<String> flagsSeen = new TreeSet<>();

        for (IAtomType t : types) {
            if (t.getSymbol() != null) nonNullFields.add("symbol");
            if (t.getAtomTypeName() != null) nonNullFields.add("atomTypeName");
            if (t.getAtomicNumber() != null) nonNullFields.add("atomicNumber");
            if (t.getFormalCharge() != null) nonNullFields.add("formalCharge");
            if (t.getFormalNeighbourCount() != null) nonNullFields.add("formalNeighbourCount");
            if (t.getHybridization() != null) nonNullFields.add("hybridization");
            if (t.getMaxBondOrder() != null) nonNullFields.add("maxBondOrder");
            if (t.getBondOrderSum() != null) nonNullFields.add("bondOrderSum");
            if (t.getValency() != null) nonNullFields.add("valency");
            if (t.getCovalentRadius() != null) nonNullFields.add("covalentRadius");
            if (t.getExactMass() != null) nonNullFields.add("exactMass");
            if (t.getMassNumber() != null) nonNullFields.add("massNumber");
            if (t.getNaturalAbundance() != null) nonNullFields.add("naturalAbundance");

            Map<Object, Object> props = t.getProperties();
            if (props != null) for (Object k : props.keySet()) propKeys.add(String.valueOf(k));

            if (t.getFlag(org.openscience.cdk.CDKConstants.IS_HYDROGENBOND_ACCEPTOR)) flagsSeen.add("IS_HYDROGENBOND_ACCEPTOR");
            if (t.getFlag(org.openscience.cdk.CDKConstants.IS_HYDROGENBOND_DONOR)) flagsSeen.add("IS_HYDROGENBOND_DONOR");
            if (t.getFlag(org.openscience.cdk.CDKConstants.ISAROMATIC)) flagsSeen.add("ISAROMATIC");
            if (t.getFlag(org.openscience.cdk.CDKConstants.ISALIPHATIC)) flagsSeen.add("ISALIPHATIC");
            if (t.getFlag(org.openscience.cdk.CDKConstants.ISINRING)) flagsSeen.add("ISINRING");
        }

        System.out.println("\npopulated fields: " + nonNullFields);
        System.out.println("property keys   : " + propKeys);
        System.out.println("flags set       : " + flagsSeen);

        IAtomType s = f.getAtomType("C.sp3");
        System.out.println("\nsample C.sp3:");
        System.out.println("  symbol=" + s.getSymbol() + " Z=" + s.getAtomicNumber()
                + " charge=" + s.getFormalCharge() + " nbrs=" + s.getFormalNeighbourCount()
                + " hyb=" + s.getHybridization() + " maxBO=" + s.getMaxBondOrder()
                + " boSum=" + s.getBondOrderSum() + " valency=" + s.getValency()
                + " props=" + s.getProperties());
    }
}
