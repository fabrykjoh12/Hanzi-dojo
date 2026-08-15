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
