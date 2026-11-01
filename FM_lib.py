"""
  FM_lib - общая логика для макросов FM_* (чистый Python, без импорта FreeCAD).

  Содержит блоки G-code: старт, конец, торцевание. Из них собираются программы
  (FM_MakeTrim - только торцевание, FM_step2gcode - полная программа по STEP).
  Конвенции те же, что в FM_MakeGCODE: оси X1/Z1 - левая башня, X2/Z2 - правая,
  R1 - поворотный стол, подача в конфиге в мм/с (в G-code умножается на 60).
"""
import math

# - Значения по умолчанию взяты из FM_Init.FCMacro
DEFAULT_CONFIG = {
  "HorizontalTravel": 490.0,    # - ход по Y: от -245 до +245
  "VerticalTravel":   235.0,    # - ход по Z: от 0 до 235
  "FieldWidth":       374.0,    # - расстояние между башнями по X: +-187

  "X1AxisName": "X", "Z1AxisName": "Y", "X2AxisName": "Z", "Z2AxisName": "A", "R1AxisName": "B",

  "HomingX1": 249.0, "HomingZ1": 238.0, "HomingX2": 245.0, "HomingZ2": 236.0, "HomingR1": -7.3,
  "ParkX": 240.0, "ParkZ": 235.0, "ParkR1": 0.0,
  "TravelClearance": 20.0,      # - на сколько выше верха заготовки идут холостые ходы

  "FeedRateCut": 7.0, "FeedRateMove": 14.0, "FeedRateRotate": 30.0,
  "WireMinPower": 500, "WireMaxPower": 1000,

  "CutCommand":          "G01 {Position} F{FeedRate}",
  "MoveCommand":         "G00 {Position} F{FeedRate}",
  "HomingCommand":       "$H",
  "WireOnCommand":       "M03 S{WirePower}",
  "WireOffCommand":      "M05",
  "InitPositionCommand": "G92 {Position}",
}

# - Параметры заготовки по умолчанию
DEFAULT_TRIM = {
  "Length":       360.0,  # - длинная сторона заготовки
  "Width":        100.0,  # - короткая сторона (толщина стандартного листа)
  "Height":       100.0,  # - высота по Z
  "LongAxis":     "Y",    # - вдоль какой оси стоит длинная сторона при угле стола 0: "Y" или "X"
  "TrimEnds":     5.0,    # - сколько срезать с каждого торца (перпендикулярно длинной стороне)
  "TrimSides":    0.0,    # - сколько срезать с каждой длинной стороны (0 = не резать)
  "RetractOffset": 30.0,  # - на сколько отвести проволоку от центра перед подъёмом (чтобы не испортить чистый рез)
  "BottomZ":      0.0,    # - высота нижней грани заготовки (резать вниз до неё)
  "RadialMargin": 2.0,    # - минимальный зазор между углом заготовки и башней при вращении
}

EOL = "\r\n"


class TrimError(Exception):
  pass


def _f(cfg, name):
  return float(cfg[name])


def travel_height(cfg, top):
  """ Высота холостых ходов и поворота стола для заготовки с верхом на Z=top """
  return float(top) + _f(cfg, "TravelClearance")


def _travel_position(cfg, x1, z1, x2, z2):
  return "%s%.2f %s%.2f %s%.2f %s%.2f" % (
    cfg["X1AxisName"], x1, cfg["Z1AxisName"], z1, cfg["X2AxisName"], x2, cfg["Z2AxisName"], z2)


def _rotation_position(cfg, angle):
  return "%s%.2f" % (cfg["R1AxisName"], angle)


def _command(template, position, feed_rate):
  return template.replace("{Position}", position).replace("{FeedRate}", str(float(feed_rate) * 60)) + EOL


def _travel(cfg, template, feed, x1, z1, x2, z2):
  return _command(template, _travel_position(cfg, x1, z1, x2, z2), feed)


def _rotation(cfg, angle):
  return _command(cfg["MoveCommand"], _rotation_position(cfg, angle), cfg["FeedRateRotate"])


def with_defaults(cfg, trim = None):
  full_cfg = dict(DEFAULT_CONFIG)
  full_cfg.update(cfg)
  full_trim = dict(DEFAULT_TRIM)
  full_trim.update(trim or {})
  return full_cfg, full_trim


def travel(cfg, kind, y_left, z_left, y_right, z_right):
  """ kind: "cut" либо "move"; координаты - Y и Z левой и правой башни """
  if kind == "cut":
    return _travel(cfg, cfg["CutCommand"], cfg["FeedRateCut"], y_left, z_left, y_right, z_right)
  return _travel(cfg, cfg["MoveCommand"], cfg["FeedRateMove"], y_left, z_left, y_right, z_right)


