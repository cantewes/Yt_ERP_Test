const express = require('express');
const router = express.Router();
const db = require('../db');

// ==================== CUSTOMERS ====================

// GET /api/customers - Get all customers
router.get('/customers', (req, res) => {
  db.all('SELECT id, name, email, phone, address FROM customers', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    res.json({ success: true, data: rows, message: 'Customers retrieved' });
  });
});

// GET /api/customers/:id - Get single customer
router.get('/customers/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT id, name, email, phone, address FROM customers WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ success: false, error: 'Not found', message: 'Customer not found' });
    }
    res.json({ success: true, data: row, message: 'Customer retrieved' });
  });
});

// POST /api/customers - Create new customer
router.post('/customers', (req, res) => {
  const { name, email, phone, address } = req.body;

  if (!name || !email) {
    return res.status(400).json({ success: false, error: 'Missing fields', message: 'Name and email are required' });
  }

  const stmt = db.prepare('INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)');
  stmt.run([name, email, phone || null, address || null], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ success: false, error: 'Duplicate email', message: 'Email already exists' });
      }
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    res.status(201).json({ success: true, data: { id: this.lastID, name, email, phone: phone || null, address: address || null }, message: 'Customer created' });
  });
  stmt.finalize();
});

// PUT /api/customers/:id - Update customer
router.put('/customers/:id', (req, res) => {
  const { id } = req.params;
  const { name, email, phone, address } = req.body;

  db.get('SELECT * FROM customers WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ success: false, error: 'Not found', message: 'Customer not found' });
    }

    const updatedName = name || row.name;
    const updatedEmail = email || row.email;
    const updatedPhone = phone !== undefined ? phone : row.phone;
    const updatedAddress = address !== undefined ? address : row.address;

    const stmt = db.prepare('UPDATE customers SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?');
    stmt.run([updatedName, updatedEmail, updatedPhone, updatedAddress, id], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ success: false, error: 'Duplicate email', message: 'Email already exists' });
        }
        return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
      }
      res.json({ success: true, data: { id: parseInt(id), name: updatedName, email: updatedEmail, phone: updatedPhone, address: updatedAddress }, message: 'Customer updated' });
    });
    stmt.finalize();
  });
});

// DELETE /api/customers/:id - Delete customer
router.delete('/customers/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM customers WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ success: false, error: 'Not found', message: 'Customer not found' });
    }

    db.run('DELETE FROM customers WHERE id = ?', [id], (err) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
      }
      res.json({ success: true, data: null, message: 'Customer deleted' });
    });
  });
});

// ==================== ORDERS ====================

// GET /api/orders - Get all orders with items
router.get('/orders', (req, res) => {
  db.all('SELECT id, customer_id, order_date, status FROM orders', [], (err, orders) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }

    if (orders.length === 0) {
      return res.json({ success: true, data: [], message: 'Orders retrieved' });
    }

    // Get items for each order
    const orderIds = orders.map(o => o.id);
    const placeholders = orderIds.map(() => '?').join(',');

    db.all(
      `SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, p.name as product_name
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id IN (${placeholders})`,
      orderIds,
      (err, items) => {
        if (err) {
          return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
        }

        // Group items by order_id
        const itemsByOrder = {};
        items.forEach(item => {
          if (!itemsByOrder[item.order_id]) {
            itemsByOrder[item.order_id] = [];
          }
          itemsByOrder[item.order_id].push({
            id: item.id,
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity
          });
        });

        // Attach items to orders
        const ordersWithItems = orders.map(order => ({
          ...order,
          items: itemsByOrder[order.id] || []
        }));

        res.json({ success: true, data: ordersWithItems, message: 'Orders retrieved' });
      }
    );
  });
});

