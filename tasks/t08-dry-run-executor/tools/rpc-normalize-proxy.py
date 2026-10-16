#!/usr/bin/env python3
"""Logging JSON-RPC proxy: listens on 127.0.0.1:8546, forwards to upstream, logs requests."""
import http.server, http.client, json, os, sys

UPSTREAM = os.environ["UPSTREAM_URL"]
from urllib.parse import urlparse
u = urlparse(UPSTREAM)
HOST, PORT = u.hostname, u.port or (443 if u.scheme == "https" else 80)
PATH = (u.path or "/") + (("?" + u.query) if u.query else "")
TLS = u.scheme == "https"

# Outbound goes through the VM's proxy (curl works; raw sockets don't).
_pu = urlparse(os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or "")
PROXY_HOST, PROXY_PORT = _pu.hostname, _pu.port or 8080

def upstream_conn():
    if PROXY_HOST:
        c = http.client.HTTPSConnection(PROXY_HOST, PROXY_PORT, timeout=60) if TLS \
            else http.client.HTTPConnection(PROXY_HOST, PROXY_PORT, timeout=60)
        c.set_tunnel(HOST, PORT)
        return c, f"{u.scheme}://{HOST}:{PORT}{PATH}"
    c = http.client.HTTPSConnection(HOST, PORT, timeout=60) if TLS \
        else http.client.HTTPConnection(HOST, PORT, timeout=60)
    return c, PATH

class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        try:
            req = json.loads(body)
            ms = req.get("method")
            if req.get("params") is None:
                req["params"] = []  # normalize: proxy rejects params:null
                rewritten = True
            else:
                rewritten = False
            # normalize: proxy rejects {blockHash,...} objects; the blockHash
            # forge sends is the 'latest' block it just fetched, so map to latest
            def norm(p):
                if isinstance(p, dict) and "blockHash" in p:
                    return "latest"
                if isinstance(p, list):
                    return [norm(x) for x in p]
                if isinstance(p, dict):
                    return {k: norm(v) for k, v in p.items()}
                return p
            np_ = norm(req.get("params"))
            if np_ != req.get("params"):
                req["params"] = np_
                rewritten = True
            if rewritten:
                body = json.dumps(req).encode()
                print(f">>> {ms} params NORMALIZED -> {json.dumps(req.get('params'))[:160]}", flush=True)
            else:
                ps = json.dumps(req.get("params"))[:220]
                print(f">>> {ms} params={ps}", flush=True)
        except Exception as e:
            print(f">>> UNPARSEABLE: {body[:220]} ({e})", flush=True)
        conn, target = upstream_conn()
        conn.request("POST", target, body, {"content-type": "application/json"})
        resp = conn.getresponse().read()
        try:
            rj = json.loads(resp)
            err = rj.get("error")
            print(f"<<< {ms} -> {'ERROR '+json.dumps(err)[:160] if err else 'ok '+str(resp)[:80]}", flush=True)
        except Exception:
            print(f"<<< {ms} -> non-json {resp[:120]}", flush=True)
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(resp)))
        self.end_headers()
        self.wfile.write(resp)

http.server.HTTPServer(("127.0.0.1", 8546), H).serve_forever()
