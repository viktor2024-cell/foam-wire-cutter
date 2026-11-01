"""
  FM_step - чтение твёрдого тела из STEP без FreeCAD и разбор его на линейчатые поверхности для проволочной резки.

  Что умеет:
    * разбирает STEP (простые и составные сущности), B-сплайновые кривые и поверхности, в том числе рациональные;
    * находит ось размаха (в двух плоскостях лежат профили) и линейчатые грани между ними;
    * выдаёт внешний контур (замкнутая цепочка граней) и внутренние замкнутые контуры (отверстия)
      в виде пар направляющих A(t) и B(t): прямая между A(t) и B(t) - положение проволоки.

  Ограничение: поверхности должны быть линейчатыми вдоль размаха (степень 1 по параметру размаха).
  Это условие любой детали, которую можно вырезать натянутой проволокой между двумя профилями.
"""
import math
import re
from collections import namedtuple

Typed = namedtuple("Typed", "name args")
Ref   = namedtuple("Ref", "id")


class StepError(Exception):
  pass


# ------------------------------------------------------------------------------------------------
#  Разбор текста STEP
# ------------------------------------------------------------------------------------------------

_NUMBER = r"[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][-+]?\d+)?"
_TOKEN  = re.compile(r"'(?:[^']|'')*'|#\d+|" + _NUMBER + r"|\.[A-Z_0-9]+\.|[A-Z_][A-Z_0-9]*|[(),*$]")
_NUM_RE = re.compile(_NUMBER + r"$")


def _parse_value(tokens, i):
  token = tokens[i]
  if token == "(":
    items = []
    i += 1
    while tokens[i] != ")":
      if tokens[i] == ",":
        i += 1
        continue
      value, i = _parse_value(tokens, i)
      items.append(value)
    return items, i + 1
  if token[0] == "'":
    return token[1:-1], i + 1
  if token[0] == "#":
    return Ref(int(token[1:])), i + 1
  if token in ("*", "$"):
    return None, i + 1
  if token[0] == "." and token[-1] == "." and len(token) > 2:
    return token, i + 1
  if _NUM_RE.match(token):
    return float(token), i + 1
  if i + 1 < len(tokens) and tokens[i + 1] == "(":
    args, j = _parse_value(tokens, i + 1)
    return Typed(token, args), j
  return token, i + 1


def parse_step(text):
  """ Возвращает словарь {номер сущности: Typed либо список Typed для составной сущности} """
  start = text.index("DATA;") + 5
  end   = text.index("ENDSEC;", start)
  entities = {}
  for match in re.finditer(r"#(\d+)\s*=\s*(.*?);(?=\s*(?:#|ENDSEC))", text[start:end] + "\nENDSEC", re.S):
    tokens = _TOKEN.findall(match.group(2))
    value, _ = _parse_value(tokens, 0)
    entities[int(match.group(1))] = value
  return entities


# ------------------------------------------------------------------------------------------------
#  B-сплайны
# ------------------------------------------------------------------------------------------------

def _expand_knots(knots, mults):
  return [k for k, m in zip(knots, mults) for _ in range(int(m))]


def _find_span(n, p, u, U):
  if u >= U[n + 1]:
    return n
  if u <= U[p]:
    return p
  low, high = p, n + 1
  mid = (low + high) // 2
  while u < U[mid] or u >= U[mid + 1]:
    if u < U[mid]:
      high = mid
    else:
      low = mid
    mid = (low + high) // 2
  return mid


def _basis(span, u, p, U):
  N     = [0.0] * (p + 1)
  left  = [0.0] * (p + 1)
  right = [0.0] * (p + 1)
  N[0]  = 1.0
  for j in range(1, p + 1):
    left[j]  = u - U[span + 1 - j]
    right[j] = U[span + j] - u
    saved = 0.0
    for r in range(j):
      temp  = N[r] / (right[r + 1] + left[j - r])
      N[r]  = saved + right[r + 1] * temp
      saved = left[j - r] * temp
    N[j] = saved
  return N


