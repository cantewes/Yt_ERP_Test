const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, requireRole, logAudit } = require('../middleware/auth');

// All accounting routes require authentication
router.use(authMiddleware);

// Helper to get client IP
function getClientIp(req) {
  return req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
}

// Generate invoice number (INV-YYYYMMDD-XXXX)
function generateInvoiceNumber() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `INV-${dateStr}-${random}`;
}

// Validate date format (YYYY-MM-DD)
function isValidDate(dateStr) {
  if (!dateStr) return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date);
}

// ==================== GET /api/accounting/invoices ====================
router.get('/invoices', (req, res) => {
  const { status, customer_id, from_date, to_date, limit = 100, offset = 0 } = req.query;

  let query = `
    SELECT i.*, o.customer_id, c.name as customer_name,
           (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.invoice_id = i.id) as paid_amount
    FROM invoices i
    JOIN orders o ON i.order_id = o.id
    JOIN customers c ON o.customer_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    query += ' AND i.status = ?';
    params.push(status);
  }

  if (customer_id) {
    query += ' AND o.customer_id = ?';
    params.push(customer_id);
  }

  if (from_date) {
    query += ' AND i.invoice_date >= ?';
    params.push(from_date);
  }

  if (to_date) {
    query += ' AND i.invoice_date <= ?';
    params.push(to_date);
  }

  query += ' ORDER BY i.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  db.all(query, params, (err, invoices) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: 'Database error'
      });
    }

    // Calculate remaining amount for each invoice
    const result = invoices.map(inv => ({
      ...inv,
      remaining_amount: inv.total_amount - inv.paid_amount
    }));

    res.json({
      success: true,
      data: result,
      message: `Retrieved ${result.length} invoices`
    });
  });
});

// ==================== GET /api/accounting/invoices/:id ====================
router.get('/invoices/:id', (req, res) => {
  const { id } = req.params;

  db.get(
    `SELECT i.*, o.customer_id, c.name as customer_name, c.email as customer_email,
            (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.invoice_id = i.id) as paid_amount
     FROM invoices i
     JOIN orders o ON i.order_id = o.id
     JOIN customers c ON o.customer_id = c.id
     WHERE i.id = ?`,
    [id],
    (err, invoice) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database error'
        });
      }

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: 'Invoice not found'
        });
      }

      // Get order items for this invoice
      db.all(
        `SELECT oi.*, p.name as product_name, p.price as unit_price
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ?`,
        [invoice.order_id],
        (itemsErr, items) => {
          if (itemsErr) {
            return res.status(500).json({
              success: false,
              error: 'Database error'
            });
          }

          // Get payments for this invoice
          db.all(
            'SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date DESC',
            [id],
            (paymentsErr, payments) => {
              if (paymentsErr) {
                return res.status(500).json({
                  success: false,
                  error: 'Database error'
                });
              }

              res.json({
                success: true,
                data: {
                  ...invoice,
                  remaining_amount: invoice.total_amount - invoice.paid_amount,
                  items: items,
                  payments: payments
                },
                message: 'Invoice retrieved'
              });
            }
          );
        }
      );
    }
  );
});

// ==================== POST /api/accounting/invoices ====================
router.post('/invoices', requireRole('admin', 'manager'), (req, res) => {
  const { order_id, due_date, notes } = req.body;

  // Validate required fields
  if (!order_id) {
    return res.status(400).json({
      success: false,
      error: 'Order ID is required'
    });
  }

  if (!due_date || !isValidDate(due_date)) {
    return res.status(400).json({
      success: false,
      error: 'Valid due date (YYYY-MM-DD) is required'
    });
  }

  // Check if order exists and doesn't already have an invoice
  db.get('SELECT * FROM orders WHERE id = ?', [order_id], (err, order) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: 'Database error'
      });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    // Check if invoice already exists for this order
    db.get('SELECT id FROM invoices WHERE order_id = ?', [order_id], (checkErr, existing) => {
      if (checkErr) {
        return res.status(500).json({
          success: false,
          error: 'Database error'
        });
      }

      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'Invoice already exists for this order'
        });
      }

      // Calculate total from order items using actual product prices
      db.all(
        `SELECT oi.quantity, p.name, p.price
         FROM order_items oi
         JOIN products p ON oi.product_id = p.id
         WHERE oi.order_id = ?`,
        [order_id],
        (itemsErr, items) => {
          if (itemsErr) {
            return res.status(500).json({
              success: false,
              error: 'Database error'
            });
          }

          if (items.length === 0) {
            return res.status(400).json({
              success: false,
              error: 'Order has no items'
            });
          }

          // Calculate total using actual product prices (fallback to 10 EUR for products without price)
          const totalAmount = items.reduce((sum, item) => sum + (item.quantity * (item.price || 10)), 0);

          const invoiceNumber = generateInvoiceNumber();
          const invoiceDate = new Date().toISOString().slice(0, 10);

          db.run(
            `INSERT INTO invoices (order_id, invoice_number, invoice_date, due_date, total_amount, status, notes, created_by)
             VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`,
            [order_id, invoiceNumber, invoiceDate, due_date, totalAmount, notes || null, req.user.id],
            function(insertErr) {
              if (insertErr) {
                return res.status(500).json({
                  success: false,
                  error: 'Failed to create invoice'
                });
              }

              const invoiceId = this.lastID;

              logAudit(
                req.user.id,
                'create',
                'invoice',
                invoiceId,
                null,
                { invoice_number: invoiceNumber, order_id, total_amount: totalAmount },
                getClientIp(req),
                'success'
              );

              res.status(201).json({
                success: true,
                data: {
                  id: invoiceId,
                  invoice_number: invoiceNumber,
                  total_amount: totalAmount
                },
                message: 'Invoice created successfully'
              });
            }
          );
        }
      );
    });
  });
});

// ==================== PUT /api/accounting/invoices/:id ====================
router.put('/invoices/:id', requireRole('admin', 'manager'), (req, res) => {
  const { id } = req.params;
  const { status, due_date, notes } = req.body;

  // Get current invoice
  db.get('SELECT * FROM invoices WHERE id = ?', [id], (err, invoice) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: 'Database error'
      });
    }

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: 'Invoice not found'
      });
    }

    // Validate status transition
    const validStatuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Validate status transitions
    const validTransitions = {
      'draft': ['sent', 'cancelled'],
      'sent': ['paid', 'overdue', 'cancelled'],
      'overdue': ['paid', 'cancelled'],
      'paid': [],
      'cancelled': []
    };

    if (status && status !== invoice.status) {
      if (!validTransitions[invoice.status].includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Cannot transition from '${invoice.status}' to '${status}'`
        });
      }
    }

    // Validate due_date if provided
    if (due_date && !isValidDate(due_date)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid due date format (YYYY-MM-DD)'
      });
    }

    // Build update query
    const updates = [];
    const params = [];
    const oldValues = {};
    const newValues = {};

    if (status && status !== invoice.status) {
      updates.push('status = ?');
      params.push(status);
      oldValues.status = invoice.status;
      newValues.status = status;
    }

    if (due_date && due_date !== invoice.due_date) {
      updates.push('due_date = ?');
      params.push(due_date);
      oldValues.due_date = invoice.due_date;
      newValues.due_date = due_date;
    }

    if (notes !== undefined && notes !== invoice.notes) {
      updates.push('notes = ?');
      params.push(notes);
      oldValues.notes = invoice.notes;
      newValues.notes = notes;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No changes provided'
      });
    }

    params.push(id);

    db.run(
      `UPDATE invoices SET ${updates.join(', ')} WHERE id = ?`,
      params,
      function(updateErr) {
        if (updateErr) {
          return res.status(500).json({
            success: false,
            error: 'Failed to update invoice'
          });
        }

        logAudit(
          req.user.id,
          'update',
          'invoice',
          id,
          oldValues,
          newValues,
          getClientIp(req),
          'success'
        );

        res.json({
          success: true,
          message: 'Invoice updated successfully'
        });
      }
    );
  });
});

