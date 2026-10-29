"""力度旁路：低频字段、静默失败。不代替角度。"""
import os
import subprocess
import sys
import tempfile
import unittest

from sensors.fake import FakeSource
from sensors.force import ForceTouch, WeightGate, open_weight
from sensors.replay import ReplaySource


class WeightGateTest(unittest.TestCase):
    def test_change_and_keepalive(self):
        gate = WeightGate(epsilon=0.03, keep_sec=0.5)
        self.assertEqual(gate.update(0.4, 0.0), 0.4)
        self.assertIsNone(gate.update(0.41, 0.1))
        self.assertIsNone(gate.update(None, 0.2))
        self.assertIsNone(gate.update(0.41, 0.3))
        self.assertEqual(gate.update(0.41, 0.5), 0.41)
        self.assertEqual(gate.update(0.0, 0.6), 0.0)

    def test_junk_is_omitted(self):
        gate = WeightGate()
        self.assertIsNone(gate.update("heavy", 0.0))
        self.assertIsNone(gate.update(float("nan"), 0.0))
        self.assertEqual(gate.update(-1, 1.0), 0.0)
        self.assertEqual(gate.update(4, 1.1), 1.0)


class ForceTouchTest(unittest.TestCase):
    def test_non_darwin_is_silent(self):
        if sys.platform == "darwin":
            return
        touch = ForceTouch()
        try:
            self.assertIsNone(touch._proc)
            self.assertIsNone(touch.read())
            touch.close()
            self.assertIsNone(touch.read())
        finally:
            touch.close()

    def test_helper_exits_quietly_off_darwin(self):
        if sys.platform == "darwin":
            return
        helper = os.path.join(
            os.path.dirname(__file__), "..", "..", "backend", "sensors", "force_touch_helper.py"
        )
        proc = subprocess.run(
            [sys.executable, helper],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(proc.stdout, "")
        self.assertEqual(proc.stderr, "")

    def test_replay_weight_wins_over_trackpad(self):
        fd, path = tempfile.mkstemp(suffix=".jsonl")
        os.write(fd, b'{"t": 0, "angle": 10, "weight": 0.37}\n')
        os.close(fd)
        src = ReplaySource(path)
        try:
            port = open_weight(src)
            self.assertNotIsInstance(port, ForceTouch)
            self.assertEqual(src.read(), 10)
            self.assertAlmostEqual(port.read(), 0.37)
            port.close()
        finally:
            src.close()
            os.remove(path)

    def test_angle_source_without_weight_does_not_raise(self):
        if sys.platform == "darwin":
            return
        src = FakeSource()
        port = open_weight(src)
        try:
            self.assertIsInstance(port, ForceTouch)
            self.assertIsNone(port.read())
            self.assertAlmostEqual(src.read(), 0.0)
        finally:
            port.close()
            src.close()


if __name__ == "__main__":
    unittest.main()
