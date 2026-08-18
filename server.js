const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const db = new Database('database.db');
const JWT_SECRET = 'change_ce_secret_tres_long_et_securise_12345';

// Initialisation des tables SQLite
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT UNIQUE NOT NULL
  );
  CREATE TABLE IF NOT EXISTS actu (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    contenu TEXT NOT NULL,
    date TEXT NOT NULL,
    category_id INTEGER,
    FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS vinted (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titre TEXT NOT NULL,
    prix TEXT NOT NULL,
    lien TEXT NOT NULL,
    image_url TEXT
  );
  CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY,
    password_hash TEXT NOT NULL
  );
`);

// Catégories initiales par défaut
const countCat = db.prepare('SELECT COUNT(*) as count FROM categories').get();
if (countCat.count === 0) {
  db.prepare('INSERT INTO categories (nom) VALUES (?)').run('Général');
  db.prepare('INSERT INTO categories (nom) VALUES (?)').run('Annonces');
}

// Initialisation du compte Admin par défaut
const rowAdmin = db.prepare('SELECT * FROM admin WHERE id = 1').get();
if (!rowAdmin) {
  const hash = bcrypt.hashSync('MonSuperPass123!', 10);
  db.prepare('INSERT INTO admin (id, password_hash) VALUES (1, ?)').run(hash);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware d'authentification Admin via JWT
function verifierAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Accès refusé' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Jeton invalide' });
  }
}

// Connexion Admin
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const admin = db.prepare('SELECT * FROM admin WHERE id = 1').get();

  if (bcrypt.compareSync(password, admin.password_hash)) {
    const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '6h' });
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: 'Mot de passe incorrect' });
  }
});

// Routes publiques
app.get('/api/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories').all());
});

app.get('/api/actu', (req, res) => {
  const catId = req.query.cat;
  if (catId) {
    res.json(db.prepare('SELECT * FROM actu WHERE category_id = ? ORDER BY id DESC').all(catId));
  } else {
    res.json(db.prepare('SELECT * FROM actu ORDER BY id DESC').all());
  }
});

app.get('/api/vinted', (req, res) => {
  res.json(db.prepare('SELECT * FROM vinted ORDER BY id DESC').all());
});

// Routes protégées Admin
app.post('/api/categories', verifierAdmin, (req, res) => {
  const { nom } = req.body;
  try {
    db.prepare('INSERT INTO categories (nom) VALUES (?)').run(nom);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'Cette catégorie existe déjà.' });
  }
});

app.delete('/api/categories/:id', verifierAdmin, (req, res) => {
  db.prepare('DELETE FROM actu WHERE category_id = ?').run(req.params.id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/actu', verifierAdmin, (req, res) => {
  const { titre, contenu, category_id } = req.body;
  const date = new Date().toLocaleDateString('fr-FR');
  db.prepare('INSERT INTO actu (titre, contenu, date, category_id) VALUES (?, ?, ?, ?)').run(titre, contenu, date, category_id);
  res.json({ success: true });
});

app.delete('/api/actu/:id', verifierAdmin, (req, res) => {
  db.prepare('DELETE FROM actu WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/vinted', verifierAdmin, (req, res) => {
  const { titre, prix, lien, image_url } = req.body;
  db.prepare('INSERT INTO vinted (titre, prix, lien, image_url) VALUES (?, ?, ?, ?)').run(titre, prix, lien, image_url);
  res.json({ success: true });
});

app.delete('/api/vinted/:id', verifierAdmin, (req, res) => {
  db.prepare('DELETE FROM vinted WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Port dynamique pour Render ou 3000 en local
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur prêt sur le port ${PORT}`));
