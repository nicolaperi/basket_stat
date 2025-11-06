Backup server (Node.js)

This project includes a simple Node.js server that serves the app and exposes an endpoint to save backups in the project folder.

Why: Browsers cannot write files on the project filesystem directly—this server lets the client POST the DB export and have it stored as backups/backup.json.

Files added:
- backup_server.js  -> Express-based server (also serves static files)
- package.json      -> scripts/deps to run the server

Setup (Windows, PowerShell)

1. Install Node.js (LTS) from https://nodejs.org/ if you don't have it.
2. Open PowerShell in the project root (where this README is) and run:

   npm install

3. Start the server:

   npm start

4. Open the app in your browser:

   http://localhost:8000/

Behaviour

- When you press "Termina partita" in the app, the client will POST a JSON export to POST /save-backup.
- The server writes it to backups/backup.json. On next app start the client will try to fetch /backups/backup.json and restore automatically.

Notes

- The server serves the entire project folder statically. Be cautious about committing backups to source control.
- If you want a different backup filename or port, edit `backup_server.js`.
