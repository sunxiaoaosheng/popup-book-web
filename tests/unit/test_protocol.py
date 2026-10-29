"""角度帧编码与健康检查 JSON。"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "backend"))

from protocol import TAP_KINDS, angle_frame, health_body, heartbeat_frame, tap_frame, tap_frames_from  # noqa: E402


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

    def test_mode_is_optional(self):
        plain = angle_frame(1, 1, 1)
        self.assertNotIn("mode", plain)
        self.assertEqual(angle_frame(1, 1, 1, "sensor")["mode"], "sensor")
        self.assertEqual(heartbeat_frame(2, 3, "fake")["mode"], "fake")
        self.assertNotIn("mode", heartbeat_frame(2, 3))

    def test_heartbeat_has_no_angle(self):
        beat = heartbeat_frame(4, 1000)
        self.assertEqual(beat["type"], "heartbeat")
        self.assertNotIn("angle", beat)
        self.assertGreater(beat["seq"], 0)

    def test_tap_frame_is_kind_and_strength_only(self):
        frame = tap_frame(6, 12.26, "slap", 0.724, "sensor")
        self.assertEqual(frame["v"], 1)
        self.assertEqual(frame["type"], "tap")
        self.assertEqual(frame["kind"], "slap")
        self.assertEqual(frame["strength"], 0.724)
        self.assertEqual(frame["mode"], "sensor")
        self.assertNotIn("angle", frame)
        self.assertNotIn("waveform", frame)
        self.assertNotIn("samples", frame)
        self.assertEqual(set(TAP_KINDS), {"slap", "double-knock", "triple-knock"})
        loud = tap_frame(7, 1, "triple-knock", 4)
        self.assertEqual(loud["strength"], 1)
        self.assertNotIn("mode", loud)
        with self.assertRaises(ValueError):
            tap_frame(1, 1, "wave", 0.2)

    def test_tap_batch_drops_waveform_and_unknown_kinds(self):
        seq, frames = tap_frames_from([
            {"kind": "slap", "strength": 0.2, "waveform": [1, 2, 3]},
            {"kind": "nope", "strength": 0.9, "samples": [0]},
            {"kind": "double-knock", "strength": "no"},
            "not-a-dict",
            {"kind": "triple-knock", "strength": 0.5},
        ], 10, 4, "fake")
        self.assertEqual(seq, 12)
        self.assertEqual([f["kind"] for f in frames], ["slap", "triple-knock"])
        self.assertEqual(frames[0]["seq"], 11)
        self.assertNotIn("waveform", frames[0])
        self.assertEqual(frames[0]["mode"], "fake")
        self.assertEqual(frames[1]["strength"], 0.5)

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
