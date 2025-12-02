const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '..', 'erp.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Products table
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      price REAL NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add price column if it doesn't exist (migration for existing databases)
  db.run(`ALTER TABLE products ADD COLUMN price REAL NOT NULL DEFAULT 0`, (err) => {
    // Ignore error if column already exists
  });

  // Employees table
  db.run(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      position TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      start_date DATE NOT NULL,
      monthly_salary REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Work hours table
  db.run(`
    CREATE TABLE IF NOT EXISTS work_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      date DATE NOT NULL,
      hours REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    )
  `);

  // Customers table
  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Orders table
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      order_date DATE DEFAULT CURRENT_DATE,
      status TEXT DEFAULT 'created',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    )
  `);

  // Order items table
  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // ==================== PHASE 11: AUTHENTICATION TABLES ====================

  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      status TEXT NOT NULL DEFAULT 'active',
      failed_login_attempts INTEGER DEFAULT 0,
      locked_until DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME,
      updated_at DATETIME
    )
  `);

  // Sessions table
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      token_type TEXT DEFAULT 'bearer',
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_activity DATETIME,
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Password reset tokens table
  db.run(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Audit logs table
  db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      resource TEXT,
      resource_id INTEGER,
      old_value TEXT,
      new_value TEXT,
      ip_address TEXT,
      result TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ==================== PHASE 11: ACCOUNTING TABLES ====================

  // Invoices table
  db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      invoice_number TEXT NOT NULL UNIQUE,
      invoice_date DATE NOT NULL,
      due_date DATE NOT NULL,
      total_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  // Payments table
  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      payment_date DATE NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT,
      reference TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    )
  `);

  // ==================== PHASE 11b: EMAIL-TO-ORDER TABLES ====================

  // Parsed emails table - stores all incoming emails
  db.run(`
    CREATE TABLE IF NOT EXISTS parsed_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_email TEXT NOT NULL,
      subject TEXT,
      raw_body TEXT NOT NULL,
      parsed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'NEW',
      error_message TEXT,
      imap_message_id TEXT UNIQUE,
      duplicate_of INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (duplicate_of) REFERENCES parsed_emails(id)
    )
  `);

  // Pending orders table - extracted order data awaiting approval
  db.run(`
    CREATE TABLE IF NOT EXISTS pending_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parsed_email_id INTEGER,
      sender_email TEXT NOT NULL,
      extracted_quantity INTEGER,
      extracted_product_name TEXT,
      product_id INTEGER,
      confidence_score REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
      admin_notes TEXT,
      approved_at DATETIME,
      approved_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parsed_email_id) REFERENCES parsed_emails(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (approved_by) REFERENCES users(id)
    )
  `);

  // Email parsing errors table - tracks failed parsing attempts
  db.run(`
    CREATE TABLE IF NOT EXISTS email_parsing_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_email TEXT NOT NULL,
      raw_body TEXT NOT NULL,
      error_type TEXT,
      error_message TEXT,
      parse_attempt_count INTEGER DEFAULT 1,
      first_attempt_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Email rate limits table - prevents spam/DOS
  db.run(`
    CREATE TABLE IF NOT EXISTS email_rate_limits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_email TEXT NOT NULL UNIQUE,
      parse_count_this_minute INTEGER DEFAULT 0,
      last_reset DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_throttled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Email configuration table - stores IMAP/SMTP settings
  db.run(`
    CREATE TABLE IF NOT EXISTS email_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_key TEXT NOT NULL UNIQUE,
      config_value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ==================== PHASE 12: PROCUREMENT TABLES ====================

  // Suppliers table
  db.run(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      phone TEXT,
      address TEXT,
      contact_person TEXT,
      payment_terms TEXT DEFAULT 'NET30',
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    )
  `);

  // Purchase orders table
  db.run(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT NOT NULL UNIQUE,
      supplier_id INTEGER NOT NULL,
      status TEXT DEFAULT 'draft',
      order_date DATE,
      expected_delivery DATE,
      actual_delivery DATE,
      total_amount REAL DEFAULT 0,
      notes TEXT,
      created_by INTEGER,
      approved_by INTEGER,
      approved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (approved_by) REFERENCES users(id)
    )
  `);

  // Purchase order items table
  db.run(`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity_ordered INTEGER NOT NULL,
      quantity_received INTEGER DEFAULT 0,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Purchase order versions table (for audit trail)
  db.run(`
    CREATE TABLE IF NOT EXISTS purchase_order_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id INTEGER NOT NULL,
      version_number INTEGER NOT NULL,
      changed_by INTEGER,
      change_type TEXT,
      old_values TEXT,
      new_values TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
      FOREIGN KEY (changed_by) REFERENCES users(id)
    )
  `);

  // Purchase order receipts / GRN (Goods Receipt Notes)
  db.run(`
    CREATE TABLE IF NOT EXISTS purchase_order_receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grn_number TEXT NOT NULL UNIQUE,
      purchase_order_id INTEGER NOT NULL,
      purchase_order_item_id INTEGER NOT NULL,
      quantity_received INTEGER NOT NULL,
      received_by INTEGER,
      receipt_date DATE DEFAULT CURRENT_DATE,
      quality_status TEXT DEFAULT 'accepted',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
      FOREIGN KEY (purchase_order_item_id) REFERENCES purchase_order_items(id),
      FOREIGN KEY (received_by) REFERENCES users(id)
    )
  `);

  // Supplier performance metrics table
  db.run(`
    CREATE TABLE IF NOT EXISTS supplier_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      purchase_order_id INTEGER NOT NULL,
      on_time_delivery INTEGER DEFAULT 0,
      quality_rating INTEGER,
      defect_count INTEGER DEFAULT 0,
      total_items INTEGER DEFAULT 0,
      evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      notes TEXT,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id)
    )
  `);

  // Add reorder_level and preferred_supplier_id to products (migration)
  db.run(`ALTER TABLE products ADD COLUMN reorder_level INTEGER DEFAULT 10`, (err) => {
    // Ignore error if column already exists
  });

  db.run(`ALTER TABLE products ADD COLUMN preferred_supplier_id INTEGER REFERENCES suppliers(id)`, (err) => {
    // Ignore error if column already exists
  });

  // Create default admin user if not exists
  const adminHash = bcrypt.hashSync('Admin123!', 10);
  db.run(`
    INSERT OR IGNORE INTO users (username, email, password_hash, role)
    VALUES ('admin', 'admin@erp.local', ?, 'admin')
  `, [adminHash]);
});

module.exports = db;