class Curve:
  def __init__(this, degree, points, knots, weights):
    this.p, this.P, this.U, this.w = degree, points, knots, weights
    this.n = len(points) - 1
    this.domain = (knots[degree], knots[this.n + 1])

  def __call__(this, t):
    span = _find_span(this.n, this.p, t, this.U)
    N = _basis(span, t, this.p, this.U)
    x = y = z = d = 0.0
    for j in range(this.p + 1):
      index = span - this.p + j
      c = N[j] * this.w[index]
      point = this.P[index]
      x += c * point[0]; y += c * point[1]; z += c * point[2]; d += c
    return (x / d, y / d, z / d)


class Surface:
  def __init__(this, udeg, vdeg, grid, uknots, vknots, weights):
    this.pu, this.pv, this.P, this.U, this.V, this.w = udeg, vdeg, grid, uknots, vknots, weights
    this.nu, this.nv = len(grid) - 1, len(grid[0]) - 1
    this.udomain = (uknots[udeg], uknots[this.nu + 1])
    this.vdomain = (vknots[vdeg], vknots[this.nv + 1])

  def __call__(this, u, v):
    su = _find_span(this.nu, this.pu, u, this.U)
    sv = _find_span(this.nv, this.pv, v, this.V)
    Nu = _basis(su, u, this.pu, this.U)
    Nv = _basis(sv, v, this.pv, this.V)
    x = y = z = d = 0.0
    for i in range(this.pu + 1):
      iu = su - this.pu + i
      for j in range(this.pv + 1):
        iv = sv - this.pv + j
        c = Nu[i] * Nv[j] * this.w[iu][iv]
        point = this.P[iu][iv]
        x += c * point[0]; y += c * point[1]; z += c * point[2]; d += c
    return (x / d, y / d, z / d)


# ------------------------------------------------------------------------------------------------
#  Модель
# ------------------------------------------------------------------------------------------------

def _dist(a, b):
  return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)


def _mid(a, b):
  return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)


class Face:
  """ Линейчатая грань: A(t), B(t) - направляющие в плоскостях профилей, t в [t0, t1] """
  def __init__(this, rail_a, rail_b, t0, t1, closed, skew = 0.0):
    this.A, this.B, this.t0, this.t1, this.closed = rail_a, rail_b, t0, t1, closed
    this.skew = skew      # - доля диапазона параметра, на которую пришлось сместить B относительно A


class Contour:
  """ Замкнутая цепочка граней: список (грань, прямое направление?) """
  def __init__(this, items):
    this.items = items


