#!/usr/bin/env python3
"""Serve the main scoreboard and try to start its optional local Vosk services."""

import functools
import http.server
import os
import socket
import socketserver
import shutil
import subprocess
import sys
import threading
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_PORT = 8360
PAGE = "snooker_scoreboard.html"


def pick_port(preferred):
    """Refuse alternate ports so the browser origin stays consistent across launches."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind(("127.0.0.1", preferred))
        except OSError as error:
            raise SystemExit(
                "Port %d is unavailable. Close the other scoreboard server or choose a fixed "
                "port explicitly." % preferred
            ) from error
    return preferred


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Always re-read the file: you will be editing the board while this runs
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Keep the console readable: log the path, not the whole request line
        sys.stderr.write("  %s %s\n" % (self.address_string(), fmt % args))


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def start_vosk():
    if not shutil.which("docker"):
        print("Docker was not found. The scoreboard will work without offline voice.")
        return
    try:
        process = subprocess.Popen(
            ["docker", "compose", "up", "-d"],
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        output, _ = process.communicate()
        if process.returncode == 0:
            print("Local Vosk services started (first start downloads the recognition models).")
        else:
            print("Vosk Docker services did not start; the scoreboard remains available.")
            if output:
                print(output.strip())
    except OSError as error:
        print("Could not start Vosk Docker services: %s" % error)
        print("The scoreboard remains available without offline voice.")


def main(argv):
    flags = set(a for a in argv[1:] if a.startswith("-"))
    positional = [a for a in argv[1:] if not a.startswith("-")]
    port = int(positional[0]) if positional and positional[0].isdigit() else DEFAULT_PORT
    port = pick_port(port)
    open_browser = "--no-open" not in flags

    handler = functools.partial(Handler, directory=ROOT)
    httpd = Server(("127.0.0.1", port), handler)

    url = "http://127.0.0.1:%d/%s" % (port, PAGE)
    print("Snooker scoreboard served from %s" % ROOT)
    print("  %s" % url)
    print("Microphone permission is saved for this exact browser address.")
    print("Voice is optional; the scoreboard remains usable if Docker/Vosk is unavailable.")
    print("Press Ctrl+C to stop the web server. Stop the Vosk containers with: docker compose down")
    threading.Thread(target=start_vosk, daemon=True).start()

    if open_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nWeb server stopped.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
