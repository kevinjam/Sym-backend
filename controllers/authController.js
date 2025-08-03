const jwt = require('jsonwebtoken');
const User = require('../models/User');

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

      await user.save();

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.status(201).json({
        message: 'User registered successfully',
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          fullName: user.fullName
        }
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

      // Generate JWT token
      const token = jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          fullName: user.fullName
        }
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
      res.json({ user });
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
        user
      });
    } catch (error) {
      console.error('Profile update error:', error);
      res.status(500).json({ error: 'Failed to update profile' });
    }
  }

  // Refresh JWT token
  static async refreshToken(req, res) {
    try {
      // Generate new token
      const token = jwt.sign(
        { userId: req.user._id, role: req.user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      res.json({
        message: 'Token refreshed successfully',
        token
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
}

module.exports = AuthController; 