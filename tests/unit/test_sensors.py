"""假角度和回放适配器。真实合页不在这里测。"""
import os
import tempfile
import unittest

from protocol import angle_frame
from sensors.ambient import demo_lux, pinned_lux, read_source_light
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

    def test_fake_light_sweeps_and_can_be_pinned(self):
        previous = os.environ.pop("POPUP_LUX", None)
        try:
            self.assertAlmostEqual(demo_lux(0), 0.0)
            self.assertAlmostEqual(demo_lux(0.5), 900.0)
            clock = _Clock()
            src = FakeSource(period=28.0, clock=clock)
            self.assertAlmostEqual(src.read_light(), 0.0)
            frame = angle_frame(1, 0, src.read(), src.mode, light=src.read_light())
            self.assertEqual(frame["light"], 0.0)
            clock.t = 14.0
            self.assertAlmostEqual(src.read_light(), 900.0)
            os.environ["POPUP_LUX"] = "5"
            self.assertEqual(pinned_lux(), 5.0)
            self.assertEqual(src.read_light(), 5.0)
            os.environ["POPUP_LUX"] = "nope"
            self.assertIsNone(pinned_lux())
            self.assertAlmostEqual(src.read_light(), 900.0)
            src.close()
        finally:
            if previous is None:
                os.environ.pop("POPUP_LUX", None)
            else:
                os.environ["POPUP_LUX"] = previous

    def test_replay_light_is_optional(self):
        fd, path = tempfile.mkstemp(suffix=".jsonl")
        os.write(fd, b'{"t": 0, "angle": 10}\n{"t": 1, "angle": 40, "light": 8}\n{"t": 2, "angle": 90, "light": "dim"}\n')
        os.close(fd)
        clock = _Clock()
        src = ReplaySource(path, clock=clock)
        self.assertIsNone(src.read_light())
        clock.t = 1
        src.read()
        self.assertEqual(src.read_light(), 8.0)
        clock.t = 2
        src.read()
        self.assertIsNone(src.read_light())
        src.close()
        os.remove(path)

    def test_a_broken_light_reader_is_dropped(self):
        class Boom:
            def read_light(self):
                raise RuntimeError("als")

        self.assertIsNone(read_source_light(Boom()))
        self.assertIsNone(read_source_light(object()))


if __name__ == "__main__":
    unittest.main()
