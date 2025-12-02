const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, requireRole, logAudit } = require('../middleware/auth');

// Helper to get client IP
function getClientIp(req) {
  return req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || 'unknown';
}

// Generate PO number: PO-YYYYMM-NNNN
function generatePONumber(callback) {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `PO-${yearMonth}-`;

  db.get(
    "SELECT po_number FROM purchase_orders WHERE po_number LIKE ? ORDER BY po_number DESC LIMIT 1",
    [`${prefix}%`],
    (err, row) => {
      if (err) {
        return callback(err, null);
      }

      let nextNum = 1;
      if (row) {
        const lastNum = parseInt(row.po_number.split('-')[2], 10);
        nextNum = lastNum + 1;
      }

      callback(null, `${prefix}${String(nextNum).padStart(4, '0')}`);
    }
  );
}

// Generate GRN number: GRN-YYYY-MM-NNNN
function generateGRNNumber(callback) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `GRN-${year}-${month}-`;

  db.get(
    "SELECT grn_number FROM purchase_order_receipts WHERE grn_number LIKE ? ORDER BY grn_number DESC LIMIT 1",
    [`${prefix}%`],
    (err, row) => {
      if (err) {
        return callback(err, null);
      }

      let nextNum = 1;
      if (row) {
        const lastNum = parseInt(row.grn_number.split('-')[3], 10);
        nextNum = lastNum + 1;
      }

      callback(null, `${prefix}${String(nextNum).padStart(4, '0')}`);
    }
  );
}

// GET all purchase orders
router.get('/', authMiddleware, (req, res) => {
  const { status, supplier_id, from_date, to_date } = req.query;

  let sql = `
    SELECT po.*, s.name as supplier_name
    FROM purchase_orders po
    LEFT JOIN suppliers s ON po.supplier_id = s.id
    WHERE 1=1
  `;
  const params = [];

  if (status) {
    sql += ' AND po.status = ?';
    params.push(status);
  }

  if (supplier_id) {
    sql += ' AND po.supplier_id = ?';
    params.push(supplier_id);
  }

  if (from_date) {
    sql += ' AND po.order_date >= ?';
    params.push(from_date);
  }

  if (to_date) {
    sql += ' AND po.order_date <= ?';
    params.push(to_date);
  }

  sql += ' ORDER BY po.created_at DESC';

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Error fetching purchase orders:', err);
      return res.status(500).json({ error: 'Failed to fetch purchase orders' });
    }
    res.json(rows);
  });
});

// GET single purchase order with items
router.get('/:id', authMiddleware, (req, res) => {
  const { id } = req.params;

  db.get(
    `SELECT po.*, s.name as supplier_name, s.email as supplier_email
     FROM purchase_orders po
     LEFT JOIN suppliers s ON po.supplier_id = s.id
     WHERE po.id = ?`,
    [id],
    (err, order) => {
      if (err) {
        console.error('Error fetching purchase order:', err);
        return res.status(500).json({ error: 'Failed to fetch purchase order' });
      }
      if (!order) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      // Get order items
      db.all(
        `SELECT poi.*, p.name as product_name, p.category as product_category
         FROM purchase_order_items poi
         LEFT JOIN products p ON poi.product_id = p.id
         WHERE poi.purchase_order_id = ?`,
        [id],
        (err, items) => {
          if (err) {
            console.error('Error fetching purchase order items:', err);
            return res.status(500).json({ error: 'Failed to fetch purchase order items' });
          }

          res.json({ ...order, items });
        }
      );
    }
  );
});

