const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'votre_cle_secrete_super_securisee_12345';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Création du dossier d'upload d'images si inexistant
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuration de Multer pour le stockage des images
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'img-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

// Initialisation de la base SQLite via better-sqlite3
const db = new Database('./data.db');
db.pragma('foreign_keys = ON');

// Initialisation des tables
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS actu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    titre TEXT NOT NULL,
    contenu TEXT,
    image TEXT,
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
  );
`);

// Middleware d'authentification Admin
function verifierToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Accès non autorisé" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Token invalide ou expiré" });
    req.user = user;
    next();
  });
}

// ==================== ROUTES API ====================

// Route Connexion Admin
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ success: true, token });
  }
  res.status(401).json({ success: false, message: "Mot de passe incorrect" });
});

// --- Catégories ---
app.get('/api/categories', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const categories = db.prepare("SELECT * FROM categories ORDER BY nom ASC").all();
  res.json(categories);
});

app.post('/api/categories', verifierToken, (req, res) => {
  const { nom } = req.body;
  if (!nom) return res.status(400).json({ error: "Nom requis" });
  try {
    const info = db.prepare("INSERT INTO categories (nom) VALUES (?)").run(nom);
    res.json({ id: info.lastInsertRowid, nom });
  } catch (err) {
    res.status(400).json({ error: "Cette catégorie existe déjà." });
  }
});

app.delete('/api/categories/:id', verifierToken, (req, res) => {
  db.prepare("DELETE FROM categories WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// --- Actualités ---
app.get('/api/actu', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const query = `
    SELECT actu.*, categories.nom AS category_name 
    FROM actu 
    LEFT JOIN categories ON actu.category_id = categories.id 
    ORDER BY actu.id DESC
  `;
  const actus = db.prepare(query).all();
  res.json(actus);
});

app.post('/api/actu', verifierToken, upload.single('image'), (req, res) => {
  const { category_id, titre, contenu } = req.body;
  const imagePath = req.file ? '/uploads/' + req.file.filename : null;

  const info = db.prepare("INSERT INTO actu (category_id, titre, contenu, image) VALUES (?, ?, ?, ?)").run(category_id, titre, contenu, imagePath);
  res.json({ id: info.lastInsertRowid, category_id, titre, contenu, image: imagePath });
});

app.delete('/api/actu/:id', verifierToken, (req, res) => {
  db.prepare("DELETE FROM actu WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// Redirection SPA générique
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Serveur sécurisé démarré sur http://localhost:${PORT}`);
});