// ==================== POST /api/accounting/payments ====================
router.post('/payments', requireRole('admin', 'manager'), (req, res) => {
  const { invoice_id, amount, payment_method, reference } = req.body;

  // Validate required fields
  if (!invoice_id) {
    return res.status(400).json({
      success: false,
      error: 'Invoice ID is required'
    });
  }

  if (!amount || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Valid payment amount (> 0) is required'
    });
  }

  // Get invoice and check remaining balance
  db.get(
    `SELECT i.*,
            (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.invoice_id = i.id) as paid_amount
     FROM invoices i
     WHERE i.id = ?`,
    [invoice_id],
    (err, invoice) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database error'
        });
      }

      if (!invoice) {
        return res.status(404).json({
          success: false,
          error: 'Invoice not found'
        });
      }

      // Check if invoice can accept payments
      if (['cancelled', 'paid'].includes(invoice.status)) {
        return res.status(400).json({
          success: false,
          error: `Cannot add payment to ${invoice.status} invoice`
        });
      }

      const remainingAmount = invoice.total_amount - invoice.paid_amount;

      if (amount > remainingAmount) {
        return res.status(400).json({
          success: false,
          error: `Payment amount (${amount}) exceeds remaining balance (${remainingAmount})`
        });
      }

      const paymentDate = new Date().toISOString().slice(0, 10);

      db.run(
        `INSERT INTO payments (invoice_id, payment_date, amount, payment_method, reference)
         VALUES (?, ?, ?, ?, ?)`,
        [invoice_id, paymentDate, amount, payment_method || null, reference || null],
        function(insertErr) {
          if (insertErr) {
            return res.status(500).json({
              success: false,
              error: 'Failed to record payment'
            });
          }

          const paymentId = this.lastID;
          const newPaidAmount = invoice.paid_amount + amount;

          // Update invoice status if fully paid
          if (newPaidAmount >= invoice.total_amount) {
            db.run('UPDATE invoices SET status = ? WHERE id = ?', ['paid', invoice_id]);
          }

          logAudit(
            req.user.id,
            'create',
            'payment',
            paymentId,
            null,
            { invoice_id, amount, payment_method },
            getClientIp(req),
            'success'
          );

          res.status(201).json({
            success: true,
            data: {
              id: paymentId,
              invoice_id: invoice_id,
              amount: amount,
              remaining_balance: invoice.total_amount - newPaidAmount
            },
            message: 'Payment recorded successfully'
          });
        }
      );
    }
  );
});

