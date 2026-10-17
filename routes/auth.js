const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dns = require('dns').promises;
const { db } = require('../db/database');
const { authMiddleware, JWT_SECRET } = require('../middleware/authMiddleware');
const { sendVerificationEmail } = require('../utils/mailer');

// Helper function to verify if an email has a real, active mail server (MX records)
async function isEmailDomainValid(email) {
  // 1. Strict RFC 5322 Syntax Regex
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(email)) return false;

  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const domain = parts[1].toLowerCase().trim();

  // 2. Reject obvious fake / placeholder domains
  const fakeDomains = ['test.com', 'example.com', 'fake.com', 'asdf.com', 'temp.com', 'sample.com', 'dummy.com', 'mailinator.com', 'tempmail.com', '10minutemail.com', 'guerrillamail.com'];
  if (fakeDomains.includes(domain)) return false;

  // 3. Known trusted mail services (instant pass)
  const trusted = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me', 'protonmail.com', 'zoho.com', 'aol.com', 'live.com', 'msn.com', 'rediffmail.com', 'yandex.com'];
  if (trusted.includes(domain)) return true;

  // 4. Live DNS MX (Mail Exchange) lookup for custom domains
  try {
    const mxRecords = await dns.resolveMx(domain);
    return mxRecords && mxRecords.length > 0;
  } catch (error) {
    return false; // Domain has no active mail servers / does not exist
  }
}

// 1. POST /api/auth/send-otp - Step 1: Check Real Email Validity, Duplicates & Send Code
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check Real Email & Active Mail Server Validity
    const isValid = await isEmailDomainValid(cleanEmail);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email! Please enter a real, valid email address (e.g. name@gmail.com, @yahoo.com, @outlook.com).'
      });
    }

    // Check if Email already exists in database
    const existingEmail = await db.getAsync(`SELECT id FROM users WHERE LOWER(email) = ?`, [cleanEmail]);
    if (existingEmail) {
      return res.status(400).json({ 
        success: false, 
        message: 'An account with this email already exists. Please log in instead.' 
      });
    }

    // Generate secure 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Clear previous OTPs for this email
    await db.runAsync(`DELETE FROM otps WHERE LOWER(email) = ?`, [cleanEmail]);

    // Save to database
    await db.runAsync(`
      INSERT INTO otps (id, email, otp_code, expires_at, verified)
      VALUES (?, ?, ?, ?, 0)
    `, ['otp_' + Date.now(), cleanEmail, otpCode, expiresAt]);

    // Dispatch verification email
    await sendVerificationEmail(cleanEmail, otpCode);

    res.json({
      success: true,
      message: `A 6-digit confirmation code has been sent to ${cleanEmail}. Please check your inbox!`
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to process request.' });
  }
});

// 2. GET /api/auth/check-username - Check if a username is available or taken
router.get('/check-username', async (req, res) => {
  try {
    const rawHandle = req.query.username || req.query.handle;
    if (!rawHandle || !rawHandle.trim()) {
      return res.status(400).json({ success: false, message: 'Username is required.' });
    }

    let cleanHandle = rawHandle.trim().toLowerCase();
    if (!cleanHandle.startsWith('@')) {
      cleanHandle = '@' + cleanHandle;
    }

    // Validate format (3 to 25 chars, alphanumeric + underscores)
    const validPattern = /^@[a-z0-9_.]{3,25}$/;
    if (!validPattern.test(cleanHandle)) {
      return res.json({
        success: true,
        available: false,
        message: 'Username must be 3-25 characters (letters, numbers, underscores).'
      });
    }

    const existingUser = await db.getAsync(`SELECT id FROM users WHERE LOWER(handle) = ?`, [cleanHandle]);

    if (existingUser) {
      return res.json({
        success: true,
        available: false,
        message: `Username "${cleanHandle}" is already taken. Please choose another username.`
      });
    }

    return res.json({
      success: true,
      available: true,
      cleanHandle,
      message: `Username "${cleanHandle}" is available!`
    });
  } catch (error) {
    console.error('Check username error:', error);
    res.status(500).json({ success: false, message: 'Error checking username availability.' });
  }
});

// 3. POST /api/auth/verify-otp - Step 2: Verify the 6-digit code
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and verification code are required.' });
    }

    const otpRecord = await db.getAsync(
      `SELECT * FROM otps WHERE LOWER(email) = ? AND otp_code = ? AND verified = 0`,
      [email.toLowerCase().trim(), otp.trim()]
    );

    if (!otpRecord) {
      return res.status(400).json({ success: false, message: 'Invalid verification code. Please check and try again.' });
    }

    if (Date.now() > otpRecord.expires_at) {
      return res.status(400).json({ success: false, message: 'Verification code has expired. Please request a new one.' });
    }

    // Mark verified
    await db.runAsync(`UPDATE otps SET verified = 1 WHERE id = ?`, [otpRecord.id]);

    const verificationToken = jwt.sign(
      { email: email.toLowerCase().trim(), isVerified: true },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({
      success: true,
      message: 'Email verified successfully! Please set your password.',
      verificationToken
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ success: false, message: 'Verification failed.' });
  }
});

