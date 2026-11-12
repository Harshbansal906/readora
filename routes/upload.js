/**
 * READORA - Image Upload Engine
 * Supports:
 * 1. Cloudinary Permanent Cloud Storage (Render / Cloud Production)
 * 2. Secure buffer processing via Multer memory storage (never writes to ephemeral disk)
 * 3. Strict MIME type & size verification (max 5MB)
 * 4. Development fallback to base64 data URI when Cloudinary credentials are not yet configured
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { authMiddleware } = require('../middleware/authMiddleware');

// Configure Cloudinary from environment variables
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME.trim(),
    api_key: process.env.CLOUDINARY_API_KEY.trim(),
    api_secret: process.env.CLOUDINARY_API_SECRET.trim(),
    secure: true
  });
}

// Memory storage keeps file buffers in RAM, avoiding Render's ephemeral filesystem
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB maximum
  },
  fileFilter: (req, file, cb) => {
    const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedMime.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WEBP, and GIF images are permitted.'));
    }
  }
});

// POST /api/upload/image - Upload single image
router.post('/image', authMiddleware, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'Image exceeds maximum size limit of 5MB.' });
      }
      return res.status(400).json({ success: false, message: err.message || 'Error processing image.' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file was provided.' });
    }

    const hasCloudinary = !!(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    );

    if (hasCloudinary) {
      try {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'readora_uploads',
            resource_type: 'image'
          },
          (cloudErr, result) => {
            if (cloudErr || !result) {
              console.error('Cloudinary upload error:', cloudErr);
              return res.status(500).json({ success: false, message: 'Failed to upload image to permanent cloud storage.' });
            }

            return res.json({
              success: true,
              message: 'Image uploaded successfully to Cloudinary.',
              url: result.secure_url,
              publicId: result.public_id,
              provider: 'cloudinary'
            });
          }
        );

        uploadStream.end(req.file.buffer);
      } catch (streamErr) {
        console.error('Cloudinary stream error:', streamErr);
        return res.status(500).json({ success: false, message: 'Upload stream failed.' });
      }
    } else {
      // Local development fallback: encode to base64 Data URI
      const base64 = req.file.buffer.toString('base64');
      const dataUri = `data:${req.file.mimetype};base64,${base64}`;

      return res.json({
        success: true,
        message: 'Image processed successfully (Local Dev Mode). Configure Cloudinary for cloud production.',
        url: dataUri,
        provider: 'local_dev'
      });
    }
  });
});

module.exports = router;

