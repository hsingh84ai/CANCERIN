#!/usr/bin/env bash
# Builds a TeaVM-compatible copy of CDK 1.4.6.
#
# CDK loads its reference data using ClassLoader.loadClass and SAX XML parsing,
# neither of which TeaVM can compile. This overlays TeaVM-safe replacements from
# engine/src/patch/java onto a copy of the stock jar and installs the result as
# local.cancerin:cdk-teavm:1.4.6.
#
# The stock lib/cdk-1.4.6.jar is never modified. Regenerate the atom-type table
# first if CDK's data changes:
#   cd engine && mvn exec:java -Dexec.mainClass=cancerin.build.GenerateTables \
#                              -Dexec.args=src/patch/java
#
# Run: tools/build-cdk-teavm.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/engine/src/patch/java"
WORK="$ROOT/engine/target/cdk-teavm"
JAR="$ROOT/engine/target/cdk-teavm-1.4.6.jar"
STOCK="$ROOT/lib/cdk-1.4.6.jar"

echo "==> unpacking stock CDK"
rm -rf "$WORK" && mkdir -p "$WORK/classes" "$WORK/exploded"
unzip -qo "$STOCK" -d "$WORK/exploded"

echo "==> compiling replacement classes"
mapfile -t SOURCES < <(find "$SRC" -name '*.java')
printf '    %s\n' "${SOURCES[@]#$SRC/}"
javac -nowarn -source 8 -target 8 -cp "$STOCK" -d "$WORK/classes" "${SOURCES[@]}" 2>&1 \
  | grep -v "bootstrap class path\|source value 8\|target value 8\|deprecat" || true

echo "==> overlaying onto the stock tree"
REPLACED=0
while IFS= read -r cls; do
  rel="${cls#$WORK/classes/}"
  [ -f "$WORK/exploded/$rel" ] && REPLACED=$((REPLACED+1))
  mkdir -p "$(dirname "$WORK/exploded/$rel")"
  cp "$cls" "$WORK/exploded/$rel"
done < <(find "$WORK/classes" -name '*.class')
echo "    $REPLACED stock class file(s) replaced, $(find "$WORK/classes" -name '*.class' | wc -l) total written"

# CDK hashes each path string to a bit position with
# `new Random(hashCode).nextInt(size)`. TeaVM's java.util.Random is not
# bit-compatible with the JDK's, which silently corrupts FP/ExtFP/GraphFP.
# Redirect just the RNG; everything else in those classes is untouched.
echo "==> remapping java.util.Random -> JdkRandom in CDK fingerprint classes"
# Passed as a system property, not exec.args: the plugin splits exec.args on
# whitespace, and this repo is also reachable via a path containing spaces
# ("/mnt/c/Documents and Settings/..."), which silently truncated the path and
# skipped the remap entirely. No `|| true` here — a failure must stop the build.
(cd "$ROOT/engine" && mvn -q -B --no-transfer-progress exec:java \
    -Dexec.mainClass=cancerin.build.RemapRandom \
    -Dremap.dir="$WORK/exploded" -Dexec.classpathScope=compile 2>&1 \
  | grep -vE "^\[INFO\]|SLF4J|WARNING")

# Guard: a missing remap does not fail any JVM test — java.util.Random and
# JdkRandom behave identically there — but silently corrupts FP/ExtFP/GraphFP in
# the browser. Verify the substitution actually landed.
echo "==> verifying the remap"
FPC="$WORK/exploded/org/openscience/cdk/fingerprint/Fingerprinter.class"
if ! grep -qa "JdkRandom" "$FPC"; then
  echo "    FAILED: Fingerprinter.class does not reference JdkRandom" >&2
  exit 1
fi
if grep -qa "java/util/Random" "$FPC"; then
  echo "    FAILED: Fingerprinter.class still references java/util/Random" >&2
  exit 1
fi
echo "    ok — Fingerprinter uses JdkRandom"

echo "==> packaging"
(cd "$WORK/exploded" && jar cf "$JAR" .)
ls -lh "$JAR" | awk '{print "    "$9" ("$5")"}'

echo "==> installing as local.cancerin:cdk-teavm:1.4.6"
mvn -q -B --no-transfer-progress install:install-file \
    -Dfile="$JAR" -DgroupId=local.cancerin -DartifactId=cdk-teavm \
    -Dversion=1.4.6 -Dpackaging=jar
echo "done"
