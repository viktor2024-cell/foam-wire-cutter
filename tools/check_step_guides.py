#!/usr/bin/env python3
"""Offline STEP guide-curve intrusion diagnostic. Never emits machine G-code.

Requires numpy, scipy and OCP (OCP is bundled with cadquery).
Usage: python tools/check_step_guides.py F4-1.stp --pairs 197:406 544:681
"""
import argparse
import json
import re
from pathlib import Path

import numpy as np
from scipy.interpolate import BSpline
from OCP.STEPControl import STEPControl_Reader
from OCP.BRepClass3d import BRepClass3d_SolidClassifier
from OCP.TopAbs import TopAbs_IN, TopAbs_ON, TopAbs_SOLID
from OCP.TopExp import TopExp_Explorer
from OCP.gp import gp_Pnt


def entities_of(text):
    return {int(k): v for k, v in re.findall(r'(?m)^#(\d+)\s*=\s*(.*?);', text, re.S)}


def curve_points(entities, identifier):
    entity = entities[identifier]
    match = re.search(r"B_SPLINE_CURVE_WITH_KNOTS\s*\(\s*'[^']*'\s*,\s*(\d+)\s*,\s*\((.*?)\)", entity, re.S)
    if not match:
        raise ValueError(f'#{identifier}: unsupported curve type')
    degree = int(match.group(1))
    refs = [int(v) for v in re.findall(r'#(\d+)', match.group(2))]
    groups = re.findall(r'\(([^()]*)\)', entity[match.end():])
    if len(groups) < 2:
        raise ValueError(f'#{identifier}: missing knot data')
    mult = [int(x) for x in groups[0].split(',')]
    knot_values = [float(x) for x in groups[1].split(',')]
    knots = np.repeat(knot_values, mult)
    control = []
    for ref in refs:
        point = re.search(r"CARTESIAN_POINT\s*\(\s*'[^']*'\s*,\s*\((.*?)\)\s*\)", entities[ref], re.S)
        if not point:
            raise ValueError(f'#{ref}: unsupported control point')
        control.append([float(x) for x in point.group(1).split(',')])
    control = np.array(control)
    if len(knots) != len(control) + degree + 1:
        raise ValueError(f'#{identifier}: invalid knot vector')
    return BSpline(knots, control, degree, extrapolate=False)(
        np.linspace(knots[degree], knots[len(control)], 2049))


def sample_curve(points, count, closed):
    if closed:
        points = np.vstack([points, points[0]])
    lengths = np.r_[0, np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))]
    if lengths[-1] < 1e-8:
        raise ValueError('Degenerate guide curve')
    fractions = np.linspace(0, lengths[-1], count, endpoint=not closed)
    return np.column_stack([np.interp(fractions, lengths, points[:, k]) for k in range(3)])


def check_pair(entities, solid, ids, count=64, across=9, tolerance=1e-4):
    raw = [curve_points(entities, k) for k in ids]
    closed = [bool(np.linalg.norm(p[0]-p[-1]) < .05) for p in raw]
    if closed[0] != closed[1]:
        raise ValueError(f'{ids}: open/closed mismatch')
    a, b = [sample_curve(p, count, closed[0]) for p in raw]
    matching = []
    for reverse in (False, True):
        candidate = b[::-1] if reverse else b
        for shift in range(count if closed[0] else 1):
            shifted = np.roll(candidate, shift, axis=0)
            da = a - a.mean(axis=0)
            db = shifted - shifted.mean(axis=0)
            rms = float(np.mean(np.sum((da-db)**2, axis=1))**.5)
            matching.append((rms, reverse, shift, shifted))
    rms, reverse, shift, b = min(matching, key=lambda item: item[0])
    classifier = BRepClass3d_SolidClassifier(solid)
    inside = on = outside = 0
    examples = []
    for start, end in zip(a[::2], b[::2]):
        for t in np.linspace(0, 1, across):
            p = start + t*(end-start)
            classifier.Perform(gp_Pnt(*[float(x) for x in p]), tolerance)
            state = classifier.State()
            if state == TopAbs_IN:
                inside += 1
                if len(examples) < 4:
                    examples.append([round(float(x), 2) for x in p])
            elif state == TopAbs_ON:
                on += 1
            else:
                outside += 1
    return {'pair': ids, 'closed': closed[0], 'matching_rms_mm': round(rms, 4),
            'reversed': reverse, 'shift_samples': shift, 'tested': inside+on+outside,
            'inside': inside, 'on': on, 'outside': outside,
            'inside_examples_mm': examples, 'approved_for_cutting': False}


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('step', type=Path)
    cli.add_argument('--pairs', nargs='+', default=['197:406', '544:681'])
    args = cli.parse_args()
    entities = entities_of(args.step.read_text(encoding='utf-8', errors='replace'))
    reader = STEPControl_Reader()
    if reader.ReadFile(str(args.step)) != 1:
        raise RuntimeError('STEP import failed')
    reader.TransferRoots()
    solid = reader.OneShape()
    if not TopExp_Explorer(solid, TopAbs_SOLID).More():
        raise RuntimeError('STEP has no solid; intrusion test unavailable')
    checked = []
    for pair in args.pairs:
        ids = [int(x) for x in pair.split(':')]
        if len(ids) != 2:
            raise ValueError('Use STEP entity IDs such as 197:406')
        checked.append(check_pair(entities, solid, ids))
    print(json.dumps({'file': args.step.name, 'method': 'sampled straight wire vs solid classifier',
                      'note': 'Diagnostic only; zero inside samples would not prove safe machining',
                      'results': checked}, indent=2, ensure_ascii=False))
    return 2 if any(x['inside'] for x in checked) else 0


if __name__ == '__main__':
    raise SystemExit(main())
