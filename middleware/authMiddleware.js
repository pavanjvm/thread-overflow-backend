import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { promisify } from 'util';

// Import your User model and any token blacklist service
import { User } from '../models/index.js';

class AuthMiddleware {
  constructor() {
    // Token blacklist - in production, use Redis or database
    this.tokenBlacklist = new Set();
    
    // Suspicious activity tracking
    this.suspiciousActivity = new Map();
    
    // Rate limiter for failed auth attempts
    this.authRateLimit = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 failed attempts per window
      skipSuccessfulRequests: true,
      keyGenerator: (req) => {
        // Use IP + User-Agent for better tracking
        return `${req.ip}-${req.get('User-Agent') || 'unknown'}`;
      },
      handler: (req, res) => {
        this.logSecurityEvent('AUTH_RATE_LIMIT_EXCEEDED', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path
        });
        
        res.status(429).json({
          success: false,
          message: 'Too many authentication attempts. Please try again later.',
          data: null,
          retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
        });
      }
    });
  }

  /**
   * Logs security events for monitoring
   */
  logSecurityEvent(eventType, details) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      eventType,
      details,
      severity: this.getEventSeverity(eventType)
    };

    // In production, send to your logging service (e.g., Winston, DataDog, etc.)
    if (process.env.NODE_ENV === 'production') {
      console.error('🔒 SECURITY EVENT:', JSON.stringify(logEntry));
    } else {
      console.warn('🔒 Security Event:', eventType, details);
    }

    // Track suspicious activity
    this.trackSuspiciousActivity(details.ip, eventType);
  }

  /**
   * Tracks suspicious activity patterns
   */
  trackSuspiciousActivity(ip, eventType) {
    if (!ip) return;

    const key = ip;
    const activity = this.suspiciousActivity.get(key) || { count: 0, events: [], firstSeen: Date.now() };
    
    activity.count++;
    activity.events.push({ type: eventType, timestamp: Date.now() });
    activity.lastSeen = Date.now();

    // Keep only last 10 events
    if (activity.events.length > 10) {
      activity.events = activity.events.slice(-10);
    }

    this.suspiciousActivity.set(key, activity);

    // Alert on suspicious patterns
    if (activity.count > 10 && (activity.lastSeen - activity.firstSeen) < 5 * 60 * 1000) {
      this.logSecurityEvent('SUSPICIOUS_ACTIVITY_DETECTED', {
        ip,
        eventCount: activity.count,
        timespan: activity.lastSeen - activity.firstSeen,
        events: activity.events
      });
    }

    // Clean old entries (older than 1 hour)
    if (activity.firstSeen < Date.now() - 60 * 60 * 1000) {
      this.suspiciousActivity.delete(key);
    }
  }

  /**
   * Determines event severity
   */
  getEventSeverity(eventType) {
    const severityMap = {
      'INVALID_TOKEN': 'medium',
      'TOKEN_EXPIRED': 'low',
      'BLACKLISTED_TOKEN': 'high',
      'MALFORMED_TOKEN': 'medium',
      'AUTH_RATE_LIMIT_EXCEEDED': 'high',
      'SUSPICIOUS_ACTIVITY_DETECTED': 'critical',
      'USER_NOT_FOUND': 'medium',
      'INVALID_TOKEN_FORMAT': 'medium'
    };
    return severityMap[eventType] || 'low';
  }

  /**
   * Validates token format before JWT verification
   */
  validateTokenFormat(token) {
    // Basic format check: should have 3 parts separated by dots
    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }

    // Check if each part is valid base64
    try {
      parts.forEach(part => {
        // Add padding if necessary
        const padded = part + '='.repeat((4 - part.length % 4) % 4);
        atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Checks if token is blacklisted
   */
  isTokenBlacklisted(token) {
    // In production, check against Redis or database
    return this.tokenBlacklist.has(token);
  }

  /**
   * Adds token to blacklist
   */
  blacklistToken(token) {
    this.tokenBlacklist.add(token);
    
    // In production, store in Redis with expiration
    // redis.setex(`blacklist:${token}`, tokenExpiry, '1');
    
    this.logSecurityEvent('TOKEN_BLACKLISTED', { 
      tokenHash: this.hashToken(token),
      reason: 'Manual blacklist'
    });
  }

  /**
   * Creates a hash of the token for logging (security)
   */
  hashToken(token) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
  }

  /**
   * Validates request context for additional security
   */
  validateRequestContext(req, decodedToken) {
    const issues = [];

    // Check if User-Agent is present (basic bot detection)
    if (!req.get('User-Agent')) {
      issues.push('Missing User-Agent header');
    }

    // Check for suspicious headers
    const suspiciousHeaders = ['x-forwarded-for', 'x-real-ip', 'x-cluster-client-ip'];
    const forwardedIPs = suspiciousHeaders
      .map(header => req.get(header))
      .filter(Boolean)
      .join(', ');

    if (forwardedIPs) {
      // Log but don't block - might be legitimate proxy
      this.logSecurityEvent('FORWARDED_IP_DETECTED', {
        originalIP: req.ip,
        forwardedIPs,
        userId: decodedToken.userId
      });
    }

    // Check token age (warn if token is very old but still valid)
    const tokenAge = Date.now() / 1000 - decodedToken.iat;
    const maxRecommendedAge = 24 * 60 * 60; // 24 hours
    
    if (tokenAge > maxRecommendedAge) {
      this.logSecurityEvent('OLD_TOKEN_USAGE', {
        userId: decodedToken.userId,
        tokenAge: Math.round(tokenAge / 3600) + ' hours',
        ip: req.ip
      });
    }

    return issues;
  }

  /**
   * Main authentication middleware
   */
  authenticate = async (req, res, next) => {
    try {
      // Apply rate limiting for failed attempts
      this.authRateLimit(req, res, () => {});

      // Extract token from header
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : null;

      if (!token) {
        this.logSecurityEvent('MISSING_TOKEN', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path
        });

        return res.status(401).json({
          success: false,
          message: 'Access denied. No authentication token provided.',
          data: null,
          code: 'TOKEN_MISSING'
        });
      }

      // Validate token format
      if (!this.validateTokenFormat(token)) {
        this.logSecurityEvent('INVALID_TOKEN_FORMAT', {
          ip: req.ip,
          tokenHash: this.hashToken(token)
        });

        return res.status(401).json({
          success: false,
          message: 'Invalid token format.',
          data: null,
          code: 'TOKEN_MALFORMED'
        });
      }

      // Check if token is blacklisted
      if (this.isTokenBlacklisted(token)) {
        this.logSecurityEvent('BLACKLISTED_TOKEN', {
          ip: req.ip,
          tokenHash: this.hashToken(token)
        });

        return res.status(401).json({
          success: false,
          message: 'Token has been revoked.',
          data: null,
          code: 'TOKEN_REVOKED'
        });
      }

      // Verify JWT token
      let decodedPayload;
      try {
        decodedPayload = jwt.verify(token, process.env.JWT_SECRET);
      } catch (jwtError) {
        let errorMessage = 'Invalid token.';
        let errorCode = 'TOKEN_INVALID';
        let logEventType = 'INVALID_TOKEN';

        if (jwtError.name === 'TokenExpiredError') {
          errorMessage = 'Token has expired. Please login again.';
          errorCode = 'TOKEN_EXPIRED';
          logEventType = 'TOKEN_EXPIRED';
        } else if (jwtError.name === 'JsonWebTokenError') {
          errorMessage = 'Invalid token signature.';
          errorCode = 'TOKEN_INVALID_SIGNATURE';
          logEventType = 'INVALID_TOKEN';
        } else if (jwtError.name === 'NotBeforeError') {
          errorMessage = 'Token not active yet.';
          errorCode = 'TOKEN_NOT_ACTIVE';
          logEventType = 'INVALID_TOKEN';
        }

        this.logSecurityEvent(logEventType, {
          ip: req.ip,
          error: jwtError.message,
          tokenHash: this.hashToken(token)
        });

        return res.status(401).json({
          success: false,
          message: errorMessage,
          data: null,
          code: errorCode
        });
      }

      // Validate required token fields
      if (!decodedPayload.userId || !decodedPayload.email) {
        this.logSecurityEvent('MALFORMED_TOKEN', {
          ip: req.ip,
          tokenHash: this.hashToken(token),
          missingFields: !decodedPayload.userId ? 'userId' : 'email'
        });

        return res.status(401).json({
          success: false,
          message: 'Token is missing required information.',
          data: null,
          code: 'TOKEN_INCOMPLETE'
        });
      }

      // Verify user still exists and is active
      const user = await User.findById(decodedPayload.userId)
        .select('_id email role createdAt updatedAt')
        .exec();

      if (!user) {
        this.logSecurityEvent('USER_NOT_FOUND', {
          ip: req.ip,
          userId: decodedPayload.userId,
          tokenHash: this.hashToken(token)
        });

        return res.status(401).json({
          success: false,
          message: 'User account no longer exists.',
          data: null,
          code: 'USER_NOT_FOUND'
        });
      }

      // Check if user email matches token
      if (user.email !== decodedPayload.email) {
        this.logSecurityEvent('EMAIL_MISMATCH', {
          ip: req.ip,
          userId: decodedPayload.userId,
          tokenEmail: decodedPayload.email,
          userEmail: user.email
        });

        return res.status(401).json({
          success: false,
          message: 'Token information does not match user account.',
          data: null,
          code: 'TOKEN_USER_MISMATCH'
        });
      }

      // Validate request context
      const contextIssues = this.validateRequestContext(req, decodedPayload);
      if (contextIssues.length > 0) {
        // Log but don't block for now
        this.logSecurityEvent('CONTEXT_VALIDATION_WARNING', {
          ip: req.ip,
          userId: decodedPayload.userId,
          issues: contextIssues
        });
      }

      // Add user information to request
      req.user = {
        userId: user._id.toString(),
        email: user.email,
        role: user.role || 'user',
        ...decodedPayload
      };

      // Add token information for potential blacklisting
      req.token = token;

      // Set security headers
      res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block'
      });

      next();
    } catch (error) {
      this.logSecurityEvent('AUTH_MIDDLEWARE_ERROR', {
        ip: req.ip,
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        message: 'Authentication service temporarily unavailable.',
        data: null,
        code: 'AUTH_SERVICE_ERROR'
      });
    }
  };

  /**
   * Role-based access control middleware
   */
  requireRole = (roles) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.',
          data: null,
          code: 'AUTH_REQUIRED'
        });
      }

      const userRole = req.user.role;
      const allowedRoles = Array.isArray(roles) ? roles : [roles];

      if (!allowedRoles.includes(userRole)) {
        this.logSecurityEvent('INSUFFICIENT_PERMISSIONS', {
          ip: req.ip,
          userId: req.user.userId,
          userRole,
          requiredRoles: allowedRoles,
          path: req.path
        });

        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions for this action.',
          data: null,
          code: 'INSUFFICIENT_PERMISSIONS'
        });
      }

      next();
    };
  };

  /**
   * Optional authentication middleware (doesn't fail if no token)
   */
  optionalAuth = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : null;

    if (!token) {
      return next();
    }

    // Use the main authenticate middleware but catch errors
    try {
      await this.authenticate(req, res, next);
    } catch (error) {
      // If authentication fails, continue without user
      next();
    }
  };

  /**
   * Logout middleware (blacklists token)
   */
  logout = (req, res, next) => {
    if (req.token) {
      this.blacklistToken(req.token);
    }
    next();
  };
}

