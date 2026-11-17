const jwt = require('jsonwebtoken');

const isProd = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || 'readora_super_secret_jwt_key_2026_creator_sanctuary';

if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'readora_super_secret_jwt_key_2026_creator_sanctuary')) {
  console.warn('⚠️ SECURITY WARNING: In production, JWT_SECRET should be set to a strong unique secret in environment variables.');
}

function authMiddleware(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

// Optional Auth (passes user if token exists, but doesn't block if guest)
function optionalAuthMiddleware(req, res, next) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      // Ignore token verification failure for optional auth
    }
  }
  next();
}

module.exports = { authMiddleware, optionalAuthMiddleware, JWT_SECRET };
