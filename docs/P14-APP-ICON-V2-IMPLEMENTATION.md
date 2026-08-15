# P14 · App Icon V2 — implementation plan

**Plan only — nothing here has been executed.** It becomes actionable the
moment the E1-vs-E2 device gate closes
([`P14-APP-ICON-V2-DEVICE-GATE.md`](P14-APP-ICON-V2-DEVICE-GATE.md)). The
locked inputs: the **V2 brush mark** (`docs/icon-v2/brush/masters/mask-V2.png`
+ its small-size solidified twin), the lacquer palette anchored on `#B83A24`,
and the material recipe of the winning finalist.

**One principle above all: the same V2 mask drives every surface.** iOS,
Android, web, favicon, splash and (later) the in-app logo all rasterise from
the one committed mask — no surface ever gets its own redraw.

---

## 0 · Order of operations

1. Device gate closes → E1 or E2 wins.
2. Rewrite `tools/generate-app-icons.mjs` (§1). One script run regenerates
   every asset below from the masks.
3. iOS asset catalog + `Contents.json` (§2). Ship this first — it fixes the
   audit's dark/tinted bug and needs no Mac.
4. Android layers + adaptive XML + monochrome (§3).
5. Web/PWA + favicon (§4).
6. Icon Composer `.icon` on a Mac, when available (§5) — an upgrade, not a
   blocker.
7. Verify per §7, then `/ship` on a branch, PR, release per
   `docs/RELEASE-CHECKLIST.md`. Store-review note: a changed app icon is a
   binary change — it rides the next normal store submission.

## 1 · The generator (`tools/generate-app-icons.mjs` — rewrite)

Inputs move from the stock raster to the refined masks:

```
docs/icon-v2/brush/masters/mask-V2.png        the mark (alpha, 1024²)
        + solidify()                          small-size master, sizes ≤72px
```

The script keeps its current job (rasterise every platform asset in one run)
and gains: the lacquer field builder (ramp `#C24730→#B83A24→#8E2D1A`, grain,
sheen, vignette — from `tools/icon-v2-device.mjs`), the E2 bands if E2 wins,
the dark palette (`#8F2E1C→#5C1B0C`, mark `#EFE3D6`), a true greyscale tinted
variant, and the ≤72px small-master switch. The concept scripts
(`icon-v2-*.mjs`) stay as the decision record; the production generator is the
only one CI-adjacent.

## 2 · iOS — authored Any / Dark / Tinted (asset catalog)

`ios/App/App/Assets.xcassets/AppIcon.appiconset/`:

| File | Content |
|------|---------|
| `AppIcon-512@2x.png` (replace) | Light icon, **flattened, no alpha channel** (App Store Connect rejects alpha) |
| `AppIcon-Dark.png` (new) | Dark lacquer field + dimmed ivory mark. Full-square opaque artwork — the deliberate, documented departure from Apple's transparent-background advice: the field IS the identity |
| `AppIcon-Tinted.png` (new) | **True greyscale**: mark as the light figure (~L 235) on a dark field (~L 45) — the system maps luminance through the user's tint. The brush silhouette, never a ring |
| `Contents.json` | Three entries; Dark and Tinted carry `"appearances": [{"appearance": "luminosity", "value": "dark"|"tinted"}]`; the light entry carries none. Exact JSON in audit §3.2 |

No `project.pbxproj` change — `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon`
already points here.

## 3 · Android — foreground / background / monochrome

| File | Change |
|------|--------|
| `mipmap-anydpi-v26/ic_launcher.xml` + `ic_launcher_round.xml` | Drop **both** `<inset>` wrappers; add `<monochrome android:drawable="@drawable/ic_launcher_monochrome"/>` — on both files, or themed icons stay off |
| `mipmap-*/ic_launcher_background.png` (6) | Full-bleed 108dp lacquer field — **no inset** (fixes the transparent effect-margin bug) |
| `mipmap-*/ic_launcher_foreground.png` (6) | Small-master mark sized to the 66dp safe zone (~61% of canvas), transparent elsewhere. E2's bands are omitted below 72px output anyway |
| `drawable/ic_launcher_monochrome.png` (new; per-density if raster) | The small-master silhouette, white-on-transparent — **the real brush mark**. Alpha carries the shape; launcher recolours it |
| `mipmap-*/ic_launcher.png` + `ic_launcher_round.png` (12) | Legacy pre-adaptive (API 24–25): the full flattened light icon, regenerated |
| Delete | `drawable/ic_launcher_background.xml`, `drawable-v24/ic_launcher_foreground.xml`, `values/ic_launcher_background.xml` — dead Android Studio templates squatting where the monochrome drawable goes |

