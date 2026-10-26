"""测试用的仓库相对路径。截图落在 shots/（已 gitignore）。"""
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SHOTS = os.path.join(ROOT, "shots")
BASE = os.environ.get("POPUP_BASE", "http://127.0.0.1:8123/index.html")
BRIDGE = os.path.join(ROOT, "backend", "bridge.py")


def shot_dir(name=""):
    d = os.path.join(SHOTS, name) if name else SHOTS
    os.makedirs(d, exist_ok=True)
    return d


def python_cmd():
    env = os.environ.get("POPUP_PYTHON")
    if env:
        return env
    venv = os.path.join(ROOT, "backend", ".venv", "bin", "python")
    if os.path.isfile(venv):
        return venv
    return sys.executable
