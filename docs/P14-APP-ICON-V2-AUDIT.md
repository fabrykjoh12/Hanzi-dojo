# P14 · App Icon V2 — audit

**Status: audit only. Nothing in this document has been implemented.** No icon
asset, no `Contents.json`, no adaptive-icon XML and no production code was
changed by the work that produced this file. It exists so the icon decision can
be made once, on facts, before any pixel is redrawn.

Written 2026-08-15. Scope: the two problems raised — (1) iOS changes the icon's
appearance in dark/tinted modes because the appearance configuration is
incomplete, and (2) the icon is flat where it should feel dimensional.

> **Parallel-work note.** This audit deliberately touches nothing owned by the
> Home V3 / three-tab navigation migration. It does not read from or propose
> changes to `Home.jsx`, navigation, the app shell/router, shared controls,
> shared design tokens, Home/nav tests or Study. §7 flags one place where an
> icon change would eventually reach in-app UI (`src/assets/Hanzi-logo.png`,
> imported by eight screens) — that is listed as *scope to be aware of*, not as
> work proposed here.

---

## 1 · Exact technical audit of the current configuration

### 1.1 Where the icon comes from

Every icon in the repo is rasterised by one script, `tools/generate-app-icons.mjs`,
from a single master PNG:

```
src/assets/86055582-d1d3-4cb7-a460-6c907025fe15.png   (1.1 MB, the brush ensō)
```

The script chroma-keys a stock-preview checkerboard out of that PNG (colourfulness
is used as the alpha channel), un-multiplies the anti-aliased edges against the
grey it was composited on, crops to the ink bounding box, then composites that
mark at a fixed `coverage` fraction over a flat ground. Two grounds exist:

| Constant | Value | Used for |
|----------|-------|----------|
| `LIGHT` | `rgb(250,250,248)` = `#FAFAF8` | every icon, and the light splash |
| `DARK` | `rgb(15,17,21)` = `#0F1115` | **splash screens only — never any icon** |

That table is the root of problem (1): **`DARK` is never used by any icon
output.** There is exactly one icon artwork in the repository, and it is a light
one.

### 1.2 Measured properties of the shipped artwork

Pixel-level measurements of the actual committed files:

| File | Size | Alpha | Ink colour | Ground | Mean luma | Ink coverage |
|------|------|-------|-----------|--------|-----------|--------------|
| `ios/.../AppIcon-512@2x.png` | 1024² | **none** (RGB, colortype 2) | `#E1350F` | `#FAFAF8`, 82% of canvas | **223 / 255** | ~11% of pixels |
| `assets/icon-only.png` | 1024² | RGBA, fully opaque | `#E1350F` | `#FAFAF8` | 223 | ~11% |
| `assets/icon-foreground.png` | 1024² | RGBA, 90.6% transparent | `#E1350F` | — | 92 (over ink only) | bbox 256→766 = **0.499 of canvas** |
| `assets/icon-background.png` | 1024² | RGBA, fully opaque | — | `#FAFAF8` 100% | 250 | 0% |
| `public/maskable-512.png` | 512² | RGBA, opaque | `#E1350F` | `#FAFAF8` 91% | 238 | ~6% |

Relative luminance of the two tones, on the 0–255 scale iOS's appearance
treatments work in:

* ground `#FAFAF8` → **L ≈ 250**
* ink `#E1350F` → **L ≈ 87**

The icon is therefore, in luminance terms, *a dark mark on an almost-white
field covering 82% of the canvas*. Hold that thought for §2.

### 1.3 Three different reds and two different marks

| Where | Mark | Red |
|-------|------|-----|
| `src/languageTheme.js` `chinese.accentHex` | — | `#B83A24` |
| `public/favicon.svg` | a clean geometric arc with round caps | `#C43A22` |
| every rasterised app icon | the textured brush ensō | `#E1350F` |

