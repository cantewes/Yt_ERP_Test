const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/products - Get all products
router.get('/', (req, res) => {
  db.all('SELECT id, name, category, quantity FROM products', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    res.json({ success: true, data: rows, message: 'Products retrieved' });
  });
});

// POST /api/products - Create new product
router.post('/', (req, res) => {
  const { name, category, quantity } = req.body;

  if (!name || !category || quantity === undefined) {
    return res.status(400).json({ success: false, error: 'Missing fields', message: 'Name, category and quantity are required' });
  }

  if (typeof quantity !== 'number' || quantity < 0) {
    return res.status(400).json({ success: false, error: 'Invalid quantity', message: 'Quantity must be a non-negative number' });
  }

  const stmt = db.prepare('INSERT INTO products (name, category, quantity) VALUES (?, ?, ?)');
  stmt.run([name, category, quantity], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ success: false, error: 'Duplicate name', message: 'Product name already exists' });
      }
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    res.status(201).json({ success: true, data: { id: this.lastID, name, category, quantity }, message: 'Product created' });
  });
  stmt.finalize();
});

// PUT /api/products/:id - Update product
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, category, quantity } = req.body;

  if (quantity !== undefined && (typeof quantity !== 'number' || quantity < 0)) {
    return res.status(400).json({ success: false, error: 'Invalid quantity', message: 'Quantity must be a non-negative number' });
  }

  db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ success: false, error: 'Not found', message: 'Product not found' });
    }

    const updatedName = name || row.name;
    const updatedCategory = category || row.category;
    const updatedQuantity = quantity !== undefined ? quantity : row.quantity;

    const stmt = db.prepare('UPDATE products SET name = ?, category = ?, quantity = ? WHERE id = ?');
    stmt.run([updatedName, updatedCategory, updatedQuantity, id], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ success: false, error: 'Duplicate name', message: 'Product name already exists' });
        }
        return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
      }
      res.json({ success: true, data: { id: parseInt(id), name: updatedName, category: updatedCategory, quantity: updatedQuantity }, message: 'Product updated' });
    });
    stmt.finalize();
  });
});

// DELETE /api/products/:id - Delete product
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ success: false, error: 'Not found', message: 'Product not found' });
    }

    const stmt = db.prepare('DELETE FROM products WHERE id = ?');
    stmt.run([id], function(err) {
      if (err) {
        return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
      }
      res.json({ success: true, data: null, message: 'Product deleted' });
    });
    stmt.finalize();
  });
});

module.exports = router;
