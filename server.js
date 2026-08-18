const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// Création du dossier uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Base de données SQLite
const db = new Database('database.db');

// Initialisation de la table d'actualités
db.exec(`
  CREATE TABLE IF NOT EXISTS actu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    image TEXT,
    date DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Configuration Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Middlewares
app.use(express.json());

// Servir les fichiers du dossier public s'il existe, sinon la racine
const publicDir = fs.existsSync(path.join(__dirname, 'public')) 
  ? path.join(__dirname, 'public') 
  : __dirname;

app.use(express.static(publicDir));
app.use('/uploads', express.static(uploadDir));

// --- ROUTES PAGES HTML ---

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

// --- ROUTES API ---

app.get('/api/actu', (req, res) => {
  try {
    const articles = db.prepare('SELECT * FROM actu ORDER BY date DESC').all();
    res.json(articles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/actu', upload.single('image'), (req, res) => {
  try {
    const { title, content } = req.body;
    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

    const stmt = db.prepare('INSERT INTO actu (title, content, image) VALUES (?, ?, ?)');
    const result = stmt.run(title, content, imagePath);

    res.json({ id: result.lastInsertRowid, title, content, image: imagePath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/actu/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM actu WHERE id = ?');
    stmt.run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
