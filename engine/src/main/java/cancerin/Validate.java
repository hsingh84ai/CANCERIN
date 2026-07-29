package cancerin;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Checks this engine against PaDEL's own output, molecule by molecule and bit
 * by bit. Sweeps every combination of PaDEL's three preparation switches so the
 * defaults are established by evidence rather than guessed.
 *
 * Inputs (all already in the repo):
 *   imp-no               the 108 selected PaDEL columns, ascending
 *   data/probes.smi      SMILES + NSC id, one per line
 *   data/probes_out.csv  PaDEL's fingerprints for exactly those molecules
 *
 * Usage: Validate <repoRoot>
 */
public final class Validate {

    public static void main(String[] args) throws Exception {
        Path root = Paths.get(args.length > 0 ? args[0] : ".");

        int[] impNo = readImpNo(root.resolve("imp-no"));
        Map<String, String> smiles = readSmi(root.resolve("data/probes.smi"));
        Map<String, int[]> expected = readPadel(root.resolve("data/probes_out.csv"), impNo);

        List<String> names = new ArrayList<>(smiles.keySet());
        names.retainAll(expected.keySet());
        System.out.println("validating " + names.size() + " molecules x " + impNo.length + " columns\n");

        // Path blocks and PubchemFP are swept independently: 8 x 8.
        Fingerprint108.Options best = null, bestPub = null;
        int bestExact = -1, bestBad = Integer.MAX_VALUE;

        for (int mask = 0; mask < 8; mask++) {
            Fingerprint108.Options o = new Fingerprint108.Options(
                    (mask & 1) != 0, (mask & 2) != 0, (mask & 4) != 0);
            for (int pmask = 0; pmask < 8; pmask++) {
                Fingerprint108.Options po = new Fingerprint108.Options(
                        (pmask & 1) != 0, (pmask & 2) != 0, (pmask & 4) != 0);

                int exact = 0, totalBad = 0, agreedFailures = 0;
                for (String n : names) {
                    int[] want = expected.get(n);
                    int[] got;
                    try {
                        got = Fingerprint108.columns(smiles.get(n), impNo, o, po);
                    } catch (Exception e) {
                        // Agreeing that a molecule is unprocessable is a match.
                        if (want == null) { exact++; agreedFailures++; }
                        continue;
                    }
                    if (want == null) continue;   // PaDEL failed, we didn't -> not a match
                    int bad = 0;
                    for (int i = 0; i < want.length; i++) if (got[i] != want[i]) bad++;
                    if (bad == 0) exact++;
                    totalBad += bad;
                }
                if (exact > bestExact || (exact == bestExact && totalBad < bestBad)) {
                    bestExact = exact; bestBad = totalBad; best = o; bestPub = po;
                    System.out.printf("  path[%s]%n  pub [%s]%n    -> exact %2d/%d  wrong bits %4d%s%n%n",
                            o, po, exact, names.size(), totalBad,
                            agreedFailures > 0 ? "  (" + agreedFailures + " unprocessable in both)" : "");
                }
            }
        }

        System.out.println("best path: " + best);
        System.out.println("best pub : " + bestPub);
        System.out.println("  -> " + bestExact + "/" + names.size() + " molecules exact");
        final Fingerprint108.Options bp = bestPub;
        if (bestExact == names.size()) {
            System.out.println("ENGINE MATCHES PaDEL EXACTLY on every molecule.");
        } else {
            System.out.println("Mismatch remains — engine is not yet a faithful replacement.");
            // Show where the best option still disagrees, to guide the next step.
            for (String n : names) {
                int[] want = expected.get(n);
                try {
                    int[] got = Fingerprint108.columns(smiles.get(n), impNo, best, bp);
                    if (want == null) {
                        System.out.println("  NSC " + n + ": PaDEL failed but the engine succeeded");
                        continue;
                    }
                    List<Integer> bad = new ArrayList<>();
                    for (int i = 0; i < want.length; i++) if (got[i] != want[i]) bad.add(impNo[i]);
                    if (!bad.isEmpty()) System.out.println("  NSC " + n + ": " + bad.size() + " wrong, columns " + bad);
                } catch (Exception e) {
                    if (want != null) {
                        System.out.println("  NSC " + n + ": THREW " + e.getClass().getSimpleName() + ": " + e.getMessage()
                                + "  (PaDEL succeeded)");
                    }
                }
            }
        }
    }

    static String summarise(int[] v) {
        int set = 0;
        for (int x : v) set += x;
        return set + "/" + v.length + " bits set";
    }

    static int[] readImpNo(Path p) throws IOException {
        List<String> lines = Files.readAllLines(p);
        List<Integer> v = new ArrayList<>();
        for (String l : lines) if (!l.trim().isEmpty()) v.add(Integer.parseInt(l.trim()));
        int[] out = new int[v.size()];
        for (int i = 0; i < out.length; i++) out[i] = v.get(i);
        return out;
    }

    static Map<String, String> readSmi(Path p) throws IOException {
        Map<String, String> m = new HashMap<>();
        for (String l : Files.readAllLines(p)) {
            if (l.trim().isEmpty()) continue;
            String[] parts = l.split("\\s+");
            if (parts.length >= 2) m.put(parts[1], parts[0]);
        }
        return m;
    }

    /**
     * Reads PaDEL's CSV and keeps only the imp-no columns, in imp-no order.
     * A row of entirely empty cells means PaDEL itself failed on that molecule
     * (e.g. CDK 1.4.6 has no Se.2 atom type); such rows map to null, and the
     * engine is expected to fail on them too.
     */
    static Map<String, int[]> readPadel(Path p, int[] impNo) throws IOException {
        List<String> lines = Files.readAllLines(p);
        Map<String, int[]> m = new HashMap<>();
        for (int r = 1; r < lines.size(); r++) {
            String[] cells = lines.get(r).split(",", -1);
            String name = cells[0].replaceAll("^\"|\"$", "");
            boolean allEmpty = true;
            for (int i = 1; i < cells.length; i++) if (!cells[i].isEmpty()) { allEmpty = false; break; }
            if (allEmpty) { m.put(name, null); continue; }
            int[] v = new int[impNo.length];
            for (int i = 0; i < impNo.length; i++) {
                String s = cells[impNo[i]].replaceAll("^\"|\"$", "");
                v[i] = s.isEmpty() ? 0 : Integer.parseInt(s);
            }
            m.put(name, v);
        }
        return m;
    }
}
