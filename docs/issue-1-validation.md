# Issue #1: F1 on-edge stock validation

Result: **rejected; no machining G-code is produced for F1 under the requested conditions**. The source STEP is private to the task and is not included in the repository. No physical machine was connected.

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

## Motion and machine limits

Machine parameters remain unchanged: field width 374 mm, horizontal travel ±245 mm, vertical travel 0–235 mm, clearance 20 mm. Even with stock bottom Z=0, the required overhead move is **250 mm**, exceeding vertical travel by **15 mm**. At the UI default bottom Z=10, it is 260 mm (excess 25 mm); stock top is already 240 mm. Changing the stock interpretation does not solve either incompatibility.

The generator stops at the geometry-fit check before it emits an executable result, so there is no valid F1 toolpath, entry/exit, or cutting simulation to approve. Enlarging the stock or changing machine travel to force success was deliberately not done. A different model/placement strategy and reachable clearance would need separate investigation.

For valid generated programs, every Program movement destination (including approach, exit and start/end park) must be finite and inside travel. Linear interpolation remains inside the convex axis travel box; homing coordinates set by G92 are the documented limit-switch exception. Start/end blocks now update Program.pos rather than emitting untracked movements. Generation additionally runs the existing simulator checks before exposing the result. Critical simulator findings block save and machine start; they cannot be overridden by confirmation. This simulator models stock/wire intersection, travel and sampled rotation checks; fixtures, thermal effects, actual GRBL motion and the physical machine remain outside its model.

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

The committed synthetic rectangular profile has split coedge chains and no dependency on F1. It checks full-chain reconstruction, stock-axis metadata, no trim/B90 when disabled, finite in-range motion, excessive approach/clearance rejection, invalid input rejection and Program.pos synchronization. The external tests check the actual trimmed dimensions and the expected stock-fit rejection. Node tests execute the production generator extracted from index.html, not a port of it.

Validation in Chromium: synthetic model generated 410 moves, simulated duration 141.815 s, WebGL active, no critical simulator findings and no JavaScript exceptions. F1 UI showed `Деталь 50.0 x 380.6 x 221.7 не помещается ... 50.0 x 340.0 x 230.0`, with result export controls hidden. The independent geometry illustration and browser screenshots remain task-local to avoid publishing model geometry without permission.

The Python CLI retains its existing legacy trimming/90° workflow; this issue's optional-trim/table-0 workflow is the browser generator. Only the shared geometry parsing correction applies to Python here.
