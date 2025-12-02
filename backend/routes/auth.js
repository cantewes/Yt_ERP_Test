const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { authMiddleware, logAudit } = require('../middleware/auth');

// Constants
const BCRYPT_SALT_ROUNDS = 10;
const SESSION_EXPIRY_HOURS = 8;
const PASSWORD_RESET_EXPIRY_HOURS = 1;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 30;

// Validation helpers
function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{3,32}$/.test(username);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password) {
  // Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  return hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getClientIp(req) {
  return req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
}

// ==================== POST /api/auth/register ====================
router.post('/register', (req, res) => {
  const { username, email, password, role } = req.body;

  // Validate required fields
  if (!username || !email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: username, email, password'
    });
  }

  // Validate username format
  if (!isValidUsername(username)) {
    return res.status(400).json({
      success: false,
      error: 'Username must be 3-32 characters, alphanumeric and underscore only'
    });
  }

  // Validate email format
  if (!isValidEmail(email)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid email format'
    });
  }

  // Validate password strength
  if (!isValidPassword(password)) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character'
    });
  }

  // Only allow admin to set roles (default is viewer)
  const userRole = ['admin', 'manager', 'viewer'].includes(role) ? role : 'viewer';

  // Hash password
  const passwordHash = bcrypt.hashSync(password, BCRYPT_SALT_ROUNDS);

  // Insert user
  const stmt = db.prepare(`
    INSERT INTO users (username, email, password_hash, role)
    VALUES (?, ?, ?, ?)
  `);

  stmt.run([username, email.toLowerCase(), passwordHash, userRole], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed: users.username')) {
        return res.status(409).json({
          success: false,
          error: 'Username already exists'
        });
      }
      if (err.message.includes('UNIQUE constraint failed: users.email')) {
        return res.status(409).json({
          success: false,
          error: 'Email already registered'
        });
      }
      return res.status(500).json({
        success: false,
        error: 'Database error'
      });
    }

    const userId = this.lastID;

    // Log audit
    logAudit(userId, 'register', 'user', userId, null, { username, email }, getClientIp(req), 'success');

    res.status(201).json({
      success: true,
      user_id: userId,
      message: 'User created successfully'
    });
  });

  stmt.finalize();
});

// ==================== POST /api/auth/login ====================
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Missing username or password'
    });
  }

  // Find user
  db.get(
    'SELECT * FROM users WHERE username = ?',
    [username],
    (err, user) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database error'
        });
      }

      const ipAddress = getClientIp(req);

      // User not found - generic error for security
      if (!user) {
        logAudit(null, 'login', 'user', null, null, { username }, ipAddress, 'failure');
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }

      // Check if account is locked
      if (user.status === 'locked' && user.locked_until) {
        const lockedUntil = new Date(user.locked_until);
        const now = new Date();

        if (now < lockedUntil) {
          const minutesLeft = Math.ceil((lockedUntil - now) / 1000 / 60);
          return res.status(429).json({
            success: false,
            error: `Account locked. Try again in ${minutesLeft} minutes`
          });
        } else {
          // Unlock account if lockout period has passed
          db.run(
            'UPDATE users SET status = "active", failed_login_attempts = 0, locked_until = NULL WHERE id = ?',
            [user.id]
          );
          user.status = 'active';
          user.failed_login_attempts = 0;
        }
      }

      // Check if account is suspended
      if (user.status === 'suspended') {
        return res.status(401).json({
          success: false,
          error: 'Account is suspended. Contact administrator'
        });
      }

      // Verify password
      const passwordValid = bcrypt.compareSync(password, user.password_hash);

      if (!passwordValid) {
        // Increment failed attempts
        const newAttempts = (user.failed_login_attempts || 0) + 1;

        if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
          // Lock account
          const lockUntil = new Date();
          lockUntil.setMinutes(lockUntil.getMinutes() + LOCKOUT_MINUTES);

          db.run(
            'UPDATE users SET status = "locked", failed_login_attempts = ?, locked_until = ? WHERE id = ?',
            [newAttempts, lockUntil.toISOString(), user.id]
          );

          logAudit(user.id, 'login', 'user', user.id, null, { attempts: newAttempts, locked: true }, ipAddress, 'failure');

          return res.status(429).json({
            success: false,
            error: `Account locked due to ${MAX_LOGIN_ATTEMPTS} failed attempts. Try again in ${LOCKOUT_MINUTES} minutes`
          });
        } else {
          db.run(
            'UPDATE users SET failed_login_attempts = ? WHERE id = ?',
            [newAttempts, user.id]
          );

          logAudit(user.id, 'login', 'user', user.id, null, { attempts: newAttempts }, ipAddress, 'failure');

          return res.status(401).json({
            success: false,
            error: 'Invalid credentials',
            attempts_remaining: MAX_LOGIN_ATTEMPTS - newAttempts
          });
        }
      }

      // Successful login - reset failed attempts and create session
      const token = generateToken();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + SESSION_EXPIRY_HOURS);

      // Create session
      db.run(
        `INSERT INTO sessions (user_id, token, expires_at, last_activity, ip_address, user_agent)
         VALUES (?, ?, ?, datetime('now'), ?, ?)`,
        [user.id, token, expiresAt.toISOString(), ipAddress, req.headers['user-agent'] || 'unknown'],
        function(sessionErr) {
          if (sessionErr) {
            return res.status(500).json({
              success: false,
              error: 'Failed to create session'
            });
          }

          // Update user login info
          db.run(
            'UPDATE users SET failed_login_attempts = 0, last_login = datetime("now") WHERE id = ?',
            [user.id]
          );

          logAudit(user.id, 'login', 'user', user.id, null, null, ipAddress, 'success');

          res.json({
            success: true,
            token: token,
            user_id: user.id,
            role: user.role,
            expires_in_seconds: SESSION_EXPIRY_HOURS * 3600,
            message: 'Login successful'
          });
        }
      );
    }
  );
});