// Create singleton instance
const authmiddleware = new AuthMiddleware();

// Export the middleware functions
export const authMiddleware = authMiddleware.authenticate;
export const requireRole = authMiddleware.requireRole;
export const optionalAuth = authMiddleware.optionalAuth;
export const logout = authMiddleware.logout;

// Export the class for testing or advanced usage
export default authmiddleware;


// How to use the middleware in your routes:
/**Basic Authentication
JavaScript

import { authMiddleware } from '../middleware/authMiddleware.js';

router.get('/protected', authMiddleware, (req, res) => {
  // req.user is available here
  res.json({ user: req.user });
});
Role-Based Access Control
JavaScript

import { authMiddleware, requireRole } from '../middleware/authMiddleware.js';

// Single role
router.delete('/admin-only', authMiddleware, requireRole('ADMIN'), (req, res) => {
  // Only admins can access
});

// Multiple roles
router.put('/moderator-action', authMiddleware, requireRole(['ADMIN', 'MODERATOR']), (req, res) => {
  // Admins and moderators can access
});
Optional Authentication
JavaScript

import { optionalAuth } from '../middleware/authMiddleware.js';

router.get('/public-with-optional-auth', optionalAuth, (req, res) => {
  if (req.user) {
    // User is authenticated
    res.json({ message: 'Hello, ' + req.user.email });
  } else {
    // User is not authenticated
    res.json({ message: 'Hello, guest' });
  }
});
Logout
JavaScript

import { authMiddleware, logout } from '../middleware/authMiddleware.js';

router.post('/logout', authMiddleware, logout, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});
**/