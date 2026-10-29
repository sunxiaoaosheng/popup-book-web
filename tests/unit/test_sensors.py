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

    def test_replay_reports_classified_taps_not_waveforms(self):
        fd, path = tempfile.mkstemp(suffix=".jsonl")
        os.write(fd, "\n".join([
            '{"t": 0, "angle": 10}',
            '{"t": 0.4, "kind": "slap", "strength": 0.3, "waveform": [9, 9, 9]}',
            '{"t": 1, "angle": 40, "kind": "triple-knock", "strength": 0.5}',
            '{"t": 2, "angle": 80}',
        ]).encode())
        os.close(fd)
        clock = _Clock()
        src = ReplaySource(path, clock=clock)
        self.assertEqual(src.read(), 10)
        self.assertEqual(src.pull_taps(), [])
        clock.t = 0.5
        self.assertEqual(src.read(), 10)
        taps = src.pull_taps()
        self.assertEqual(taps, [{"kind": "slap", "strength": 0.3}])
        self.assertNotIn("waveform", taps[0])
        self.assertEqual(src.pull_taps(), [])
        clock.t = 1
        self.assertEqual(src.read(), 40)
        self.assertEqual(src.pull_taps(), [{"kind": "triple-knock", "strength": 0.5}])
        clock.t = 3
        self.assertEqual(src.read(), 80)
        self.assertEqual(src.pull_taps(), [])
        src.close()
        os.remove(path)

    def test_fake_source_has_no_taps(self):
        src = FakeSource(period=28.0, clock=_Clock())
        self.assertEqual(src.pull_taps(), [])
        src.close()

    def test_replay_rejects_unknown_tap_kind(self):
        fd, path = tempfile.mkstemp(suffix=".jsonl")
        os.write(fd, b'{"t": 0, "angle": 1}\n{"t": 0.2, "kind": "wave", "strength": 0.2}\n')
        os.close(fd)
        with self.assertRaises(RuntimeError):
            ReplaySource(path, clock=_Clock())
        os.remove(path)

    def test_empty_replay_is_refused(self):
        fd, path = tempfile.mkstemp(suffix=".jsonl")
        os.close(fd)
        with self.assertRaises(RuntimeError):
            ReplaySource(path, clock=_Clock())
        os.remove(path)


if __name__ == "__main__":
    unittest.main()
