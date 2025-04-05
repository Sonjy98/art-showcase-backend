Art Showcase – Backend
This is the backend for the Art Showcase app, built with Node.js, Express, and PostgreSQL, deployed on Render. It handles secure image uploads to Amazon S3, persists artwork metadata in a hosted database, and exposes protected API endpoints for managing artworks.

🔗 Repositories
Frontend: github.com/Sonjy98/art-showcase-frontend

Backend: github.com/Sonjy98/art-showcase-backend

🌐 Live API
https://art-showcase-backend.onrender.com

🖼 Features
Upload and delete artwork images securely (Multer + S3).

Store metadata (title, description, image filename, upload date) in PostgreSQL.

Secure endpoints with token-based authorization.

CORS support for local development and Netlify frontend.

Public GET endpoint for displaying artworks.

🛠️ Tech Stack
Node.js + Express

PostgreSQL (hosted on Render)

Multer for file handling

AWS SDK v2 (S3)

Hosted on Render

⚙️ Environment Variables
Create a .env file with the following:

```
PORT=3001
AUTH_TOKEN=your_secret_token

AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_REGION=your_region
AWS_BUCKET_NAME=your_bucket

DATABASE_URL=your_postgres_connection_url
```

🚀 Local Development
```
git clone https://github.com/Sonjy98/art-showcase-backend
cd art-showcase-backend
npm install
node index.js
```
