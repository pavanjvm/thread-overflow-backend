import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import validator from 'validator';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import mongoose from 'mongoose';
import { User } from '../models/index.js';

class AuthService {
  /**
   * Validates user input for signup
   */
  validateSignupInput(name, email, password) {
    const errors = [];

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      errors.push('Name must be at least 2 characters long');
    }

    if (!email || !validator.isEmail(email)) {
      errors.push('Please provide a valid email address');
    }

    if (!password || password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (password && !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      errors.push('Password must contain at least one uppercase letter, one lowercase letter, and one number');
    }

    return errors;
  }

  /**
   * Validates user input for login
   */
  validateLoginInput(email, password) {
    const errors = [];

    if (!email || !validator.isEmail(email)) {
      errors.push('Please provide a valid email address');
    }

    if (!password || typeof password !== 'string') {
      errors.push('Password is required');
    }

    return errors;
  }

  /**
   * Validates password reset input
   */
  validatePasswordResetInput(token, newPassword) {
    const errors = [];

    if (!token || typeof token !== 'string' || token.length < 32) {
      errors.push('Invalid reset token');
    }

    if (!newPassword || newPassword.length < 8) {
      errors.push('New password must be at least 8 characters long');
    }

    if (newPassword && !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      errors.push('New password must contain at least one uppercase letter, one lowercase letter, and one number');
    }

    return errors;
  }

