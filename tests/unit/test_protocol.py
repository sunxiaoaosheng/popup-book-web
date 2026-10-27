"""角度帧编码与健康检查 JSON。"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

from protocol import angle_frame, health_body, heartbeat_frame  # noqa: E402


class ProtocolTest(unittest.TestCase):
    def test_angle_frame_fields(self):
        frame = angle_frame(3, 15.26, 87.256)
        self.assertEqual(frame["v"], 1)
        self.assertEqual(frame["seq"], 3)
        self.assertEqual(frame["t"], 15.3)
        self.assertEqual(frame["type"], "angle")
        self.assertEqual(frame["angle"], 87.26)
        raw = json.dumps(frame)
        again = json.loads(raw)
        again["unrelated"] = {"keep": True}
        self.assertEqual(again["angle"], 87.26)

    def test_heartbeat_has_no_angle(self):
        beat = heartbeat_frame(4, 1000)
        self.assertEqual(beat["type"], "heartbeat")
        self.assertNotIn("angle", beat)
        self.assertGreater(beat["seq"], 0)

    def test_health_shape(self):
        body = health_body("fake", 2, 12.5, 40, 9, 45)
        self.assertTrue(body["ok"])
        self.assertEqual(body["mode"], "fake")
        self.assertEqual(body["clients"], 2)
        self.assertEqual(body["lastAngle"], 12.5)
        self.assertEqual(body["lastAngleAgeMs"], 40)
        self.assertEqual(body["seq"], 9)
        empty = health_body("sensor", 0, None, None, 0, 45)
        self.assertIsNone(empty["lastAngle"])
        self.assertIsNone(empty["lastAngleAgeMs"])


if __name__ == "__main__":
    unittest.main()