// ==================== POST /api/auth/logout ====================
router.post('/logout', authMiddleware, (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  db.run('DELETE FROM sessions WHERE token = ?', [token], function(err) {
    if (err) {
      return res.status(500).json({
        success: false,
        error: 'Failed to logout'
      });
    }

    logAudit(req.user.id, 'logout', 'user', req.user.id, null, null, getClientIp(req), 'success');

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });
});

// ==================== GET /api/auth/me ====================
router.get('/me', authMiddleware, (req, res) => {
  res.json({
    success: true,
    data: {
      user_id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role
    },
    message: 'User info retrieved'
  });
});

// ==================== POST /api/auth/password-reset-request ====================
router.post('/password-reset-request', (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      error: 'Email is required'
    });
  }

  // Always return success for security (don't reveal if email exists)
  const successResponse = () => {
    res.json({
      success: true,
      message: 'If an account exists with this email, a reset link has been sent'
    });
  };

  db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()], (err, user) => {
    if (err || !user) {
      // Log attempt even if user not found
      logAudit(null, 'password_reset_request', 'user', null, null, { email }, getClientIp(req), 'not_found');
      return successResponse();
    }

    // Generate reset token
    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + PASSWORD_RESET_EXPIRY_HOURS);

    // Invalidate existing reset tokens for this user
    db.run('DELETE FROM password_reset_tokens WHERE user_id = ?', [user.id]);

    // Create new reset token
    db.run(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, token, expiresAt.toISOString()],
      function(insertErr) {
        if (insertErr) {
          return res.status(500).json({
            success: false,
            error: 'Failed to create reset token'
          });
        }

        logAudit(user.id, 'password_reset_request', 'user', user.id, null, { email }, getClientIp(req), 'success');

        // In production, send email here. For MVP, log the token
        console.log(`Password reset token for ${email}: ${token}`);
        console.log(`Reset URL: http://localhost:3000/reset-password.html?token=${token}`);

        successResponse();
      }
    );
  });
});

// ==================== POST /api/auth/password-reset ====================
router.post('/password-reset', (req, res) => {
  const { token, new_password } = req.body;

  if (!token || !new_password) {
    return res.status(400).json({
      success: false,
      error: 'Token and new password are required'
    });
  }

  // Validate password strength
  if (!isValidPassword(new_password)) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character'
    });
  }

  // Find valid token
  db.get(
    `SELECT * FROM password_reset_tokens
     WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')`,
    [token],
    (err, resetToken) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database error'
        });
      }

      if (!resetToken) {
        // Check if token exists but is expired
        db.get('SELECT * FROM password_reset_tokens WHERE token = ?', [token], (checkErr, expiredToken) => {
          if (expiredToken && expiredToken.used_at) {
            return res.status(400).json({
              success: false,
              error: 'Reset token has already been used'
            });
          }
          if (expiredToken) {
            return res.status(410).json({
              success: false,
              error: 'Reset token has expired'
            });
          }
          return res.status(400).json({
            success: false,
            error: 'Invalid reset token'
          });
        });
        return;
      }

      // Hash new password
      const passwordHash = bcrypt.hashSync(new_password, BCRYPT_SALT_ROUNDS);

      // Update password
      db.run(
        'UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?',
        [passwordHash, resetToken.user_id],
        function(updateErr) {
          if (updateErr) {
            return res.status(500).json({
              success: false,
              error: 'Failed to update password'
            });
          }

          // Mark token as used
          db.run(
            'UPDATE password_reset_tokens SET used_at = datetime("now") WHERE id = ?',
            [resetToken.id]
          );

          // Invalidate all sessions for this user
          db.run('DELETE FROM sessions WHERE user_id = ?', [resetToken.user_id]);

          logAudit(resetToken.user_id, 'password_reset', 'user', resetToken.user_id, null, null, getClientIp(req), 'success');

          res.json({
            success: true,
            message: 'Password reset successful. Please login with your new password'
          });
        }
      );
    }
  );
});

// ==================== PUT /api/auth/change-password ====================
router.put('/change-password', authMiddleware, (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({
      success: false,
      error: 'Current password and new password are required'
    });
  }

  // Validate new password strength
  if (!isValidPassword(new_password)) {
    return res.status(400).json({
      success: false,
      error: 'New password must be at least 8 characters with uppercase, lowercase, number, and special character'
    });
  }

  // Get user's current password hash
  db.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err || !user) {
      return res.status(500).json({
        success: false,
        error: 'Failed to verify user'
      });
    }

    // Verify current password
    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      logAudit(req.user.id, 'change_password', 'user', req.user.id, null, null, getClientIp(req), 'failure');
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Hash and update new password
    const newHash = bcrypt.hashSync(new_password, BCRYPT_SALT_ROUNDS);

    db.run(
      'UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?',
      [newHash, req.user.id],
      function(updateErr) {
        if (updateErr) {
          return res.status(500).json({
            success: false,
            error: 'Failed to update password'
          });
        }

        // Get current token to preserve it
        const currentToken = req.headers.authorization.split(' ')[1];

        // Invalidate all other sessions
        db.run('DELETE FROM sessions WHERE user_id = ? AND token != ?', [req.user.id, currentToken]);

        logAudit(req.user.id, 'change_password', 'user', req.user.id, null, null, getClientIp(req), 'success');

        res.json({
          success: true,
          message: 'Password changed successfully'
        });
      }
    );
  });
});

module.exports = router;
