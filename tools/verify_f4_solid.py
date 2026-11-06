#!/usr/bin/env python3
"""Conservative independent STEP-solid intrusion scan for F4 diagnostic JSON.

Install pythonocc/OCP (e.g. cadquery), then run:
  python tools/verify_f4_solid.py F4-11.stp F4-11-motion-DIAGNOSTIC.json

This checks whether sampled hot-wire segments ENTER the volume of the
original intended STEP solid. Any confirmed point inside is unsafe.
Zero hits is NOT a proof of safety: between-sample collisions, kerf,
fixture interference, and actual stock removal are not certified.
"""
import argparse
import json
import math
from pathlib import Path
from OCP.STEPControl import STEPControl_Reader
from OCP.TopAbs import TopAbs_SOLID, TopAbs_IN, TopAbs_ON
from OCP.TopExp import TopExp_Explorer
from OCP.TopoDS import TopoDS
from OCP.BRepClass3d import BRepClass3d_SolidClassifier
from OCP.gp import gp_Pnt

def read_solid(filename):
    reader = STEPControl_Reader()
    if "RetDone" not in str(reader.ReadFile(str(filename))):
        raise ValueError("STEP could not be read")
    reader.TransferRoots()
    cursor = TopExp_Explorer(reader.OneShape(), TopAbs_SOLID)
    solids = []
    while cursor.More():
        solids.append(TopoDS.Solid_s(cursor.Current()))
        cursor.Next()
    if len(solids) != 1:
        raise ValueError(f"Expected exactly one preserved solid, found {len(solids)}")
    return solids[0]

def validate_motion(data):
    if data.get("schema") != "foam-wire-f4-diagnostic-motion-v1":
        raise ValueError("Unsupported diagnostic JSON schema")
    rotation = data.get("rotation")
    if rotation is None or any(abs(rotation[i][j] - (1 if i == j else 0)) > 1e-9
                               for i in range(3) for j in range(3)):
        raise ValueError("Only an unrotated STEP is supported by this verifier")
    if abs(data.get("scale", -1) - 1) > 1e-9:
        raise ValueError("Only STEP scale 1 is supported")
    if not data.get("operations"):
        raise ValueError("No guide operations found")

def interpolate(a, b, t):
    return [x + t * (y - x) for x, y in zip(a, b)]

def verify(step, report, along=11, stride=2, tol=1e-5, limit=25):
    data = json.loads(Path(report).read_text(encoding="utf-8"))
    validate_motion(data)
    solid = read_solid(step)
    classifier = BRepClass3d_SolidClassifier(solid)
    runs = []
    for operation in data["operations"]:
        samples = operation["samples"]
        # Also check wire positions BETWEEN STEP samples; checking only the
        # cutter endpoints is insufficient for an oblique ruled surface.
        inside, on_surface, count, examples = 0, 0, 0, []
        for i in range(0, len(samples) - 1, stride):
            j = min(len(samples) - 1, i + stride)
            for fraction in (0.0, .25, .5, .75, 1.0):
                a = interpolate(samples[i]["profileA"], samples[j]["profileA"], fraction)
                b = interpolate(samples[i]["profileB"], samples[j]["profileB"], fraction)
                for k in range(1, along):
                    p = interpolate(a, b, k / along)
                    if not all(math.isfinite(x) for x in p):
                        raise ValueError("Nonfinite wire coordinate")
                    classifier.Perform(gp_Pnt(*p), tol)
                    state = classifier.State()
                    count += 1
                    if state == TopAbs_IN:
                        inside += 1
                        if len(examples) < limit:
                            examples.append([round(x, 4) for x in p])
                    elif state == TopAbs_ON:
                        on_surface += 1
        runs.append({
            "operation": operation.get("operation"),
            "curve_ids": operation.get("ids"),
            "tested_wire_points": count,
            "confirmed_inside_solid": inside,
            "on_solid_boundary": on_surface,
            "first_inside_positions": examples,
            "status": "INSIDE_PRESERVED_SOLID" if inside else "NO_SAMPLED_INTRUSIONS_UNPROVEN",
        })
    return {
        "schema": "foam-wire-original-solid-check-v1",
        "step_filename": Path(step).name,
        "motion_filename": Path(report).name,
        "operations": runs,
        "machine_gcode_approved": False,
        "note": "A positive inside-solid count blocks the path. Zero sampled hits is not proof of safety.",
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("step", type=Path)
    parser.add_argument("diagnostic_json", type=Path)
    parser.add_argument("--along", type=int, default=11)
    parser.add_argument("--stride", type=int, default=2)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.along < 2 or args.stride < 1:
        parser.error("--along must be >= 2 and --stride >= 1")
    result = verify(args.step, args.diagnostic_json,
                    along=args.along, stride=args.stride)
    payload = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(payload + "\n", encoding="utf-8")
    print(payload)

if __name__ == "__main__":
    main()