class Model:
  def __init__(this, path):
    with open(path, "r", encoding="latin-1") as f:
      this.entities = parse_step(f.read())
    this._read_geometry()

  # --- Чтение сущностей

  def _point(this, ref):
    entity = this.entities[ref.id]
    return tuple(entity.args[1])

  def _typed(this, entity, name):
    """ Часть составной сущности по имени (или сама простая сущность) """
    if isinstance(entity, list):
      for part in entity:
        if part.name == name:
          return part
      return None
    return entity if entity.name == name else None

  def curve(this, ref):
    entity = this.entities[ref.id]
    if isinstance(entity, list):
      base, knots, rational = (this._typed(entity, n) for n in ("B_SPLINE_CURVE", "B_SPLINE_CURVE_WITH_KNOTS", "RATIONAL_B_SPLINE_CURVE"))
      if base is None or knots is None:
        raise StepError("#%d: неподдерживаемая кривая" % ref.id)
      degree, refs = int(base.args[0]), base.args[1]
      mults, kn = knots.args[0], knots.args[1]
      weights = rational.args[0] if rational is not None else None
    else:
      if entity.name != "B_SPLINE_CURVE_WITH_KNOTS":
        raise StepError("#%d: тип кривой %s не поддерживается" % (ref.id, entity.name))
      degree, refs, mults, kn = int(entity.args[1]), entity.args[2], entity.args[6], entity.args[7]
      weights = None
    points = [this._point(r) for r in refs]
    return Curve(degree, points, _expand_knots(kn, mults), weights or [1.0] * len(points))

  def surface(this, ref):
    entity = this.entities[ref.id]
    if isinstance(entity, list):
      base, knots, rational = (this._typed(entity, n) for n in ("B_SPLINE_SURFACE", "B_SPLINE_SURFACE_WITH_KNOTS", "RATIONAL_B_SPLINE_SURFACE"))
      if base is None or knots is None:
        raise StepError("#%d: неподдерживаемая поверхность" % ref.id)
      udeg, vdeg, grid_refs = int(base.args[0]), int(base.args[1]), base.args[2]
      umult, vmult, uknots, vknots = knots.args[0], knots.args[1], knots.args[2], knots.args[3]
      weights = rational.args[0] if rational is not None else None
    else:
      if entity.name != "B_SPLINE_SURFACE_WITH_KNOTS":
        raise StepError("#%d: тип поверхности %s не поддерживается" % (ref.id, entity.name))
      udeg, vdeg, grid_refs = int(entity.args[1]), int(entity.args[2]), entity.args[3]
      umult, vmult, uknots, vknots = entity.args[8], entity.args[9], entity.args[10], entity.args[11]
      weights = None
    grid = [[this._point(r) for r in row] for row in grid_refs]
    if weights is None:
      weights = [[1.0] * len(row) for row in grid]
    return Surface(udeg, vdeg, grid, _expand_knots(uknots, umult), _expand_knots(vknots, vmult), weights)

  def _read_geometry(this):
    # - Рёбра: начальная и конечная вершины
    this.edges = {}
    for eid, e in this.entities.items():
      if isinstance(e, Typed) and e.name == "EDGE_CURVE":
        this.edges[eid] = (this._vertex(e.args[1]), this._vertex(e.args[2]))

    # - Грани: поверхность и рёбра внешней и внутренних границ
    this.faces_raw = []
    for fid, f in this.entities.items():
      if isinstance(f, Typed) and f.name == "ADVANCED_FACE":
        edge_ids = []
        for bound_ref in f.args[1]:
          bound = this.entities[bound_ref.id]
          loop  = this.entities[bound.args[1].id]
          for oriented_ref in loop.args[1]:
            oriented = this.entities[oriented_ref.id]
            edge_ids.append(oriented.args[3].id)
        this.faces_raw.append((fid, f.args[2], edge_ids))
    if len(this.faces_raw) == 0:
      raise StepError("В файле нет граней: ожидается твёрдое тело (MANIFOLD_SOLID_BREP)")

  def _vertex(this, ref):
    return this._point(this.entities[ref.id].args[1])

  # --- Разбор формы

  def span_axis(this, forced = None):
    """ Ось размаха: единственная ось, по которой вершины лежат ровно в двух плоскостях """
    points = [p for pair in this.edges.values() for p in pair]
    if forced is not None:
      axis = "xyz".index(forced)
    else:
      candidates = []
      for axis in range(3):
        values = sorted({round(p[axis], 3) for p in points})
        if len(values) == 2:
          candidates.append(axis)
      if len(candidates) != 1:
        raise StepError("Не удалось определить ось размаха (вершины должны лежать в двух плоскостях профилей); задайте её явно")
      axis = candidates[0]
    values = sorted({round(p[axis], 3) for p in points})
    return axis, values[0], values[-1]

  def build(this, axis = None, step_tolerance = 0.01):
    """ Возвращает (внешний контур, [внутренние контуры], ось, координата плоскости A, координата плоскости B) """
    forced = axis
    axis, plane_a, plane_b = this.span_axis(forced)
    faces = []
    for fid, surf_ref, edge_ids in this.faces_raw:
      surf = this.surface(surf_ref)
      face = this._ruled_face(surf, axis, plane_a, plane_b, edge_ids)
      if face is not None:
        faces.append(face)

    outer, holes = [], []
    for face in faces:
      (holes if face.closed else outer).append(face)
    return this._chain(outer), [Contour([(h, True)]) for h in holes], axis, plane_a, plane_b

  def _ruled_face(this, surf, axis, plane_a, plane_b, edge_ids):
    # - Параметр размаха: степень 1 и координата по оси размаха меняется вдоль него
    u_mid = sum(surf.udomain) / 2
    v_mid = sum(surf.vdomain) / 2
    span_is_u = None
    if surf.pu == 1:
      a, b = surf(surf.udomain[0], v_mid), surf(surf.udomain[1], v_mid)
      if abs(a[axis] - b[axis]) > 1e-6:
        span_is_u = True
    if span_is_u is None and surf.pv == 1:
      a, b = surf(u_mid, surf.vdomain[0]), surf(u_mid, surf.vdomain[1])
      if abs(a[axis] - b[axis]) > 1e-6:
        span_is_u = False
    if span_is_u is None:
      return None     # - торцевая грань (лежит в плоскости профиля)

    s_dom = surf.udomain if span_is_u else surf.vdomain
    t_dom = surf.vdomain if span_is_u else surf.udomain
    def at(s, t):
      return surf(s, t) if span_is_u else surf(t, s)

    # - Значения параметра размаха в плоскостях профилей (координата линейна по параметру размаха)
    c0, c1 = at(s_dom[0], sum(t_dom) / 2)[axis], at(s_dom[1], sum(t_dom) / 2)[axis]
    s_a = s_dom[0] + (plane_a - c0) / (c1 - c0) * (s_dom[1] - s_dom[0])
    s_b = s_dom[0] + (plane_b - c0) / (c1 - c0) * (s_dom[1] - s_dom[0])
    for t in (t_dom[0], t_dom[1]):
      if abs(at(s_a, t)[axis] - plane_a) > 1e-4 or abs(at(s_b, t)[axis] - plane_b) > 1e-4:
        raise StepError("Поверхность не линейчатая вдоль размаха: вырезать её проволокой между профилями нельзя")

    rail_a = lambda t: at(s_a, t)
    rail_b = lambda t: at(s_b, t)

    # - Границы по t по рёбрам в плоскостях профилей
    ends_a, ends_b, closed = [], [], False
    for eid in edge_ids:
      v1, v2 = this.edges[eid]
      if abs(v1[axis] - plane_a) < 1e-3 and abs(v2[axis] - plane_a) < 1e-3:
        if _dist(v1, v2) < 1e-6:
          closed = True
        ends_a = [v1, v2]
      if abs(v1[axis] - plane_b) < 1e-3 and abs(v2[axis] - plane_b) < 1e-3:
        ends_b = [v1, v2]
    if len(ends_a) == 0 or len(ends_b) == 0:
      raise StepError("Грань без рёбер в плоскостях профилей")

    skew = 0.0
    if closed:
      t0, t1 = t_dom
    else:
      t0, t1 = (this._project(rail_a, t_dom, p) for p in ends_a)
      u0, u1 = (this._project(rail_b, t_dom, p) for p in ends_b)

      # - Грань может быть куском поверхности, обрезанным прямыми рёбрами (ступенька, стенка): тогда её углы
      #   в плоскостях A и B лежат при немного разных параметрах. Углы увязываем с углами, внутри параметр масштабируем.
      a_lo, a_hi = sorted((t0, t1))
      b_lo, b_hi = sorted((u0, u1))
      skew = max(abs(a_lo - b_lo), abs(a_hi - b_hi)) / (a_hi - a_lo)

      # - Проверка по топологии: углы в плоскостях A и B должны быть соединены боковым ребром грани
      side_edges = []
      for eid in edge_ids:
        v1, v2 = this.edges[eid]
        if abs(v1[axis] - plane_a) < 1e-3 and abs(v2[axis] - plane_b) < 1e-3:
          side_edges.append((v1, v2))
        elif abs(v2[axis] - plane_a) < 1e-3 and abs(v1[axis] - plane_b) < 1e-3:
          side_edges.append((v2, v1))
      corner_a = {a_lo: ends_a[0] if t0 <= t1 else ends_a[1], a_hi: ends_a[1] if t0 <= t1 else ends_a[0]}
      corner_b = {b_lo: ends_b[0] if u0 <= u1 else ends_b[1], b_hi: ends_b[1] if u0 <= u1 else ends_b[0]}
      for ca, cb in ((corner_a[a_lo], corner_b[b_lo]), (corner_a[a_hi], corner_b[b_hi])):
        if not any(_dist(ca, sa) < 0.01 and _dist(cb, sb) < 0.01 for sa, sb in side_edges):
          raise StepError("Углы грани в плоскостях профилей не соединены боковым ребром: соответствие направляющих неоднозначно")
      if skew > 1e-6:
        base_b = rail_b
        scale  = (b_hi - b_lo) / (a_hi - a_lo)
        rail_b = lambda t: base_b(b_lo + (t - a_lo) * scale)
    return Face(rail_a, rail_b, t0, t1, closed, skew)

  @staticmethod
  def _project(rail, domain, point, samples = 1500):
    best_t, best = domain[0], 1e18
    for i in range(samples + 1):
      t = domain[0] + (domain[1] - domain[0]) * i / samples
      d = _dist(rail(t), point)
      if d < best:
        best, best_t = d, t
    low  = max(domain[0], best_t - (domain[1] - domain[0]) / samples)
    high = min(domain[1], best_t + (domain[1] - domain[0]) / samples)
    for _ in range(60):
      m1, m2 = low + (high - low) / 3, high - (high - low) / 3
      if _dist(rail(m1), point) < _dist(rail(m2), point):
        high = m2
      else:
        low = m1
    t = (low + high) / 2
    if _dist(rail(t), point) > 0.01:
      raise StepError("Вершина ребра не лежит на направляющей (расстояние %.3f мм)" % _dist(rail(t), point))
    return t

  @staticmethod
  def _chain(faces):
    """ Замыкает грани в цепочку по совпадающим концам направляющей A """
    if len(faces) == 0:
      raise StepError("Нет линейчатых граней")
    ends = lambda f: (f.A(f.t0), f.A(f.t1))
    items = [(faces[0], True)]
    rest  = faces[1:]
    first_start = ends(faces[0])[0]
    current = ends(faces[0])[1]
    while len(rest) > 0:
      for face in rest:
        s, e = ends(face)
        if _dist(current, s) < 0.01:
          items.append((face, True));  current = e; rest.remove(face); break
        if _dist(current, e) < 0.01:
          items.append((face, False)); current = s; rest.remove(face); break
      else:
        raise StepError("Профиль не образует единую замкнутую цепочку граней")
    if _dist(current, first_start) > 0.01:
      raise StepError("Профиль не замкнут")
    return Contour(items)


