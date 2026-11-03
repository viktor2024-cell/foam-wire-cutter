[Русский](README.md) | **English**

# Foam Wire Cutter

Software for a hot-wire foam cutting machine with a rotary table (GRBL, XYZAB axes).

> ⚠️ **Emergency stop is the physical key or the power switch only.** The "Stop" button on the page is not an emergency stop.

> The web interface is in Russian. Tab names are given below as they appear on screen, with a translation.

## Features

- **"ГЕНЕРАТОР G-CODE" tab (G-code generator)** builds G-code from a STEP file:
  1. a single part;
  2. two parts from one stock block, one of them mirrored (for example, the left and right wing panels).
- **"РЕЗКА" tab (Cutting)** shows the program in 3D, sends it to the machine and controls the machine over USB.

## Getting started

### Web page

Open `index.html` in a browser: no installation and no internet connection needed. Machine control over USB works only in Chrome or Edge, because the page opens the COM port through Web Serial.

The `lib/` folder (three.js r128, MIT license: `lib/three.LICENSE`) is required for the 3D view. Keep it next to `index.html`.

### Python generator

A fallback that runs without a browser. It needs Python 3 and no third-party packages.

```
python FM_step2gcode.py part.stp --stock 340 230 50 --bottom-z 10
```

The G-code is saved next to the STEP file as `part_auto.gcode` (or to the file given with `-o`).

| Option | Meaning | Default |
|---|---|---|
| `--stock LENGTH WIDTH THICKNESS` | stock block, mm: along the span, along the chord, thickness | `340 230 50` |
| `--bottom-z` | Z of the stock's bottom face, mm | `10` |
| `--material` | foam type from `materials.json` | `_default` from the file |
| `--kerf` | cut width, mm (`0` disables compensation) | from the material |
| `--lead-side {+,-}` | side of the contour entry along the carriage Y axis | `+` |
| `--lead-margin` | how far the entry point lies beyond the stock edge, mm | `5` |
| `--retract` | retract distance during face trimming, mm | `30` |
| `--sag`, `--max-step` | discretization tolerance and maximum step along the contour, mm | `0.01`, `1` |
| `--no-power-comp` | do not vary wire power with wire length | off |
| `--power-step` | minimum change of S that triggers a new `M03` command | `5` |

All options: `python FM_step2gcode.py --help`.

#### Materials

`materials.json` holds cutting settings for specific foams: `FeedRateCut` is the cutting speed, mm/s; `WireMinPower` is the S power with a straight wire (374 mm); `WireMaxPower` is the S ceiling; `Kerf` is the cut width, mm. Add your own foam following the existing entry.

## Repository layout

| File | Purpose |
|---|---|
| `index.html` | web interface: generator, 3D preview, machine control |
| `FM_step2gcode.py` | Python G-code generator from STEP |
| `FM_step.py` | STEP reader; splits a part into ruled surfaces |
| `FM_lib.py` | machine settings and G-code blocks (start, end, face trimming) |
| `materials.json` | cutting settings for different foams |
| `lib/` | three.js library for the 3D view |
