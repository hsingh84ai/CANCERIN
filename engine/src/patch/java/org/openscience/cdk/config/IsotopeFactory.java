package org.openscience.cdk.config;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

import org.openscience.cdk.interfaces.IAtom;
import org.openscience.cdk.interfaces.IAtomContainer;
import org.openscience.cdk.interfaces.IChemObjectBuilder;
import org.openscience.cdk.interfaces.IElement;
import org.openscience.cdk.interfaces.IIsotope;
import org.openscience.cdk.tools.periodictable.PeriodicTable;

/**
 * TeaVM-safe replacement for CDK 1.4.6's IsotopeFactory.
 *
 * The original parses isotopes.xml (809 KB) with SAX after picking a reader by
 * reflection. Reached in this build from CDK's 2D layout, which sorts fragments
 * by molecular weight.
 *
 * Only the MAJOR isotope of each element is carried, from GeneratedIsotopeData
 * — that is all the reachable code needs, and it avoids shipping the full
 * isotope list. Methods that genuinely require every isotope throw rather than
 * return a plausible-looking wrong answer.
 *
 * Part of the patched cdk-teavm jar; see tools/build-cdk-teavm.sh.
 */
public class IsotopeFactory {

    private static final Map<IChemObjectBuilder, IsotopeFactory> CACHE =
            new HashMap<IChemObjectBuilder, IsotopeFactory>();

    private static final class Entry {
        String symbol;
        int atomicNumber;
        Integer massNumber;
        Double exactMass;
        Double abundance;
        double naturalMass;
    }

    private final Map<String, Entry> bySymbol = new HashMap<String, Entry>();
    private final IChemObjectBuilder builder;

    private IsotopeFactory(IChemObjectBuilder builder) {
        this.builder = builder;
        for (String line : GeneratedIsotopeData.DATA) {
            String[] p = line.split(";", -1);
            Entry e = new Entry();
            e.symbol = p[0];
            e.atomicNumber = Integer.parseInt(p[1]);
            e.massNumber = p[2].length() == 0 ? null : Integer.valueOf(p[2]);
            e.exactMass = p[3].length() == 0 ? null : Double.valueOf(p[3]);
            e.abundance = p[4].length() == 0 ? null : Double.valueOf(p[4]);
            e.naturalMass = p[5].length() == 0 ? 0 : Double.parseDouble(p[5]);
            bySymbol.put(e.symbol, e);
        }
    }

    public static IsotopeFactory getInstance(IChemObjectBuilder builder) throws IOException {
        synchronized (CACHE) {
            IsotopeFactory f = CACHE.get(builder);
            if (f == null) {
                f = new IsotopeFactory(builder);
                CACHE.put(builder, f);
            }
            return f;
        }
    }

    public int getSize() {
        return bySymbol.size();
    }

    public boolean isElement(String symbol) {
        return bySymbol.containsKey(symbol);
    }

    public String getElementSymbol(int atomicNumber) {
        return PeriodicTable.getSymbol(atomicNumber);
    }

    public IIsotope getMajorIsotope(String symbol) {
        Entry e = bySymbol.get(symbol);
        if (e == null) return null;
        IIsotope iso = builder.newInstance(IIsotope.class, symbol);
        iso.setAtomicNumber(Integer.valueOf(e.atomicNumber));
        if (e.massNumber != null) iso.setMassNumber(e.massNumber);
        if (e.exactMass != null) iso.setExactMass(e.exactMass);
        if (e.abundance != null) iso.setNaturalAbundance(e.abundance);
        return iso;
    }

    public IIsotope getMajorIsotope(int atomicNumber) {
        String symbol = PeriodicTable.getSymbol(atomicNumber);
        return symbol == null ? null : getMajorIsotope(symbol);
    }

    public IElement getElement(String symbol) {
        Entry e = bySymbol.get(symbol);
        if (e == null) return null;
        IElement el = builder.newInstance(IElement.class, symbol);
        el.setAtomicNumber(Integer.valueOf(e.atomicNumber));
        return el;
    }

    public IElement getElement(int atomicNumber) {
        String symbol = PeriodicTable.getSymbol(atomicNumber);
        return symbol == null ? null : getElement(symbol);
    }

    public double getNaturalMass(IElement element) {
        if (element == null || element.getSymbol() == null) return 0;
        Entry e = bySymbol.get(element.getSymbol());
        return e == null ? 0 : e.naturalMass;
    }

    public IAtom configure(IAtom atom) {
        IIsotope iso = getMajorIsotope(atom.getSymbol());
        return iso == null ? atom : configure(atom, iso);
    }

    public IAtom configure(IAtom atom, IIsotope isotope) {
        atom.setMassNumber(isotope.getMassNumber());
        atom.setSymbol(isotope.getSymbol());
        atom.setExactMass(isotope.getExactMass());
        atom.setAtomicNumber(isotope.getAtomicNumber());
        atom.setNaturalAbundance(isotope.getNaturalAbundance());
        return atom;
    }

    public void configureAtoms(IAtomContainer container) {
        for (IAtom atom : container.atoms()) configure(atom);
    }

    // ---- deliberately unsupported ------------------------------------------
    // These need the full isotope list, which this build does not carry. They
    // are unreachable here; throwing keeps that assumption honest.

    public IIsotope[] getIsotopes(String symbol) {
        throw new UnsupportedOperationException(
                "the TeaVM build of CDK carries only major isotopes, not the full list for " + symbol);
    }

    public IIsotope getIsotope(String symbol, int massNumber) {
        throw new UnsupportedOperationException(
                "the TeaVM build of CDK carries only major isotopes, not " + symbol + "-" + massNumber);
    }
}