# ------------------------------------------------------------------------------------------------
#  Дискретизация пары направляющих
# ------------------------------------------------------------------------------------------------

def sample_face(face, t_from, t_to, sag = 0.01, max_step = 1.0):
  """
    Точки (A, B) от t_from до t_to. Делит отрезок, пока стрелка прогиба любой направляющей больше sag
    либо шаг больше max_step.
  """
  def pair(t):
    return (face.A(t), face.B(t))

  result = [pair(t_from)]

  def refine(t0, p0, t1, p1, depth):
    tm = (t0 + t1) / 2
    pm = pair(tm)
    deviation = max(_dist(pm[0], _mid(p0[0], p1[0])), _dist(pm[1], _mid(p0[1], p1[1])))
    length    = max(_dist(p0[0], p1[0]), _dist(p0[1], p1[1]))
    if depth < 2 or (depth < 18 and (deviation > sag or length > max_step)):
      refine(t0, p0, tm, pm, depth + 1)
      refine(tm, pm, t1, p1, depth + 1)
    else:
      result.append(p1)

  refine(t_from, result[0], t_to, pair(t_to), 0)
  return result


# ------------------------------------------------------------------------------------------------
#  Участки контура и компенсация толщины реза
# ------------------------------------------------------------------------------------------------

class Segment:
  """ Участок контура: направляющие A(u), B(u) при u от 0 до 1 (в направлении обхода) """
  def __init__(this, rail_a, rail_b, kind = "face"):
    this.A, this.B, this.kind = rail_a, rail_b, kind
    this.t0, this.t1 = 0.0, 1.0     # - для sample_face