The favicon is a *different drawing* in a *different red* from the app icon, and
neither matches the product accent. `docs/DEPLOY.md:134` already records this as
a known gap ("replace it with an ensō-derived icon if full brand consistency is
wanted") and is itself stale — it says icons are generated from
`src/assets/Hanzi-logo.png` by an ad-hoc sharp script, which stopped being true
when `tools/generate-app-icons.mjs` landed.

### 1.4 iOS — `AppIcon.appiconset`

Directory contents (complete):

```
ios/App/App/Assets.xcassets/AppIcon.appiconset/
├── AppIcon-512@2x.png    1024×1024, RGB, no alpha, 383 KB
└── Contents.json         209 bytes
```

`Contents.json` in full:

```json
{
  "images": [
    {
      "idiom": "universal",
      "size": "1024x1024",
      "filename": "AppIcon-512@2x.png",
      "platform": "ios"
    }
  ],
  "info": { "author": "xcode", "version": 1 }
}
```

**There is no `appearances` key anywhere in the file.** This is a single-size
(1024-only) app icon set with exactly one image and no light / dark / tinted
declaration of any kind. That single-size form is itself correct and current —
Apple's own guidance is that iOS apps "can auto-generate all icon variations
from a single 1024×1024 pixel image" — but it declares only the **Any**
appearance slot. The Dark and Tinted wells are empty.

Supporting configuration, all of which is fine:

* `ios/App/App.xcodeproj/project.pbxproj` — `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon` in both build configurations. Correct.
* `ios/App/App/Info.plist` — no `CFBundleIcons` / `CFBundleIconName` override. Correct; the asset catalog is authoritative.
* The 1024 PNG is flattened to RGB with the alpha channel removed (`writeOpaque` in the generator). Correct and deliberate — App Store Connect rejects a marketing icon that carries an alpha channel even when it is fully opaque.
* No `.icon` (Icon Composer) file exists in the project. See §3.3.

### 1.5 Android — launcher and adaptive icon

`android/app/src/main/AndroidManifest.xml`:

```xml
android:icon="@mipmap/ic_launcher"
android:roundIcon="@mipmap/ic_launcher_round"
```

`android/variables.gradle`: `minSdkVersion 24`, `compileSdkVersion 36`,
`targetSdkVersion 36`.

`mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml` are byte-identical:

```xml
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background>
        <inset android:drawable="@mipmap/ic_launcher_background" android:inset="16.7%" />
    </background>
    <foreground>
        <inset android:drawable="@mipmap/ic_launcher_foreground" android:inset="16.7%" />
    </foreground>
</adaptive-icon>
```

Raster layers exist at six densities (ldpi 36 → xxxhdpi 192), four PNGs each —
`ic_launcher`, `ic_launcher_round`, `ic_launcher_foreground`, `ic_launcher_background`
— 24 files total. All are PNG; none are vector.

Three defects, in descending severity:

**(a) There is no `<monochrome>` layer.** The app targets SDK 36 and therefore
runs on every Android release that supports themed icons (13+), but opts out of
them by omission. On a themed-icon home screen every participating app renders
as a wallpaper-tinted monochrome mark and Hanzi Dojo renders as its full-colour
near-white square — the single most conspicuous way an icon can look wrong on
modern Android. Themed icons additionally require the `<monochrome>` node on
**both** `ic_launcher` and `ic_launcher_round`, since the manifest declares both.

**(b) The background layer is inset, which is invalid.** An adaptive icon's
canvas is 108×108 dp; the mask displays the centre 72×72 dp; the safe zone is
the centre 66×66 dp; **the outer 18 dp on each side is reserved for the
launcher's own visual effects — parallax, pulse, zoom.** `android:inset="16.7%"`
removes `0.167 × 108 ≈ 18 dp` from each side, so the opaque background covers
exactly 71.9 dp — the mask area and not one dp more. The reserved effect margin
is fully transparent. Any launcher that parallaxes, pulses, or uses a mask
larger than the 72 dp reference exposes transparency at the edge, and the
elevation shadow Android derives from the background layer is derived from a
72 dp square rather than the 108 dp canvas. A background layer must be
full-bleed 108 dp; this one is not.

**(c) The mark is drawn far too small.** The generator writes the adaptive
foreground at `coverage 0.50` of its 1024 canvas, and the XML then insets that
by a further 16.7%. Net mark size: `0.50 × 71.9 ≈ 36 dp` on a 108 dp canvas —
about **33% of the canvas**, inside a 66 dp safe zone that could hold nearly
twice that. `docs/PRE-RELEASE-CHECKLIST.md:75-79` records the 0.50 figure as a
deliberate correction for the XML's inset, which is honest but doubles the
shrink instead of cancelling it: the fix for a background that must not be inset
is to stop insetting it, not to shrink the foreground to match. At a 48 dp
launcher size the result is a ~16 dp ring of thin brush strokes floating in a
white field.

**Dead template files.** `android/app/src/main/res/drawable/ic_launcher_background.xml`
(the teal `#26A69A` Android Studio grid) and `android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml`
(the stock green Android robot head) are both untouched Android Studio template
leftovers. Nothing references them — the adaptive XML points at
`@mipmap/…`, not `@drawable/…` — so they are inert, but they are the wrong icon
sitting in the resource tree, and `values/ic_launcher_background.xml` defines an
unused `#FFFFFF` colour alongside them.

### 1.6 Web / PWA

`public/manifest.webmanifest`:

```json
"background_color": "#FAFAF8",
"theme_color": "#B83A24",
"icons": [
  { "src": "icon-192.png",     "sizes": "192x192", "purpose": "any" },
  { "src": "icon-512.png",     "sizes": "512x512", "purpose": "any" },
  { "src": "maskable-512.png", "sizes": "512x512", "purpose": "maskable" }
]
```

`index.html` declares `favicon.svg`, `apple-touch-icon.png`, the manifest, a
`theme-color` of `#B83A24`, and `og:image` → `https://hanzi-dojo.com/icon-512.png`.

Findings:

* **The maskable icon is drawn about half the size it should be.** The generator
  writes it at `coverage 0.46` with the comment "the safe zone (40% of the
  canvas)". The maskable spec's minimum safe zone is a circle of **radius** 40%
  of the icon width — i.e. **80% diameter**, 409 px on a 512 canvas. The mark is
  at 235 px. It is safe, but needlessly tiny.
