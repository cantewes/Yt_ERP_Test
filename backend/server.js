const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const inventoryRoutes = require('./routes/inventory');
const hrRoutes = require('./routes/hr');
const salesRoutes = require('./routes/sales');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// API Routes
app.use('/api/products', inventoryRoutes);
app.use('/api', hrRoutes);
app.use('/api', salesRoutes);

// Root route serves index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`ERP Server running on http://localhost:${PORT}`);
});
