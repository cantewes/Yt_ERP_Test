const db = require('../db');

// Session timeout in minutes
const SESSION_TIMEOUT_MINUTES = 60;

// Authentication middleware - validates token and attaches user to request
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Missing or invalid authorization header'
    });
  }

  const token = authHeader.split(' ')[1];

  // Find session with token
  db.get(
    `SELECT s.*, u.id as user_id, u.username, u.email, u.role, u.status
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token = ? AND s.expires_at > datetime('now')`,
    [token],
    (err, session) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database error'
        });
      }

      if (!session) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired token'
        });
      }

      // Check for inactivity timeout (1 hour)
      if (session.last_activity) {
        // SQLite stores datetime without timezone, treat as UTC by appending 'Z'
        const lastActivityStr = session.last_activity.endsWith('Z')
          ? session.last_activity
          : session.last_activity + 'Z';
        const lastActivity = new Date(lastActivityStr);
        const now = new Date();
        const minutesSinceLastActivity = (now - lastActivity) / 1000 / 60;

        if (minutesSinceLastActivity > SESSION_TIMEOUT_MINUTES) {
          // Delete expired session
          db.run('DELETE FROM sessions WHERE id = ?', [session.id]);
          return res.status(401).json({
            success: false,
            error: 'Session expired due to inactivity'
          });
        }
      }

      // Check if user account is still active
      if (session.status !== 'active') {
        return res.status(401).json({
          success: false,
          error: 'Account is locked or suspended'
        });
      }

      // Update last activity
      db.run(
        'UPDATE sessions SET last_activity = datetime("now") WHERE id = ?',
        [session.id]
      );

      // Attach user to request
      req.user = {
        id: session.user_id,
        username: session.username,
        email: session.email,
        role: session.role
      };

      next();
    }
  );
}

// Role-based access control middleware
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    next();
  };
}

// Helper function to log audit events
function logAudit(userId, action, resource, resourceId, oldValue, newValue, ipAddress, result) {
  db.run(
    `INSERT INTO audit_logs (user_id, action, resource, resource_id, old_value, new_value, ip_address, result)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      action,
      resource,
      resourceId,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      ipAddress,
      result
    ]
  );
}

module.exports = {
  authMiddleware,
  requireRole,
  logAudit
};
