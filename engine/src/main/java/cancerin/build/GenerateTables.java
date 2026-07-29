package cancerin.build;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

import org.openscience.cdk.DefaultChemObjectBuilder;
import org.openscience.cdk.config.AtomTypeFactory;
import org.openscience.cdk.interfaces.IAtomType;
import org.openscience.cdk.interfaces.IChemObjectBuilder;

/**
 * Build-time only. Runs the REAL CDK (where SAX and reflection work) and
 * serialises the atom-type table into Java source, so the TeaVM build can serve
 * it without XML parsing or reflection.
 *
 * Discover.java established the full schema: 264 types, five populated fields
 * (symbol, atomTypeName, formalCharge, formalNeighbourCount, hybridization) and
 * two properties (lone pair count, pi bond count). No flags are ever set.
 *
 * The generator round-trips every type and fails the build on any difference,
 * so the table cannot silently drift from what CDK would have loaded.
 *
 * Usage: GenerateTables <outputDir>
 */
public final class GenerateTables {

    static final String OWL = "org/openscience/cdk/dict/data/cdk-atom-types.owl";
    static final String LONE_PAIR = "cdk:Lone Pair Count";
    static final String PI_BOND = "cdk:Pi Bond Count";

    public static void main(String[] args) throws Exception {
        Path outDir = Paths.get(args.length > 0 ? args[0] : "src/patch/java");
        IChemObjectBuilder builder = DefaultChemObjectBuilder.getInstance();
        AtomTypeFactory f = AtomTypeFactory.getInstance(OWL, builder);
        IAtomType[] types = f.getAllAtomTypes();

        List<String> lines = new ArrayList<>();
        for (IAtomType t : types) lines.add(encode(t));

        // Round-trip check: decoding must reproduce every field exactly.
        for (int i = 0; i < types.length; i++) {
            String again = encode(decode(lines.get(i), builder));
            if (!again.equals(lines.get(i))) {
                throw new IllegalStateException("round-trip mismatch for " + types[i].getAtomTypeName()
                        + "\n  encoded: " + lines.get(i) + "\n  decoded: " + again);
            }
        }
        System.out.println("round-trip verified for all " + types.length + " atom types");

        StringBuilder sb = new StringBuilder();
        sb.append("package org.openscience.cdk.config;\n\n")
          .append("/**\n")
          .append(" * Atom-type table for the TeaVM build, serialised from CDK's own\n")
          .append(" * ").append(OWL).append(" by cancerin.build.GenerateTables.\n")
          .append(" *\n")
          .append(" * Fields per line: name;symbol;formalCharge;formalNeighbourCount;hybridization;lonePairs;piBonds\n")
          .append(" *\n")
          .append(" * GENERATED -- do not edit.\n")
          .append(" */\n")
          .append("public final class GeneratedAtomTypeData {\n")
          .append("    private GeneratedAtomTypeData() {}\n\n")
          .append("    public static final String[] DATA = {\n");
        for (String l : lines) sb.append("        \"").append(l).append("\",\n");
        sb.append("    };\n}\n");

        Path out = outDir.resolve("org/openscience/cdk/config/GeneratedAtomTypeData.java");
        Files.createDirectories(out.getParent());
        Files.write(out, sb.toString().getBytes(StandardCharsets.UTF_8));
        System.out.println("wrote " + out + " (" + lines.size() + " atom types)");

        generatePeriodicTable(outDir);
        generateIsotopes(outDir);
    }

    /**
     * Major isotope per element, for the TeaVM IsotopeFactory.
     *
     * CDK's isotopes.xml is 809 KB and lists every isotope; the only reachable
     * use in this build is getMajorIsotope / getNaturalMass (CDK's layout code
     * sorts fragments by molecular weight), so only the major isotope of each
     * element is emitted. The replacement throws for the full-list methods
     * rather than answering them wrongly.
     */
    static void generateIsotopes(Path outDir) throws Exception {
        IChemObjectBuilder builder = DefaultChemObjectBuilder.getInstance();
        org.openscience.cdk.config.IsotopeFactory f =
                org.openscience.cdk.config.IsotopeFactory.getInstance(builder);

        int count = org.openscience.cdk.tools.periodictable.PeriodicTable.getElementCount();
        List<String> rows = new ArrayList<>();
        for (int z = 1; z <= count; z++) {
            String sym = org.openscience.cdk.tools.periodictable.PeriodicTable.getSymbol(z);
            if (sym == null) continue;
            org.openscience.cdk.interfaces.IIsotope iso = f.getMajorIsotope(sym);
            if (iso == null) continue;
            org.openscience.cdk.interfaces.IElement el = f.getElement(sym);
            double natural = el == null ? 0 : f.getNaturalMass(el);
            rows.add(String.join(";",
                    sym,
                    String.valueOf(z),
                    nz(iso.getMassNumber()),
                    nz(iso.getExactMass()),
                    nz(iso.getNaturalAbundance()),
                    String.valueOf(natural)));
        }

        StringBuilder sb = new StringBuilder();
        sb.append("package org.openscience.cdk.config;\n\n")
          .append("/**\n")
          .append(" * Major isotope per element, serialised from CDK's isotopes.xml by\n")
          .append(" * cancerin.build.GenerateTables.\n")
          .append(" *\n")
          .append(" * Fields: symbol;atomicNumber;massNumber;exactMass;naturalAbundance;naturalMass\n")
          .append(" *\n")
          .append(" * GENERATED -- do not edit.\n")
          .append(" */\n")
          .append("public final class GeneratedIsotopeData {\n")
          .append("    private GeneratedIsotopeData() {}\n\n")
          .append("    public static final String[] DATA = {\n");
        for (String r : rows) sb.append("        \"").append(r).append("\",\n");
        sb.append("    };\n}\n");

        Path out = outDir.resolve("org/openscience/cdk/config/GeneratedIsotopeData.java");
        Files.createDirectories(out.getParent());
        Files.write(out, sb.toString().getBytes(StandardCharsets.UTF_8));
        System.out.println("wrote " + out + " (" + rows.size() + " elements)");
    }

