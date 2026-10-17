/**
 * READORA - Main Application Server
 * Express API + Static Delivery for Unified Production Deployment
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db/database');

const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');

const app = express();
const PORT = process.env.PORT || 5000;

// Security and Parsing Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve Static Frontend Assets (HTML, CSS, JS, Images)
app.use(express.static(path.join(__dirname)));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    app: 'READORA',
    tagline: 'Where readers become creators.',
    timestamp: new Date().toISOString()
  });
});

// Explicit Route fallbacks for clean navigation
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'practise.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'account.html'));
});

// Fallback all other client-side routes to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Initialize Database and Start Server
initDB().then(() => {
  app.listen(PORT, () => {
    console.log('====================================================');
    console.log(`🔥 READORA Server is running live on port ${PORT}!`);
    console.log(`🌐 Local Access: http://localhost:${PORT}`);
    console.log(`📚 Ready for Production Deployment`);
    console.log('====================================================');
  });
}).catch(err => {
  console.error('Failed to start server:', err);
});
