# Issue #1: F1 on-edge stock validation

Original 340×230×50 stock: **rejected**. Updated user-confirmed 400×240×50 stock: **generation and browser simulation pass with right-side entry**, as detailed below. The source STEP is private to the task and is not included in the repository. No physical machine was connected.

## Geometry and placement

The original reader failed with an ambiguous correspondence error. A face has multiple consecutive coedges in a profile plane; the reader overwrote the previously read edge endpoints. Both Python and JavaScript now remove paired interior vertices and retain the two ends of the complete chain. Existing side-edge correspondence checks remain active.

After this correction, both implementations identify six outer ruled faces, no holes, and model Y planes -25 and +25 mm. Sampling the **trimmed** rail intervals (sag 0.001 mm, maximum step 0.1 mm) gives:

| Coordinate | Minimum (mm) | Maximum (mm) | Size (mm) |
|---|---:|---:|---:|
| Model X | -500.622068 | -119.973701 | 380.648368 |
| Model Y | -25 | 25 | 50 |
| Model Z | -27.811139 | 193.914646 | 221.725785 |

An independent OpenCascade 7.8.1 STEP import and `BRepBndLib.AddOptimal(shape, box, False, False)` gives X minimum -500.622121 and agrees with these dimensions within 0.001 mm. The curved edge extends well beyond the vertex-only bounding box. Bounding an untrimmed supporting surface is not used here.

At table 0°, model Y maps along the wire (machine X), model X maps horizontally across the wire (machine Y), and model Z remains vertical. Generator dimensions therefore must be **50, 340, 230 mm**, in that order. Simulator metadata uses **L=340 W=50 H=230** because its stock box is X=W, Y=L, Z=H.

For centered placement with bottom Z=0, the model occupies horizontal [-190.324184, +190.324184] and vertical [4.137107, 225.862893] mm. Stock occupies horizontal [-170,+170], vertical [0,230]. Minimum horizontal allowance is **-20.324184 mm** (fails), vertical allowance is 4.137107 mm, and along-wire allowance is 0 mm. A 1 mm kerf further consumes approximately 0.5 mm of allowance. These values describe geometric placement, not a certified usable cutting path.

## Updated stock and confirmed machine

The user subsequently confirmed the machine working area as **490 mm horizontal × 250 mm vertical × 370 mm along the wire**, and changed the stock to **400×240×50 mm**. Browser generator/simulator and Python shared machine defaults now use 250 mm vertical travel and 370 mm field width. Homing offsets and park coordinates remain at their existing calibrated values; no new limit-switch positions were invented.

For the updated stock, generator inputs are **50 along wire, 400 across wire, 240 high**, bottom Z=10 mm, kerf=1 mm, feed=7 mm/s, S=500, trim=false, sideEntry=true, side=+1, pair=false. The part is centered: horizontal ±190.324184 mm, vertical [19.137107,240.862893] mm. Nominal allowance is **9.675816 mm horizontally** and **9.137107 mm vertically**; kerf compensation consumes approximately 0.5 mm. Along-wire allowance is 0 mm, stock-to-tower gap is 160 mm per side, and stock top is exactly Z=250 mm.

The old overhead route requires Z=270 mm for this stock and remains correctly rejected. The new explicit “Вход и выход справа без подъёма над заготовкой” option avoids that route. From the right park (horizontal 240 mm, Z=235 mm), the wire approaches horizontal 205 mm at the contour-entry height, cuts inward to the profile, completes the contour, exits through the same slit to 205 mm, switches off and returns directly to the right park. Both the approach and return remain beyond the stock edge at 200 mm. There is **no move above the stock**, no end trimming and no B90; the main cut stays at B0.

The side-entry option rejects left entry, trimming, pair cutting and profiles with holes instead of silently using an overhead route. It also requires a positive outside lead margin, a reachable corridor between stock and park, and stock top within vertical travel.

### Actual simulation result

- 2596 contour points; **2603 simulated movements**.
- Estimated duration **362.702 s (6:03)**, excluding acceleration and real controller effects.
- All movement destination coordinates, including entry/exit and park: horizontal [-190.82,240.00] mm and vertical [18.64,241.36] mm for both towers.
- Axis margins over the complete program: at least **5.00 mm horizontal** (park), **18.64 mm below**, **8.64 mm above**. The exterior entry has **5 mm stock clearance**.
- No critical findings, no generator warnings, no JavaScript exceptions; WebGL simulation verified in Chromium.
- Four informational 90° contour-turn notices remain: local overheating is possible at corners. No physical cutting or controller test was performed.

For every generated Program movement, destination coordinates must be finite and inside travel. Linear interpolation stays in the convex axis travel box; G92 homing coordinates retain the documented limit-switch exception. Start/end blocks synchronize Program.pos. The existing simulator checks stock intersections before exposing generated output; critical findings block save, copy and machine start. Rotation intersection checks remain sampled; fixtures, thermal effects and real controller behavior remain outside the simulator model.

The F1 source, G-code and images stay outside the checkout. They are not included in the public PR, per the user's request to keep F1 external.

## Reproduction

No third-party dependency is needed for the regression suite:

```sh
node --test tests/generator.test.cjs
python3 -B -m unittest discover -s tests -v
```

Without the private file, the external-model tests are explicitly skipped. To execute them, supply your existing file without copying it into the checkout:

```sh
F1_STEP=/absolute/path/F1.stp node --test tests/generator.test.cjs
F1_STEP=/absolute/path/F1.stp python3 -B -m unittest discover -s tests -v
```

The committed synthetic rectangular profile has split coedge chains and no dependency on F1. Tests cover full-chain reconstruction, stock-axis metadata, no trim/B90, all commanded travel coordinates, approach/clearance rejection, invalid input rejection, Program.pos, simulator collision detection and the right-side exterior corridor. External tests check both the original 340 mm stock rejection and successful updated 400 mm stock path at B0.

Validation with F1_STEP set: **8 Node tests and 2 Python tests pass**. Without the private file, its three tests are explicitly skipped and the synthetic regressions still run in CI.

The Python CLI retains its existing legacy trimming/90° workflow; the optional-trim/table-0 and side-entry workflow is the browser generator. Python receives the shared geometry correction and user-confirmed machine dimensions.