def rotate(cfg, angle):
  return _rotation(cfg, angle)


class Program:
  """
    Выдаёт команды перемещения и подстраивает мощность проволоки под её длину между башнями:
      S = WireMinPower * длина / FieldWidth, не больше WireMaxPower (как в FM_MakeGCODE.generateWireCompensatedPower).
    Команда M03 вставляется перед резом, только когда мощность изменилась не меньше чем на power_step.
  """
  def __init__(this, cfg, compensate = True, power_step = 5.0):
    this.cfg, this.compensate, this.power_step = cfg, compensate, power_step
    this.pos      = None                          # - последние координаты (Yл, Zл, Yп, Zп)
    this.power    = float(cfg["WireMinPower"])    # - мощность, заданная стартовым блоком
    this.min_power = this.max_power = this.power
    this.changes  = 0
    this.clipped  = False

  def wire_length(this, pos):
    width = float(this.cfg["FieldWidth"])
    return math.sqrt(width ** 2 + (pos[0] - pos[2]) ** 2 + (pos[1] - pos[3]) ** 2)

  def power_for(this, length):
    cfg = this.cfg
    power = float(cfg["WireMinPower"]) * length / float(cfg["FieldWidth"])
    if power > float(cfg["WireMaxPower"]):
      this.clipped = True
      power = float(cfg["WireMaxPower"])
    return max(power, float(cfg["WireMinPower"]))

  def travel(this, kind, y_left, z_left, y_right, z_right):
    target = (y_left, z_left, y_right, z_right)
    g = ""
    if kind == "cut" and this.compensate:
      # - Длиннее из двух положений (начало и конец шага), чтобы не недогреть проволоку
      length = this.wire_length(target) if this.pos is None else max(this.wire_length(target), this.wire_length(this.pos))
      power = this.power_for(length)
      if abs(power - this.power) >= this.power_step:
        g += this.cfg["WireOnCommand"].replace("{WirePower}", "%.2f" % power) + EOL
        this.power = power
        this.changes += 1
        this.min_power, this.max_power = min(this.min_power, power), max(this.max_power, power)
    this.pos = target
    return g + travel(this.cfg, kind, *target)

  def rotate(this, angle):
    return rotate(this.cfg, angle)


def start_block(cfg):
  """ Хоминг, начальные координаты, парковка, включение проволоки (как FM_MakeGCODE.generateStartBlock) """
  g = "; *** START BLOCK ***" + EOL
  g += cfg["HomingCommand"] + EOL
  g += "G21 G90 G94" + EOL      # - мм, абсолютные координаты, подача в мм/мин: не зависеть от режима, оставшегося от прошлой программы
  g += cfg["InitPositionCommand"].replace("{Position}",
    _travel_position(cfg, _f(cfg, "HomingX1"), _f(cfg, "HomingZ1"), _f(cfg, "HomingX2"), _f(cfg, "HomingZ2"))
    + " " + _rotation_position(cfg, _f(cfg, "HomingR1"))) + EOL
  g += travel(cfg, "move", _f(cfg, "ParkX"), _f(cfg, "ParkZ"), _f(cfg, "ParkX"), _f(cfg, "ParkZ"))
  g += rotate(cfg, _f(cfg, "ParkR1"))
  g += cfg["WireOnCommand"].replace("{WirePower}", "%.2f" % float(cfg["WireMinPower"])) + EOL
  return g


def end_block(cfg):
  """ Выключение проволоки и парковка (как FM_MakeGCODE.generateEndBlock) """
  g = ";" + EOL + "; *** END BLOCK ***" + EOL
  g += cfg["WireOffCommand"] + EOL
  g += travel(cfg, "move", _f(cfg, "ParkX"), _f(cfg, "ParkZ"), _f(cfg, "ParkX"), _f(cfg, "ParkZ"))
  g += rotate(cfg, _f(cfg, "ParkR1"))
  return g


def trim_faces(trim):
  """
    Список торцов для подрезки: [(угол стола, Y положение реза), ...], по возрастанию угла.
    Заготовка центрирована относительно оси стола. Резы идут вертикально по плоскости Y = const,
    поэтому грани с нормалью по X режутся после поворота стола на 90 градусов.
  """
  length, width = float(trim["Length"]), float(trim["Width"])
  if trim["LongAxis"] not in ("X", "Y"):
    raise TrimError("LongAxis должен быть 'X' или 'Y'")

  # - Размер заготовки вдоль Y при угле 0 и при угле 90
  if trim["LongAxis"] == "Y":
    ends_angle, sides_angle = 0.0, 90.0
  else:
    ends_angle, sides_angle = 90.0, 0.0

  faces = []
  if float(trim["TrimEnds"]) > 0:
    y = length / 2 - float(trim["TrimEnds"])
    faces += [(ends_angle, -y), (ends_angle, y)]
  if float(trim["TrimSides"]) > 0:
    y = width / 2 - float(trim["TrimSides"])
    faces += [(sides_angle, -y), (sides_angle, y)]

  # - Сначала всё при угле 0, потом при угле 90 (одно вращение стола)
  faces.sort(key=lambda item: item[0])
  return faces


