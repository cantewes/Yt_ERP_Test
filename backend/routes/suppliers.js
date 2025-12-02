const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, requireRole, logAudit } = require('../middleware/auth');

// Helper to get client IP
function getClientIp(req) {
  return req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || 'unknown';
}

// GET all suppliers
router.get('/', authMiddleware, (req, res) => {
  const { status, search } = req.query;

  let sql = 'SELECT * FROM suppliers WHERE 1=1';
  const params = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  if (search) {
    sql += ' AND (name LIKE ? OR email LIKE ? OR contact_person LIKE ?)';
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  sql += ' ORDER BY name ASC';

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Error fetching suppliers:', err);
      return res.status(500).json({ error: 'Failed to fetch suppliers' });
    }
    res.json(rows);
  });
});

// GET all supplier performance rankings (must be before /:id route)
router.get('/reports/performance', authMiddleware, (req, res) => {
  const sql = `
    SELECT
      s.id,
      s.name,
      s.status,
      COUNT(DISTINCT po.id) as total_orders,
      ROUND(
        CASE
          WHEN COUNT(sp.id) > 0
          THEN (SUM(CASE WHEN sp.on_time_delivery = 1 THEN 1.0 ELSE 0 END) / COUNT(sp.id)) * 100
          ELSE 0
        END, 1
      ) as on_time_percentage,
      ROUND(AVG(sp.quality_rating), 1) as avg_quality_rating,
      ROUND(
        CASE
          WHEN SUM(sp.total_items) > 0
          THEN (CAST(SUM(sp.defect_count) AS REAL) / SUM(sp.total_items)) * 100
          ELSE 0
        END, 2
      ) as defect_rate,
      SUM(po.total_amount) as total_spend
    FROM suppliers s
    LEFT JOIN purchase_orders po ON s.id = po.supplier_id
    LEFT JOIN supplier_performance sp ON s.id = sp.supplier_id
    WHERE s.status = 'active'
    GROUP BY s.id
    ORDER BY on_time_percentage DESC, avg_quality_rating DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('Error fetching supplier performance:', err);
      return res.status(500).json({ error: 'Failed to fetch supplier performance' });
    }
    res.json(rows);
  });
});

// GET single supplier by ID
router.get('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM suppliers WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Error fetching supplier:', err);
      return res.status(500).json({ error: 'Failed to fetch supplier' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    res.json(row);
  });
});

// GET supplier performance metrics
router.get('/:id/performance', authMiddleware, (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT
      s.id,
      s.name,
      COUNT(DISTINCT po.id) as total_orders,
      SUM(CASE WHEN sp.on_time_delivery = 1 THEN 1 ELSE 0 END) as on_time_deliveries,
      ROUND(AVG(sp.quality_rating), 1) as avg_quality_rating,
      SUM(sp.defect_count) as total_defects,
      SUM(sp.total_items) as total_items_ordered,
      ROUND(
        CASE
          WHEN COUNT(sp.id) > 0
          THEN (SUM(CASE WHEN sp.on_time_delivery = 1 THEN 1.0 ELSE 0 END) / COUNT(sp.id)) * 100
          ELSE 0
        END, 1
      ) as on_time_percentage,
      ROUND(
        CASE
          WHEN SUM(sp.total_items) > 0
          THEN (CAST(SUM(sp.defect_count) AS REAL) / SUM(sp.total_items)) * 100
          ELSE 0
        END, 2
      ) as defect_rate
    FROM suppliers s
    LEFT JOIN purchase_orders po ON s.id = po.supplier_id
    LEFT JOIN supplier_performance sp ON s.id = sp.supplier_id
    WHERE s.id = ?
    GROUP BY s.id
  `;

  db.get(sql, [id], (err, row) => {
    if (err) {
      console.error('Error fetching supplier performance:', err);
      return res.status(500).json({ error: 'Failed to fetch supplier performance' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    res.json(row);
  });
});

// POST create new supplier
router.post('/', authMiddleware, requireRole('manager', 'admin'), (req, res) => {
  const { name, email, phone, address, contact_person, payment_terms, notes } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Supplier name is required' });
  }

  const sql = `
    INSERT INTO suppliers (name, email, phone, address, contact_person, payment_terms, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [name, email, phone, address, contact_person, payment_terms || 'NET30', notes], function(err) {
    if (err) {
      console.error('Error creating supplier:', err);
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Supplier with this email already exists' });
      }
      return res.status(500).json({ error: 'Failed to create supplier' });
    }

    const supplierId = this.lastID;

    // Log audit
    logAudit(
      req.user?.id,
      'CREATE_SUPPLIER',
      'suppliers',
      supplierId,
      null,
      JSON.stringify({ name, email, phone, address, contact_person, payment_terms }),
      getClientIp(req),
      'success'
    );

    res.status(201).json({
      id: supplierId,
      message: 'Supplier created successfully'
    });
  });
});

// PUT update supplier
router.put('/:id', authMiddleware, requireRole('manager', 'admin'), (req, res) => {
  const { id } = req.params;
  const { name, email, phone, address, contact_person, payment_terms, status, notes } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Supplier name is required' });
  }

  // First get current values for audit
  db.get('SELECT * FROM suppliers WHERE id = ?', [id], (err, oldSupplier) => {
    if (err) {
      console.error('Error fetching supplier:', err);
      return res.status(500).json({ error: 'Failed to update supplier' });
    }
    if (!oldSupplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const sql = `
      UPDATE suppliers
      SET name = ?, email = ?, phone = ?, address = ?, contact_person = ?,
          payment_terms = ?, status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    db.run(sql, [name, email, phone, address, contact_person, payment_terms, status || 'active', notes, id], function(err) {
      if (err) {
        console.error('Error updating supplier:', err);
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Supplier with this email already exists' });
        }
        return res.status(500).json({ error: 'Failed to update supplier' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Supplier not found' });
      }

      // Log audit
      logAudit(
        req.user?.id,
        'UPDATE_SUPPLIER',
        'suppliers',
        id,
        JSON.stringify(oldSupplier),
        JSON.stringify({ name, email, phone, address, contact_person, payment_terms, status, notes }),
        getClientIp(req),
        'success'
      );

      res.json({ message: 'Supplier updated successfully' });
    });
  });
});

// DELETE supplier (soft delete - set status to inactive)
router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  const { id } = req.params;

  // Check if supplier has active purchase orders
  db.get(
    "SELECT COUNT(*) as count FROM purchase_orders WHERE supplier_id = ? AND status NOT IN ('received', 'cancelled')",
    [id],
    (err, result) => {
      if (err) {
        console.error('Error checking purchase orders:', err);
        return res.status(500).json({ error: 'Failed to delete supplier' });
      }

      if (result.count > 0) {
        return res.status(400).json({
          error: 'Cannot delete supplier with active purchase orders'
        });
      }

      // Soft delete - set status to inactive
      db.run(
        'UPDATE suppliers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['inactive', id],
        function(err) {
          if (err) {
            console.error('Error deleting supplier:', err);
            return res.status(500).json({ error: 'Failed to delete supplier' });
          }

          if (this.changes === 0) {
            return res.status(404).json({ error: 'Supplier not found' });
          }

          // Log audit
          logAudit(
            req.user?.id,
            'DELETE_SUPPLIER',
            'suppliers',
            id,
            null,
            JSON.stringify({ status: 'inactive' }),
            getClientIp(req),
            'success'
          );

          res.json({ message: 'Supplier deactivated successfully' });
        }
      );
    }
  );
});

module.exports = router;
