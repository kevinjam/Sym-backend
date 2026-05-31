const fs = require('fs').promises;
const path = require('path');

const { admin } = require('../config/firebase');
const { cloudinary, configureCloudinary, isCloudinaryConfigured } = require('../config/cloudinary');

/** @type {'cloudinary' | 'local' | null} */
let resolvedMode = null;

const CLOUDINARY_FOLDER = process.env.CLOUDINARY_PROFILE_FOLDER || 'sym-wellness/profile-pictures';

function getConfiguredMode() {
  const raw = (process.env.PROFILE_PICTURE_STORAGE || 'auto').toLowerCase();
  if (raw === 'local' || raw === 'cloudinary') return raw;
  return 'auto';
}

function publicIdFromCloudinaryUrl(storedUrl) {
  if (!storedUrl || typeof storedUrl !== 'string') return null;
  if (!storedUrl.includes('res.cloudinary.com')) return null;

  const match = storedUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?(?:\?.*)?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function objectPathFromStoredUrl(storedUrl) {
  if (!storedUrl || typeof storedUrl !== 'string') return null;

  const firebaseMatch = storedUrl.match(
    /firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?]+)/,
  );
  if (firebaseMatch) {
    return decodeURIComponent(firebaseMatch[1]);
  }

  const gcsMatch = storedUrl.match(/storage\.googleapis\.com\/[^/]+\/(.+)$/);
  if (gcsMatch) {
    return gcsMatch[1];
  }

  return null;
}

function bucketNameFromStoredUrl(storedUrl) {
  if (!storedUrl || typeof storedUrl !== 'string') return null;
  const match = storedUrl.match(/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\//);
  return match ? match[1] : null;
}

/**
 * Resolve once per process: Cloudinary (free tier) or local disk fallback.
 */
async function resolveStorageMode() {
  if (resolvedMode) return resolvedMode;

  const configured = getConfiguredMode();

  if (configured === 'local') {
    resolvedMode = 'local';
    console.log('[profile-picture] Storage mode: local');
    return resolvedMode;
  }

  if (configured === 'cloudinary' || configured === 'auto') {
    if (isCloudinaryConfigured()) {
      configureCloudinary();
      resolvedMode = 'cloudinary';
      console.log(
        `[profile-picture] Storage mode: cloudinary (${process.env.CLOUDINARY_CLOUD_NAME})`,
      );
      return resolvedMode;
    }

    if (configured === 'cloudinary') {
      throw new Error(
        'PROFILE_PICTURE_STORAGE=cloudinary but Cloudinary is not configured. '
        + 'Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env. '
        + 'Sign up free at https://cloudinary.com/',
      );
    }
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Cloudinary is not configured for production. Add CLOUDINARY_* env vars from '
      + 'https://cloudinary.com/console',
    );
  }

  resolvedMode = 'local';
  console.log(
    '[profile-picture] Storage mode: local (add Cloudinary credentials for free cloud storage)',
  );
  return resolvedMode;
}

function uploadBufferToCloudinary(userId, buffer) {
  const publicId = `${userId}/${Date.now()}`;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: CLOUDINARY_FOLDER,
        public_id: publicId,
        format: 'jpg',
        overwrite: true,
        resource_type: 'image',
        transformation: [
          { width: 512, height: 512, crop: 'fill', gravity: 'auto', quality: 'auto:good' },
        ],
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(result.secure_url);
      },
    );

    stream.end(buffer);
  });
}

async function uploadToCloudinary(userId, buffer) {
  const url = await uploadBufferToCloudinary(userId, buffer);
  console.log(`[profile-picture] Uploaded to Cloudinary for user ${userId}`);
  return url;
}

async function uploadToLocalDisk(userId, buffer) {
  const relativeDir = path.join('uploads', 'profile-pictures', userId);
  const absoluteDir = path.join(__dirname, '..', relativeDir);
  await fs.mkdir(absoluteDir, { recursive: true });

  const filename = `${Date.now()}.jpg`;
  await fs.writeFile(path.join(absoluteDir, filename), buffer);

  const publicPath = `/${relativeDir.replace(/\\/g, '/')}/${filename}`;
  console.log(`[profile-picture] Saved locally at ${publicPath}`);
  return publicPath;
}

async function uploadProfilePictureBuffer(userId, buffer) {
  const mode = await resolveStorageMode();
  if (mode === 'cloudinary') {
    return uploadToCloudinary(userId, buffer);
  }
  return uploadToLocalDisk(userId, buffer);
}

async function deleteStoredProfilePicture(storedUrl) {
  if (!storedUrl || typeof storedUrl !== 'string') return;

  if (storedUrl.startsWith('/uploads/profile-pictures/')) {
    try {
      const absolutePath = path.join(__dirname, '..', storedUrl.replace(/^\//, ''));
      await fs.unlink(absolutePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('Failed to delete local profile picture:', error.message);
      }
    }
    return;
  }

  const cloudinaryPublicId = publicIdFromCloudinaryUrl(storedUrl);
  if (cloudinaryPublicId && isCloudinaryConfigured()) {
    try {
      configureCloudinary();
      await cloudinary.uploader.destroy(cloudinaryPublicId, { resource_type: 'image' });
    } catch (error) {
      console.warn('Failed to delete Cloudinary profile picture:', error.message);
    }
    return;
  }

  const objectPath = objectPathFromStoredUrl(storedUrl);
  if (!objectPath || !admin.apps.length) return;

  const bucketName = bucketNameFromStoredUrl(storedUrl);
  if (!bucketName) return;

  try {
    const bucket = admin.storage().bucket(bucketName);
    await bucket.file(objectPath).delete({ ignoreNotFound: true });
  } catch (error) {
    console.warn('Failed to delete legacy Firebase profile picture:', error.message);
  }
}

module.exports = {
  uploadProfilePictureBuffer,
  deleteStoredProfilePicture,
  resolveStorageMode,
};
