# Reproducing the browser review

This is a disposable Linux review runtime. The source, scripts and committed evidence are the checkpoint; `/tmp` paths are not backups.

1. Install project dependencies using its lockfile. Install the temporary browser package separately: `npm install --prefix /tmp/hanzi-browser @sparticuz/chromium@153.0.0`.
2. The package's normal extractor attempts ownership changes that this runtime rejects. Decompress the four `.br` files from `/tmp/hanzi-browser/node_modules/@sparticuz/chromium/bin/` with Node `zlib.brotliDecompressSync`. Write `chromium.br` to `/tmp/hanzi-chromium/chromium`; extract `al2023.tar.br`, `swiftshader.tar.br` and `fonts.tar.br` there using `tar --no-same-owner`. Mark `chromium` executable. Do not use a zero-byte `/tmp/chromium` left by the failed default extraction.
3. Launch with `LD_LIBRARY_PATH=/tmp/hanzi-chromium/lib`. Direct Playwright launches used `--no-sandbox`, `--disable-dev-shm-usage`, `--no-zygote`, `--disable-gpu`. Do not use the package's `--single-process` flag for multi-context browser tests.
4. App-bundled Inter/Noto Sans SC font subsets are activated by `DOJO_NATIVE_BUILD=1`. This is a font/build setting, not a native device simulation. Vite dev still includes external font tags, which the screenshot script blocks; native builds strip those tags themselves.
5. A complete CJK fallback is needed for the serif/handwriting preview specimens on this Linux image. Download `https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf`, use `fontTools.varLib.instancer.instantiateVariableFont` at `wght=400`, and save `/tmp/hanzi-system-fonts/NotoSansSC-Regular.ttf`. The reviewed instance maps 30,890 glyphs; its SHA-256 is in `INDEPENDENT-REVIEW.md`. Include this directory in a Fontconfig file at `/tmp/hanzi-system-fonts/fonts.conf`, with Noto Sans SC as a fallback for serif, sans-serif and cursive. Pass that path as `FONTCONFIG_FILE`. The selected fallback preserves readable glyphs, not the visual identity of iOS handwriting fonts.
6. Run the capture script against the desired source tree:

```sh
HD_REVIEW_ROOT=/absolute/path/to/Hanzi-dojo \
HD_REVIEW_PHASE=final HD_REVIEW_PORT=5191 \
node docs/recovery-2026-09-28/review-browser.mjs
```

The script starts and stops its own Vite server, uses synthetic Supabase fixtures, records source fingerprints before and after, and writes PNGs plus compact metadata under `docs/recovery-2026-09-28/evidence/<phase>/`. It must run against a stable source tree. A nonzero `failures` list, a mismatched source fingerprint, or a screenshot named `failure-*` is evidence to investigate, never an implicit pass.

For behavioral E2E use the repository's Playwright suite with an external temporary configuration pointing at this browser, an exclusive Vite port, ordinary default timeouts, two workers and no retries. Keep canonical CI screenshot comparisons and store-marketing captures separate from a local behavioral run. Do not modify the global timeout or bless new pixel baselines to make the sandbox pass.

The initial `agent-browser` CLI daemon failed to start here. Direct Playwright successfully launched the restored binary and performed the recorded interactions. Both failures and the fallback are documented rather than silently treating a started web server as verified.