// GET /api/orders/:id - Get single order with items
router.get('/orders/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT id, customer_id, order_date, status FROM orders WHERE id = ?', [id], (err, order) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    if (!order) {
      return res.status(404).json({ success: false, error: 'Not found', message: 'Order not found' });
    }

    db.all(
      `SELECT oi.id, oi.product_id, oi.quantity, p.name as product_name
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [id],
      (err, items) => {
        if (err) {
          return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
        }

        res.json({
          success: true,
          data: {
            ...order,
            items: items.map(item => ({
              id: item.id,
              product_id: item.product_id,
              product_name: item.product_name,
              quantity: item.quantity
            }))
          },
          message: 'Order retrieved'
        });
      }
    );
  });
});

// POST /api/orders - Create new order WITH STOCK CHECK AND INVENTORY REDUCTION
router.post('/orders', (req, res) => {
  const { customer_id, items } = req.body;

  if (!customer_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'Missing fields', message: 'customer_id and items array are required' });
  }

  // Validate items structure
  for (const item of items) {
    if (!item.product_id || !item.quantity || item.quantity <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid item', message: 'Each item must have product_id and positive quantity' });
    }
  }

  // Check customer exists
  db.get('SELECT id FROM customers WHERE id = ?', [customer_id], (err, customer) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    if (!customer) {
      return res.status(404).json({ success: false, error: 'Not found', message: 'Customer not found' });
    }

    // Check all products exist and have sufficient stock
    const productIds = items.map(i => i.product_id);
    const placeholders = productIds.map(() => '?').join(',');

    db.all(`SELECT id, name, quantity FROM products WHERE id IN (${placeholders})`, productIds, (err, products) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
      }

      if (products.length !== productIds.length) {
        return res.status(404).json({ success: false, error: 'Not found', message: 'One or more products not found' });
      }

      // CRITICAL: Check stock for ALL items BEFORE creating order
      for (const item of items) {
        const product = products.find(p => p.id === item.product_id);
        if (product.quantity < item.quantity) {
          return res.status(400).json({
            success: false,
            error: 'Insufficient stock',
            message: `Insufficient stock for ${product.name}. Available: ${product.quantity}, requested: ${item.quantity}`
          });
        }
      }

      // All stock checks passed - create order
      const orderDate = new Date().toISOString().split('T')[0];

      db.run('INSERT INTO orders (customer_id, order_date, status) VALUES (?, ?, ?)',
        [customer_id, orderDate, 'created'],
        function(err) {
          if (err) {
            return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
          }

          const orderId = this.lastID;
          let insertedItems = [];
          let processedCount = 0;
          let hasError = false;

          // Insert order items AND reduce inventory
          items.forEach((item) => {
            const product = products.find(p => p.id === item.product_id);

            // Insert order item
            db.run('INSERT INTO order_items (order_id, product_id, quantity) VALUES (?, ?, ?)',
              [orderId, item.product_id, item.quantity],
              function(err) {
                if (err) {
                  hasError = true;
                  processedCount++;
                  checkComplete();
                  return;
                }

                const itemId = this.lastID;
                insertedItems.push({
                  id: itemId,
                  product_id: item.product_id,
                  product_name: product.name,
                  quantity: item.quantity
                });

                // CRITICAL: Reduce inventory
                db.run('UPDATE products SET quantity = quantity - ? WHERE id = ?',
                  [item.quantity, item.product_id],
                  function(err) {
                    if (err) {
                      hasError = true;
                    }
                    processedCount++;
                    checkComplete();
                  }
                );
              }
            );
          });

          function checkComplete() {
            if (processedCount === items.length) {
              if (hasError) {
                return res.status(500).json({ success: false, error: 'Insert error', message: 'Error creating order' });
              }

              res.status(201).json({
                success: true,
                data: {
                  id: orderId,
                  customer_id,
                  order_date: orderDate,
                  status: 'created',
                  items: insertedItems
                },
                message: 'Order created'
              });
            }
          }
        }
      );
    });
  });
});

// DELETE /api/orders/:id - Delete order AND RESTORE INVENTORY
router.delete('/orders/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM orders WHERE id = ?', [id], (err, order) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    if (!order) {
      return res.status(404).json({ success: false, error: 'Not found', message: 'Order not found' });
    }

    // Get order items to restore inventory
    db.all('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [id], (err, items) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
      }

      // CRITICAL: Restore inventory for each item
      let restoredCount = 0;
      let hasError = false;

      if (items.length === 0) {
        // No items to restore, just delete order
        deleteOrder();
        return;
      }

      items.forEach((item) => {
        db.run('UPDATE products SET quantity = quantity + ? WHERE id = ?',
          [item.quantity, item.product_id],
          function(err) {
            if (err) {
              hasError = true;
            }
            restoredCount++;

            if (restoredCount === items.length) {
              if (hasError) {
                return res.status(500).json({ success: false, error: 'Restore error', message: 'Error restoring inventory' });
              }
              deleteOrder();
            }
          }
        );
      });

      function deleteOrder() {
        // Delete order items first, then order
        db.run('DELETE FROM order_items WHERE order_id = ?', [id], (err) => {
          if (err) {
            return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
          }

          db.run('DELETE FROM orders WHERE id = ?', [id], (err) => {
            if (err) {
              return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
            }
            res.json({ success: true, data: null, message: 'Order deleted and inventory restored' });
          });
        });
      }
    });
  });
});

module.exports = router;
