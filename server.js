const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// S'assurer que le dossier uploads existe pour éviter les erreurs Multer
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

// Configuration de Multer pour le stockage des images
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

// Middlewares pour les fichiers statiques et le JSON
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(uploadDir));

// --- ROUTES API ---

// 1. Récupérer toutes les actualités
app.get('/api/actu', (req, res) => {
  try {
    const articles = db.prepare('SELECT * FROM actu ORDER BY date DESC').all();
    res.json(articles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Ajouter une nouvelle actualité
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

// 3. Supprimer une actualité
app.delete('/api/actu/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM actu WHERE id = ?');
    stmt.run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ROUTE PRINCIPALE (Affiche index.html) ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Lancement du serveur
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
