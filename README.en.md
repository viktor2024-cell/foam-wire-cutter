[Русский](README.md) | **English**

# Foam Wire Cutter

**From a STEP file to the cut in one window**

Getting from a model to the machine used to go like this: run macros in FreeCAD that build the G-code, then open Candle and send it to the machine. Candle is made for ordinary CNC machines, so it only shows toolpath lines and not how a wire cut actually proceeds. You had to take the code on trust.

Now it all happens on one browser page.

- **Load a STEP file, get G-code.** One part, or two from the same stock block, one of them mirrored: for example, the left and right wing panels. The "Зеркало" (Mirror) button does that for you.
- **See the cut before you run it.** The program opens in 3D and you can play it back on screen: view it from above, along the wire, or in 3D.
- **Control the machine from the same page.** USB connection, homing, start and pause, all in one tab.
- **Nothing to install.** Open `index.html` in Chrome or Edge. No internet connection is needed either: everything required is in the folder.
- **Open code.** Read it, adapt it to your machine, and see exactly what goes into the G-code.

Before: FreeCAD, macros, Candle and guessing the toolpath. Now: one file, a clear picture and fewer ruined stock blocks.

---

Software for a hot-wire foam cutting machine with a rotary table (GRBL, XYZAB axes).

> ⚠️ **Emergency stop is the physical key or the power switch only.** The "Stop" button on the page is not an emergency stop.

> The web interface is in Russian. Tab names are given below as they appear on screen, with a translation.

## Features

- **"ГЕНЕРАТОР G-CODE" tab (G-code generator)** builds G-code from a STEP file:
  1. a single part;
  2. two parts from one stock block, one of them mirrored (for example, the left and right wing panels).
- **"РЕЗКА" tab (Cutting)** shows the program in 3D, sends it to the machine and controls the machine over USB.

## Getting started

Open `index.html` in a browser: no installation and no internet connection needed. Machine control over USB works only in Chrome or Edge, because the page opens the COM port through Web Serial.

The `lib/` folder (three.js r128, MIT license: `lib/three.LICENSE`) is required for the 3D view. Keep it next to `index.html`.

## Repository layout

| File | Purpose |
|---|---|
| `index.html` | web interface: generator, 3D preview, machine control |
| `FM_step2gcode.py` | Python G-code generator from STEP |
| `FM_step.py` | STEP reader; splits a part into ruled surfaces |
| `FM_lib.py` | machine settings and G-code blocks (start, end, face trimming) |
| `materials.json` | cutting settings for different foams |
| `lib/` | three.js library for the 3D view |

## License

[MIT](LICENSE). The three.js library in `lib/` is distributed under its own MIT license: `lib/three.LICENSE`.

> The software drives a heated wire and the machine's moving parts. You use it at your own risk; the license provides the code "as is", without warranty.
