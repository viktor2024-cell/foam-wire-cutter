"""
  FM_step2gcode - G-code для проволочной резки по твёрдому телу из STEP, без FreeCAD.

  Порядок операций:
    1. торцевание заготовки до чистового размера детали по размаху (стол 0 градусов);
    2. поворот стола на 90 градусов (размах детали оказывается вдоль проволоки);
    3. отверстия (замкнутые контуры): вход проволоки сверху по вертикальной щели, обход контура, выход вверх;
    4. внешний контур профиля: вход со стороны задней кромки (или передней), обход, выход тем же путём.

  Расположение: заготовка центрирована на оси стола, деталь центрирована в заготовке.
  Модель при угле стола 0: размах вдоль Y каретки, хорда вдоль X, толщина вдоль Z.
  После поворота на +90 (как объект Rotation в FM_*): X станка = -(y - yc), Y каретки = x - xc.

  Запуск:
    python FM_step2gcode.py D:\\1800mm\\W2.stp --stock 340 230 50 --bottom-z 10
"""
import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import FM_lib as L
import FM_step as S

EOL = L.EOL


class Layout:
  """ Преобразование координат модели в координаты станка при угле стола 90 """
  def __init__(this, center, z_mid, half_width, plane_a, plane_b):
    this.xc, this.yc, this.zc = center
    this.z_mid, this.half = z_mid, half_width
    this.plane_a, this.plane_b = plane_a, plane_b

  def machine(this, p):
    return (-(p[1] - this.yc), p[0] - this.xc, p[2] - this.zc + this.z_mid)

  def towers(this, a, b):
    """ Положение концов проволоки на башнях: ((Y, Z) слева, (Y, Z) справа) для прямой через точки a и b """
    ma, mb = this.machine(a), this.machine(b)
    def at(x):
      s = (x - ma[0]) / (mb[0] - ma[0])
      return (ma[1] + s * (mb[1] - ma[1]), ma[2] + s * (mb[2] - ma[2]))
    return at(-this.half), at(this.half)


def sample_sequence(segments, sag, max_step, min_step = 0.02):
  """
    Точки (A, B) по цепочке участков без повторов на стыках. Точки ближе min_step к предыдущей
    отбрасываются: на гладком стыке граней смещённые концы расходятся на сотые доли мм, и микрошаг
    назад заставил бы станок затормозить до нуля (пережог в этом месте).
  """
  points = []
  for seg in segments:
    for p in S.sample_face(seg, 0.0, 1.0, sag, max_step):
      if len(points) == 0 or max(S._dist(points[-1][0], p[0]), S._dist(points[-1][1], p[1])) > min_step:
        points.append(p)
  return points


def prepare_contour(segments, axis, kerf, material_inside, notes):
  """ Смещение контура на половину толщины реза в сторону отхода """
  if kerf <= 0:
    return segments
  result, contour_notes = S.offset_segments(segments, axis, kerf / 2, material_inside)
  notes += contour_notes
  return result


def hole_block(safe, prog, face, layout, axis, kerf, notes, sag, max_step):
  """ Отверстие: вход сверху в самую высокую точку контура, обход, выход вверх по той же щели """
  segments = prepare_contour([S.face_segment(face)], axis, kerf, False, notes)

  # - Старт: точка, в которой контур наивысший на станке
  best, best_z = (0, 0.0), -1e18
  for k, seg in enumerate(segments):
    for i in range(361):
      u = i / 360
      (yl, zl), (yr, zr) = layout.towers(seg.A(u), seg.B(u))
      if (zl + zr) / 2 > best_z:
        best, best_z = (k, u), (zl + zr) / 2
  pts = sample_sequence(S.start_sequence(segments, *best), sag, max_step)
  towers = [layout.towers(a, b) for a, b in pts]

  (yl, zl), (yr, zr) = towers[0]
  g = ";" + EOL + "; *** HOLE: %d points, kerf %.2f ***" % (len(towers), kerf) + EOL
  g += prog.travel("move", yl, safe, yr, safe)
  g += prog.travel("cut",  yl, zl, yr, zr)                         # - вниз по щели до контура
  for (yl2, zl2), (yr2, zr2) in towers[1:]:
    g += prog.travel("cut", yl2, zl2, yr2, zr2)
  g += prog.travel("cut",  yl, safe, yr, safe)                     # - вверх по той же щели
  return g, towers


