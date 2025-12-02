const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const inventoryRoutes = require('./routes/inventory');
const hrRoutes = require('./routes/hr');
const salesRoutes = require('./routes/sales');
const analyticsRoutes = require('./routes/analytics');
const authRoutes = require('./routes/auth');
const accountingRoutes = require('./routes/accounting');
const usersRoutes = require('./routes/users');
const emailOrdersRoutes = require('./routes/emailOrders');
const suppliersRoutes = require('./routes/suppliers');
const purchaseOrdersRoutes = require('./routes/purchaseOrders');

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
app.use('/api/analytics', analyticsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/email-orders', emailOrdersRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/purchase-orders', purchaseOrdersRoutes);

// Root route serves index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`ERP Server running on http://localhost:${PORT}`);
});

// Graceful Shutdown - sauberes Beenden bei Ctrl+C
process.on('SIGINT', () => {
  console.log('\nServer wird beendet...');
  server.close(() => {
    console.log('Server beendet.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nSIGTERM empfangen, Server wird beendet...');
  server.close(() => process.exit(0));
});
