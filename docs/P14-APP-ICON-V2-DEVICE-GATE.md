# P14 · App Icon V2 — E1 vs E2 device gate

**Status: final validation package, stopped for the E1-vs-E2 call.** No
production asset modified. The identity is **locked**: the V2 brush mark,
approved 2026-08-15. E3/E4 are closed. All output in `docs/icon-v2/device/`.

Both finalists load the **byte-identical committed V2 mask**
(`docs/icon-v2/brush/masters/mask-V2.png`) — the renderer refuses to re-derive
it, so the silhouette cannot drift between them. The only difference in E2 is
two ~7px bands clipped inside the stroke (shade top-left wall, light
bottom-right edge).

```bash
node tools/icon-v2-device.mjs      # writes only docs/icon-v2/device/
```

## The package

| Sheet | Contents |
|-------|----------|
| `D-01-ladder.png` | E1/E2 at true 180 / 120 / 60 / 40 + 40@6× |
| `D-02-home-light.png` | Realistic Home Screen, light — E1 and E2 side by side among generic neighbour tiles (no real brands) |
| `D-03-home-dark.png` | Same screen, dark wallpaper, **authored dark variants** |
| `D-04-ios.png` | Light / Dark / Tinted grid |
| `D-05-android.png` | Adaptive squircle + circle, authored monochrome, themed |
| `true{40,60,120,180}-{E1,E2}.png` | Singles for 1:1 inspection |

## What the sheets already show

* **At 40 and 60px the two are pixel-identical for practical purposes** — the
  inlay bands resolve to under 0.3px. The home-screen row (60pt icons) shows
  no discernible difference at arm's length.
* **At 120–180px E2 reads slightly more "set into" the lacquer**; E1 reads
  slightly flatter and cleaner. This is the entire decision, and it is a taste
  call at App-Store-page scale, not a correctness call.
* Both behave identically in dark, tinted, Android masks and themed — those
  columns share every asset except the two bands.

## What this sandbox cannot decide

The remaining question is physical: OLED vs LCD, True Tone, night shift, real
viewing distance. **The call needs one look at `D-01`/`D-04` crops — or a
TestFlight build — on an actual phone.** Recommendation stands from the brush
gate: **E2, with E1 as the no-regrets fallback**; if the inlay is invisible or
ambiguous on device, ship E1 and lose nothing.

The implementation plan for whichever wins is in
[`P14-APP-ICON-V2-IMPLEMENTATION.md`](P14-APP-ICON-V2-IMPLEMENTATION.md).

---

## Addendum 2026-08-15 — full-bleed verification (closed, no change made)

**Question raised:** in regression sheet `V-01-ios-sizes.png`, Light/Dark/Tinted
appeared to sit inside an outer cream/black square. Was that baked into the
shipped PNGs, or only review chrome?

**Answer: review chrome only. The production assets are genuinely full-bleed.
Nothing was changed.**

Evidence, from the actual shipped 1024×1024 files:

| Asset | TL (0,0) | TR (1023,0) | BL (0,1023) | BR (1023,1023) | Channels |
|-------|----------|-------------|-------------|----------------|----------|
| `AppIcon-512@2x.png` | `#CF7463` | `#BB5643` | `#B03722` | `#852A18` | 3 (no alpha) |
| `AppIcon-Dark.png` | `#A96154` | `#8B4336` | `#772212` | `#56190B` | 3 (no alpha) |
| `AppIcon-Tinted.png` | `#393939` | `#2C2C2C` | `#2C2C2C` | `#1B1B1B` | 3 (no alpha) |

Every corner is live artwork — the lacquer ramp's own top-left→bottom-right
gradient, lit corner brightest, shaded corner darkest, exactly as designed.
Three further checks agree:

* **The outer 2px band is a gradient, not a flat colour** (light: red channel
  ranges 133–208 across the border; dark 86–170; tinted 27–64). Baked chrome
  would be one uniform value.
* **Every light pixel is the mark, not a plate.** Pixels above (230,228,225)
  occupy a centred bbox spanning 65% of the width, and **zero** of them fall
  within 24px of any edge.
* The apparent plate matched the sheet's own `#EDEBE6` / `#101014` backdrop
  colours exactly — because that is what it was.

**Rendered proof** (both on neutral grey, so a cream *or* black plate would be
unmissable):

* `docs/icon-v2/impl/V-03-fullbleed-check.png` — raw square assets with no mask
  and no chrome, above the same pixels under a simulated iOS squircle.
* `docs/icon-v2/impl/V-04-corner-2x.png` — the top-left 150px of each raw asset
  at 2×; the gradient runs to the literal corner pixel.

**No current-vs-full-bleed comparison was produced** — the brief asked for one
"only if there is genuinely an inset field", and there is not.

**Two follow-ups applied** (verification hardening only; no icon pixels
changed):

1. `tools/verify-app-icons.mjs` gained a permanent **full-bleed check** per
   appearance — corner pixels must not be plate-like (near-white or near-black)
   and the border band must carry a real gradient. It now runs 11 checks.
2. `V-01-ios-sizes.png` plates were switched from cream/near-black to **neutral
   grey** and captioned, so the sheet can no longer imply a baked background.