def profile_block(safe, prog, contour, layout, axis, kerf, notes, side, stock_width, margin, sag, max_step):
  """ Внешний контур: вход горизонтально со стороны side (+1 или -1 по Y каретки), выход тем же путём """
  segments = prepare_contour(S.contour_segments(contour), axis, kerf, True, notes)

  # - Участок грани, лежащий дальше всех в сторону входа; середина его - точка входа
  faces = [k for k, seg in enumerate(segments) if seg.kind == "face"]
  start = max(faces, key = lambda k: side * layout.machine(segments[k].A(0.5))[1])
  pts = sample_sequence(S.start_sequence(segments, start, 0.5), sag, max_step)
  towers = [layout.towers(a, b) for a, b in pts]

  y_out = side * (stock_width / 2 + margin)
  (yl, zl), (yr, zr) = towers[0]
  g = ";" + EOL + "; *** PROFILE: %d points, kerf %.2f, lead-in from Y=%.1f ***" % (len(towers), kerf, y_out) + EOL
  g += prog.travel("move", y_out, safe, y_out, safe)
  g += prog.travel("cut",  y_out, zl, y_out, zr)                   # - вниз снаружи заготовки
  g += prog.travel("cut",  yl, zl, yr, zr)                         # - подход к контуру по щели
  for (yl2, zl2), (yr2, zr2) in towers[1:]:
    g += prog.travel("cut", yl2, zl2, yr2, zr2)
  g += prog.travel("cut",  y_out, zl, y_out, zr)                   # - обратно по щели наружу
  g += prog.travel("cut",  y_out, safe, y_out, safe)               # - вверх вне детали
  return g, towers


def build_program(stp_path, stock, bottom_z, trim_retract = 30.0, lead_margin = 5.0, side = 1,
                  axis = None, sag = 0.01, max_step = 1.0, cfg_override = None,
                  power_comp = True, power_step = 5.0, kerf = 1.0):
  """ Возвращает (текст G-code, сведения, предупреждения) """
  cfg, _ = L.with_defaults(cfg_override or {})
  warnings, info = [], {}

  model = S.Model(stp_path)
  outer, holes, span_axis, plane_a, plane_b = model.build(axis)
  if span_axis != 1:
    raise S.StepError("Пока поддерживается только размах вдоль оси Y модели (найдена ось %s)" % "XYZ"[span_axis])

  # - Габарит детали по направляющим
  xs, zs = [], []
  for face, _ in outer.items:
    for a, b in S.sample_face(face, face.t0, face.t1, 0.05, 5.0):
      xs += [a[0], b[0]]; zs += [a[2], b[2]]
  part = dict(x0 = min(xs), x1 = max(xs), z0 = min(zs), z1 = max(zs), span = plane_b - plane_a)
  stock_length, stock_width, stock_height = stock
  if part["x1"] - part["x0"] > stock_width or part["z1"] - part["z0"] > stock_height or part["span"] > stock_length:
    raise ValueError("Деталь %.1f x %.1f x %.1f не помещается в заготовку %.1f x %.1f x %.1f" % (
      part["span"], part["x1"] - part["x0"], part["z1"] - part["z0"], stock_length, stock_width, stock_height))

  layout = Layout(((part["x0"] + part["x1"]) / 2, (plane_a + plane_b) / 2, (part["z0"] + part["z1"]) / 2),
                  bottom_z + stock_height / 2, float(cfg["FieldWidth"]) / 2, plane_a, plane_b)
  info["part"] = part

  # --- Торцевание до размера детали по размаху (стол 0: размах вдоль Y каретки)
  trim = dict(Length = stock_length, Width = stock_width, Height = stock_height, LongAxis = "Y",
              TrimEnds = (stock_length - part["span"]) / 2 - kerf / 2, TrimSides = 0.0, BottomZ = bottom_z, RetractOffset = trim_retract)
  cfg, trim = L.with_defaults(cfg, trim)
  errors, trim_warnings = L.check_trim(cfg, trim)
  if errors:
    raise L.TrimError("; ".join(errors))
  # - Стол вращается после торцевания, поэтому зазор до башни считаем по размеру после среза
  warnings += [w for w in trim_warnings if "зазор до башни" not in w]
  radius = math.hypot(part["span"], stock_width) / 2
  if float(cfg["ParkX"]) - radius < float(trim["RadialMargin"]):
    warnings.append("При повороте на 90 радиус заготовки %.1f мм, каретки отведены только на %.1f мм: проверьте зазор" % (
      radius, float(cfg["ParkX"])))

  # - Шапка: сведения для симулятора и для человека (GRBL комментарии пропускает)
  program  = "; FM_step2gcode: %s" % os.path.basename(stp_path) + EOL
  program += "; STOCK L=%g W=%g H=%g Z0=%g" % (stock_length, stock_width, stock_height, bottom_z) + EOL
  program += "; CUT F=%g mm/s S=%g..%g kerf=%g" % (float(cfg["FeedRateCut"]), float(cfg["WireMinPower"]),
                                                   float(cfg["WireMaxPower"]), kerf) + EOL
  program += L.start_block(cfg)
  prog = L.Program(cfg, power_comp, power_step)
  if float(trim["TrimEnds"]) > 0:
    block, _ = L.trim_block(cfg, trim, 0.0, prog)
    program += block
  safe = L.travel_height(cfg, bottom_z + stock_height)
  # - Перед поворотом каретки уходят от центра в сторону дома: угол заготовки описывает окружность вокруг оси стола
  park = float(cfg["ParkX"])
  program += ";" + EOL + "; - Rotation 90" + EOL + prog.travel("move", park, safe, park, safe) + L.rotate(cfg, 90.0)

  all_towers = []
  for hole in holes:
    block, towers = hole_block(safe, prog, hole.items[0][0], layout, span_axis, kerf, warnings, sag, max_step)
    program += block
    all_towers += towers
  block, towers = profile_block(safe, prog, outer, layout, span_axis, kerf, warnings, side, stock_width, lead_margin, sag, max_step)
  program += block
  all_towers += towers
  program += L.end_block(cfg)

  # --- Проверка пределов хода
  half_y = float(cfg["HorizontalTravel"]) / 2
  for (yl, zl), (yr, zr) in all_towers:
    if abs(yl) > half_y or abs(yr) > half_y or min(zl, zr) < 0 or max(zl, zr) > float(cfg["VerticalTravel"]):
      raise ValueError("Контур выходит за ход кареток: Y=(%.1f, %.1f) Z=(%.1f, %.1f)" % (yl, yr, zl, zr))
  info["points"] = len(all_towers)
  info["holes"] = len(holes)
  info["power"] = (prog.min_power, prog.max_power, prog.changes)
  if prog.clipped:
    warnings.append("Мощность проволоки упёрлась в WireMaxPower=%g: проволока слишком длинная для этой формулы" % float(cfg["WireMaxPower"]))
  return program, info, warnings


