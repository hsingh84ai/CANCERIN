package org.openscience.cdk.tools.periodictable;

import java.util.HashMap;
import java.util.Map;

/**
 * TeaVM-safe replacement for CDK 1.4.6's PeriodicTable.
 *
 * The original lazily builds itself from elementdata.xml through
 * ElementPTFactory -> ElementPTReader, using SAX and ClassLoader.loadClass.
 * That path is reached by EVERY atom creation (new Atom(symbol) calls
 * getAtomicNumber), so it must go for the browser build.
 *
 * Data comes from GeneratedPeriodicTableData, dumped from the real CDK by
 * cancerin.build.GenerateTables. Public API and null-return behaviour for
 * unknown symbols are unchanged.
 *
 * Part of the patched cdk-teavm jar; see tools/build-cdk-teavm.sh.
 */
public class PeriodicTable {

    private static final Map<String, Element> BY_SYMBOL = new HashMap<String, Element>();
    private static final Map<Integer, String> BY_NUMBER = new HashMap<Integer, String>();

    private static final class Element {
        String symbol, name, casId, series, phase;
        Integer number, group, period;
        Double vdwRadius, covalentRadius, electronegativity;
    }

    static {
        for (String line : GeneratedPeriodicTableData.DATA) {
            String[] p = line.split(";", -1);
            Element e = new Element();
            e.symbol = p[0];
            e.number = iv(p[1]);
            e.name = sv(p[2]);
            e.casId = sv(p[3]);
            e.series = sv(p[4]);
            e.group = iv(p[5]);
            e.period = iv(p[6]);
            e.phase = sv(p[7]);
            e.vdwRadius = dv(p[8]);
            e.covalentRadius = dv(p[9]);
            e.electronegativity = dv(p[10]);
            BY_SYMBOL.put(e.symbol, e);
            if (e.number != null) BY_NUMBER.put(e.number, e.symbol);
        }
    }

    private static String sv(String s) { return s.length() == 0 ? null : s; }
    private static Integer iv(String s) { return s.length() == 0 ? null : Integer.valueOf(s); }
    private static Double dv(String s) { return s.length() == 0 ? null : Double.valueOf(s); }

    private static Element get(String symbol) {
        return symbol == null ? null : BY_SYMBOL.get(symbol);
    }

    public static Double getVdwRadius(String symbol) {
        Element e = get(symbol); return e == null ? null : e.vdwRadius;
    }

    public static Double getCovalentRadius(String symbol) {
        Element e = get(symbol); return e == null ? null : e.covalentRadius;
    }

    public static String getCASId(String symbol) {
        Element e = get(symbol); return e == null ? null : e.casId;
    }

    public static String getChemicalSeries(String symbol) {
        Element e = get(symbol); return e == null ? null : e.series;
    }

    public static Integer getGroup(String symbol) {
        Element e = get(symbol); return e == null ? null : e.group;
    }

    public static String getName(String symbol) {
        Element e = get(symbol); return e == null ? null : e.name;
    }

    public static Integer getPeriod(String symbol) {
        Element e = get(symbol); return e == null ? null : e.period;
    }

    public static String getPhase(String symbol) {
        Element e = get(symbol); return e == null ? null : e.phase;
    }

    public static Integer getAtomicNumber(String symbol) {
        Element e = get(symbol); return e == null ? null : e.number;
    }

    public static Double getPaulingElectronegativity(String symbol) {
        Element e = get(symbol); return e == null ? null : e.electronegativity;
    }

    public static String getSymbol(int atomicNumber) {
        return BY_NUMBER.get(Integer.valueOf(atomicNumber));
    }

    public static int getElementCount() {
        return GeneratedPeriodicTableData.ELEMENT_COUNT;
    }
}