// 3. POST /api/auth/complete-signup - Step 3: Set Password and Create Creator Account
router.post('/complete-signup', async (req, res) => {
  try {
    const { name, email, password, verificationToken, handle, bio } = req.body;

    if (!name || !email || !password || !verificationToken) {
      return res.status(400).json({ success: false, message: 'All fields and verification token are required.' });
    }

    // Verify token
    try {
      const decoded = jwt.verify(verificationToken, JWT_SECRET);
      if (decoded.email !== email.toLowerCase().trim() || !decoded.isVerified) {
        return res.status(400).json({ success: false, message: 'Invalid verification session. Please verify email again.' });
      }
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Verification session expired. Please restart signup.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    let cleanHandle = handle ? (handle.startsWith('@') ? handle.toLowerCase().trim() : '@' + handle.toLowerCase().trim()) : '@' + name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    
    // Check if handle is already taken
    const existingHandle = await db.getAsync(`SELECT id FROM users WHERE LOWER(handle) = ?`, [cleanHandle]);
    if (existingHandle) {
      return res.status(400).json({ success: false, message: `Username "${cleanHandle}" is already taken. Please choose another username.` });
    }

    const userId = 'usr_' + Date.now();
    const avatar = name.substring(0, 2).toUpperCase();
    const passwordHash = await bcrypt.hash(password, 10);

    await db.runAsync(`
      INSERT INTO users (id, name, email, handle, password_hash, avatar, bio)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [userId, name, email.toLowerCase().trim(), cleanHandle, passwordHash, avatar, bio || 'Reader and creator on Readora.']);

    // Clear used OTPs
    await db.runAsync(`DELETE FROM otps WHERE LOWER(email) = ?`, [email.toLowerCase().trim()]);

    const token = jwt.sign(
      { id: userId, name, email: email.toLowerCase().trim(), handle: cleanHandle, avatar },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully with verified email!',
      token,
      user: {
        id: userId,
        name,
        email: email.toLowerCase().trim(),
        handle: cleanHandle,
        avatar,
        bio: bio || 'Reader and creator on Readora.'
      }
    });
  } catch (error) {
    console.error('Complete signup error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete registration.' });
  }
});

// Legacy POST /api/auth/signup - Direct Signup with built-in auto-safety
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, handle, bio } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }

    // Check if email or handle already exists
    const existingUser = await db.getAsync(
      `SELECT * FROM users WHERE email = ? OR handle = ?`, 
      [email.toLowerCase(), handle ? handle.toLowerCase() : '']
    );

    if (existingUser) {
      return res.status(400).json({ success: false, message: 'An account with this email or handle already exists.' });
    }

    const userId = 'usr_' + Date.now();
    const cleanHandle = handle ? (handle.startsWith('@') ? handle : '@' + handle) : '@' + name.toLowerCase().replace(/\s+/g, '_');
    const avatar = name.substring(0, 2).toUpperCase();
    const passwordHash = await bcrypt.hash(password, 10);

    await db.runAsync(`
      INSERT INTO users (id, name, email, handle, password_hash, avatar, bio)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [userId, name, email.toLowerCase(), cleanHandle, passwordHash, avatar, bio || 'Reader and creator on Readora.']);

    const token = jwt.sign(
      { id: userId, name, email: email.toLowerCase(), handle: cleanHandle, avatar },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: {
        id: userId,
        name,
        email: email.toLowerCase(),
        handle: cleanHandle,
        avatar,
        bio: bio || 'Reader and creator on Readora.'
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ success: false, message: 'Internal server error during registration.' });
  }
});

// POST /api/auth/login - User Login
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body; // identifier can be email or username

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Identifier and password are required.' });
    }

    const cleanId = identifier.trim().toLowerCase();
    const handleWithAt = cleanId.startsWith('@') ? cleanId : '@' + cleanId;
    const handleWithoutAt = cleanId.startsWith('@') ? cleanId.substring(1) : cleanId;

    const user = await db.getAsync(
      `SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(handle) = ? OR LOWER(handle) = ? OR LOWER(name) = ?`,
      [cleanId, handleWithAt, handleWithoutAt, cleanId]
    );

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials. User not found.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials. Incorrect password.' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, handle: user.handle, avatar: user.avatar },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      message: 'Welcome back to Readora!',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        handle: user.handle,
        avatar: user.avatar,
        bio: user.bio
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Internal server error during login.' });
  }
});

// GET /api/auth/me - Verify and fetch logged-in user profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.getAsync(`SELECT id, name, email, handle, avatar, bio, created_at FROM users WHERE id = ?`, [req.user.id]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Get user stats from SQLite database
    const thoughtsCount = await db.getAsync(`SELECT COUNT(*) as count FROM posts WHERE author_id = ? AND type = 'thought'`, [user.id]);
    const articlesCount = await db.getAsync(`SELECT COUNT(*) as count FROM posts WHERE author_id = ? AND type = 'article'`, [user.id]);
    const followersCount = await db.getAsync(`SELECT COUNT(*) as count FROM follows WHERE following_id = ?`, [user.id]);
    const followingCount = await db.getAsync(`SELECT COUNT(*) as count FROM follows WHERE follower_id = ?`, [user.id]);

    res.json({
      success: true,
      user: {
        ...user,
        stats: {
          thoughts: thoughtsCount ? thoughtsCount.count : 0,
          articles: articlesCount ? articlesCount.count : 0,
          followers: followersCount ? followersCount.count : 0,
          following: followingCount ? followingCount.count : 0
        }
      }
    });
  } catch (error) {
    console.error('Fetch me error:', error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  }
});

// PUT /api/auth/profile - Update user profile (name, bio, avatar)
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, bio, avatar } = req.body;
    const userId = req.user.id;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name cannot be empty.' });
    }

    const cleanAvatar = avatar || name.trim().substring(0, 2).toUpperCase();

    await db.runAsync(
      `UPDATE users SET name = ?, bio = ?, avatar = ? WHERE id = ?`,
      [name.trim(), bio ? bio.trim() : '', cleanAvatar, userId]
    );

    const updatedUser = await db.getAsync(
      `SELECT id, name, email, handle, avatar, bio, created_at FROM users WHERE id = ?`,
      [userId]
    );

    res.json({
      success: true,
      message: 'Profile updated successfully!',
      user: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
});

module.exports = router;
