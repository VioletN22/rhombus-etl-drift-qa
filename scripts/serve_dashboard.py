"""Serve dashboard/ locally with caching off, so a rebuild always shows up on refresh.

    python scripts/serve_dashboard.py [port]
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DASH = Path(__file__).resolve().parent.parent / "dashboard"


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
ThreadingHTTPServer(("127.0.0.1", port), partial(NoCache, directory=str(DASH))).serve_forever()
