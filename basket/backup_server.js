/*
Node.js backup server for the Basket project.

- Serves static files from project root (index.html, src/, assets/, ...)
- Provides POST /save-backup to receive JSON and save it to backups/backup.json
- Serves saved backup at /backups/backup.json for client-side auto-restore

Usage:
  1) Install Node.js (https://nodejs.org/) if not present
  2) In project folder run: npm install
  3) Start server: npm start

This is equivalent to the previous Python server but implemented in JavaScript (Node + Express).
*/

const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 8000;
const BACKUP_DIR = path.join(__dirname, 'backups');
const BACKUP_FILE = path.join(BACKUP_DIR, 'backup.json');

// Serve static project files from current directory
app.use(express.static(__dirname));

// parse JSON bodies
app.use(bodyParser.json({limit: '10mb'}));

app.post('/save-backup', (req, res) => {
  const data = req.body;
  if(!data || typeof data !== 'object'){
    return res.status(400).send('Invalid JSON');
  }
  try{
    if(!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(data, null, 2), { encoding: 'utf8' });
    console.log(`Saved backup to ${BACKUP_FILE}`);
    res.status(200).send('OK');
  }catch(err){
    console.error('Failed to write backup:', err);
    res.status(500).send('Write failed');
  }
});

// Optional health endpoint
app.get('/health', (req, res) => res.send({ok:true}));

app.listen(PORT, () => console.log(`Backup server running at http://localhost:${PORT}/`));
