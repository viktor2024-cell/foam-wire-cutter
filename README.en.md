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
