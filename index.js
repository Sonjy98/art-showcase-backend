require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// ✅ Dynamic CORS with origin logging
const allowedOrigins = [
  'http://localhost:5173',
  'https://courageous-pastelito-4fbee7.netlify.app'
];

app.use(cors({
  origin: function (origin, callback) {
    console.log('🌐 CORS request from:', origin);
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 🔐 AUTH MIDDLEWARE
function checkAuth(req, res, next) {
  const token = req.headers['authorization'];
  if (token === `Bearer ${process.env.AUTH_TOKEN}`) {
    next();
  } else {
    return res.status(403).json({ error: 'Unauthorized' });
  }
}

// SQLite setup
const db = new sqlite3.Database('./database.db');

db.run(`
  CREATE TABLE IF NOT EXISTS artwork (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    filename TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// File upload setup
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// 🔐 Upload artwork (protected)
app.post('/api/upload', checkAuth, upload.single('image'), (req, res) => {
  const { title, description } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'Image file is required.' });
  }

  db.run(
    `INSERT INTO artwork (title, description, filename) VALUES (?, ?, ?)`,
    [title, description, file.filename],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

// 🆓 Get all artworks (public)
app.get('/api/artworks', (req, res) => {
  console.log('📦 GET /api/artworks called');
  db.all(`SELECT * FROM artwork ORDER BY uploaded_at DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// 🔐 Delete artwork by ID (protected)
app.delete('/api/artworks/:id', checkAuth, (req, res) => {
  const id = req.params.id;

  db.get(`SELECT filename FROM artwork WHERE id = ?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Artwork not found.' });

    const filePath = path.join(__dirname, 'uploads', row.filename);
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) {
        console.warn('⚠️ Could not delete file:', unlinkErr.message);
      }
    });

    db.run(`DELETE FROM artwork WHERE id = ?`, [id], (deleteErr) => {
      if (deleteErr) return res.status(500).json({ error: deleteErr.message });
      res.json({ success: true });
    });
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});
