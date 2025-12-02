// Email Orders Routes - Phase 11b
// Admin dashboard API for email-to-order automation

const express = require('express');
const router = express.Router();
const db = require('../db');
const emailParser = require('../services/emailParser');
const emailService = require('../services/emailService');
const { authMiddleware, requireRole, logAudit } = require('../middleware/auth');

// Helper to get client IP
function getClientIp(req) {
  return req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || 'unknown';
}

// All routes require authentication and admin/manager role
router.use(authMiddleware);
router.use(requireRole('admin', 'manager'));

// GET /api/email-orders/pending - Get pending review orders
router.get('/pending', (req, res) => {
  const { status, minConfidence, maxConfidence } = req.query;

  let sql = `
    SELECT
      po.id,
      po.sender_email,
      po.extracted_quantity,
      po.extracted_product_name,
      po.product_id,
      po.confidence_score,
      po.status,
      po.admin_notes,
      po.created_at,
      p.name as product_name,
      p.price as product_price,
      pe.subject as email_subject,
      pe.raw_body as email_body
    FROM pending_orders po
    LEFT JOIN products p ON po.product_id = p.id
    LEFT JOIN parsed_emails pe ON po.parsed_email_id = pe.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    sql += ' AND po.status = ?';
    params.push(status);
  } else {
    // Default: show pending and duplicate warnings
    sql += ' AND po.status IN ("PENDING_REVIEW", "DUPLICATE_WARNING")';
  }

  if (minConfidence) {
    sql += ' AND po.confidence_score >= ?';
    params.push(parseFloat(minConfidence));
  }

  if (maxConfidence) {
    sql += ' AND po.confidence_score <= ?';
    params.push(parseFloat(maxConfidence));
  }

  sql += ' ORDER BY po.confidence_score ASC, po.created_at DESC';

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, data: rows });
  });
});

// GET /api/email-orders/auto-approved - Get auto-approved orders summary
router.get('/auto-approved', (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];

  db.all(`
    SELECT
      po.id,
      po.sender_email,
      po.extracted_quantity,
      po.extracted_product_name,
      po.confidence_score,
      po.approved_at,
      p.name as product_name
    FROM pending_orders po
    LEFT JOIN products p ON po.product_id = p.id
    WHERE po.status = 'AUTO_APPROVED'
    AND date(po.approved_at) = ?
    ORDER BY po.approved_at DESC
  `, [targetDate], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }

    // Get total count for today
    db.get(`
      SELECT COUNT(*) as count FROM pending_orders
      WHERE status = 'AUTO_APPROVED'
      AND date(approved_at) = ?
    `, [targetDate], (err, countRow) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }

      res.json({
        success: true,
        data: rows,
        summary: {
          date: targetDate,
          totalAutoApproved: countRow ? countRow.count : 0
        }
      });
    });
  });
});

// GET /api/email-orders/errors - Get parsing errors
router.get('/errors', (req, res) => {
  db.all(`
    SELECT
      id,
      sender_email,
      error_type,
      error_message,
      parse_attempt_count,
      first_attempt_at,
      created_at
    FROM email_parsing_errors
    WHERE created_at > datetime('now', '-7 days')
    ORDER BY created_at DESC
    LIMIT 100
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, data: rows });
  });
});