def face_segment(face, forward = True):
  t0, t1 = (face.t0, face.t1) if forward else (face.t1, face.t0)
  return Segment(lambda u: face.A(t0 + (t1 - t0) * u), lambda u: face.B(t0 + (t1 - t0) * u))


def contour_segments(contour):
  return [face_segment(face, forward) for face, forward in contour.items]


def sub_segment(seg, u0, u1):
  return Segment(lambda u: seg.A(u0 + (u1 - u0) * u), lambda u: seg.B(u0 + (u1 - u0) * u), seg.kind)


def start_sequence(segments, k, u):
  """ Замкнутый обход, начинающийся с точки u участка k """
  result = []
  if u < 1.0 - 1e-9:
    result.append(sub_segment(segments[k], u, 1.0))
  result += segments[k + 1:] + segments[:k]
  if u > 1e-9:
    result.append(sub_segment(segments[k], 0.0, u))
  return result


def _plane_axes(axis):
  return [k for k in range(3) if k != axis]


def _tangent(f, u, ia, ja, h = 1e-5):
  a, b = f(max(0.0, u - h)), f(min(1.0, u + h))
  dx, dz = b[ia] - a[ia], b[ja] - a[ja]
  length = math.hypot(dx, dz)
  if length < 1e-14:
    raise StepError("Вырожденный участок контура (нулевая длина)")
  return dx / length, dz / length