// ==================== GET /api/accounting/summary ====================
router.get('/summary', (req, res) => {
  const { from_date, to_date } = req.query;

  let dateFilter = '';
  const params = [];

  if (from_date && to_date) {
    dateFilter = 'AND i.invoice_date BETWEEN ? AND ?';
    params.push(from_date, to_date);
  }

  // Get invoice summary
  db.get(
    `SELECT
       COUNT(*) as total_invoices,
       COALESCE(SUM(total_amount), 0) as total_invoiced,
       COALESCE(SUM(CASE WHEN status = 'draft' THEN total_amount ELSE 0 END), 0) as draft_amount,
       COALESCE(SUM(CASE WHEN status = 'sent' THEN total_amount ELSE 0 END), 0) as sent_amount,
       COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0) as paid_amount,
       COALESCE(SUM(CASE WHEN status = 'overdue' THEN total_amount ELSE 0 END), 0) as overdue_amount,
       COALESCE(SUM(CASE WHEN status = 'cancelled' THEN total_amount ELSE 0 END), 0) as cancelled_amount,
       COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_count,
       COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
       COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
       COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdue_count,
       COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count
     FROM invoices i
     WHERE 1=1 ${dateFilter}`,
    params,
    (err, invoiceSummary) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database error'
        });
      }

      // Get payment summary
      let paymentDateFilter = '';
      const paymentParams = [];

      if (from_date && to_date) {
        paymentDateFilter = 'WHERE p.payment_date BETWEEN ? AND ?';
        paymentParams.push(from_date, to_date);
      }

      db.get(
        `SELECT
           COUNT(*) as total_payments,
           COALESCE(SUM(amount), 0) as total_received
         FROM payments p
         ${paymentDateFilter}`,
        paymentParams,
        (paymentErr, paymentSummary) => {
          if (paymentErr) {
            return res.status(500).json({
              success: false,
              error: 'Database error'
            });
          }

          // Get outstanding balance (sent + overdue invoices minus their payments)
          db.get(
            `SELECT
               COALESCE(SUM(i.total_amount), 0) - COALESCE(SUM(paid.amount), 0) as outstanding_balance
             FROM invoices i
             LEFT JOIN (
               SELECT invoice_id, SUM(amount) as amount
               FROM payments
               GROUP BY invoice_id
             ) paid ON i.id = paid.invoice_id
             WHERE i.status IN ('sent', 'overdue')`,
            [],
            (outstandingErr, outstanding) => {
              if (outstandingErr) {
                return res.status(500).json({
                  success: false,
                  error: 'Database error'
                });
              }

              res.json({
                success: true,
                data: {
                  invoices: {
                    total_count: invoiceSummary.total_invoices,
                    total_amount: invoiceSummary.total_invoiced,
                    by_status: {
                      draft: { count: invoiceSummary.draft_count, amount: invoiceSummary.draft_amount },
                      sent: { count: invoiceSummary.sent_count, amount: invoiceSummary.sent_amount },
                      paid: { count: invoiceSummary.paid_count, amount: invoiceSummary.paid_amount },
                      overdue: { count: invoiceSummary.overdue_count, amount: invoiceSummary.overdue_amount },
                      cancelled: { count: invoiceSummary.cancelled_count, amount: invoiceSummary.cancelled_amount }
                    }
                  },
                  payments: {
                    total_count: paymentSummary.total_payments,
                    total_received: paymentSummary.total_received
                  },
                  outstanding_balance: outstanding.outstanding_balance || 0
                },
                message: 'Financial summary retrieved'
              });
            }
          );
        }
      );
    }
  );
});

module.exports = router;
