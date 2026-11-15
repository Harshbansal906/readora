/**
 * READORA - Main Application Server
 * Express API + Static Delivery for Unified Production Deployment
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { db, initDB } = require('./db/database');

const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const aiRoutes = require('./routes/ai');
const uploadRoutes = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 5000;

// Production Security Headers (disables CSP to allow remote Unsplash images & Google Fonts)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS and Body Parsing Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// SECURITY: never serve the database, server code, config or secrets as static files
app.use((req, res, next) => {
  const p = decodeURIComponent(req.path).toLowerCase();
  // Allow public translation JSON files and user uploads
  if (p.startsWith('/locales/') && (p.endsWith('/en.json') || p.endsWith('/hi.json'))) {
    return next();
  }
  if (p.startsWith('/uploads/')) {
    return next();
  }
  const blockedExt = /\.(db|sqlite|sqlite3|env|json|md|yaml|yml|log|lock)$/;
  const blockedPath = /^\/(server\.js|procfile|license|\.git|node_modules|db|routes|middleware|utils|scripts)(\/|$|\.)/;
  if (blockedExt.test(p) || blockedPath.test(p)) {
    return res.status(404).send('Not found');
  }
  next();
});

// Serve Static Frontend Assets (HTML, CSS, JS, Images)
app.use(express.static(path.join(__dirname)));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/upload', uploadRoutes);

// Enhanced Production Health check endpoint
app.get('/api/health', async (req, res) => {
  let dbStatus = 'healthy';
  try {
    await db.getAsync('SELECT 1');
  } catch (e) {
    dbStatus = 'degraded';
  }

  res.json({
    status: 'online',
    app: 'READORA',
    tagline: 'Where readers become creators.',
    database: db.isPostgres ? 'postgresql' : 'sqlite',
    databaseStatus: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// Explicit Route fallbacks for clean navigation
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'account.html'));
});

// Unknown API routes should return JSON, not the home page
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API route not found.' });
});

// Fallback all other client-side routes to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Centralized Production Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected server error occurred.'
      : (err.message || 'Internal server error')
  });
});

// Initialize Database and Start Server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log('====================================================');
    console.log(`🔥 READORA Server is running live on port ${PORT}!`);
    console.log(`🌐 Local Access: http://localhost:${PORT}`);
    console.log(`🗄️ Database: ${db.isPostgres ? 'PostgreSQL' : 'SQLite'}`);
    console.log(`📚 Ready for Production Deployment`);
    console.log('====================================================');
  });
}).catch(err => {
  console.error('Failed to start server:', err);
});