def _rail_length(f, n = 60):
  pts = [f(i / n) for i in range(n + 1)]
  return sum(_dist(pts[i], pts[i + 1]) for i in range(n))


def _signed_area(segments, rail, ia, ja, n = 60):
  pts = []
  for seg in segments:
    f = seg.A if rail == "A" else seg.B
    pts += [f(i / n) for i in range(n)]
  area = 0.0
  for i in range(len(pts)):
    p, q = pts[i], pts[(i + 1) % len(pts)]
    area += p[ia] * q[ja] - q[ia] * p[ja]
  return area / 2


def _offset_rail(f, side, distance, ia, ja):
  def g(u):
    p = list(f(u))
    tx, tz = _tangent(f, u, ia, ja)
    p[ia] += distance * (-tz) * side
    p[ja] += distance * tx * side
    return tuple(p)
  return g


def _segment_hit(p1, p2, q1, q2, ia, ja):
  """ Пересечение отрезков p1p2 и q1q2 в плоскости: (доля на первом, доля на втором) либо None """
  rx, ry = p2[ia] - p1[ia], p2[ja] - p1[ja]
  sx, sy = q2[ia] - q1[ia], q2[ja] - q1[ja]
  denominator = rx * sy - ry * sx
  if abs(denominator) < 1e-18:
    return None
  qx, qy = q1[ia] - p1[ia], q1[ja] - p1[ja]
  a = (qx * sy - qy * sx) / denominator
  b = (qx * ry - qy * rx) / denominator
  if -1e-9 <= a <= 1 + 1e-9 and -1e-9 <= b <= 1 + 1e-9:
    return a, b
  return None


def _intersect_offsets(g1, g2, ia, ja, length1, length2, window = 10.0, n = 200):
  """ Пересечение конца смещённого участка g1 с началом g2 (внутренний угол): (u на g1, u на g2) """
  for w in (window, None):
    w1 = 1.0 if w is None else min(1.0, w / max(length1, 1e-9))
    w2 = 1.0 if w is None else min(1.0, w / max(length2, 1e-9))
    u1 = [1.0 - w1 + w1 * i / n for i in range(n + 1)]
    u2 = [w2 * i / n for i in range(n + 1)]
    p1 = [g1(u) for u in u1]
    p2 = [g2(u) for u in u2]
    best, best_cost = None, 1e18
    for a in range(n):
      for b in range(n):
        hit = _segment_hit(p1[a], p1[a + 1], p2[b], p2[b + 1], ia, ja)
        if hit is not None:
          s1 = u1[a] + hit[0] * (u1[a + 1] - u1[a])
          s2 = u2[b] + hit[1] * (u2[b + 1] - u2[b])
          cost = (1.0 - s1) * length1 + s2 * length2
          if cost < best_cost:
            best, best_cost = (s1, s2), cost
    if best is not None:
      return best
  return None


