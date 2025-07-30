import express from 'express';
import authService from '../services/authService.js';

const router = express.Router();

/**
 * @route POST /signup
 * @desc Register a new user
 * @access Public
 */
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Call service
    const result = await authService.signup({ name, email, password });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        user: result.user,
        token: result.token
      }
    });

  } catch (error) {
    console.error('Signup route error:', error.message);

    // Determine status code based on error type
    let statusCode = 500;
    if (error.message.includes('already exists')) {
      statusCode = 409;
    } else if (error.message.includes('must be') || error.message.includes('required') || error.message.includes('valid')) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || 'An error occurred during signup',
      data: null
    });
  }
});

/**
 * @route POST /login
 * @desc Authenticate user and get token
 * @access Public
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Call service
    const result = await authService.login({ email, password });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: result.user,
        token: result.token
      }
    });

  } catch (error) {
    console.error('Login route error:', error.message);

    // Determine status code based on error type
    let statusCode = 500;
    if (error.message.includes('Invalid email or password')) {
      statusCode = 401;
    } else if (error.message.includes('required') || error.message.includes('valid')) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || 'An error occurred during login',
      data: null
    });
  }
});

/**
 * @route POST /forgot-password
 * @desc Send password reset email
 * @access Public
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    // Call service
    const result = await authService.forgotPassword(email);

    res.status(200).json({
      success: true,
      message: result.message,
      data: process.env.NODE_ENV === 'development' ? { resetToken: result.resetToken } : null
    });

  } catch (error) {
    console.error('Forgot password route error:', error.message);

    // Determine status code based on error type
    let statusCode = 500;
    if (error.message.includes('valid email')) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || 'An error occurred while processing your request',
      data: null
    });
  }
});

/**
 * @route POST /reset-password
 * @desc Reset user password using reset token
 * @access Public
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Call service
    const result = await authService.resetPassword(token, newPassword);

    res.status(200).json({
      success: true,
      message: result.message,
      data: null
    });

  } catch (error) {
    console.error('Reset password route error:', error.message);

    // Determine status code based on error type
    let statusCode = 500;
    if (error.message.includes('Invalid or expired')) {
      statusCode = 400;
    } else if (error.message.includes('must be') || error.message.includes('must contain')) {
      statusCode = 400;
    }

    res.status(statusCode).json({
      success: false,
      message: error.message || 'An error occurred while resetting your password',
      data: null
    });
  }
});

/**
 * @route POST /logout
 * @desc Logout user (client-side token removal)
 * @access Private
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logout successful. Please remove the token from client storage.',
    data: null
  });
});

export default router;