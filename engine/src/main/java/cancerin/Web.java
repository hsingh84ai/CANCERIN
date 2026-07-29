package cancerin;

import org.teavm.jso.JSExport;

/**
 * Browser entry point. Compiled to JavaScript by TeaVM so the Svelte app can
 * compute fingerprints client-side with no server and no Java runtime.
 *
 * Returns the 108 bits as a "0"/"1" string in canonical order (ascending
 * imp-no), which is exactly the bit order of data/background.bin.
 * Returns null for a molecule that cannot be processed -- which is what PaDEL
 * does too (it writes an empty row, e.g. for Se compounds that CDK 1.4.6 has
 * no atom type for).
 */
public final class Web {

    private static final Fingerprint108.Options PATH_OPTS =
            new Fingerprint108.Options(false, false, false);
    private static final Fingerprint108.Options PUBCHEM_OPTS =
            new Fingerprint108.Options(true, false, false);

    private static String lastError;

    private Web() {}

    @JSExport
    public static String fingerprint(String smiles) {
        try {
            lastError = null;
            int[] bits = Fingerprint108.columns(smiles, Columns.PADEL, PATH_OPTS, PUBCHEM_OPTS);
            StringBuilder sb = new StringBuilder(bits.length);
            for (int b : bits) sb.append(b == 0 ? '0' : '1');
            return sb.toString();
        } catch (Throwable e) {
            lastError = e.getClass().getName() + ": " + e.getMessage();
            return null;
        }
    }

    /** Why the last fingerprint() call returned null. Null if it succeeded. */
    @JSExport
    public static String lastError() {
        return lastError;
    }

    /**
     * 2D coordinates for drawing the molecule, as JSON. Null if the structure
     * cannot be laid out; the reason is in lastError().
     */
    @JSExport
    public static String depict(String smiles) {
        try {
            lastError = null;
            return Depict.depict(smiles);
        } catch (Throwable e) {
            lastError = e.getClass().getName() + ": " + e.getMessage();
            return null;
        }
    }

    /** Diagnostic: TeaVM's java.util.Random vs the JDK's specified LCG. */
    @JSExport
    public static int rnd(int seed, int bound) {
        return new java.util.Random(seed).nextInt(bound);
    }

    /** Diagnostic: TeaVM's String.hashCode vs the JDK's. */
    @JSExport
    public static int strHash(String s) {
        return s.hashCode();
    }

    /**
     * Diagnostic: runs the pipeline up to a named stage and reports what
     * happened. Used by tools/verify-js-engine.mjs to localise failures that
     * only appear in the browser build.
     */
    @JSExport
    public static String stage(String smiles, String which) {
        try {
            org.openscience.cdk.interfaces.IAtomContainer mol =
                    Fingerprint108.prepare(smiles, "pubchem".equals(which) ? PUBCHEM_OPTS : PATH_OPTS);
            if ("prepare".equals(which)) return "ok atoms=" + mol.getAtomCount() + " bonds=" + mol.getBondCount();
            if ("fp".equals(which)) return "ok " + new org.openscience.cdk.fingerprint.Fingerprinter().getFingerprint(mol).cardinality();
            if ("ext".equals(which)) return "ok " + new org.openscience.cdk.fingerprint.ExtendedFingerprinter().getFingerprint(mol).cardinality();
            if ("graph".equals(which)) return "ok " + new org.openscience.cdk.fingerprint.GraphOnlyFingerprinter().getFingerprint(mol).cardinality();
            if ("maccs".equals(which)) return "ok " + new org.openscience.cdk.fingerprint.MACCSFingerprinter().getFingerprint(mol).cardinality();
            if ("pubchem".equals(which)) return "ok " + new libpadeldescriptor.PubchemFingerprinter().getFingerprint(mol).cardinality();
            return "unknown stage " + which;
        } catch (Throwable e) {
            return "FAIL " + e.getClass().getName() + ": " + e.getMessage();
        }
    }

    public static void main(String[] args) {
        // TeaVM requires an entry point; the exported method is the real API.
    }
}
