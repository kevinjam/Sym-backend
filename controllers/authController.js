const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { OAuth2Client } = require('google-auth-library');
const { admin } = require('../config/firebase');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const AccountDeletionRequest = require('../models/AccountDeletionRequest');
const { formatAuthUser } = require('../utils/formatAuthUser');
const { issueTokenPair } = require('../utils/tokenService');
const {
  uploadProfilePictureBuffer,
  deleteStoredProfilePicture,
} = require('../services/profilePictureStorageService');
const googleOAuthClient = new OAuth2Client();
const isPrivateRelayEmail = (email) =>
  typeof email === 'string' &&
  email.toLowerCase().trim().endsWith('@privaterelay.appleid.com');

function googleAudiencesFromEnv() {
  const raw = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.IOS_GOOGLE_CLIENT_ID,
  ]
    .filter(Boolean)
    .join(',');

  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function verifySocialIdToken(idToken) {
  const normalized = String(idToken || '').trim().replace(/^Bearer\s+/i, '');
  if (!normalized) {
    const err = new Error('ID token is required');
    err.code = 'auth/argument-error';
    throw err;
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(normalized);
    const provider = decodedToken.firebase?.sign_in_provider === 'apple.com' ? 'apple' : 'google';
    return { decodedToken, provider };
  } catch (firebaseError) {
    const canFallbackToGoogle =
      firebaseError?.code === 'auth/argument-error' ||
      firebaseError?.code === 'auth/invalid-id-token' ||
      String(firebaseError?.message || '').includes('Decoding Firebase ID token failed');

    if (!canFallbackToGoogle) {
      throw firebaseError;
    }

    const audiences = googleAudiencesFromEnv();
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken: normalized,
      audience: audiences.length > 0 ? audiences : undefined,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      throw firebaseError;
    }

    return {
      provider: 'google',
      decodedToken: {
        uid: payload.sub,
        sub: payload.sub,
        email: payload.email,
        email_verified: payload.email_verified,
        name: payload.name,
        picture: payload.picture,
        given_name: payload.given_name,
        family_name: payload.family_name,
        firebase: { sign_in_provider: 'google.com' },
      },
    };
  }
}

