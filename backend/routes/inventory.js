const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/products - Get all products
router.get('/', (req, res) => {
  db.all('SELECT id, name, category, quantity, price FROM products', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    res.json({ success: true, data: rows, message: 'Products retrieved' });
  });
});

// POST /api/products - Create new product
router.post('/', (req, res) => {
  const { name, category, quantity, price } = req.body;

  if (!name || !category || quantity === undefined) {
    return res.status(400).json({ success: false, error: 'Missing fields', message: 'Name, category and quantity are required' });
  }

  if (typeof quantity !== 'number' || quantity < 0) {
    return res.status(400).json({ success: false, error: 'Invalid quantity', message: 'Quantity must be a non-negative number' });
  }

  const productPrice = (typeof price === 'number' && price >= 0) ? price : 0;

  const stmt = db.prepare('INSERT INTO products (name, category, quantity, price) VALUES (?, ?, ?, ?)');
  stmt.run([name, category, quantity, productPrice], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ success: false, error: 'Duplicate name', message: 'Product name already exists' });
      }
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    res.status(201).json({ success: true, data: { id: this.lastID, name, category, quantity, price: productPrice }, message: 'Product created' });
  });
  stmt.finalize();
});

// PUT /api/products/:id - Update product
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, category, quantity, price } = req.body;

  if (quantity !== undefined && (typeof quantity !== 'number' || quantity < 0)) {
    return res.status(400).json({ success: false, error: 'Invalid quantity', message: 'Quantity must be a non-negative number' });
  }

  if (price !== undefined && (typeof price !== 'number' || price < 0)) {
    return res.status(400).json({ success: false, error: 'Invalid price', message: 'Price must be a non-negative number' });
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
    const updatedPrice = price !== undefined ? price : (row.price || 0);

    const stmt = db.prepare('UPDATE products SET name = ?, category = ?, quantity = ?, price = ? WHERE id = ?');
    stmt.run([updatedName, updatedCategory, updatedQuantity, updatedPrice, id], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ success: false, error: 'Duplicate name', message: 'Product name already exists' });
        }
        return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
      }
      res.json({ success: true, data: { id: parseInt(id), name: updatedName, category: updatedCategory, quantity: updatedQuantity, price: updatedPrice }, message: 'Product updated' });
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
