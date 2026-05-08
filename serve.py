#!/usr/bin/env python3
import http.server, socketserver, os, sys

DIR = "/Users/neyjohns/Documents/Claude/Projects/Window LF Cost Calculator"
PORT = int(os.environ.get("PORT", "8755"))

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=DIR, **kw)
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        super().end_headers()

with socketserver.TCPServer(("", PORT), H) as httpd:
    sys.stderr.write(f"serving {DIR} on port {PORT}\n")
    httpd.serve_forever()
