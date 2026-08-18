const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'votre_cle_secrete_super_securisee';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Vérifier et créer le dossier d'upload s'il n'existe pas
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuration de Multer pour le stockage des images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'img-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage: storage });

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rendre les fichiers statiques accessibles (TRÈS IMPORTANT POUR LES IMAGES)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

// Initialisation de la Base de Données SQLite
const db = new sqlite3.Database('./data.db', (err) => {
  if (err) console.error("Erreur ouverture DB:", err.message);
  else console.log("Connecté à la base de données SQLite.");
});

// Création des tables si elles n'existent pas
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL UNIQUE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS actu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    titre TEXT NOT NULL,
    contenu TEXT,
    image TEXT,
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
  )`);
});

// Middleware d'authentification JWT pour les routes admin
function verifierToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(0x191).json({ error: "Accès non autorisé" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(0x193).json({ error: "Token invalide ou expiré" });
    req.user = user;
    next();
  });
}

// ==================== ROUTES API ====================

// Connexion Admin
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
  db.all("SELECT * FROM categories ORDER BY nom ASC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/categories', verifierToken, (req, res) => {
  const { nom } = req.body;
  if (!nom) return res.status(400).json({ error: "Nom requis" });
  db.run("INSERT INTO categories (nom) VALUES (?)", [nom], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, nom });
  });
});

app.delete('/api/categories/:id', verifierToken, (req, res) => {
  db.run("DELETE FROM categories WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// --- Actualités ---
app.get('/api/actu', (req, res) => {
  const query = `
    SELECT actu.*, categories.nom AS category_name 
    FROM actu 
    LEFT JOIN categories ON actu.category_id = categories.id 
    ORDER BY actu.id DESC
  `;
  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/actu', verifierToken, upload.single('image'), (req, res) => {
  const { category_id, titre, contenu } = req.body;
  let imagePath = null;

  if (req.file) {
    // Normaliser l'URL publique de l'image
    imagePath = '/uploads/' + req.file.filename;
  }

  const stmt = db.prepare("INSERT INTO actu (category_id, titre, contenu, image) VALUES (?, ?, ?, ?)");
  stmt.run([category_id, titre, contenu, imagePath], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, category_id, titre, contenu, image: imagePath });
  });
  stmt.finalize();
});

app.delete('/api/actu/:id', verifierToken, (req, res) => {
  db.run("DELETE FROM actu WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

// Redirection globale vers index.html pour les routes inconnues
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