// GET purchase order receipts (GRN)
router.get('/:id/receipts', authMiddleware, (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT por.*, poi.product_id, p.name as product_name, u.username as received_by_name
    FROM purchase_order_receipts por
    LEFT JOIN purchase_order_items poi ON por.purchase_order_item_id = poi.id
    LEFT JOIN products p ON poi.product_id = p.id
    LEFT JOIN users u ON por.received_by = u.id
    WHERE por.purchase_order_id = ?
    ORDER BY por.receipt_date DESC
  `;

  db.all(sql, [id], (err, rows) => {
    if (err) {
      console.error('Error fetching receipts:', err);
      return res.status(500).json({ error: 'Failed to fetch receipts' });
    }
    res.json(rows);
  });
});

// POST create new purchase order
router.post('/', authMiddleware, requireRole('manager', 'admin'), (req, res) => {
  const { supplier_id, expected_delivery, notes, items } = req.body;

  if (!supplier_id) {
    return res.status(400).json({ error: 'Supplier is required' });
  }

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required' });
  }

  // Validate items
  for (const item of items) {
    if (!item.product_id || !item.quantity || !item.unit_price) {
      return res.status(400).json({ error: 'Each item must have product_id, quantity, and unit_price' });
    }
  }

  generatePONumber((err, poNumber) => {
    if (err) {
      console.error('Error generating PO number:', err);
      return res.status(500).json({ error: 'Failed to generate PO number' });
    }

    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

    const sql = `
      INSERT INTO purchase_orders (po_number, supplier_id, status, order_date, expected_delivery, total_amount, notes, created_by)
      VALUES (?, ?, 'draft', CURRENT_DATE, ?, ?, ?, ?)
    `;

    db.run(sql, [poNumber, supplier_id, expected_delivery, totalAmount, notes, req.user?.id], function(err) {
      if (err) {
        console.error('Error creating purchase order:', err);
        return res.status(500).json({ error: 'Failed to create purchase order' });
      }

      const poId = this.lastID;

      // Insert items
      const itemSql = `
        INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity_ordered, unit_price, total_price)
        VALUES (?, ?, ?, ?, ?)
      `;

      let itemsInserted = 0;
      for (const item of items) {
        const totalPrice = item.quantity * item.unit_price;
        db.run(itemSql, [poId, item.product_id, item.quantity, item.unit_price, totalPrice], (err) => {
          if (err) {
            console.error('Error inserting PO item:', err);
          }
          itemsInserted++;
          if (itemsInserted === items.length) {
            // Log audit
            logAudit(
              req.user?.id,
              'CREATE_PURCHASE_ORDER',
              'purchase_orders',
              poId,
              null,
              JSON.stringify({ po_number: poNumber, supplier_id, total_amount: totalAmount, items_count: items.length }),
              getClientIp(req),
              'success'
            );

            res.status(201).json({
              id: poId,
              po_number: poNumber,
              message: 'Purchase order created successfully'
            });
          }
        });
      }
    });
  });
});

// PUT update purchase order (only draft orders)
router.put('/:id', authMiddleware, requireRole('manager', 'admin'), (req, res) => {
  const { id } = req.params;
  const { supplier_id, expected_delivery, notes, items } = req.body;

  // First check if order is in draft status
  db.get('SELECT * FROM purchase_orders WHERE id = ?', [id], (err, order) => {
    if (err) {
      console.error('Error fetching purchase order:', err);
      return res.status(500).json({ error: 'Failed to update purchase order' });
    }
    if (!order) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    if (order.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft orders can be edited' });
    }

    const totalAmount = items ? items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0) : order.total_amount;

    const sql = `
      UPDATE purchase_orders
      SET supplier_id = ?, expected_delivery = ?, notes = ?, total_amount = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    db.run(sql, [supplier_id || order.supplier_id, expected_delivery, notes, totalAmount, id], function(err) {
      if (err) {
        console.error('Error updating purchase order:', err);
        return res.status(500).json({ error: 'Failed to update purchase order' });
      }

      // If items provided, update them
      if (items && items.length > 0) {
        // Delete existing items
        db.run('DELETE FROM purchase_order_items WHERE purchase_order_id = ?', [id], (err) => {
          if (err) {
            console.error('Error deleting old items:', err);
          }

          // Insert new items
          const itemSql = `
            INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity_ordered, unit_price, total_price)
            VALUES (?, ?, ?, ?, ?)
          `;

          let itemsInserted = 0;
          for (const item of items) {
            const totalPrice = item.quantity * item.unit_price;
            db.run(itemSql, [id, item.product_id, item.quantity, item.unit_price, totalPrice], (err) => {
              if (err) {
                console.error('Error inserting PO item:', err);
              }
              itemsInserted++;
              if (itemsInserted === items.length) {
                // Log version
                logVersion(id, req.user?.id, 'UPDATE', order, { supplier_id, expected_delivery, notes, items });

                logAudit(
                  req.user?.id,
                  'UPDATE_PURCHASE_ORDER',
                  'purchase_orders',
                  id,
                  JSON.stringify(order),
                  JSON.stringify({ supplier_id, expected_delivery, notes, total_amount: totalAmount }),
                  getClientIp(req),
                  'success'
                );

                res.json({ message: 'Purchase order updated successfully' });
              }
            });
          }
        });
      } else {
        logAudit(
          req.user?.id,
          'UPDATE_PURCHASE_ORDER',
          'purchase_orders',
          id,
          JSON.stringify(order),
          JSON.stringify({ supplier_id, expected_delivery, notes }),
          getClientIp(req),
          'success'
        );

        res.json({ message: 'Purchase order updated successfully' });
      }
    });
  });
});