class AuthController {
  // Register a new user
  static async register(req, res) {
    try {
      const { email, password, firstName, lastName, role, ...otherFields } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      // Create user
      const user = new User({
        email,
        password,
        firstName,
        lastName,
        role,
        ...otherFields
      });

      // Public signup can never grant privileged flags, whatever the body says.
      user.isSuperAdmin = false;
      user.isActive = true;

      await user.save();

      const token = await issueTokenPair({
        userId: String(user._id),
        role: user.role,
        email: user.email,
      });

      res.status(201).json({
        message: 'User registered successfully',
        token,
        user: formatAuthUser(user),
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }

  // Login user
  static async login(req, res) {
    try {
      const { email, password } = req.body;

      // Find user
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check if user is active
      if (!user.isActive) {
        return res.status(401).json({ error: 'Account is deactivated' });
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      const token = await issueTokenPair({
        userId: String(user._id),
        role: user.role,
        email: user.email,
      });

      res.json({
        message: 'Login successful',
        token,
        user: formatAuthUser(user),
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }

  // Get user profile
  static async getProfile(req, res) {
    try {
      const user = await User.findById(req.user._id).select('-password');
      res.json({ user: formatAuthUser(user) });
    } catch (error) {
      console.error('Profile error:', error);
      res.status(500).json({ error: 'Failed to get profile' });
    }
  }

  // Update user profile
  static async updateProfile(req, res) {
    try {
      const { firstName, lastName, phoneNumber, fcmToken, ...otherFields } = req.body;
      
      // Only allow updating certain fields
      const updateData = {};
      if (firstName) updateData.firstName = firstName;
      if (lastName) updateData.lastName = lastName;
      if (phoneNumber) updateData.phoneNumber = phoneNumber;
      if (fcmToken) updateData.fcmToken = fcmToken;

      const user = await User.findByIdAndUpdate(
        req.user._id,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');

      res.json({
        message: 'Profile updated successfully',
        user: formatAuthUser(user),
      });
    } catch (error) {
      console.error('Profile update error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  }

  // Upload profile picture (multipart field: photo) → Cloudinary (free tier) or local disk in dev
  static async uploadProfilePicture(req, res) {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'Photo is required' });
      }

      const userId = String(req.user._id);

      const processedBuffer = await sharp(req.file.buffer)
        .rotate()
        .resize(512, 512, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();

      const publicUrl = await uploadProfilePictureBuffer(userId, processedBuffer);

      const existing = await User.findById(userId).select('profilePicture');
      const oldUrl = existing?.profilePicture;

      if (oldUrl) {
        await deleteStoredProfilePicture(oldUrl);
        // Legacy: remove disk file if an older build stored locally
        if (oldUrl.startsWith('/uploads/profile-pictures/')) {
          const oldFile = path.join(__dirname, '..', oldUrl);
          fs.promises.unlink(oldFile).catch(() => {});
        }
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { profilePicture: publicUrl },
        { new: true, runValidators: true }
      ).select('-password');

      res.json({
        message: 'Profile picture updated successfully',
        profilePicture: publicUrl,
        user: formatAuthUser(user),
      });
      console.log(`[profile-picture] Saved for user ${userId}: ${publicUrl}`);
    } catch (error) {
      console.error('Profile picture upload error:', error);
      res.status(500).json({
        error: 'Failed to upload profile picture',
        details: error.message || 'Unknown error',
      });
    }
  }

  // Refresh JWT token
  static async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token is required' });
      }

      // Verify the refresh token
      let decoded;
      try {
        decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
      } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired refresh token' });
      }

      // Find the user
      const user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      const token = await issueTokenPair({
        userId: String(user._id),
        role: user.role,
        email: user.email,
      });

      res.json({
        message: 'Token refreshed successfully',
        token,
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({ error: 'Failed to refresh token' });
    }
  }

  // Update FCM token
  static async updateFcmToken(req, res) {
    try {
      const { fcmToken } = req.body;
      
      if (!fcmToken) {
        return res.status(400).json({ error: 'FCM token is required' });
      }
      
      const user = await User.findByIdAndUpdate(
        req.user._id,
        { fcmToken },
        { new: true }
      ).select('-password');
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({ 
        message: 'FCM token updated successfully',
        fcmToken: user.fcmToken
      });
    } catch (error) {
      console.error('FCM token update error:', error);
      res.status(500).json({ error: 'Failed to update FCM token' });
    }
  }

  // Remove FCM token (for logout)
  static async removeFcmToken(req, res) {
    try {
      const user = await User.findByIdAndUpdate(
        req.user._id,
        { fcmToken: null },
        { new: true }
      ).select('-password');
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({ 
        message: 'FCM token removed successfully'
      });
    } catch (error) {
      console.error('FCM token removal error:', error);
      res.status(500).json({ error: 'Failed to remove FCM token' });
    }
  }

  // Request permanent account deletion. We keep a request row so support can
  // complete deletion and contact the user if follow-up is needed.
  static async requestAccountDeletion(req, res) {
    try {
      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const existingRequest = await AccountDeletionRequest.findOne({
        userId: user._id,
        status: { $in: ['pending', 'processing'] },
      });

      if (!existingRequest) {
        await AccountDeletionRequest.create({
          userId: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          requestSource: 'mobile_app',
          userAgent: req.get('user-agent'),
          ipAddress: req.ip,
        });
      }

      user.isActive = false;
      user.fcmToken = undefined;
      await user.save();

      await RefreshToken.updateMany(
        { userId: String(user._id), revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );

      return res.status(202).json({
        success: true,
        message:
          'Your account deletion request has been submitted. Our team will get back to you by email.',
      });
    } catch (error) {
      console.error('Account deletion request error:', error);
      if (error && error.code === 11000) {
        return res.status(202).json({
          success: true,
          message:
            'Your account deletion request is already submitted. Our team will get back to you by email.',
        });
      }
      return res.status(500).json({
        error: 'Failed to submit account deletion request',
      });
    }
  }

  // Google authentication (also handles Apple)
  static async googleAuth(req, res) {
    let provider = 'google'; // Default, will be determined from token
    try {
      const { idToken, role } = req.body;

      if (!idToken) {
        return res.status(400).json({ error: 'ID token is required' });
      }

      if (!role || !['patient', 'doctor'].includes(role)) {
        return res.status(400).json({
          error: 'Valid role is required: "patient" (app user) or "doctor".',
        });
      }

      // Verify token with Firebase first; if token is a pure Google ID token,
      // fallback verification via google-auth-library.
      const verification = await verifySocialIdToken(idToken);
      const decodedToken = verification.decodedToken;
      provider = verification.provider;
      
      // Apple may not always provide email_verified, so only check for Google
      if (provider === 'google' && !decodedToken.email_verified) {
        return res.status(400).json({ error: 'Google account email must be verified' });
      }

      // Safely extract fields from decoded token with defaults
      const email = decodedToken.email || null;
      const name = decodedToken.name || decodedToken.displayName || null;
      const picture = decodedToken.picture || decodedToken.photoURL || null;
      const providerId = decodedToken.sub || decodedToken.uid || null;
      const appleUserId = provider === 'apple' ? providerId : null;
      // Optional first/last name from client (only available first Apple sign-in)
      const bodyFirstName = req.body.firstName;
      const bodyLastName = req.body.lastName;
      const manualEmailRaw = req.body.manualEmail;
      const manualEmail =
        typeof manualEmailRaw === 'string' && manualEmailRaw.trim().length > 0
          ? manualEmailRaw.trim().toLowerCase()
          : null;
      const normalizedFirstName =
        typeof bodyFirstName === 'string' && bodyFirstName.trim().length > 0
          ? bodyFirstName.trim()
          : null;
      const normalizedLastName =
        typeof bodyLastName === 'string' && bodyLastName.trim().length > 0
          ? bodyLastName.trim()
          : null;
      const relayEmailFromApple = isPrivateRelayEmail(email) ? String(email).toLowerCase().trim() : null;
      const normalizedEmail = email ? String(email).toLowerCase().trim() : null;
      // Accept Apple relay and real emails from the verified token — never require manual entry.
      const resolvedEmail =
        provider === 'apple'
          ? (manualEmail || normalizedEmail || null)
          : normalizedEmail;

      // Returning Apple users may have no email in the token; resolve by appleUserId below.
      if (provider === 'apple' && !resolvedEmail && appleUserId) {
        const existingAppleUser = await User.findOne({
          $or: [
            { appleUserId },
            { providerId: providerId, provider: 'apple' },
          ],
        });
        if (existingAppleUser) {
          existingAppleUser.lastLogin = new Date();
          existingAppleUser.appleUserId = appleUserId;
          if (normalizedFirstName && (!existingAppleUser.firstName || existingAppleUser.firstName === 'User')) {
            existingAppleUser.firstName = normalizedFirstName;
          }
          if (normalizedLastName && (!existingAppleUser.lastName || existingAppleUser.lastName === 'User')) {
            existingAppleUser.lastName = normalizedLastName;
          }
          if (relayEmailFromApple) {
            existingAppleUser.appleRelayEmail = relayEmailFromApple;
          }
          await existingAppleUser.save();

          const token = await issueTokenPair({
            userId: String(existingAppleUser._id),
            role: existingAppleUser.role,
            email: existingAppleUser.email,
          });

          return res.json({
            message: 'Apple login successful',
            token: { ...token, isNewUser: false },
            user: formatAuthUser(existingAppleUser),
          });
        }
      }
      
      // Log decoded token for debugging
      console.log('Decoded token:', {
        email,
        name,
        picture,
        providerId,
        provider,
        hasName: !!name,
        nameType: typeof name,
        allKeys: Object.keys(decodedToken)
      });
      
      // For Apple, email might be null on subsequent sign-ins, use providerId as fallback
      if (!email && provider === 'apple') {
        // Apple user without email - use providerId to find user
        const appleUser = await User.findOne({ 
          $or: [
            { appleUserId },
            { providerId: providerId, provider: 'apple' },
          ],
        });
        
        if (appleUser) {
          // Existing Apple user without email
          appleUser.lastLogin = new Date();
          appleUser.appleUserId = appleUserId;
          if (normalizedFirstName && (!appleUser.firstName || appleUser.firstName === 'User')) {
            appleUser.firstName = normalizedFirstName;
          }
          if (normalizedLastName && (!appleUser.lastName || appleUser.lastName === 'User')) {
            appleUser.lastName = normalizedLastName;
          }
          if (resolvedEmail && (!appleUser.email || appleUser.isPrivateRelay)) {
            appleUser.email = resolvedEmail;
            appleUser.isPrivateRelay = false;
          }
          if (relayEmailFromApple) {
            appleUser.appleRelayEmail = relayEmailFromApple;
            if (!resolvedEmail) appleUser.isPrivateRelay = true;
          }
          await appleUser.save();
          
          const token = await issueTokenPair({
            userId: String(appleUser._id),
            role: appleUser.role,
            email: appleUser.email,
          });

          return res.json({
            message: 'Apple login successful',
            token: {
              ...token,
              isNewUser: false,
            },
            user: formatAuthUser(appleUser),
          });
        } else {
          // New Apple user without email - this is OK now, we'll create them below
          // Continue to the user creation logic below
          console.log('New Apple user without email - will create user with providerId only');
        }
      }
      
      // Check if user already exists
      // For Apple users without email, only check by providerId
      // For others, check by email or providerId+provider
      let user;
      if (!email && provider === 'apple') {
        // Apple user without email - only check by providerId
        user = await User.findOne({ 
          $or: [
            { appleUserId },
            { providerId: providerId, provider: provider },
          ],
        });
      } else {
        // User with email or non-Apple provider - check by email or providerId
        const lookups = [
          resolvedEmail ? { email: resolvedEmail } : null,
          { providerId: providerId, provider: provider },
        ];
        if (provider === 'apple' && appleUserId) {
          lookups.push({ appleUserId });
        }
        user = await User.findOne({
          $or: lookups.filter(Boolean),
        });
      }

      if (user) {
        // User exists, update last login and return user data
        user.lastLogin = new Date();
        user.provider = provider;
        user.providerId = providerId;
        if (provider === 'apple') {
          user.appleUserId = appleUserId;
        }
        user.emailVerified = provider === 'google' ? true : (user.emailVerified || false);
        // Apple only provides full name on first consent; persist client-provided names
        // when profile still has placeholders.
        if (normalizedFirstName && (!user.firstName || user.firstName === 'User')) {
          user.firstName = normalizedFirstName;
        }
        if (normalizedLastName && (!user.lastName || user.lastName === 'User')) {
          user.lastName = normalizedLastName;
        }
        if (resolvedEmail && (!user.email || user.isPrivateRelay)) {
          user.email = resolvedEmail;
          user.isPrivateRelay = false;
        }
        if (relayEmailFromApple) {
          user.appleRelayEmail = relayEmailFromApple;
          if (!resolvedEmail) user.isPrivateRelay = true;
        }
        
        // Update profile picture if not set
        if (!user.profilePicture && picture) {
          user.profilePicture = picture;
        }
        
        await user.save();

        const token = await issueTokenPair({
          userId: String(user._id),
          role: user.role,
          email: user.email,
        });

        return res.json({
          message: `${provider === 'apple' ? 'Apple' : 'Google'} login successful`,
          token: {
            ...token,
            isNewUser: false,
          },
          user: formatAuthUser(user),
        });
      }

      // Create new user from provider data
      // Safely handle name parsing - Apple may not provide name on subsequent sign-ins
      // Also honor first/last name provided by the client on first sign-in
      let firstName = 'User';
      let lastName = 'User';
      
      try {
        if (bodyFirstName || bodyLastName) {
          firstName = (bodyFirstName && bodyFirstName.trim()) || 'User';
          lastName = (bodyLastName && bodyLastName.trim()) || 'User';
        } else if (name && typeof name === 'string' && name.trim().length > 0) {
          const nameParts = name.trim().split(/\s+/);
          firstName = nameParts[0] || 'User';
          lastName = nameParts.slice(1).join(' ') || 'User';
        } else if (decodedToken.given_name || decodedToken.family_name) {
          // For Apple, check if name is in separate fields (given_name, family_name)
          firstName = (decodedToken.given_name && decodedToken.given_name.trim()) || 'User';
          lastName = (decodedToken.family_name && decodedToken.family_name.trim()) || 'User';
        }
        // If no name is available, defaults remain ('User', 'User')
      } catch (nameError) {
        console.error('Error parsing name:', nameError);
        // Defaults already set to avoid validation errors
        firstName = 'User';
        lastName = 'User';
      }

      // For Apple users, email might be null - that's OK now that schema allows it
      // But we should still try to use providerId as a fallback identifier
      if (!email && provider === 'apple') {
        console.log('Apple user without email - using providerId as identifier');
      }

      // Fallback email for Apple users if none is provided (helps avoid validation issues)
      const effectiveEmail = resolvedEmail || relayEmailFromApple;

      user = new User({
        email: effectiveEmail,
        firstName: firstName || 'User',
        lastName: lastName || 'User',
        role,
        provider: provider,
        providerId,
        appleUserId: provider === 'apple' ? appleUserId : undefined,
        appleRelayEmail: relayEmailFromApple || undefined,
        isPrivateRelay: provider === 'apple' ? Boolean(relayEmailFromApple) : false,
        emailVerified: provider === 'google' ? true : (effectiveEmail ? true : false),
        profilePicture: picture || undefined,
        isActive: true
      });

      await user.save();

      const token = await issueTokenPair({
        userId: String(user._id),
        role: user.role,
        email: user.email,
      });

      res.status(201).json({
        message: `${provider === 'apple' ? 'Apple' : 'Google'} signup successful`,
        token: {
          ...token,
          isNewUser: true,
        },
        user: formatAuthUser(user),
      });

    } catch (error) {
      console.error('Firebase authentication error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      
      // Handle specific Firebase errors
      if (error.code === 'auth/id-token-expired') {
        return res.status(401).json({ error: 'Token expired. Please try again.' });
      }
      
      if (error.code === 'auth/invalid-id-token') {
        return res.status(401).json({ error: 'Invalid token. Please try again.' });
      }
      
      if (error.code === 'auth/argument-error') {
        return res.status(400).json({ 
          error: 'Invalid token format',
          details: 'The provided token is not a valid Firebase ID token'
        });
      }
      
      // Handle Mongoose validation errors
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({ 
          error: 'Validation error',
          details: validationErrors.join(', ')
        });
      }
      
      // Handle duplicate key errors (e.g., duplicate email)
      if (error.code === 11000) {
        return res.status(400).json({ 
          error: 'User already exists',
          details: 'An account with this email or provider ID already exists'
        });
      }
      
      const providerName = provider === 'apple' ? 'Apple' : 'Google';
      res.status(500).json({ 
        error: `${providerName} authentication failed`,
        details: error.message || 'An unexpected error occurred',
        code: error.code || 'UNKNOWN_ERROR'
      });
    }
  }

  // Verify Google token
  static async verifyGoogleToken(req, res) {
    try {
      const { idToken } = req.body;

      if (!idToken) {
        return res.status(400).json({ error: 'Google ID token is required' });
      }

      // Verify the Google ID token
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      
      res.json({
        message: 'Token verified successfully',
        user: {
          email: decodedToken.email,
          emailVerified: decodedToken.email_verified,
          name: decodedToken.name,
          picture: decodedToken.picture
        }
      });

    } catch (error) {
      console.error('Google token verification error:', error);
      
      if (error.code === 'auth/id-token-expired') {
        return res.status(401).json({ error: 'Google token expired' });
      }
      
      if (error.code === 'auth/invalid-id-token') {
        return res.status(401).json({ error: 'Invalid Google token' });
      }
      
      res.status(500).json({ error: 'Token verification failed' });
    }
  }

  // Test endpoint to check Firebase Admin SDK configuration
  static async testFirebaseConfig(req, res) {
    try {
      console.log('Testing Firebase Admin SDK configuration...');
      
      // Check if Firebase Admin SDK is initialized
      if (!admin.apps.length) {
        return res.status(500).json({ 
          error: 'Firebase Admin SDK not initialized',
          details: 'Check FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL environment variables'
        });
      }

      // Try to list users (this will fail if not properly configured)
      const listUsersResult = await admin.auth().listUsers(1);
      
      res.json({
        message: 'Firebase Admin SDK is properly configured',
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
        userCount: listUsersResult.users.length
      });

    } catch (error) {
      console.error('Firebase configuration test error:', error);
      
      res.status(500).json({ 
        error: 'Firebase Admin SDK configuration error',
        details: error.message,
        code: error.code
      });
    }
  }

  // Test endpoint to verify a Firebase ID token
  static async testFirebaseToken(req, res) {
    try {
      const { idToken } = req.body;

      if (!idToken) {
        return res.status(400).json({ error: 'Firebase ID token is required' });
      }

      console.log('Testing Firebase ID token verification...');
      console.log('Token (first 50 chars):', idToken.substring(0, 50) + '...');

      // Verify the Firebase ID token
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      
      res.json({
        message: 'Firebase ID token is valid',
        decoded: {
          uid: decodedToken.uid,
          email: decodedToken.email,
          emailVerified: decodedToken.email_verified,
          name: decodedToken.name,
          picture: decodedToken.picture,
          iss: decodedToken.iss,
          aud: decodedToken.aud,
          exp: decodedToken.exp,
          iat: decodedToken.iat
        }
      });

    } catch (error) {
      console.error('Firebase token verification error:', error);
      
      res.status(400).json({ 
        error: 'Firebase ID token verification failed',
        details: error.message,
        code: error.code
      });
    }
  }
}

module.exports = AuthController; 