require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

// ✅ Allow localhost + Netlify
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

// 🔐 Auth Middleware
const checkAuth = (req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  const token = req.headers['authorization'];
  console.log('🔐 Incoming Authorization Header:', token);
  console.log('🔐 Expected Token:', `Bearer ${process.env.AUTH_TOKEN}`);

  if (token === `Bearer ${process.env.AUTH_TOKEN}`) return next();

  return res.status(403).json({ error: 'Unauthorized' });
};

// 🛠️ SQLite setup
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

// 💾 S3 setup
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
const upload = multer({ storage: multer.memoryStorage() });

// 🔐 Upload route
app.post('/api/upload', checkAuth, upload.single('image'), (req, res) => {
  const { title, description } = req.body;
  const file = req.file;

  if (!file) return res.status(400).json({ error: 'Image file is required.' });

  const fileKey = `${uuidv4()}-${file.originalname}`;

  s3.upload({
    Bucket: BUCKET_NAME,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: 'public-read'
  }, (err, data) => {
    if (err) {
      console.error('❌ S3 Upload Error:', err.message);
      return res.status(500).json({ error: err.message });
    }

    console.log('✅ Uploaded to S3:', data.Location);

    db.run(
      `INSERT INTO artwork (title, description, filename) VALUES (?, ?, ?)`,
      [title, description, fileKey],
      function (err) {
        if (err) {
          console.error('❌ DB Insert Error:', err.message);
          return res.status(500).json({ error: err.message });
        }

        console.log('✅ Saved to DB:', this.lastID);
        res.json({ success: true, id: this.lastID });
      }
    );
  });
});

// 🆓 Get all artworks
app.get('/api/artworks', (req, res) => {
  db.all(`SELECT * FROM artwork ORDER BY uploaded_at DESC`, [], (err, rows) => {
    if (err) {
      console.error('❌ DB Read Error:', err.message);
      return res.status(500).json({ error: err.message });
    }

    const withUrls = rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${row.filename}`,
      uploaded_at: row.uploaded_at
    }));

    res.json(withUrls);
  });
});

// 🔐 Delete artwork by ID
app.delete('/api/artworks/:id', checkAuth, (req, res) => {
  const id = req.params.id;

  db.get(`SELECT filename FROM artwork WHERE id = ?`, [id], (err, row) => {
    if (err) {
      console.error('❌ DB Lookup Error:', err.message);
      return res.status(500).json({ error: err.message });
    }

    if (!row) return res.status(404).json({ error: 'Artwork not found.' });

    s3.deleteObject({
      Bucket: BUCKET_NAME,
      Key: row.filename
    }, (err) => {
      if (err) {
        console.warn('⚠️ Could not delete file from S3:', err.message);
      } else {
        console.log('✅ Deleted from S3:', row.filename);
      }

      db.run(`DELETE FROM artwork WHERE id = ?`, [id], (deleteErr) => {
        if (deleteErr) {
          console.error('❌ DB Delete Error:', deleteErr.message);
          return res.status(500).json({ error: deleteErr.message });
        }

        console.log('✅ Deleted artwork record from DB:', id);
        res.json({ success: true });
      });
    });
  });
});

// ✅ Server up
app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});