  /**
   * Checks if a user exists by email
   */
  async findUserByEmail(email) {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      return await User.findOne({ email: normalizedEmail }).exec();
    } catch (error) {
      console.error('Database error in findUserByEmail:', error);
      throw new Error('Database operation failed');
    }
  }

  /**
   * Finds user by reset token
   */
  async findUserByResetToken(token) {
    try {
      return await User.findOne({
        resetToken: token,
        resetTokenExpiry: { $gt: new Date() }
      }).exec();
    } catch (error) {
      console.error('Database error in findUserByResetToken:', error);
      throw new Error('Database operation failed');
    }
  }

  /**
   * Generates a secure reset token
   */
  generateResetToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Creates a new user
   */
  async createUser(userData) {
    const { name, email, password } = userData;
    
    try {
      // Normalize email
      const normalizedEmail = email.toLowerCase().trim();
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Create user
      const newUser = new User({
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
      });

      const savedUser = await newUser.save();

      // Return user without password
      const userObject = savedUser.toObject();
      const { password: _, resetToken, resetTokenExpiry, ...userWithoutSensitiveData } = userObject;

      return userWithoutSensitiveData;
    } catch (error) {
      console.error('Database error in createUser:', error);
      
      // Handle MongoDB duplicate key error
      if (error.code === 11000 && error.keyPattern?.email) {
        throw new Error('User with this email already exists');
      }
      
      // Handle Mongoose validation errors
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        throw new Error(messages.join(', '));
      }
      
      throw new Error('Failed to create user');
    }
  }

  /**
   * Updates user's reset token and expiry
   */
  async updateUserResetToken(userId, resetToken, resetTokenExpiry) {
    try {
      await User.findByIdAndUpdate(
        userId,
        {
          resetToken,
          resetTokenExpiry
        },
        { new: true }
      ).exec();
    } catch (error) {
      console.error('Database error in updateUserResetToken:', error);
      throw new Error('Failed to update reset token');
    }
  }

  /**
   * Updates user's password and clears reset token
   */
  async updateUserPassword(userId, newPassword) {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      
      await User.findByIdAndUpdate(
        userId,
        {
          password: hashedPassword,
          resetToken: null,
          resetTokenExpiry: null
        },
        { new: true }
      ).exec();
    } catch (error) {
      console.error('Database error in updateUserPassword:', error);
      throw new Error('Failed to update password');
    }
  }

  /**
   * Verifies user password
   */
  async verifyPassword(plainPassword, hashedPassword) {
    try {
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      console.error('Password verification error:', error);
      throw new Error('Password verification failed');
    }
  }

  /**
   * Generates JWT token
   */
  generateToken(user) {
    try {
      if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET environment variable is not set');
      }

      const payload = {
        userId: user.id || user._id,
        role: user.role || 'user',
        email: user.email
      };

      return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: '24h',
        issuer: 'your-app-name',
        audience: 'your-app-users'
      });
    } catch (error) {
      console.error('Token generation error:', error);
      throw new Error('Failed to generate authentication token');
    }
  }

  /**
   * Sends password reset email
   */
  async sendPasswordResetEmail(email, resetToken) {
    try {
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

      // Create the transporter
      const transporter = nodemailer.createTransporter({
        host: process.env.EMAIL_HOST,           // e.g., smtp.gmail.com or smtp.sendgrid.net
        port: process.env.EMAIL_PORT,           // 465 (SSL) or 587 (TLS)
        secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for 587
        auth: {
          user: process.env.EMAIL_USER,         // Your email username
          pass: process.env.EMAIL_PASS          // Your email password or app password
        }
      });

      // Email content
      const mailOptions = {
        from: process.env.FROM_EMAIL || '"Your App" <no-reply@yourapp.com>',
        to: email,
        subject: 'Password Reset Request',
        html: `
          <h2>Password Reset Request</h2>
          <p>You requested a password reset. Click the link below to reset your password:</p>
          <a href="${resetUrl}" target="_blank" style="color: blue;">Reset Password</a>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
        `
      };

      // Send the email
      await transporter.sendMail(mailOptions);

      console.log(`Password reset email sent to: ${email}`);
      return true;
    } catch (error) {
      console.error('Email sending error:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  /**
   * Handles user signup
   */
  async signup(userData) {
    const { name, email, password } = userData;

    // Validate input
    const validationErrors = this.validateSignupInput(name, email, password);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join(', '));
    }

    // Check if user already exists
    const existingUser = await this.findUserByEmail(email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Create new user
    const newUser = await this.createUser({ name, email, password });
    
    // Generate token
    const token = this.generateToken(newUser);

    return {
      user: newUser,
      token
    };
  }

  /**
   * Handles user login
   */
  async login(credentials) {
    const { email, password } = credentials;

    // Validate input
    const validationErrors = this.validateLoginInput(email, password);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join(', '));
    }

    // Find user
    const user = await this.findUserByEmail(email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await this.verifyPassword(password, user.password);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Generate token
    const token = this.generateToken(user);

    // Return user data without password and sensitive fields
    const userObject = user.toObject();
    const { password: _, resetToken, resetTokenExpiry, __v, ...userWithoutPassword } = userObject;

    return {
      user: userWithoutPassword,
      token
    };
  }

  /**
   * Handles forgot password request
   */
  async forgotPassword(email) {
    // Validate email
    if (!email || !validator.isEmail(email)) {
      throw new Error('Please provide a valid email address');
    }

    // Find user
    const user = await this.findUserByEmail(email);
    if (!user) {
      // For security, don't reveal if email exists or not
      return { message: 'If an account with this email exists, a password reset link has been sent.' };
    }

    // Generate reset token
    const resetToken = this.generateResetToken();
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Save reset token to database
    await this.updateUserResetToken(user._id, resetToken, resetTokenExpiry);

    // Send password reset email
    await this.sendPasswordResetEmail(user.email, resetToken);

    return { 
      message: 'If an account with this email exists, a password reset link has been sent.',
      // In development, you might want to return the token for testing
      ...(process.env.NODE_ENV === 'development' && { resetToken })
    };
  }

  /**
   * Handles password reset
   */
  async resetPassword(token, newPassword) {
    // Validate input
    const validationErrors = this.validatePasswordResetInput(token, newPassword);
    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join(', '));
    }

    // Find user by reset token
    const user = await this.findUserByResetToken(token);
    if (!user) {
      throw new Error('Invalid or expired reset token');
    }

    // Update password and clear reset token
    await this.updateUserPassword(user._id, newPassword);

    return { message: 'Password has been reset successfully' };
  }

  /**
   * Get user profile by ID
   */
  async getUserProfile(userId) {
    try {
      const user = await User.findById(userId)
        .select('-password -resetToken -resetTokenExpiry -__v')
        .exec();
      
      if (!user) {
        throw new Error('User not found');
      }

      return user.toObject();
    } catch (error) {
      console.error('Database error in getUserProfile:', error);
      
      if (error.name === 'CastError') {
        throw new Error('Invalid user ID');
      }
      
      throw new Error('Failed to fetch user profile');
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId, updateData) {
    try {
      const { name, avatarUrl } = updateData;
      
      const updateFields = {};
      if (name) updateFields.name = name.trim();
      if (avatarUrl !== undefined) updateFields.avatarUrl = avatarUrl;

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        updateFields,
        { 
          new: true, 
          runValidators: true,
          select: '-password -resetToken -resetTokenExpiry -__v'
        }
      ).exec();

      if (!updatedUser) {
        throw new Error('User not found');
      }

      return updatedUser.toObject();
    } catch (error) {
      console.error('Database error in updateUserProfile:', error);
      
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(err => err.message);
        throw new Error(messages.join(', '));
      }
      
      if (error.name === 'CastError') {
        throw new Error('Invalid user ID');
      }
      
      throw new Error('Failed to update user profile');
    }
  }

  /**
   * Change user password
   */
  async changePassword(userId, currentPassword, newPassword) {
    try {
      // Validate new password
      const validationErrors = [];
      
      if (!newPassword || newPassword.length < 8) {
        validationErrors.push('New password must be at least 8 characters long');
      }

      if (newPassword && !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
        validationErrors.push('New password must contain at least one uppercase letter, one lowercase letter, and one number');
      }

      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join(', '));
      }

      // Find user
      const user = await User.findById(userId).exec();
      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password
      const isCurrentPasswordValid = await this.verifyPassword(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        throw new Error('Current password is incorrect');
      }

      // Update password
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await User.findByIdAndUpdate(
        userId,
        { password: hashedPassword },
        { new: true }
      ).exec();

      return { message: 'Password changed successfully' };
    } catch (error) {
      console.error('Database error in changePassword:', error);
      
      if (error.name === 'CastError') {
        throw new Error('Invalid user ID');
      }
      
      throw error;
    }
  }

  /**
   * Cleanup method to disconnect Mongoose
   */
  async disconnect() {
    try {
      await mongoose.disconnect();
      console.log('MongoDB disconnected');
    } catch (error) {
      console.error('Error disconnecting from MongoDB:', error);
    }
  }
}

export default new AuthService();