// Log version changes
function logVersion(poId, userId, changeType, oldValues, newValues) {
  db.get(
    'SELECT COALESCE(MAX(version_number), 0) + 1 as next_version FROM purchase_order_versions WHERE purchase_order_id = ?',
    [poId],
    (err, row) => {
      if (err) {
        console.error('Error getting version number:', err);
        return;
      }

      db.run(
        `INSERT INTO purchase_order_versions (purchase_order_id, version_number, changed_by, change_type, old_values, new_values)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [poId, row.next_version, userId, changeType, JSON.stringify(oldValues), JSON.stringify(newValues)],
        (err) => {
          if (err) {
            console.error('Error logging version:', err);
          }
        }
      );
    }
  );
}

// POST send purchase order (change status to sent)
router.post('/:id/send', authMiddleware, requireRole('manager', 'admin'), (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM purchase_orders WHERE id = ?', [id], (err, order) => {
    if (err) {
      console.error('Error fetching purchase order:', err);
      return res.status(500).json({ error: 'Failed to send purchase order' });
    }
    if (!order) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    if (order.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft orders can be sent' });
    }

    db.run(
      'UPDATE purchase_orders SET status = ?, order_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['sent', id],
      function(err) {
        if (err) {
          console.error('Error sending purchase order:', err);
          return res.status(500).json({ error: 'Failed to send purchase order' });
        }

        logVersion(id, req.user?.id, 'STATUS_CHANGE', { status: 'draft' }, { status: 'sent' });

        logAudit(
          req.user?.id,
          'SEND_PURCHASE_ORDER',
          'purchase_orders',
          id,
          JSON.stringify({ status: 'draft' }),
          JSON.stringify({ status: 'sent' }),
          getClientIp(req),
          'success'
        );

        res.json({ message: 'Purchase order sent successfully' });
      }
    );
  });
});

// POST confirm purchase order (supplier confirmed)
router.post('/:id/confirm', authMiddleware, requireRole('manager', 'admin'), (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM purchase_orders WHERE id = ?', [id], (err, order) => {
    if (err) {
      console.error('Error fetching purchase order:', err);
      return res.status(500).json({ error: 'Failed to confirm purchase order' });
    }
    if (!order) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    if (order.status !== 'sent') {
      return res.status(400).json({ error: 'Only sent orders can be confirmed' });
    }

    db.run(
      'UPDATE purchase_orders SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['confirmed', req.user?.id, id],
      function(err) {
        if (err) {
          console.error('Error confirming purchase order:', err);
          return res.status(500).json({ error: 'Failed to confirm purchase order' });
        }

        logVersion(id, req.user?.id, 'STATUS_CHANGE', { status: 'sent' }, { status: 'confirmed' });

        logAudit(
          req.user?.id,
          'CONFIRM_PURCHASE_ORDER',
          'purchase_orders',
          id,
          JSON.stringify({ status: 'sent' }),
          JSON.stringify({ status: 'confirmed' }),
          getClientIp(req),
          'success'
        );

        res.json({ message: 'Purchase order confirmed successfully' });
      }
    );
  });
});

// POST receive items (partial or full delivery)
router.post('/:id/receive', authMiddleware, requireRole('manager', 'admin'), (req, res) => {
  const { id } = req.params;
  const { items, quality_notes } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Items to receive are required' });
  }

  db.get('SELECT * FROM purchase_orders WHERE id = ?', [id], (err, order) => {
    if (err) {
      console.error('Error fetching purchase order:', err);
      return res.status(500).json({ error: 'Failed to receive items' });
    }
    if (!order) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    if (!['confirmed', 'partially_received'].includes(order.status)) {
      return res.status(400).json({ error: 'Order must be confirmed before receiving items' });
    }

    generateGRNNumber((err, grnNumber) => {
      if (err) {
        console.error('Error generating GRN number:', err);
        return res.status(500).json({ error: 'Failed to generate GRN number' });
      }

      let processedItems = 0;
      let totalDefects = 0;
      let totalReceived = 0;

      for (const item of items) {
        // Get the PO item
        db.get(
          'SELECT * FROM purchase_order_items WHERE id = ? AND purchase_order_id = ?',
          [item.purchase_order_item_id, id],
          (err, poItem) => {
            if (err || !poItem) {
              console.error('Error fetching PO item:', err);
              processedItems++;
              return;
            }

            const qualityStatus = item.quality_status || 'accepted';
            if (qualityStatus === 'defective') {
              totalDefects += item.quantity_received;
            }
            totalReceived += item.quantity_received;

            // Create receipt (GRN)
            db.run(
              `INSERT INTO purchase_order_receipts (grn_number, purchase_order_id, purchase_order_item_id, quantity_received, received_by, quality_status, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [grnNumber, id, item.purchase_order_item_id, item.quantity_received, req.user?.id, qualityStatus, item.notes || quality_notes],
              (err) => {
                if (err) {
                  console.error('Error creating receipt:', err);
                }

                // Update PO item quantity received
                db.run(
                  'UPDATE purchase_order_items SET quantity_received = quantity_received + ? WHERE id = ?',
                  [item.quantity_received, item.purchase_order_item_id],
                  (err) => {
                    if (err) {
                      console.error('Error updating PO item:', err);
                    }

                    // Update product inventory if accepted
                    if (qualityStatus === 'accepted') {
                      db.run(
                        'UPDATE products SET quantity = quantity + ? WHERE id = ?',
                        [item.quantity_received, poItem.product_id],
                        (err) => {
                          if (err) {
                            console.error('Error updating inventory:', err);
                          }
                        }
                      );
                    }

                    processedItems++;

                    if (processedItems === items.length) {
                      // Check if all items are fully received
                      db.get(
                        `SELECT
                          SUM(quantity_ordered) as total_ordered,
                          SUM(quantity_received) as total_received
                         FROM purchase_order_items WHERE purchase_order_id = ?`,
                        [id],
                        (err, totals) => {
                          if (err) {
                            console.error('Error checking totals:', err);
                          }

                          const newStatus = totals && totals.total_received >= totals.total_ordered
                            ? 'received'
                            : 'partially_received';

                          const actualDelivery = newStatus === 'received' ? 'CURRENT_DATE' : null;

                          db.run(
                            `UPDATE purchase_orders SET status = ?, actual_delivery = ${actualDelivery ? 'CURRENT_DATE' : 'actual_delivery'}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                            [newStatus, id],
                            (err) => {
                              if (err) {
                                console.error('Error updating PO status:', err);
                              }

                              // Record supplier performance when fully received
                              if (newStatus === 'received') {
                                const onTime = new Date() <= new Date(order.expected_delivery) ? 1 : 0;
                                db.run(
                                  `INSERT INTO supplier_performance (supplier_id, purchase_order_id, on_time_delivery, defect_count, total_items)
                                   VALUES (?, ?, ?, ?, ?)`,
                                  [order.supplier_id, id, onTime, totalDefects, totalReceived],
                                  (err) => {
                                    if (err) {
                                      console.error('Error recording performance:', err);
                                    }
                                  }
                                );
                              }

                              logAudit(
                                req.user?.id,
                                'RECEIVE_ITEMS',
                                'purchase_orders',
                                id,
                                JSON.stringify({ status: order.status }),
                                JSON.stringify({ status: newStatus, grn_number: grnNumber, items_received: items.length }),
                                getClientIp(req),
                                'success'
                              );

                              res.json({
                                message: 'Items received successfully',
                                grn_number: grnNumber,
                                new_status: newStatus
                              });
                            }
                          );
                        }
                      );
                    }
                  }
                );
              }
            );
          }
        );
      }
    });
  });
});

// POST cancel purchase order
router.post('/:id/cancel', authMiddleware, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  db.get('SELECT * FROM purchase_orders WHERE id = ?', [id], (err, order) => {
    if (err) {
      console.error('Error fetching purchase order:', err);
      return res.status(500).json({ error: 'Failed to cancel purchase order' });
    }
    if (!order) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }
    if (order.status === 'received') {
      return res.status(400).json({ error: 'Cannot cancel a completed order' });
    }

    db.run(
      'UPDATE purchase_orders SET status = ?, notes = COALESCE(notes, \'\') || ? || ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['cancelled', '\n[CANCELLED] ', reason || 'No reason provided', id],
      function(err) {
        if (err) {
          console.error('Error cancelling purchase order:', err);
          return res.status(500).json({ error: 'Failed to cancel purchase order' });
        }

        logVersion(id, req.user?.id, 'STATUS_CHANGE', { status: order.status }, { status: 'cancelled', reason });

        logAudit(
          req.user?.id,
          'CANCEL_PURCHASE_ORDER',
          'purchase_orders',
          id,
          JSON.stringify({ status: order.status }),
          JSON.stringify({ status: 'cancelled', reason }),
          getClientIp(req),
          'success'
        );

        res.json({ message: 'Purchase order cancelled successfully' });
      }
    );
  });
});

// GET purchase order version history
router.get('/:id/history', authMiddleware, (req, res) => {
  const { id } = req.params;

  const sql = `
    SELECT pov.*, u.username as changed_by_name
    FROM purchase_order_versions pov
    LEFT JOIN users u ON pov.changed_by = u.id
    WHERE pov.purchase_order_id = ?
    ORDER BY pov.version_number DESC
  `;

  db.all(sql, [id], (err, rows) => {
    if (err) {
      console.error('Error fetching version history:', err);
      return res.status(500).json({ error: 'Failed to fetch version history' });
    }
    res.json(rows);
  });
});

// GET reconciliation report
router.get('/reports/reconciliation', authMiddleware, (req, res) => {
  const { from_date, to_date, supplier_id } = req.query;

  let sql = `
    SELECT
      po.id,
      po.po_number,
      po.status,
      po.order_date,
      po.expected_delivery,
      po.actual_delivery,
      po.total_amount,
      s.name as supplier_name,
      SUM(poi.quantity_ordered) as total_ordered,
      SUM(poi.quantity_received) as total_received,
      SUM(poi.quantity_ordered) - SUM(poi.quantity_received) as pending_quantity,
      CASE
        WHEN po.actual_delivery IS NOT NULL AND po.actual_delivery <= po.expected_delivery THEN 'On Time'
        WHEN po.actual_delivery IS NOT NULL AND po.actual_delivery > po.expected_delivery THEN 'Late'
        ELSE 'Pending'
      END as delivery_status
    FROM purchase_orders po
    LEFT JOIN suppliers s ON po.supplier_id = s.id
    LEFT JOIN purchase_order_items poi ON po.id = poi.purchase_order_id
    WHERE po.status != 'draft' AND po.status != 'cancelled'
  `;

  const params = [];

  if (from_date) {
    sql += ' AND po.order_date >= ?';
    params.push(from_date);
  }

  if (to_date) {
    sql += ' AND po.order_date <= ?';
    params.push(to_date);
  }

  if (supplier_id) {
    sql += ' AND po.supplier_id = ?';
    params.push(supplier_id);
  }

  sql += ' GROUP BY po.id ORDER BY po.order_date DESC';

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('Error fetching reconciliation report:', err);
      return res.status(500).json({ error: 'Failed to fetch reconciliation report' });
    }
    res.json(rows);
  });
});

// GET low stock alerts (products below reorder level)
router.get('/reports/low-stock', authMiddleware, (req, res) => {
  const sql = `
    SELECT
      p.id,
      p.name,
      p.category,
      p.quantity as current_stock,
      p.reorder_level,
      p.reorder_level - p.quantity as shortage,
      s.id as preferred_supplier_id,
      s.name as preferred_supplier_name
    FROM products p
    LEFT JOIN suppliers s ON p.preferred_supplier_id = s.id
    WHERE p.quantity <= p.reorder_level
    ORDER BY (p.reorder_level - p.quantity) DESC
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('Error fetching low stock alerts:', err);
      return res.status(500).json({ error: 'Failed to fetch low stock alerts' });
    }
    res.json(rows);
  });
});

module.exports = router;