def load_materials():
  """ materials.json рядом со скриптом: {"_default": "имя", "имя": {"FeedRateCut": мм/с, "WireMinPower": S, "WireMaxPower": S, "Kerf": мм}} """
  path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "materials.json")
  if not os.path.exists(path):
    return {}
  import json
  with open(path, encoding = "utf-8") as f:
    return json.load(f)


def main():
  parser = argparse.ArgumentParser(description = "STEP -> G-code для проволочной резки")
  parser.add_argument("stp")
  parser.add_argument("-o", "--output")
  parser.add_argument("--stock", nargs = 3, type = float, default = [340.0, 230.0, 50.0], metavar = ("ДЛИНА", "ШИРИНА", "ТОЛЩИНА"),
                      help = "заготовка: вдоль размаха, вдоль хорды, толщина")
  parser.add_argument("--bottom-z", type = float, default = 10.0, help = "Z нижней грани заготовки")
  parser.add_argument("--retract", type = float, default = 30.0, help = "отвод при торцевании, мм")
  parser.add_argument("--lead-margin", type = float, default = 5.0, help = "вынос входа за край заготовки, мм")
  parser.add_argument("--lead-side", choices = ["+", "-"], default = "+", help = "сторона входа в контур по Y каретки")
  parser.add_argument("--sag", type = float, default = 0.01, help = "допуск дискретизации, мм")
  parser.add_argument("--max-step", type = float, default = 1.0, help = "максимальный шаг по контуру, мм")
  parser.add_argument("--material", help = "пенопласт из materials.json (скорость, мощность, толщина реза)")
  parser.add_argument("--kerf", type = float, help = "толщина реза, мм (0 - без компенсации); по умолчанию из материала")
  parser.add_argument("--no-power-comp", action = "store_true", help = "не менять мощность проволоки по её длине")
  parser.add_argument("--power-step", type = float, default = 5.0, help = "минимальное изменение S для новой команды M03")
  args = parser.parse_args()

  # - Материал: скорость реза, мощность проволоки и толщина реза для конкретного пенопласта
  materials = load_materials()
  name = args.material or materials.get("_default")
  if name is not None and name not in materials:
    raise SystemExit("Материал '%s' не найден в materials.json. Есть: %s" % (name, ", ".join(k for k in materials if not k.startswith("_"))))
  material = materials.get(name, {}) if name else {}
  cfg_override = {key: material[key] for key in ("FeedRateCut", "WireMinPower", "WireMaxPower") if key in material}
  kerf = args.kerf if args.kerf is not None else float(material.get("Kerf", 1.0))

  program, info, warnings = build_program(args.stp, tuple(args.stock), args.bottom_z, args.retract, args.lead_margin,
                                          1 if args.lead_side == "+" else -1, None, args.sag, args.max_step, cfg_override,
                                          not args.no_power_comp, args.power_step, kerf)
  if name:
    print("Материал: %s (рез %g мм/с, S %g..%g, толщина реза %g мм)" % (
      name, float(material.get("FeedRateCut", L.DEFAULT_CONFIG["FeedRateCut"])),
      float(material.get("WireMinPower", L.DEFAULT_CONFIG["WireMinPower"])),
      float(material.get("WireMaxPower", L.DEFAULT_CONFIG["WireMaxPower"])), kerf))
  output = args.output or os.path.splitext(args.stp)[0] + "_auto.gcode"
  with open(output, "w", newline = "") as f:
    f.write(program)

  part = info["part"]
  print("Деталь: размах %.1f, хорда %.1f, толщина %.1f; отверстий: %d" % (
    part["span"], part["x1"] - part["x0"], part["z1"] - part["z0"], info["holes"]))
  print("Точек контуров: %d; строк: %d" % (info["points"], program.count("\n")))
  low, high, changes = info["power"]
  print("Мощность проволоки: S %.0f..%.0f, изменений: %d" % (low, high, changes))
  for w in warnings:
    print("ПРЕДУПРЕЖДЕНИЕ:", w)
  print("Сохранено:", output)


if __name__ == "__main__":
  main()
