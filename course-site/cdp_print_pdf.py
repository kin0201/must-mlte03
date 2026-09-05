#!/usr/bin/env python3
"""cdp_print_pdf.py — render a reveal.js deck to PDF via the Chrome DevTools
Protocol directly, instead of `--print-to-pdf` + `--virtual-time-budget`.

Why this exists: the CLI flag combo races Google Fonts (deck.css imports
STIX Two Text and Inter from fonts.googleapis.com, so a cold isolated
profile always needs a live fetch). --virtual-time-budget can freeze real
time before that fetch resolves — sometimes before Reveal has laid out the
print pages at all (a 1-page blank), sometimes after fallback-font metrics
have already caused tall slides to split across two pages (page count >
slide count). Both are silent: the PDF is a valid, non-empty file either
way. This script instead drives the page for real and waits on concrete
signals — document.fonts.ready, the .reveal.ready class, and the actual
.pdf-page count matching <section> count — before asking Chrome to print,
so there is nothing left to race.

Usage:
    python3 cdp_print_pdf.py <url> <out.pdf> <expected_page_count>
"""
import json
import subprocess
import sys
import tempfile
import time
import base64
import shutil

import requests
import websocket

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def cdp_print(url: str, out_path: str, want_pages: int, debug_port: int = 0, timeout_s: int = 40) -> int:
    if not debug_port:
        # Randomize so back-to-back invocations (e.g. exporting all 14 decks
        # in one run) never collide with a prior Chrome process still
        # releasing its port.
        import random
        debug_port = random.randint(19000, 29000)
    profile = tempfile.mkdtemp()
    proc = subprocess.Popen(
        [
            CHROME, "--headless", "--disable-gpu", "--no-first-run",
            "--no-default-browser-check", "--disable-sync",
            f"--user-data-dir={profile}",
            f"--remote-debugging-port={debug_port}",
            "--remote-allow-origins=*",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        # wait for the devtools endpoint to come up
        deadline = time.time() + 10
        target = None
        while time.time() < deadline:
            try:
                r = requests.put(f"http://127.0.0.1:{debug_port}/json/new?{url}", timeout=2)
                if r.ok:
                    target = r.json()
                    break
            except requests.exceptions.ConnectionError:
                time.sleep(0.3)
        if target is None:
            raise RuntimeError("devtools endpoint never came up")

        ws = websocket.create_connection(target["webSocketDebuggerUrl"], timeout=timeout_s)
        msg_id = 0

        def send(method, params=None):
            nonlocal msg_id
            msg_id += 1
            ws.send(json.dumps({"id": msg_id, "method": method, "params": params or {}}))
            return msg_id

        def recv_result(for_id):
            while True:
                resp = json.loads(ws.recv())
                if resp.get("id") == for_id:
                    return resp

        def eval_js(expr):
            i = send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
            resp = recv_result(i)
            return resp.get("result", {}).get("result", {}).get("value")

        send("Page.enable")
        send("Runtime.enable")

        # navigate and wait for load
        nav_id = send("Page.navigate", {"url": url})
        recv_result(nav_id)
        deadline = time.time() + timeout_s
        while time.time() < deadline:
            state = eval_js("document.readyState")
            if state == "complete":
                break
            time.sleep(0.3)

        # the real waits, in order — this is the substance of the fix
        eval_js("document.fonts.ready.then(() => true)")
        deadline = time.time() + timeout_s
        ok = False
        while time.time() < deadline:
            ready = eval_js("document.querySelector('.reveal') && document.querySelector('.reveal').classList.contains('ready')")
            got = eval_js("document.querySelectorAll('.pdf-page').length")
            if ready and got == want_pages:
                ok = True
                break
            time.sleep(0.4)
        if not ok:
            got = eval_js("document.querySelectorAll('.pdf-page').length")
            raise RuntimeError(f"page count never settled at {want_pages} (last saw {got})")

        # small settle buffer for any final paint/layout after class flip
        time.sleep(0.5)

        pw = eval_js("parseFloat(getComputedStyle(document.querySelector('.pdf-page')).width) / 96")
        ph = eval_js("parseFloat(getComputedStyle(document.querySelector('.pdf-page')).height) / 96")

        i = send("Page.printToPDF", {
            "printBackground": True,
            "preferCSSPageSize": False,
            "paperWidth": pw,
            "paperHeight": ph,
            "marginTop": 0, "marginBottom": 0, "marginLeft": 0, "marginRight": 0,
        })
        resp = recv_result(i)
        data = resp["result"]["data"]
        with open(out_path, "wb") as f:
            f.write(base64.b64decode(data))
        ws.close()
        return 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    url, out_path, want = sys.argv[1], sys.argv[2], int(sys.argv[3])
    sys.exit(cdp_print(url, out_path, want))
