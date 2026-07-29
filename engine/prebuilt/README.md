# Prebuilt engine

`cancerin-engine.js` is the fingerprint engine compiled to JavaScript by TeaVM,
committed so the web app can be built with **Node alone** — no JDK, no Maven and
no `lib/`.

Rebuild it (only needed if the Java engine changes):

```bash
tools/build-cdk-teavm.sh
cd engine && mvn -Ppatched,web package
cp target/js/cancerin-engine.js prebuilt/cancerin-engine.js
md5sum target/js/cancerin-engine.js | cut -d' ' -f1 > prebuilt/cancerin-engine.js.md5
```

Verify it against PaDEL's own output before committing a new one:

```bash
node tools/verify-js-engine.mjs      # expects 41/41
```

`.md5` records the build this file came from, so `webapp/scripts/sync-assets.mjs`
can warn when a locally built engine differs from the committed one.
