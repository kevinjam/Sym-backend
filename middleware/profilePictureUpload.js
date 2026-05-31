const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  // iOS multipart uploads often omit a proper image/* type.
  'application/octet-stream',
]);

const allowedExtensions = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.heic',
  '.heif',
]);

const fileFilter = (_req, file, cb) => {
  const mime = (file.mimetype || '').toLowerCase();
  const ext = path.extname(file.originalname || '').toLowerCase();

  if (allowedMimeTypes.has(mime) || allowedExtensions.has(ext)) {
    cb(null, true);
    return;
  }

  cb(new Error('Only JPEG, PNG, WebP, or HEIC images are allowed'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 },
});

module.exports = {
  profilePictureUpload: upload.single('photo'),
};
