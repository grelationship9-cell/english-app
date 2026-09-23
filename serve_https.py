"""検証用のHTTPSサーバー。

マイク（音声認識）はブラウザの決まりで https でしか使えないため、
実機検証のあいだだけ自己署名証明書でHTTPSを立てる。

    python serve_https.py

本番は GitHub Pages に置くので、これは工程1〜2の一時しのぎ。
"""

import http.server
import os
import ssl

PORT = 8443
CERT_DIR = os.environ.get(
    "CERT_DIR",
    r"C:\Users\grela\AppData\Local\Temp\claude"
    r"\C--Users-grela-Work-MyClaudeCode--------"
    r"\4cd38901-c4e2-4ce3-b5ed-b37a17d6315b\scratchpad\cert",
)

os.chdir(os.path.dirname(os.path.abspath(__file__)))

ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(
    os.path.join(CERT_DIR, "cert.pem"),
    os.path.join(CERT_DIR, "key.pem"),
)

server = http.server.ThreadingHTTPServer(
    ("0.0.0.0", PORT), http.server.SimpleHTTPRequestHandler
)
server.socket = ctx.wrap_socket(server.socket, server_side=True)

print(f"https://0.0.0.0:{PORT}/  で待機中（Ctrl+C で停止）")
server.serve_forever()
