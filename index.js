require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3001;

// ✅ PostgreSQL pool
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// 🛠️ Create table (run only once)
db.query(`
  CREATE TABLE IF NOT EXISTS artwork (
    id SERIAL PRIMARY KEY,
    title TEXT,
    description TEXT,
    filename TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
  );
`).then(() => console.log('✅ Table checked/created')).catch(console.error);

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
  if (process.env.NODE_ENV !== 'production') return next();

  const token = req.headers['authorization'];
  console.log('🔐 Incoming Authorization Header:', token);
  console.log('🔐 Expected Token:', `Bearer ${process.env.AUTH_TOKEN}`);

  if (token === `Bearer ${process.env.AUTH_TOKEN}`) return next();
  return res.status(403).json({ error: 'Unauthorized' });
};

// 💾 S3 setup
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
const upload = multer({ storage: multer.memoryStorage() });

// 🔐 Upload route
app.post('/api/upload', checkAuth, upload.single('image'), async (req, res) => {
  const { title, description } = req.body;
  const file = req.file;

  if (!file) return res.status(400).json({ error: 'Image file is required.' });

  const fileKey = `${uuidv4()}-${file.originalname}`;

  try {
    const s3Res = await s3.upload({
      Bucket: BUCKET_NAME,
      Key: fileKey,
      Body: file.buffer,
      ContentType: file.mimetype,
    }).promise();

    console.log('✅ Uploaded to S3:', s3Res.Location);

    const result = await db.query(
      `INSERT INTO artwork (title, description, filename) VALUES ($1, $2, $3) RETURNING id`,
      [title, description, fileKey]
    );

    console.log('✅ Saved to DB:', result.rows[0].id);
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('❌ Upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 🆓 Get all artworks
app.get('/api/artworks', async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM artwork ORDER BY uploaded_at DESC`);
    const withUrls = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${row.filename}`,
      uploaded_at: row.uploaded_at
    }));
    res.json(withUrls);
  } catch (err) {
    console.error('❌ Fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 🔐 Delete artwork by ID
app.delete('/api/artworks/:id', checkAuth, async (req, res) => {
  const id = req.params.id;

  try {
    const fileRes = await db.query(`SELECT filename FROM artwork WHERE id = $1`, [id]);
    if (fileRes.rowCount === 0) return res.status(404).json({ error: 'Artwork not found.' });

    const filename = fileRes.rows[0].filename;

    await s3.deleteObject({ Bucket: BUCKET_NAME, Key: filename }).promise();
    console.log('✅ Deleted from S3:', filename);

    await db.query(`DELETE FROM artwork WHERE id = $1`, [id]);
    console.log('✅ Deleted artwork from DB:', id);

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Server up
app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});
