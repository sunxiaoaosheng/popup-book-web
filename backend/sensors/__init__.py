"""角度来源。每种适配器都有 name、mode、read()、close()。见 docs/ADAPTERS.md。"""

from sensors.fake import FakeSource
from sensors.lid import PyBookLidSource
from sensors.replay import ReplaySource

__all__ = ["FakeSource", "PyBookLidSource", "ReplaySource"]