* **There is no `purpose: "monochrome"` icon**, so PWA installs on Android get
  the same themed-icon miss as the native app.
* `apple-touch-icon.png` carries an alpha channel but is fully opaque, so Safari
  "Add to Home Screen" is fine.
* The web surface is the public/legal surface only per `CLAUDE.md` §1, so these
  are correctness items, not investment items — but they cost one line each in
  the same regeneration run.

---

## 2 · Why dark and tinted behave as they do

### 2.1 The mechanism

iOS 18 introduced three home-screen appearances (Light, Dark, Tinted); iOS 26
adds a Clear appearance alongside Tinted under a shared "Mono" treatment. Apple's
asset-catalog documentation states the fallback plainly:

> "If you prefer, you can take advantage of the system's automatically generated
> treatment that is applied to all app icons. It is crafted intelligently to
> preserve design intent and maintain legibility."
> — *Configuring your app icon using an asset catalog*, Apple

That is the behaviour Hanzi Dojo is getting today, because the Dark and Tinted
wells in `Contents.json` are empty. **The system is not leaving the icon alone in
dark mode — it is synthesising a dark icon and a tinted icon from the light
one.** The synthesis works by separating foreground from background and deciding
whether the extracted foreground should be re-tinted or preserved. It is
deterministic image processing, not an AI model, but it is undocumented,
version-dependent, and applied differently on different surfaces (Home Screen,
Settings › Apps, Spotlight, App Library). That surface-dependence is precisely
why the icon "changes appearance": there is no single generated result to design
against.

The specific known failure mode for a light icon with no dark variant is a
**black plate behind the icon in Settings › Apps under Dark Mode** — reported
and reproduced by developers, and resolved by explicitly declaring the Dark
appearance rather than letting the system generate it.

### 2.2 Why *this* icon is close to the worst case for that treatment

The auto-treatment's whole job is figure/ground separation. This artwork gives it
the hardest possible input:

* **82% of the canvas is a single near-white tone** (`#FAFAF8`, L ≈ 250). The
  extractor sees an enormous uniform background and one saturated shape.
* **The mark's luminance is *lower* than the ground's** (L ≈ 87 vs 250). Most
  icons that survive the treatment are a light mark on a dark or saturated
  ground; this one is inverted relative to that norm.
* **The ink is a textured brush stroke with fine dry-brush splinters and
  detached specks.** Those thin features are the first thing lost to any
  contrast remap or dilation in the separation step.
* **The artwork is fully opaque with no alpha.** There is no authored figure/
  ground information for the system to use — it has to infer it from pixels.

Result per appearance:

**iOS Light** — correct today. `AppIcon-512@2x.png` is displayed as authored:
`#E1350F` brush ensō centred at 68% coverage on `#FAFAF8`, corners rounded by
the OS. The only criticisms here are aesthetic (§1.3, and the flatness that
motivated this audit), not technical.