    /**
     * The periodic table is reached from every single atom creation:
     * new Atom(symbol) -> PeriodicTable.getAtomicNumber -> ElementPTFactory,
     * which parses elementdata.xml with SAX. Dump it the same way.
     */
    static void generatePeriodicTable(Path outDir) throws Exception {
        int count = org.openscience.cdk.tools.periodictable.PeriodicTable.getElementCount();
        List<String> rows = new ArrayList<>();
        for (int z = 1; z <= count; z++) {
            String sym = org.openscience.cdk.tools.periodictable.PeriodicTable.getSymbol(z);
            if (sym == null) continue;
            rows.add(String.join(";",
                    sym,
                    String.valueOf(z),
                    nz(org.openscience.cdk.tools.periodictable.PeriodicTable.getName(sym)),
                    nz(org.openscience.cdk.tools.periodictable.PeriodicTable.getCASId(sym)),
                    nz(org.openscience.cdk.tools.periodictable.PeriodicTable.getChemicalSeries(sym)),
                    nz(org.openscience.cdk.tools.periodictable.PeriodicTable.getGroup(sym)),
                    nz(org.openscience.cdk.tools.periodictable.PeriodicTable.getPeriod(sym)),
                    nz(org.openscience.cdk.tools.periodictable.PeriodicTable.getPhase(sym)),
                    nz(org.openscience.cdk.tools.periodictable.PeriodicTable.getVdwRadius(sym)),
                    nz(org.openscience.cdk.tools.periodictable.PeriodicTable.getCovalentRadius(sym)),
                    nz(org.openscience.cdk.tools.periodictable.PeriodicTable.getPaulingElectronegativity(sym))));
        }

        StringBuilder sb = new StringBuilder();
        sb.append("package org.openscience.cdk.tools.periodictable;\n\n")
          .append("/**\n")
          .append(" * Periodic table for the TeaVM build, serialised from CDK's own elementdata.xml\n")
          .append(" * by cancerin.build.GenerateTables.\n")
          .append(" *\n")
          .append(" * Fields: symbol;atomicNumber;name;casId;series;group;period;phase;vdwRadius;covalentRadius;electronegativity\n")
          .append(" *\n")
          .append(" * GENERATED -- do not edit.\n")
          .append(" */\n")
          .append("public final class GeneratedPeriodicTableData {\n")
          .append("    private GeneratedPeriodicTableData() {}\n\n")
          .append("    public static final int ELEMENT_COUNT = ").append(count).append(";\n\n")
          .append("    public static final String[] DATA = {\n");
        for (String r : rows) sb.append("        \"").append(r).append("\",\n");
        sb.append("    };\n}\n");

        Path out = outDir.resolve("org/openscience/cdk/tools/periodictable/GeneratedPeriodicTableData.java");
        Files.createDirectories(out.getParent());
        Files.write(out, sb.toString().getBytes(StandardCharsets.UTF_8));
        System.out.println("wrote " + out + " (" + rows.size() + " elements, ELEMENT_COUNT=" + count + ")");
    }

    static String encode(IAtomType t) {
        return String.join(";",
                nz(t.getAtomTypeName()),
                nz(t.getSymbol()),
                nz(t.getFormalCharge()),
                nz(t.getFormalNeighbourCount()),
                t.getHybridization() == null ? "" : t.getHybridization().name(),
                nz(t.getProperty(LONE_PAIR)),
                nz(t.getProperty(PI_BOND)));
    }

    /** Mirror of the runtime decoder in the patched AtomTypeFactory. */
    static IAtomType decode(String line, IChemObjectBuilder builder) {
        String[] p = line.split(";", -1);
        IAtomType t = builder.newInstance(IAtomType.class, p[1]);
        t.setAtomTypeName(p[0]);
        if (!p[2].isEmpty()) t.setFormalCharge(Integer.valueOf(p[2]));
        if (!p[3].isEmpty()) t.setFormalNeighbourCount(Integer.valueOf(p[3]));
        if (!p[4].isEmpty()) t.setHybridization(IAtomType.Hybridization.valueOf(p[4]));
        if (!p[5].isEmpty()) t.setProperty(LONE_PAIR, Integer.valueOf(p[5]));
        if (!p[6].isEmpty()) t.setProperty(PI_BOND, Integer.valueOf(p[6]));
        return t;
    }

    static String nz(Object o) { return o == null ? "" : String.valueOf(o); }
}
