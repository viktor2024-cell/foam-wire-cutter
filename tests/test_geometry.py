import os
from pathlib import Path
import unittest
import FM_step as S

class GeometryTests(unittest.TestCase):
    def bounds(self, filename):
        outer, holes, axis, a, b = S.Model(filename).build()
        points = [p for f, _ in outer.items for pair in S.sample_face(f, f.t0, f.t1, .001, .1) for p in pair]
        return outer, holes, axis, a, b, [max(p[k] for p in points)-min(p[k] for p in points) for k in range(3)]

    def test_split_edges(self):
        _, holes, axis, a, b, size = self.bounds(Path(__file__).parent/'fixtures/split-profile.stp')
        self.assertEqual((axis,a,b,len(holes)), (1,-25,25,0))
        for actual, expected in zip(size,(100,50,40)):
            self.assertAlmostEqual(actual, expected, places=4)

    @unittest.skipUnless(os.environ.get('F1_STEP'), 'set F1_STEP to the external model')
    def test_external_f1(self):
        outer, holes, axis, a, b, size = self.bounds(os.environ['F1_STEP'])
        self.assertEqual((len(outer.items),len(holes),axis,a,b), (6,0,1,-25,25))
        self.assertAlmostEqual(size[0],380.64842,places=3)
        self.assertAlmostEqual(size[2],221.72579,places=3)

if __name__ == '__main__': unittest.main()
