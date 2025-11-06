"""
Lightweight static file server with a backup save endpoint.
Run from project root and open http://localhost:8000/
It serves the project files and accepts POST /save-backup with JSON body to save backups/backups.json
"""
import http.server
import socketserver
import os
import json
from urllib.parse import urlparse

PORT = 8000
BACKUP_DIR = 'backups'
BACKUP_FILE = os.path.join(BACKUP_DIR, 'backup.json')

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/save-backup':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body.decode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b'Invalid JSON')
                return
            try:
                os.makedirs(BACKUP_DIR, exist_ok=True)
                with open(BACKUP_FILE, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'OK')
                print(f"Saved backup to {BACKUP_FILE}")
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(b'Write failed')
                print('Failed to write backup:', e)
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'Not found')

if __name__ == '__main__':
    print(f"Serving on port {PORT}. Use Ctrl-C to stop.")
    print(f"Backups will be written to {os.path.abspath(BACKUP_FILE)}")
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nStopping server')
            httpd.server_close()
