package cancerin.build;

import java.io.IOException;
import java.nio.file.FileVisitResult;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.SimpleFileVisitor;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.List;

import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.commons.ClassRemapper;
import org.objectweb.asm.commons.Remapper;

/**
 * Build-time only. Rewrites references to java/util/Random inside CDK's
 * compiled fingerprint classes so they use org/openscience/cdk/fingerprint/
 * JdkRandom instead.
 *
 * Why bytecode surgery rather than a source patch: the RNG call lives inside
 * Fingerprinter.findPathes, which is protected and returns already-hashed bit
 * positions, so it cannot be intercepted by subclassing. Reimplementing the
 * path enumeration would risk changing fingerprints; remapping the RNG owner
 * changes the RNG and provably nothing else.
 *
 * JdkRandom's constructor and nextInt signatures mirror java.util.Random, so
 * this is a pure owner substitution.
 *
 * Usage: RemapRandom <explodedClassesDir>
 */
public final class RemapRandom {

    static final String FROM = "java/util/Random";
    static final String TO = "org/openscience/cdk/fingerprint/JdkRandom";

    public static void main(String[] args) throws Exception {
        // exec-maven-plugin splits -Dexec.args on whitespace, which silently
        // truncates a path containing spaces (this repo is also reachable via
        // "/mnt/c/Documents and Settings/..."). A system property is not split,
        // so prefer it.
        String dir = System.getProperty("remap.dir");
        if (dir == null || dir.isEmpty()) {
            if (args.length != 1) {
                throw new IllegalArgumentException(
                        "expected exactly one directory; got " + args.length
                        + " argument(s) — pass -Dremap.dir=<dir> if the path contains spaces");
            }
            dir = args[0];
        }
        Path root = Paths.get(dir);
        if (!Files.isDirectory(root)) throw new IllegalArgumentException("not a directory: " + root);
        final List<Path> targets = new ArrayList<>();

        Files.walkFileTree(root, new SimpleFileVisitor<Path>() {
            @Override public FileVisitResult visitFile(Path f, BasicFileAttributes a) throws IOException {
                String p = f.toString().replace('\\', '/');
                // Only CDK's fingerprint classes hash paths with an RNG; leaving
                // the rest of the jar untouched keeps the patch auditable.
                if (p.endsWith(".class") && p.contains("/org/openscience/cdk/fingerprint/")
                        && new String(Files.readAllBytes(f), "ISO-8859-1").contains(FROM)) {
                    targets.add(f);
                }
                return FileVisitResult.CONTINUE;
            }
        });

        if (targets.isEmpty()) {
            System.out.println("    no classes reference " + FROM + " -- nothing to remap");
            return;
        }

        Remapper remapper = new Remapper() {
            @Override public String map(String internalName) {
                return FROM.equals(internalName) ? TO : internalName;
            }
        };

        for (Path f : targets) {
            byte[] in = Files.readAllBytes(f);
            ClassReader cr = new ClassReader(in);
            ClassWriter cw = new ClassWriter(0);
            cr.accept(new ClassRemapper(cw, remapper), 0);
            Files.write(f, cw.toByteArray());
            System.out.println("    remapped " + root.relativize(f));
        }
        System.out.println("    " + targets.size() + " class(es) now use JdkRandom");
    }
}