// GET /api/email-orders/stats - Get overall statistics
router.get('/stats', (req, res) => {
  const stats = {};

  db.get(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'PENDING_REVIEW' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'AUTO_APPROVED' THEN 1 ELSE 0 END) as auto_approved,
      SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN status = 'DUPLICATE_WARNING' THEN 1 ELSE 0 END) as duplicates
    FROM pending_orders
  `, [], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }

    stats.orders = row;

    db.get(`
      SELECT COUNT(*) as count FROM email_parsing_errors
      WHERE created_at > datetime('now', '-7 days')
    `, [], (err, errorRow) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }

      stats.recentErrors = errorRow ? errorRow.count : 0;

      // Get average confidence
      db.get(`
        SELECT AVG(confidence_score) as avg_confidence FROM pending_orders
        WHERE created_at > datetime('now', '-7 days')
      `, [], (err, avgRow) => {
        if (err) {
          return res.status(500).json({ success: false, error: err.message });
        }

        stats.avgConfidence = avgRow ? (avgRow.avg_confidence || 0).toFixed(2) : 0;

        res.json({ success: true, data: stats });
      });
    });
  });
});

// POST /api/email-orders/:id/approve - Approve pending order
router.post('/:id/approve', async (req, res) => {
  const { id } = req.params;
  const { notes, userId } = req.body;

  try {
    // Get pending order
    const order = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM pending_orders WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (order.status === 'APPROVED' || order.status === 'PROCESSED') {
      return res.status(400).json({ success: false, error: 'Order already processed' });
    }

    // Update pending order status
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE pending_orders
        SET status = 'APPROVED', admin_notes = ?, approved_at = datetime('now'), approved_by = ?
        WHERE id = ?
      `, [notes || null, userId || null, id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create actual order
    const orderResult = await emailService.createOrderFromPending(id);

    // Send confirmation email
    await emailService.sendApprovalEmail({
      orderId: orderResult.orderId,
      senderEmail: order.sender_email,
      productName: order.extracted_product_name,
      quantity: order.extracted_quantity
    });

    // Audit log for approval
    logAudit(
      req.user?.id || userId,
      'email_order_approve',
      'pending_order',
      id,
      { status: order.status },
      { status: 'APPROVED', orderId: orderResult.orderId, invoiceId: orderResult.invoiceId },
      getClientIp(req),
      'success'
    );

    res.json({
      success: true,
      message: 'Order approved',
      orderId: orderResult.orderId,
      invoiceId: orderResult.invoiceId
    });
  } catch (err) {
    console.error('Approve error:', err);

    // Audit log for failed approval
    logAudit(
      req.user?.id || null,
      'email_order_approve',
      'pending_order',
      id,
      null,
      { error: err.message },
      getClientIp(req),
      'failure'
    );

    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/email-orders/:id/reject - Reject pending order
router.post('/:id/reject', async (req, res) => {
  const { id } = req.params;
  const { reason, notes, sendEmail } = req.body;

  try {
    // Get pending order
    const order = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM pending_orders WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // Update status
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE pending_orders
        SET status = 'REJECTED', admin_notes = ?
        WHERE id = ?
      `, [notes || reason || 'Rejected by admin', id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Send rejection email if requested
    if (sendEmail !== false) {
      await emailService.sendRejectionEmail(order.sender_email, reason || 'Order rejected');
    }

    // Audit log for rejection
    logAudit(
      req.user?.id || null,
      'email_order_reject',
      'pending_order',
      id,
      { status: order.status },
      { status: 'REJECTED', reason: reason || 'Rejected by admin' },
      getClientIp(req),
      'success'
    );

    res.json({ success: true, message: 'Order rejected' });
  } catch (err) {
    console.error('Reject error:', err);

    // Audit log for failed rejection
    logAudit(
      req.user?.id || null,
      'email_order_reject',
      'pending_order',
      id,
      null,
      { error: err.message },
      getClientIp(req),
      'failure'
    );

    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/email-orders/test-parse - Test email parsing (for development)
router.post('/test-parse', async (req, res) => {
  const { body, senderEmail } = req.body;

  if (!body) {
    return res.status(400).json({ success: false, error: 'Email body required' });
  }

  try {
    const result = await emailParser.parseEmailBody(body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/email-orders/simulate - Simulate email order (for testing)
router.post('/simulate', async (req, res) => {
  const { senderEmail, subject, body } = req.body;

  if (!senderEmail || !body) {
    return res.status(400).json({ success: false, error: 'senderEmail and body required' });
  }

  try {
    const result = await emailParser.processEmail({
      senderEmail,
      subject: subject || 'Test Order',
      body,
      imapMessageId: `test-${Date.now()}`
    });

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== Email Configuration Routes ====================

// GET /api/email-orders/config/status - Get email service status
router.get('/config/status', async (req, res) => {
  try {
    const status = emailService.getPollingStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/email-orders/config/imap - Save IMAP configuration
router.post('/config/imap', async (req, res) => {
  const { host, port, user, password, tls } = req.body;

  if (!host || !user || !password) {
    return res.status(400).json({ success: false, error: 'host, user, password required' });
  }

  try {
    await emailService.saveConfig('imap', {
      host,
      port: port || 993,
      user,
      password,
      tls: tls !== false ? 'true' : 'false'
    });

    res.json({ success: true, message: 'IMAP configuration saved' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/email-orders/config/smtp - Save SMTP configuration
router.post('/config/smtp', async (req, res) => {
  const { host, port, user, password, secure } = req.body;

  if (!host || !user || !password) {
    return res.status(400).json({ success: false, error: 'host, user, password required' });
  }

  try {
    await emailService.saveConfig('smtp', {
      host,
      port: port || 587,
      user,
      password,
      secure: secure ? 'true' : 'false'
    });

    res.json({ success: true, message: 'SMTP configuration saved' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/email-orders/config/test-imap - Test IMAP connection
router.post('/config/test-imap', async (req, res) => {
  try {
    const result = await emailService.testImapConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/email-orders/config/test-smtp - Test SMTP connection
router.post('/config/test-smtp', async (req, res) => {
  try {
    const result = await emailService.testSmtpConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/email-orders/polling/start - Start email polling
router.post('/polling/start', (req, res) => {
  const { intervalMinutes } = req.body;

  try {
    const result = emailService.startPolling(intervalMinutes || 5);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/email-orders/polling/stop - Stop email polling
router.post('/polling/stop', (req, res) => {
  try {
    const result = emailService.stopPolling();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/email-orders/polling/trigger - Manually trigger poll
router.post('/polling/trigger', async (req, res) => {
  try {
    const result = await emailService.pollEmails();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/email-orders/errors/:id - Delete parsing error
router.delete('/errors/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM email_parsing_errors WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json({ success: true, message: 'Error deleted' });
  });
});

module.exports = router;