def offset_segments(segments, axis, distance, material_inside):
  """
    Смещение замкнутого контура на distance в сторону от материала (каждая плоскость профиля отдельно).
      material_inside = True  - внешний контур (материал внутри, смещение наружу);
      material_inside = False - отверстие (материал снаружи, смещение внутрь).
    На выпуклых углах вставляется дуга радиусом distance вокруг угла, на внутренних углах
    смещённые участки подрезаются до пересечения. Соответствие точек A и B сохраняется:
    углы увязаны с углами, внутри участка параметр масштабируется.
    Возвращает (участки, замечания).
  """
  ia, ja = _plane_axes(axis)
  area_a = _signed_area(segments, "A", ia, ja)
  area_b = _signed_area(segments, "B", ia, ja)
  if area_a * area_b <= 0:
    raise StepError("Контур в плоскостях профилей обходится в разные стороны")
  ccw  = area_a > 0
  side = (-1 if ccw else 1) if material_inside else (1 if ccw else -1)

  count  = len(segments)
  rails  = [{P: _offset_rail(getattr(s, P), side, distance, ia, ja) for P in "AB"} for s in segments]
  ranges = [{P: [0.0, 1.0] for P in "AB"} for _ in segments]
  joins  = [dict() for _ in segments]     # - join[k][P]: ("arc", центр, начальный угол, поворот) | ("point",)
  notes  = []
  lengths = [{P: _rail_length(getattr(s, P)) for P in "AB"} for s in segments]

  for k in range(count):
    nxt = (k + 1) % count
    for P in "AB":
      f1, f2 = getattr(segments[k], P), getattr(segments[nxt], P)
      t1x, t1z = _tangent(f1, 1.0, ia, ja)
      t2x, t2z = _tangent(f2, 0.0, ia, ja)
      turn = math.atan2(t1x * t2z - t1z * t2x, t1x * t2x + t1z * t2z)
      corner = f1(1.0)
      if abs(turn) < math.radians(1.0):
        joins[k][P] = ("point",)
      elif side * turn < 0:
        start_angle = math.atan2(t1x * side, -t1z * side)
        joins[k][P] = ("arc", corner, start_angle, turn)
      else:
        hit = _intersect_offsets(rails[k][P], rails[nxt][P], ia, ja, lengths[k][P], lengths[nxt][P])
        if hit is None:
          raise StepError("Элемент контура у точки (%.2f, %.2f) уже толщины реза" % (corner[ia], corner[ja]))
        ranges[k][P][1], ranges[nxt][P][0] = hit
        joins[k][P] = ("point",)
        gap = _dist(corner, rails[k][P](hit[0])) - distance
        if gap > 0.25:
          notes.append("Внутренний угол у (%.1f, %.1f) в плоскости %s: проволока не дойдёт до вершины на %.2f мм" % (
            corner[ia], corner[ja], P, gap))

  # - Сборка: подрезанные участки и дуги между ними
  result = []
  for k in range(count):
    for P in "AB":
      if ranges[k][P][0] >= ranges[k][P][1]:
        raise StepError("Участок контура полностью съеден толщиной реза: деталь тоньше реза в этом месте")

    def trimmed(P, k = k):
      lo, hi = ranges[k][P]
      g = rails[k][P]
      return lambda u: g(lo + (hi - lo) * u)
    result.append(Segment(trimmed("A"), trimmed("B")))

    if any(joins[k][P][0] == "arc" for P in "AB"):
      def arc(P, k = k):
        join = joins[k][P]
        if join[0] != "arc":
          end = trimmed(P)(1.0)
          return lambda u: end
        _, center, start_angle, turn = join
        def g(u):
          angle = start_angle + turn * u
          p = list(center)
          p[ia] += distance * math.cos(angle)
          p[ja] += distance * math.sin(angle)
          return tuple(p)
        return g
      result.append(Segment(arc("A"), arc("B"), "arc"))
  return result, notes
