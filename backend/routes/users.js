const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authMiddleware, requireRole, logAudit } = require('../middleware/auth');

// All user management routes require authentication and admin role
router.use(authMiddleware);
router.use(requireRole('admin'));

// Helper to get client IP
function getClientIp(req) {
  return req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
}

// Validation helpers
function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{3,32}$/.test(username);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPassword(password) {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  return hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial;
}

// ==================== GET /api/users ====================
router.get('/', (req, res) => {
  const { status, role, limit = 100, offset = 0 } = req.query;

  let query = `
    SELECT id, username, email, role, status, failed_login_attempts,
           locked_until, created_at, last_login, updated_at
    FROM users
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  if (role) {
    query += ' AND role = ?';
    params.push(role);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  db.all(query, params, (err, users) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: 'Database error'
      });
    }

    res.json({
      success: true,
      data: users,
      message: `Retrieved ${users.length} users`
    });
  });
});

// ==================== GET /api/users/:id ====================
router.get('/:id', (req, res) => {
  const { id } = req.params;

  db.get(
    `SELECT id, username, email, role, status, failed_login_attempts,
            locked_until, created_at, last_login, updated_at
     FROM users WHERE id = ?`,
    [id],
    (err, user) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database error'
        });
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      res.json({
        success: true,
        data: user,
        message: 'User retrieved'
      });
    }
  );
});

// ==================== POST /api/users ====================
router.post('/', (req, res) => {
  const { username, email, password, role } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: username, email, password'
    });
  }

  if (!isValidUsername(username)) {
    return res.status(400).json({
      success: false,
      error: 'Username must be 3-32 characters, alphanumeric and underscore only'
    });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid email format'
    });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character'
    });
  }

  const userRole = ['admin', 'manager', 'viewer'].includes(role) ? role : 'viewer';
  const passwordHash = bcrypt.hashSync(password, 10);

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

    logAudit(
      req.user.id,
      'create',
      'user',
      userId,
      null,
      { username, email, role: userRole },
      getClientIp(req),
      'success'
    );

    res.status(201).json({
      success: true,
      data: { id: userId, username, email, role: userRole },
      message: 'User created successfully'
    });
  });

  stmt.finalize();
});

// ==================== PUT /api/users/:id ====================
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { email, role, status } = req.body;

  // Prevent self-demotion
  if (parseInt(id) === req.user.id && role && role !== 'admin') {
    return res.status(400).json({
      success: false,
      error: 'Cannot change your own role'
    });
  }

  db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: 'Database error'
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const updates = [];
    const params = [];
    const oldValues = {};
    const newValues = {};

    if (email && email !== user.email) {
      if (!isValidEmail(email)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
      }
      updates.push('email = ?');
      params.push(email.toLowerCase());
      oldValues.email = user.email;
      newValues.email = email.toLowerCase();
    }

    if (role && role !== user.role) {
      if (!['admin', 'manager', 'viewer'].includes(role)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid role. Must be admin, manager, or viewer'
        });
      }
      updates.push('role = ?');
      params.push(role);
      oldValues.role = user.role;
      newValues.role = role;
    }

    if (status && status !== user.status) {
      if (!['active', 'suspended', 'locked'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid status. Must be active, suspended, or locked'
        });
      }
      updates.push('status = ?');
      params.push(status);
      oldValues.status = user.status;
      newValues.status = status;

      // Reset failed attempts if activating
      if (status === 'active') {
        updates.push('failed_login_attempts = 0');
        updates.push('locked_until = NULL');
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No changes provided'
      });
    }

    updates.push('updated_at = datetime("now")');
    params.push(id);

    db.run(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      params,
      function(updateErr) {
        if (updateErr) {
          if (updateErr.message.includes('UNIQUE constraint failed: users.email')) {
            return res.status(409).json({
              success: false,
              error: 'Email already registered'
            });
          }
          return res.status(500).json({
            success: false,
            error: 'Failed to update user'
          });
        }

        logAudit(
          req.user.id,
          'update',
          'user',
          id,
          oldValues,
          newValues,
          getClientIp(req),
          'success'
        );

        res.json({
          success: true,
          message: 'User updated successfully'
        });
      }
    );
  });
});

// ==================== PUT /api/users/:id/reset-password ====================
router.put('/:id/reset-password', (req, res) => {
  const { id } = req.params;
  const { new_password } = req.body;

  if (!new_password) {
    return res.status(400).json({
      success: false,
      error: 'New password is required'
    });
  }

  if (!isValidPassword(new_password)) {
    return res.status(400).json({
      success: false,
      error: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character'
    });
  }

  db.get('SELECT id FROM users WHERE id = ?', [id], (err, user) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: 'Database error'
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const passwordHash = bcrypt.hashSync(new_password, 10);

    db.run(
      'UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?',
      [passwordHash, id],
      function(updateErr) {
        if (updateErr) {
          return res.status(500).json({
            success: false,
            error: 'Failed to reset password'
          });
        }

        // Invalidate all sessions for this user
        db.run('DELETE FROM sessions WHERE user_id = ?', [id]);

        logAudit(
          req.user.id,
          'admin_password_reset',
          'user',
          id,
          null,
          null,
          getClientIp(req),
          'success'
        );

        res.json({
          success: true,
          message: 'Password reset successfully'
        });
      }
    );
  });
});

// ==================== DELETE /api/users/:id ====================
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  // Prevent self-deletion
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({
      success: false,
      error: 'Cannot delete your own account'
    });
  }

  db.get('SELECT username FROM users WHERE id = ?', [id], (err, user) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: 'Database error'
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Delete user's sessions first
    db.run('DELETE FROM sessions WHERE user_id = ?', [id], (sessionErr) => {
      if (sessionErr) {
        return res.status(500).json({
          success: false,
          error: 'Failed to delete user sessions'
        });
      }

      // Delete password reset tokens
      db.run('DELETE FROM password_reset_tokens WHERE user_id = ?', [id], (tokenErr) => {
        if (tokenErr) {
          return res.status(500).json({
            success: false,
            error: 'Failed to delete user tokens'
          });
        }

        // Delete user
        db.run('DELETE FROM users WHERE id = ?', [id], function(deleteErr) {
          if (deleteErr) {
            return res.status(500).json({
              success: false,
              error: 'Failed to delete user'
            });
          }

          logAudit(
            req.user.id,
            'delete',
            'user',
            id,
            { username: user.username },
            null,
            getClientIp(req),
            'success'
          );

          res.json({
            success: true,
            message: 'User deleted successfully'
          });
        });
      });
    });
  });
});

// ==================== GET /api/users/audit-logs ====================
router.get('/audit/logs', (req, res) => {
  const { user_id, action, resource, limit = 100, offset = 0 } = req.query;

  let query = `
    SELECT al.*, u.username
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (user_id) {
    query += ' AND al.user_id = ?';
    params.push(user_id);
  }

  if (action) {
    query += ' AND al.action = ?';
    params.push(action);
  }

  if (resource) {
    query += ' AND al.resource = ?';
    params.push(resource);
  }

  query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  db.all(query, params, (err, logs) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: 'Database error'
      });
    }

    res.json({
      success: true,
      data: logs,
      message: `Retrieved ${logs.length} audit logs`
    });
  });
});

module.exports = router;
