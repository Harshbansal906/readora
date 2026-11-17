/**
 * READORA - Main Application Server
 * Express API + Static Delivery for Unified Production Deployment
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const { db, initDB } = require('./db/database');

const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const aiRoutes = require('./routes/ai');
const uploadRoutes = require('./routes/upload');
const userRoutes = require('./routes/users');
const friendsRoutes = require('./routes/friends');
const notificationsRoutes = require('./routes/notifications');
const callsRoutes = require('./routes/calls');
const searchRoutes = require('./routes/search');
const conversationsRoutes = require('./routes/conversations');
const messagesRoutes = require('./routes/messages');

const app = express();
const PORT = process.env.PORT || 5000;

// Production Security Headers with LiveKit & Google Fonts CSP (Phase 11)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://images.unsplash.com", "https://res.cloudinary.com", "https://*.googleusercontent.com", "https://*.bing.com"],
      connectSrc: ["'self'", "https://*", "wss://*"],
      frameSrc: ["'self'", "https://accounts.google.com"],
      mediaSrc: ["'self'", "blob:", "data:"],
      objectSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// Request ID logging middleware
app.use((req, res, next) => {
  const reqId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  req.id = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
});

// CORS and Body Parsing Middlewares
app.use(cors());
app.use(cookieParser());
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
app.use(express.static(path.join(__dirname), {
  maxAge: '1h',
  etag: true
}));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/calls', callsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/messages', messagesRoutes);

// Enhanced Production Health check endpoint (serves both /health and /api/health)
app.get(['/health', '/api/health'], async (req, res) => {
  let dbStatus = 'healthy';
  try {
    await db.getAsync('SELECT 1');
  } catch (e) {
    dbStatus = 'degraded';
  }

  res.status(dbStatus === 'healthy' ? 200 : 503).json({
    status: dbStatus === 'healthy' ? 'online' : 'degraded',
    app: 'READORA',
    tagline: 'Where readers become creators.',
    database: db.isPostgres ? 'postgresql' : 'sqlite',
    databaseStatus: dbStatus,
    requestId: req.id,
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