Note per the brief: Android 16 QPR2 may auto-theme icons without a monochrome
layer — we ship our own regardless so the themed appearance is authored, not
inferred.

## 4 · Web / PWA / favicon — same mark everywhere

| File | Change |
|------|--------|
| `public/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | Regenerated from the new composite |
| `public/maskable-512.png` | Regenerated at the **correct** safe zone (mark ≈ 66% of canvas — the current one is drawn at half size; audit §1.6) |
| `public/favicon.svg` | Replaced: currently a *different geometric arc in a different red* (`#C43A22`). Becomes the V2 mark — small optimized raster of the small-master embedded as a data URI inside the SVG wrapper (the mark is raster by nature; a hand-trace would fork the silhouette). Vermilion mark on transparent, so it reads on light and dark tabs |
| `public/manifest.webmanifest` | Add `{"src": "monochrome-512.png", "purpose": "monochrome"}`; `theme_color` stays `#B83A24` |
| `index.html` | No change needed (`og:image` stays `icon-512.png`, which regenerates) |
| `public/sw.js` | Bump `CACHE_VERSION` so installed PWAs drop the old cached icons |

## 5 · Icon Composer (`AppIcon.icon`) — the macOS step

Deferred until a Mac with Xcode 26 is in the loop; the §2 catalog is complete
without it. When done: import flat layers (field colour / mark / E2-bands /
grain as image), max four groups; let Liquid Glass supply specular + shadow;
**adding the `.icon` replaces the asset catalog** — remove the appiconset in
the same commit to keep one source of truth. The catalog remains the fallback
for older iOS, generated by Xcode automatically.

## 6 · Same-mark propagation (sequenced, not immediate)

* `src/assets/Hanzi-logo.png` — the in-app logo (eight importing screens,
  incl. `Sidebar.jsx`). Asset-only swap to the V2 mark on transparent —
  **after Home V3 lands** (Codex owns that surface today).
* Splash screens (`assets/splash*.png`, iOS `Splash.imageset`, Android
  `drawable*/splash.png`) — regenerate from the V2 mask in the same generator
  run so the launch mark matches the icon.
* `docs/DEPLOY.md` ~132 (stale generator description), `docs/STORE-LISTING.md`
  (1024 store icon + screenshots), `ROADMAP.md` (ship note),
  `docs/PRE-RELEASE-CHECKLIST.md` §0 (reopen the icon item, correct the
  16.7%-inset note).

## 7 · Verification (device, per `docs/TESTING.md` — add these)

1. Xcode asset preview: three wells filled, then device Settings › Home Screen:
   Light / Dark / Tinted / Auto — **plus Settings › Apps in dark mode** (the
   black-plate surface).
2. App Store Connect upload accepts the no-alpha marketing icon.
3. Android 13+: themed-icon home screen, light + dark wallpaper; drag for
   parallax (no transparent edge); circle/squircle/rounded/teardrop masks;
   API 24/25 emulator for the legacy PNGs.
4. PWA: fresh install on Android (maskable + monochrome), Safari
   add-to-home-screen, favicon on light/dark browser tabs.
5. `npm run lint && npm test && npm run build` — the generator is not in the
   app bundle, but the favicon/manifest edits touch the built site.

## 8 · Rules that survive into maintenance

* **Never regenerate any icon from `favicon.svg` or from a redraw** — the
  committed V2 mask is the single source. If the mark ever changes, it changes
  in `docs/icon-v2/brush/masters/` first and every surface regenerates.
* The App Store icon never carries an alpha channel; the Android background
  layer is never inset; the monochrome layer is never a simplified ring.
* Dark and Tinted are always authored — if a new appearance mode appears
  (as Clear did), authoring it is part of adopting the OS version.
