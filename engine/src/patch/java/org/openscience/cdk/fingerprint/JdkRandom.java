package org.openscience.cdk.fingerprint;

/**
 * The JDK's java.util.Random LCG, exactly as specified.
 *
 * CDK's Fingerprinter maps each path string to a bit position with
 * `new Random(path.hashCode()).nextInt(size)`, so the fingerprint depends on
 * the RNG being bit-exact. TeaVM's java.util.Random is NOT bit-compatible with
 * the JDK -- for seeds 0, 1, 12345 the JDK gives 748, 748, 370 while TeaVM
 * gives 312, 402, 214 -- which silently corrupted FP, ExtFP and GraphFP while
 * leaving MACCSFP and PubchemFP (no RNG) correct.
 *
 * tools/build-cdk-teavm.sh rewrites references to java/util/Random inside CDK's
 * fingerprint classes to point here, changing the RNG and nothing else. The
 * signatures deliberately mirror java.util.Random so the remap is a pure owner
 * substitution.
 *
 * Verified against a real JVM; cancerin.Validate proves the patched classes
 * still reproduce PaDEL exactly.
 */
public class JdkRandom {

    private static final long MULTIPLIER = 0x5DEECE66DL;
    private static final long ADDEND = 0xBL;
    private static final long MASK = (1L << 48) - 1;

    private long seed;

    public JdkRandom(long seed) {
        this.seed = (seed ^ MULTIPLIER) & MASK;
    }

    protected int next(int bits) {
        seed = (seed * MULTIPLIER + ADDEND) & MASK;
        return (int) (seed >>> (48 - bits));
    }

    public int nextInt(int bound) {
        if (bound <= 0) throw new IllegalArgumentException("bound must be positive");
        if ((bound & -bound) == bound) {          // power of two: exact fast path
            return (int) ((bound * (long) next(31)) >> 31);
        }
        int bits, val;
        do {
            bits = next(31);
            val = bits % bound;
        } while (bits - val + (bound - 1) < 0);   // reject to keep the range uniform
        return val;
    }

    public int nextInt() {
        return next(32);
    }
}