def check_trim(cfg, trim):
  """ Возвращает (ошибки, предупреждения). Ошибки - G-code генерировать нельзя. """
  errors, warnings = [], []
  length, width, height = float(trim["Length"]), float(trim["Width"]), float(trim["Height"])
  half_y = _f(cfg, "HorizontalTravel") / 2
  half_x = _f(cfg, "FieldWidth") / 2
  top = float(trim["BottomZ"]) + height

  if min(length, width, height) <= 0:
    errors.append("Размеры заготовки должны быть положительными")
    return errors, warnings

  for angle, y in trim_faces(trim):
    if abs(y) > half_y:
      errors.append("Рез Y=%.2f (угол %g) выходит за ход каретки +-%.1f" % (y, angle, half_y))
    if abs(y) < 0.01:
      warnings.append("Рез Y=%.2f (угол %g) идёт через ось стола: припуск больше половины размера" % (y, angle))

  if float(trim["TrimEnds"]) >= length / 2 or float(trim["TrimSides"]) >= width / 2:
    errors.append("Припуск на подрезку больше половины размера заготовки")

  for angle, y in trim_faces(trim):
    y_out = y + math.copysign(float(trim["RetractOffset"]), y)
    if abs(y_out) > half_y:
      errors.append("Отвод Y=%.2f (угол %g) выходит за ход каретки +-%.1f" % (y_out, angle, half_y))

  if travel_height(cfg, top) > _f(cfg, "VerticalTravel"):
    errors.append("Высота холостых ходов Z=%.1f больше хода каретки %.1f" % (travel_height(cfg, top), _f(cfg, "VerticalTravel")))
  if float(trim["BottomZ"]) < 0:
    errors.append("BottomZ меньше 0: ниже хода каретки")

  # - Вращение: угол заготовки описывает окружность вокруг оси стола.
  #   Это только предупреждение: на практике заготовки с радиусом больше половины расстояния между башнями вращаются.
  radius = math.hypot(length, width) / 2
  margin = half_x - radius
  if margin < float(trim["RadialMargin"]):
    warnings.append("При вращении зазор до башни только %.2f мм (радиус %.2f, башня %.1f)" % (margin, radius, half_x))
  return errors, warnings


def trim_block(cfg, trim, angle_now = 0.0, program = None):
  """
    Торцевание: вертикальные резы с отводом от центра. Возвращает (текст, угол стола в конце).
    Резы при угле 0 идут первыми, затем поворот стола и резы при 90.
    program - необязательный Program (компенсация мощности); без него команды идут как есть.
  """
  move = program.travel if program is not None else (lambda kind, *a: travel(cfg, kind, *a))
  bottom = float(trim["BottomZ"])
  safe   = travel_height(cfg, bottom + float(trim["Height"]))
  g = ";" + EOL + "; *** TRIM BLOCK: L=%g W=%g H=%g, LongAxis=%s ***" % (
    float(trim["Length"]), float(trim["Width"]), float(trim["Height"]), trim["LongAxis"]) + EOL
  for angle, y in trim_faces(trim):
    if angle != angle_now:
      g += "; - Rotation %g" % angle + EOL
      g += rotate(cfg, angle)
      angle_now = angle
    g += "; - Trim Y=%.2f at angle %g" % (y, angle) + EOL
    g += move("move", y, safe, y, safe)                              # - к точке входа на безопасной высоте
    g += move("cut",  y, bottom, y, bottom)                          # - рез вниз (как Enter)
    y_out = y + math.copysign(float(trim["RetractOffset"]), y)       # - отвод в сторону от центра (в отход)
    g += move("cut",  y_out, bottom, y_out, bottom)
    g += move("cut",  y_out, safe, y_out, safe)                      # - подъём уже вне чистого реза
  return g, angle_now


def generate_trim_gcode(cfg, trim):
  """
    Возвращает (текст G-code, предупреждения). TrimError при ошибках.
  """
  cfg, trim = with_defaults(cfg, trim)

  errors, warnings = check_trim(cfg, trim)
  if errors:
    raise TrimError("; ".join(errors))
  if not trim_faces(trim):
    raise TrimError("Нечего резать: TrimEnds и TrimSides равны 0")

  body, _ = trim_block(cfg, trim, _f(cfg, "ParkR1"))
  return start_block(cfg) + body + end_block(cfg), warnings