**iOS Dark** — the system generates a dark variant. The near-white ground is the
thing it must deal with, and it darkens or replaces it. The outcome varies by
surface and iOS version, which is why it reads as "iOS changes my icon": on the
Home Screen the ground is pulled down toward the system's dark gradient
(nominally the ~`#313131` → `#141414` band Apple's own dark icons sit on) while
the saturated red is preserved; in Settings › Apps the reported artefact is a
hard black plate. Neither is a designed result, and neither is stable across
releases. **Root cause: no `luminosity: dark` entry in `Contents.json`, and no
dark artwork exists anywhere in the repo to put in one.**

**iOS Tinted** — the system converts the icon to greyscale and maps that
greyscale through the user's chosen tint gradient. Feed it this artwork and the
82% near-white ground maps to the *bright* end of the tint and the ring (L ≈ 87)
maps to the *dark* end. **The figure/ground relationship inverts:** what is a red
ring on white paper becomes a solid saturated tile with a dim hole punched in
it. The identity does not survive — on a home screen where every other tinted
icon is a bright mark on a dark ground, Hanzi Dojo is a solid coloured block.
The fine dry-brush texture disappears entirely. **Root cause: no
`luminosity: tinted` entry, and no greyscale artwork.**

**iOS 26 Clear (Mono, untinted)** — the same greyscale is composited as a
translucent glass material over the wallpaper. A shape that is 82% mid-to-high
luminance becomes a near-solid frosted tile. This appearance did not exist when
the current icon was made and has never been considered.

### 2.3 Android, for completeness

Android's failure is not synthesis, it is omission and geometry: no
`<monochrome>` layer means themed-icon launchers show the full-colour near-white
square unchanged next to a screen of tinted marks (§1.5a); the inset background
means the reserved effect margin is transparent (§1.5b); and the mark is drawn
at ~33% of the canvas (§1.5c). On a dark wallpaper with a dark launcher theme,
the practical result is a bright white tile with a small ring in it.

---

## 3 · Correct iOS light / dark / tinted asset strategy

### 3.1 The three authored assets

Three 1024×1024 PNGs, authored deliberately — never one asset reused three times,
and never left to the system.

| Variant | Background | Colour | Notes |
|---------|-----------|--------|-------|
| **Light (Any)** | **opaque, full-bleed, no alpha channel at all** | full colour | This is also the App Store marketing icon. App Store Connect rejects any alpha channel here, including a fully opaque one — keep the existing `flatten().removeAlpha()` step. |
| **Dark** | **transparent** | full colour, re-balanced for a dark ground | Apple: *"Provide your dark app icon with a transparent background so the system-provided background can show through."* Do not paint your own dark background — the system draws the ~`#313131`→`#141414` gradient and painting a second one produces a visible double-plate. |
| **Tinted** | greyscale | **greyscale** | Apple: *"Provide your tinted app icon as a grayscale image."* The system maps its luminance through the user's tint gradient, so luminance *is* the design. Author it so the mark is the **light** end and the ground the dark end — the opposite of today's relationship. |

Never bake rounded corners, a border, or a drop shadow into any of the three.
The OS supplies the mask and the platform lighting.

### 3.2 The `Contents.json` that declares them

```json
{
  "images": [
    {
      "idiom": "universal",
      "platform": "ios",
      "size": "1024x1024",
      "filename": "AppIcon-Light.png"
    },
    {
      "idiom": "universal",
      "platform": "ios",
      "size": "1024x1024",
      "filename": "AppIcon-Dark.png",
      "appearances": [
        { "appearance": "luminosity", "value": "dark" }
      ]
    },
    {
      "idiom": "universal",
      "platform": "ios",
      "size": "1024x1024",
      "filename": "AppIcon-Tinted.png",
      "appearances": [
        { "appearance": "luminosity", "value": "tinted" }
      ]
    }
  ],
  "info": { "author": "xcode", "version": 1 }
}
```

The first entry carries **no** `appearances` key — that absence is what marks it
as the Any/default slot. All three stay `size: "1024x1024"`; the single-size form
is retained and Xcode generates the rest. No build-setting change is required;
`ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon` already points here.

### 3.3 Icon Composer — the 2026 question, and the recommendation

Apple's current first-line guidance for iOS 26 is no longer the asset catalog. It
is **Icon Composer**: a single layered `.icon` file from which the system renders
every platform, appearance and size, applying the Liquid Glass material —
specular highlights, blur, refraction, shadow — at render time.

The consequential rule, quoted from Apple:

> "If you add an Icon Composer file to your Xcode project, it **replaces** any
> existing icon asset catalog that you previously used to represent your app
> icon. Xcode automatically generates a similar-looking version of the Liquid
> Glass icon for previous releases. If you want your existing icon to appear in
> previous releases, continue to use asset catalogs."

And the artwork-prep rule, which matters enormously for §4/§5:

> "Remove blurs and shadows, and specular, opacity, and translucency settings.
> Remove background colors and gradients." — layers are exported as flat SVGs
> (max four groups), and the depth is applied by the system.

**Two consequences for this project.**

1. **`.icon` and `AppIcon.appiconset` are mutually exclusive.** Adding one
   removes the other's effect. Pick one; do not maintain both and expect both to
   apply.
2. **Icon Composer is the direct answer to "the icon feels too flat."** The
   dimensional quality the brief asks for — restrained highlight, contact
   shadow, material depth — is exactly what Liquid Glass renders from flat
   layers, live, matched to the device and appearance. Hand-painting those
   effects into a PNG in 2026 means fighting the platform: the OS will apply its
   own lighting on top of the baked lighting and the icon will read as
   double-lit.

**Recommendation: build the V2 artwork as layered vectors from the start, and
adopt Icon Composer as the iOS delivery format**, with the three-PNG asset
catalog of §3.1–3.2 as the fallback if the toolchain (Icon Composer runs on
macOS/Xcode only, which this Linux sandbox and CI do not have) proves impractical
to get into the release process. The layered-vector master serves both paths —
Icon Composer imports SVG layers directly, and the same layers flatten to the
three PNGs — so this decision does not have to be made before the artwork is
drawn. It only has to be made before the artwork is drawn *the wrong way*, i.e.
as a single flattened raster with lighting baked in, which is what exists today.

### 3.4 Verification

None of this can be verified in this repository or in CI: it needs Xcode's asset
preview and a real device. The checks that matter, in order:

1. Xcode › `Assets.xcassets` › `AppIcon` — all three wells populated, Appearance set to Any/Dark/Tinted.
2. Simulator or device, Settings › Home Screen & App Library › **Light / Dark / Tinted / Clear**, all four states, plus Auto at night.
3. **Settings › Apps** in Dark Mode specifically — this is where the black-plate artefact appears, and it is not visible from the Home Screen.
4. Spotlight and App Library, which apply the treatments at smaller sizes.
5. App Store Connect upload — the marketing icon still has to pass the no-alpha check.

Fold these into `docs/TESTING.md` (device-only checks) rather than into any
automated suite.

---

## 4 · Correct Android adaptive-icon strategy

### 4.1 The layers

| Layer | Size | Content |
|-------|------|---------|
| `background` | **full-bleed 108 × 108 dp, opaque, no inset** | The ground — a solid or minimally-graded field. Must extend edge to edge so parallax and the elevation shadow have something to work with. |
| `foreground` | 108 × 108 dp canvas, transparent, **mark sized to the 66 dp safe zone** | The mark. Roughly 60–66% of the canvas, not 33%. |
| `monochrome` | 108 × 108 dp canvas, transparent | The mark again, as a **single flat opaque colour** with the alpha channel carrying the shape. The launcher discards the colour and re-tints; only the silhouette survives, so a flat solid mark reads best and gradients/texture read worst. |

### 4.2 The XML

```xml
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
```

Three things to get right:

* **Drop both `<inset>` wrappers.** Sizing belongs in the artwork, not in the XML. Keeping the inset on the background is the bug in §1.5b; keeping it on the foreground is what forces the mark to 33%.
* **Apply this to `ic_launcher.xml` *and* `ic_launcher_round.xml`.** The manifest declares `android:icon` and `android:roundIcon`, and a `<monochrome>` node on only one of them does not enable themed icons.
* **Prefer a vector for `monochrome`.** It is a flat silhouette; a `<vector>` drawable is smaller, sharper at every density, and cannot go soft. Raster mipmaps at six densities also work if the mark's brush texture must be preserved in alpha.

The legacy `mipmap-*/ic_launcher.png` and `ic_launcher_round.png` rasters stay —
`minSdkVersion 24` means API 24–25 devices exist that predate adaptive icons and
use them directly. They should be the light square icon, pre-masked.

### 4.3 Cleanup, same change

Delete the two Android Studio template leftovers and the unused colour:

* `android/app/src/main/res/drawable/ic_launcher_background.xml` (teal grid)
* `android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml` (Android robot)
* `android/app/src/main/res/values/ic_launcher_background.xml` (unused `#FFFFFF`)

Nothing references them; they are inert. They are removed for hygiene, not
because they break anything, so they can equally be left — but not "left and
forgotten", because a future `<monochrome android:drawable="@drawable/…">` will
resolve into that directory.

### 4.4 Verification

Device-only, on Android 13+: place the icon on a **themed-icon** home screen
against both a light and a dark wallpaper; drag it to confirm parallax does not
reveal a transparent edge; check the circle, squircle, rounded-square and
teardrop masks (Pixel launcher's Wallpaper & style › app-shape control exposes
these); and check the app-drawer and Settings › Apps sizes where the mark is
smallest.

---

## 5 · Three icon directions

Constants across all three, from the brief: vermilion/red identity retained;
Chinese-learning identity; legible at 40 px; recognisable silhouette. Excluded
throughout: generic AI 3D, heavy gradients, tiny detail, glossy plastic,
complicated scenery, a mascot, and Japanese visual symbolism.

> **The finding that shapes all three.** The current mark is an **ensō** — the
> Japanese Zen brush circle. That is not an interpretation: `tools/generate-app-icons.mjs`
> and `public/favicon.svg` both name it in their own comments ("the REAL brush
> ensō", "a Zen ensō (brush circle)"), and `docs/PRE-RELEASE-CHECKLIST.md` calls
> it "the existing ensō mark". A Japanese Zen symbol is the current identity of a
> Chinese-only product, and the brief for V2 explicitly excludes Japanese visual
> symbolism. This is the strategic decision the V2 work actually turns on, and it
> is bigger than dimensionality. Each direction below states what it does about it.

### Direction A — Vermilion Seal (印)

The Chinese seal, or chop: a solid vermilion field with the mark reversed out of
it in the paper's colour, exactly as a 阳文 seal prints. The mark inside is the
ring, redrawn — so the silhouette people already recognise survives, but as
negative space rather than as ink.

* **Figure/ground inverts, which is the whole point.** The canvas becomes ~80% saturated vermilion and ~20% near-white mark. That is the luminance relationship every appearance treatment is built for.
* **Dark mode becomes nearly free** — a vermilion tile needs almost no change against a dark ground, so light and dark differ by a small warmth/value shift instead of a redesign.
* **Tinted becomes correct by construction** — greyscale it and the mark is the light end, the field the dark end. It reads as a bright mark on a dark ground, like every well-behaved tinted icon.
* **The Japanese problem is solved outright.** Seals are the Chinese mark-making tradition. A vermilion seal impression is about as unambiguously Chinese as a mark can be, and it carries no Zen reading at all.
* **Dimensionality without 3D:** the depth is *material*, not modelled — the very slight unevenness of a real seal impression on paper, a hairline inner edge, and one restrained highlight. Under Liquid Glass the vermilion field becomes the glass body and the OS supplies the specular and the shadow.
* **Strongest possible silhouette at 40 px:** a filled tile always beats a thin ring.
* **Cost:** the largest visual change of the three. The ring stops being ink and becomes a hole, which is a real departure — and `Hanzi-logo.png` is used in eight in-app screens (§7), so the in-app logo either follows or diverges.

### Direction B — Lacquer Ring

Keep the ring as ink on a warm ground, but re-cut it: a cleaner, more
deliberately drawn brush ring in deep vermilion lacquer, with the dry-brush
splinters and detached specks removed, one restrained top-left highlight along
the stroke, and a soft contact shadow onto a warm paper ground. The ensō
reading is broken by closing the open-top sweep and giving the stroke Chinese
brush terminals (a deliberate 起笔 entry and 收笔 exit) instead of the ensō's
single continuous gesture.

* **Most continuous with today's icon** — nobody has to relearn the app.
* **Genuinely more premium** than the current flat rasterised stock brush: real material, real edge quality, real weight.
* **But it does not fix the structural problem.** A dark mark on a light ground still needs a fully separate dark variant and a deliberately inverted tinted variant; none of the three appearances comes free.
* **Weakest silhouette of the three** — a ring is mostly empty space, and at 40 px on a busy home screen an outline loses to a filled shape.
* **The Japanese question is only softened, not answered.** A red brush circle will still read as an ensō to a meaningful fraction of people, because that is what a red brush circle is.
* **Highest risk of reading as "glossy plastic"**, which the brief excludes — lacquer and gloss are separated by very little, and the difference is entirely in the restraint of the highlight.

### Direction C — Layered Paper (卡)

The product's own structure as the mark: two or three offset warm-paper cards
stacked with real depth, the top card carrying a single reversed vermilion
element — either the ring or one simplified hanzi stroke. Cards plus reading is
literally what the app is: flashcards, then stories.

* **Dimensional by construction, with no gradients at all.** The depth comes from genuine layer offsets and soft contact shadows between physical planes — which is precisely the input Icon Composer wants (flat layers, system-applied shadow and specular). It is the direction that benefits most from Liquid Glass.
* **Says what the app does** rather than gesturing at a culture, which is the strongest position an app icon can hold on a crowded store page.
* **Warm paper is not near-white**, so it survives dark and tinted far better than today — though not as cleanly as A's saturated field.
* **Carries the most risk against the brief's own exclusions.** Two or three offset rectangles with a mark on top is a lot of internal structure for 40 px; the layers can collapse into mush at small sizes, and a card stack is close to a generic "notes app" silhouette. Mitigable — two cards, not three; a large offset; the mark dominant — but it needs proving at size before it is trusted.
* **Discards the ring entirely**, which is the largest identity break of the three.

---

## 6 · Recommendation

**Direction A — Vermilion Seal — with the ring kept as the reversed mark inside
it.**

It is the only one of the three that fixes both stated problems with a single
decision instead of two separate efforts:

* **Problem 1 (appearance) stops being a design problem and becomes a
  configuration problem.** A saturated vermilion field with a light mark is
  already in the luminance relationship that dark, tinted and clear all expect.
  The three variants become value adjustments of one design rather than three
  designs. Contrast with B, where every appearance is a fresh problem because the
  ground is near-white.
* **Problem 2 (flatness) is answered with material rather than rendering.** A
  seal impression has real, subtle, physical depth — ink sitting on paper, a
  slightly uneven edge — and none of it is a gradient, a bevel, or a 3D render.
  It stays inside every exclusion in the brief.
* **It resolves the Japanese-symbolism finding outright**, which neither B nor C
  fully does, and which is the largest brand risk currently sitting in the
  repository.
* **It keeps the ring**, so the silhouette is recognisably the same product —
  just inverted from ink to negative space.
* **It is the strongest mark at 40 px**, which is the size that decides whether
  an icon works.

Build it as **layered vectors** (field / mark / seal texture), which serves the
Icon Composer path and the three-PNG asset-catalog path equally (§3.3), and let
the platform supply the lighting.

Two things to settle before drawing, both genuinely open:

1. **Which red.** Three are in play — `#B83A24` (product accent), `#C43A22`
   (favicon), `#E1350F` (current icon artwork). A seal field wants a deeper,
   less orange vermilion than `#E1350F`; `#B83A24` is the one the rest of the
   product already uses. Aligning on it would collapse three reds into one, but
   it is a brand call, not a technical one.
2. **Whether the reversed mark stays the ring or becomes a simplified hanzi.**
   The brief allows either. The ring keeps continuity; a single bold reversed
   character (字, or the 口 enclosure that a seal border already suggests) says
   "Chinese" faster to someone who has never opened the app. Worth drawing both
   and comparing at 40 px before committing.

**Second choice: Direction B**, if continuity outweighs everything and the
appearance variants are accepted as three separate pieces of work.

**Direction C** is worth keeping as a sketch even if not chosen — the layered-card
thinking is directly reusable for the store screenshots and the marketing icon
treatment in `docs/STORE-LISTING.md`.

---

## 7 · Exact files that would eventually need changing

**Nothing in this list has been touched.** It is the implementation surface for
whichever direction is approved.

### Master artwork and generator

| File | Change |
|------|--------|
| `src/assets/` — new layered master (SVG per layer, plus a 1024 raster) | **New.** The current master `src/assets/86055582-d1d3-4cb7-a460-6c907025fe15.png` is a flattened stock raster with a chroma-key checkerboard; it cannot produce a dark variant, a greyscale variant, or Icon Composer layers. |
| `tools/generate-app-icons.mjs` | **Rewrite.** Must emit light + dark + tinted for iOS, background + foreground + monochrome for Android, and stop insetting. The `DARK` constant already exists and is currently used only by splashes. |
| `assets/icon-only.png`, `assets/icon-foreground.png`, `assets/icon-background.png` | Regenerated; plus new `assets/icon-dark.png`, `assets/icon-tinted.png`, `assets/icon-monochrome.png`. |

### iOS

| File | Change |
|------|--------|
| `ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json` | Add the two `appearances` entries (§3.2). |
| `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` | Replaced with the V2 light artwork. Keep opaque / no alpha. |
| `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-Dark.png` | **New.** Transparent background. |
| `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-Tinted.png` | **New.** Greyscale. |
| *Icon Composer path instead:* `ios/App/App/AppIcon.icon` + `ios/App/App.xcodeproj/project.pbxproj` | **New file + project reference.** Mutually exclusive with the appiconset (§3.3). Requires macOS/Xcode 26 — not producible in this sandbox or in CI. |
| `ios/App/App/Assets.xcassets/Splash.imageset/*` (9 PNGs) | Only if the mark itself changes shape — the splash draws the same mark at `coverage 0.15`. |

### Android

| File | Change |
|------|--------|
| `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` | Drop both `<inset>`s, add `<monochrome>` (§4.2). |
| `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` | Same — required on both, or themed icons stay off. |
| `android/app/src/main/res/mipmap-{ldpi,mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png` | Regenerated (6 files). |
| `…/ic_launcher_round.png` | Regenerated (6 files). |
| `…/ic_launcher_foreground.png` | Regenerated at safe-zone size (6 files). |
| `…/ic_launcher_background.png` | Regenerated full-bleed (6 files). |
| `android/app/src/main/res/drawable/ic_launcher_monochrome.xml` | **New.** Flat vector silhouette. |
| `android/app/src/main/res/drawable/ic_launcher_background.xml` | **Delete** — dead teal Android Studio template. |
| `android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml` | **Delete** — dead Android robot template. |
| `android/app/src/main/res/values/ic_launcher_background.xml` | **Delete** — unused colour. |
| `android/app/src/main/res/drawable*/splash.png` (many densities) | Only if the mark changes shape. |

`android/app/src/main/AndroidManifest.xml` needs **no** change — it already
points at `@mipmap/ic_launcher` and `@mipmap/ic_launcher_round` correctly.

### Web / PWA

| File | Change |
|------|--------|
| `public/icon-192.png`, `public/icon-512.png` | Regenerated. |
| `public/maskable-512.png` | Regenerated at the correct safe-zone size (§1.6). |
| `public/apple-touch-icon.png` | Regenerated. |
| `public/favicon.svg` | Redrawn to match the app icon — it is currently a different mark in a different red (§1.3). |
| `public/manifest.webmanifest` | Optionally add a `purpose: "monochrome"` icon; revisit `background_color` if the ground changes. |
| `index.html` | Only if `og:image` should point at something other than `icon-512.png`. |
| `public/sw.js` | Check the precache list if icon filenames change. |

### Docs

| File | Change |
|------|--------|
| `docs/DEPLOY.md` (~line 132) | **Stale today** — says icons come from `src/assets/Hanzi-logo.png` via an ad-hoc sharp script. Point it at `tools/generate-app-icons.mjs` and the new master. |
| `docs/PRE-RELEASE-CHECKLIST.md` §0 (~line 75) | The app-icon item is ticked "DONE 2026-08-07" and its note documents the 16.7%-inset workaround as intentional. Reopen and correct. |
| `docs/TESTING.md` | Add the device-only appearance checks (§3.4, §4.4). |
| `docs/STORE-LISTING.md` | The 1024 store icon and any screenshot art carrying the mark. |
| `ROADMAP.md` | On start and on ship, per `CLAUDE.md`. |
| `docs/BACKLOG.md` | Carries the pointer to this audit until the direction is approved. |

### Scope to be aware of — not proposed here

`src/assets/Hanzi-logo.png` is the same ensō and is imported by eight screens:
`SplashIntro.jsx`, `PasswordReset.jsx`, `Auth.jsx`, `Landing.jsx`,
`FirstMissionWelcome.jsx`, `Onboarding.jsx`, `NativeWelcome.jsx`, `Sidebar.jsx`.
Any mark change large enough to matter (A or C especially) leaves the in-app
logo and the app icon showing different marks until that asset follows.
`Sidebar.jsx` is inside the navigation surface currently owned by the Home V3
migration, so **that follow-up must be sequenced after that work lands, and is
explicitly out of scope for this audit.** Swapping the PNG in place needs no code
change in any of the eight files; only the asset changes.

---

## 8 · Sources

* [Configuring your app icon using an asset catalog — Apple Developer](https://developer.apple.com/documentation/Xcode/configuring-your-app-icon)
* [Creating your app icon using Icon Composer — Apple Developer](https://developer.apple.com/documentation/Xcode/creating-your-app-icon-using-icon-composer)
* [App icons — Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/app-icons)
* [App Icon Shows Black Background in iOS 18 Settings Dark Mode — Apple Developer Forums](https://developer.apple.com/forums/thread/765764)
* [Can dark mode icon have transparent background? — Apple Developer Forums](https://developer.apple.com/forums/thread/771211)
* [Features and APIs Overview (themed app icons) — Android Developers](https://developer.android.com/about/versions/13/features)
* [Android 13: Implementing Themed Icons into your App — ProAndroidDev](https://proandroiddev.com/android-13-implementing-themed-icons-into-your-app-e7002f2c4e04)
* [Supporting adaptive themed icons on Android 13 — Sid Patil](https://siddroid.com/post/android/supporting-adaptive-themed-icons-on-android-13/)
* [Preparing your App Icon for dark and tinted appearance — Create with Swift](https://www.createwithswift.com/preparing-your-app-icon-for-dark-and-tinted-appearance/)
