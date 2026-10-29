"""假角度和回放适配器。真实合页不在这里测。"""
import os
import tempfile
import unittest

from sensors.fake import FakeSource
from sensors.replay import ReplaySource


class _Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


class SensorTest(unittest.TestCase):
    def test_fake_sweeps_zero_to_one_thirty(self):
        clock = _Clock()
        src = FakeSource(period=28.0, clock=clock)
        self.assertEqual(src.mode, "fake")
        self.assertAlmostEqual(src.read(), 0.0)
        clock.t = 7.0
        self.assertAlmostEqual(src.read(), 65.0)
        clock.t = 14.0
        self.assertAlmostEqual(src.read(), 130.0)
        src.close()

    def test_replay_follows_the_timeline(self):
        fd, path = tempfile.mkstemp(suffix=".jsonl")
        os.write(fd, b'{"t": 0, "angle": 10}\n{"t": 1, "angle": 40}\n# comment\n{"t": 2.5, "angle": 90}\n')
        os.close(fd)
        clock = _Clock()
        src = ReplaySource(path, clock=clock)
        self.assertEqual(src.mode, "replay")
        self.assertEqual(src.read(), 10)
        clock.t = 1.2
        self.assertEqual(src.read(), 40)
        clock.t = 3
        self.assertEqual(src.read(), 90)
        src.close()
        os.remove(path)

    def test_replay_weight_is_optional(self):
        fd, path = tempfile.mkstemp(suffix=".jsonl")
        os.write(
            fd,
            b'{"t": 0, "angle": 10}\n'
            b'{"t": 1, "angle": 40, "weight": 0.5}\n'
            b'{"t": 2, "angle": 90, "weight": "nope"}\n'
            b'{"t": 3, "angle": 12, "weight": 0}\n',
        )
        os.close(fd)
        clock = _Clock()
        src = ReplaySource(path, clock=clock)
        self.assertEqual(src.read(), 10)
        self.assertIsNone(src.read_weight())
        clock.t = 1
        self.assertEqual(src.read(), 40)
        self.assertEqual(src.read_weight(), 0.5)
        clock.t = 2
        self.assertEqual(src.read(), 90)
        self.assertIsNone(src.read_weight())
        clock.t = 3
        self.assertEqual(src.read(), 12)
        self.assertEqual(src.read_weight(), 0.0)
        src.close()
        os.remove(path)

    def test_empty_replay_is_refused(self):
        fd, path = tempfile.mkstemp(suffix=".jsonl")
        os.close(fd)
        with self.assertRaises(RuntimeError):
            ReplaySource(path, clock=_Clock())
        os.remove(path)


if __name__ == "__main__":
    unittest.main()
