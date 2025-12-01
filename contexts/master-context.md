# ERP MVP PROJECT - MASTER CONTEXT

## PROJECT OVERVIEW

Building a lightweight 3-module ERP system with integrated inventory, HR, and sales capabilities.
- Scope: MVP + Analytics + Authentication + Accounting + Email-to-Order + Procurement
- Tech: Node.js/Express, SQLite, Vanilla JavaScript, HTML/CSS
- Duration: 12 phases, sequential
- Quality: Each phase has explicit Quality Gate before progression

Target: Functional, locally-runnable system with data persistence and cross-module integration.

---

## CORE REQUIREMENTS

### Functional Modules
1. Inventory Management: Product categories, stock levels, manual adjustments
2. HR Management: Employee data, work hours tracking, salary calculation
3. CRM/Sales: Customer management, orders, automatic inventory reduction with overstock blockade
4. Analytics Dashboard (Phase 8-10): KPIs, Charts, Drill-Down, CSV Export
5. Authentication (Phase 11): Login, Sessions, Password Reset, Role-Based Access
6. Accounting (Phase 11): Invoices, Payments, Financial Summary
7. Email-to-Order (Phase 11b): Email Parsing, Confidence Scoring, Admin Approval
8. Procurement (Phase 12): Suppliers, Purchase Orders, GRN, Auto-Reordering

### Key Feature: Cross-Module Integration
- Sales orders automatically reduce inventory
- Overstock attempts are blocked with error messages
- Order deletion restores inventory
- Purchase orders increase inventory on receipt
- Invoices linked to orders
- All data persists across page refreshes

### Non-Functional Requirements
- Local deployment only (localhost:3000)
- SQLite database (file-based, no server)
- No localStorage/sessionStorage/cookies (use JS variables for auth token)
- Clean error handling (no silent failures)
- Semantic HTML with accessibility basics
- Role-Based Access Control (admin, manager, viewer)

---

## TECHNOLOGY STACK

### Backend
- Runtime: Node.js (v14+)
- Framework: Express.js
- Database: SQLite3 with prepared statements
- Auth: bcryptjs (password hashing), crypto (token generation)
- CORS: cors middleware
- Port: 3000

### Frontend
- Languages: HTML5, CSS3, Vanilla JavaScript (ES6+)
- Charts: Chart.js 3.9.1
- No frameworks (React/Vue) for MVP
- Design system: CSS variables for colors, spacing, typography

### Development Environment
- Editor: VS Code
- OS: Windows 11
- Version Control: Git (recommended)

---

## DATABASE SCHEMA

### Core Tables (Phase 1-7)

#### products
```
id (INTEGER PRIMARY KEY)
name (TEXT NOT NULL, UNIQUE)
category (TEXT NOT NULL)
quantity (INTEGER NOT NULL, default 0)
price (REAL, default 0)
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

#### employees
```
id (INTEGER PRIMARY KEY)
name (TEXT NOT NULL)
position (TEXT NOT NULL)
email (TEXT NOT NULL, UNIQUE)
start_date (DATE NOT NULL)
monthly_salary (REAL NOT NULL)
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

#### work_hours
```
id (INTEGER PRIMARY KEY)
employee_id (INTEGER NOT NULL, FOREIGN KEY -> employees.id)
date (DATE NOT NULL)
hours (REAL NOT NULL)
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

#### customers
```
id (INTEGER PRIMARY KEY)
name (TEXT NOT NULL)
email (TEXT NOT NULL)
phone (TEXT)
address (TEXT)
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

#### orders
```
id (INTEGER PRIMARY KEY)
customer_id (INTEGER NOT NULL, FOREIGN KEY -> customers.id)
order_date (DATE NOT NULL, default CURRENT_DATE)
status (TEXT, default 'created')
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

#### order_items
```
id (INTEGER PRIMARY KEY)
order_id (INTEGER NOT NULL, FOREIGN KEY -> orders.id)
product_id (INTEGER NOT NULL, FOREIGN KEY -> products.id)
quantity (INTEGER NOT NULL)
```

### Phase 11 Tables (Authentication + Accounting)

#### users
```
id (INTEGER PRIMARY KEY)
username (TEXT NOT NULL, UNIQUE)
email (TEXT NOT NULL, UNIQUE)
password_hash (TEXT NOT NULL)  -- bcrypt
role (TEXT NOT NULL)  -- 'admin', 'manager', 'viewer'
status (TEXT NOT NULL, default 'active')  -- 'active', 'locked', 'suspended'
failed_login_attempts (INTEGER, default 0)
locked_until (DATETIME)
created_at (DATETIME, default CURRENT_TIMESTAMP)
last_login (DATETIME)
updated_at (DATETIME)
```

#### sessions
```
id (INTEGER PRIMARY KEY)
user_id (INTEGER NOT NULL, FOREIGN KEY -> users.id)
token (TEXT NOT NULL, UNIQUE)
token_type (TEXT)  -- 'bearer'
expires_at (DATETIME NOT NULL)
created_at (DATETIME, default CURRENT_TIMESTAMP)
last_activity (DATETIME)
ip_address (TEXT)
user_agent (TEXT)
```

#### password_reset_tokens
```
id (INTEGER PRIMARY KEY)
user_id (INTEGER NOT NULL, FOREIGN KEY -> users.id)
token (TEXT NOT NULL, UNIQUE)
expires_at (DATETIME NOT NULL)
used_at (DATETIME)
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

#### audit_logs
```
id (INTEGER PRIMARY KEY)
user_id (INTEGER, FOREIGN KEY -> users.id)
action (TEXT NOT NULL)  -- 'login', 'logout', 'password_reset', etc.
resource (TEXT)  -- 'invoice', 'order', 'user', etc.
resource_id (INTEGER)
old_value (TEXT)  -- JSON
new_value (TEXT)  -- JSON
ip_address (TEXT)
result (TEXT)  -- 'success', 'failure'
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

#### invoices
```
id (INTEGER PRIMARY KEY)
order_id (INTEGER NOT NULL, FOREIGN KEY -> orders.id)
invoice_number (TEXT NOT NULL, UNIQUE)
invoice_date (DATE NOT NULL)
due_date (DATE NOT NULL)
total_amount (REAL NOT NULL)
status (TEXT NOT NULL)  -- 'draft', 'sent', 'paid', 'overdue', 'cancelled'
notes (TEXT)
created_at (DATETIME, default CURRENT_TIMESTAMP)
created_by (INTEGER, FOREIGN KEY -> users.id)
```

#### payments
```
id (INTEGER PRIMARY KEY)
invoice_id (INTEGER NOT NULL, FOREIGN KEY -> invoices.id)
payment_date (DATE NOT NULL)
amount (REAL NOT NULL)
payment_method (TEXT)  -- 'bank_transfer', 'credit_card', 'cash'
reference (TEXT)
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

### Phase 11b Tables (Email-to-Order)

#### parsed_emails
```
id (INTEGER PRIMARY KEY)
sender_email (TEXT NOT NULL)
subject (TEXT)
raw_body (TEXT NOT NULL)
parsed_at (DATETIME, default CURRENT_TIMESTAMP)
status (TEXT NOT NULL)  -- 'NEW', 'PARSED', 'PROCESSED', 'ERROR'
error_message (TEXT)
imap_message_id (TEXT)  -- idempotency
duplicate_of (INTEGER)  -- self-reference
```

#### pending_orders
```
id (INTEGER PRIMARY KEY)
parsed_email_id (INTEGER, FOREIGN KEY -> parsed_emails.id)
sender_email (TEXT NOT NULL)
extracted_quantity (INTEGER)
extracted_product_name (TEXT)
product_id (INTEGER, FOREIGN KEY -> products.id)
confidence_score (REAL)  -- 0.0 to 1.0
status (TEXT NOT NULL)  -- 'PENDING_REVIEW', 'AUTO_APPROVED', 'APPROVED', 'REJECTED'
admin_notes (TEXT)
approved_at (DATETIME)
approved_by (INTEGER, FOREIGN KEY -> users.id)
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

#### email_parsing_errors
```
id (INTEGER PRIMARY KEY)
sender_email (TEXT NOT NULL)
raw_body (TEXT NOT NULL)
error_type (TEXT)  -- 'NO_QUANTITY', 'NO_PRODUCT', 'UNPARSEABLE', 'DUPLICATE'
error_message (TEXT)
parse_attempt_count (INTEGER, default 0)
first_attempt_at (DATETIME)
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

#### email_rate_limits
```
id (INTEGER PRIMARY KEY)
sender_email (TEXT NOT NULL)
parse_count_this_minute (INTEGER)
last_reset (DATETIME)
is_throttled (BOOLEAN, default 0)
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

### Phase 12 Tables (Procurement)

#### suppliers
```
id (INTEGER PRIMARY KEY)
name (TEXT NOT NULL)
contact_email (TEXT)
phone (TEXT)
address (TEXT)
status (TEXT, default 'active')  -- 'active', 'inactive', 'blocked'
rating (REAL)  -- 0.0 to 5.0
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

#### purchase_orders
```
id (INTEGER PRIMARY KEY)
supplier_id (INTEGER NOT NULL, FOREIGN KEY -> suppliers.id)
created_by (INTEGER, FOREIGN KEY -> users.id)
status (TEXT NOT NULL)  -- 'draft', 'sent', 'partial', 'completed', 'cancelled'
total_amount (REAL)
notes (TEXT)
created_at (DATETIME, default CURRENT_TIMESTAMP)
updated_at (DATETIME)
```

#### purchase_order_items
```
id (INTEGER PRIMARY KEY)
purchase_order_id (INTEGER NOT NULL, FOREIGN KEY -> purchase_orders.id)
product_id (INTEGER NOT NULL, FOREIGN KEY -> products.id)
quantity (INTEGER NOT NULL)
unit_price (REAL NOT NULL)
received_quantity (INTEGER, default 0)
```

#### purchase_order_versions
```
id (INTEGER PRIMARY KEY)
purchase_order_id (INTEGER NOT NULL, FOREIGN KEY -> purchase_orders.id)
version_number (INTEGER NOT NULL)
changes_json (TEXT)  -- JSON diff
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

#### purchase_order_receipts (GRN)
```
id (INTEGER PRIMARY KEY)
purchase_order_id (INTEGER NOT NULL, FOREIGN KEY -> purchase_orders.id)
received_by (INTEGER, FOREIGN KEY -> users.id)
notes (TEXT)
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

#### supplier_performance
```
id (INTEGER PRIMARY KEY)
supplier_id (INTEGER NOT NULL, FOREIGN KEY -> suppliers.id)
metric_type (TEXT NOT NULL)  -- 'delivery_time', 'quality_rating', 'price_variance'
value (REAL NOT NULL)
period (TEXT)  -- 'YYYY-MM'
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

---

## FOLDER STRUCTURE

```
erp-project/
├── backend/
│   ├── server.js                 (Express app, routes setup, CORS)
│   ├── db.js                     (SQLite init, connection)
│   ├── package.json
│   └── routes/
│       ├── inventory.js          (GET, POST, PUT, DELETE /api/products)
│       ├── hr.js                 (GET, POST, PUT, DELETE /api/employees, /api/work-hours)
│       ├── sales.js              (GET, POST, DELETE /api/customers, /api/orders)
│       ├── analytics.js          (GET /api/analytics/*)
│       ├── auth.js               (POST /api/auth/*)
│       ├── accounting.js         (GET, POST /api/invoices, /api/payments)
│       ├── email-orders.js       (GET, POST /api/email-orders/*)
│       └── procurement.js        (GET, POST /api/suppliers, /api/purchase-orders)
│
├── frontend/
│   ├── index.html                (Main page, navigation)
│   ├── inventory.html            (Products page)
│   ├── hr.html                   (Employees & timesheets page)
│   ├── sales.html                (Customers & orders page)
│   ├── analytics.html            (Dashboard page)
│   ├── login.html                (Login page)
│   ├── reset-password-request.html
│   ├── reset-password.html
│   ├── accounting.html           (Invoices & payments page)
│   ├── email-orders.html         (Admin approval dashboard)
│   ├── procurement.html          (Suppliers & PO page)
│   ├── css/
│   │   └── style.css             (All styling, design tokens)
│   └── js/
│       ├── api.js                (Fetch wrapper, centralized API calls)
│       ├── auth.js               (Token management, requireAuth)
│       ├── inventory.js
│       ├── hr.js
│       ├── sales.js
│       ├── analytics.js
│       ├── accounting.js
│       ├── email-orders.js
│       └── procurement.js
│
├── contexts/
│   ├── master-context.md         (This file)
│   ├── project-status.md         (Dynamic, updated per phase)
│   ├── CONTEXT-LOADER.md         (Phase-specific file loading)
│   └── phases 11-12/
│       ├── Phase-11-spec-FINAL.md
│       ├── Phase-11b-spec-FINAL.md
│       └── Phase-12-spec-FINAL.md
│
├── archive/
│   ├── Phase1-7/                 (MVP documentation)
│   └── Phase 8-10/               (Analytics dashboard documentation)
│
├── erp.db                        (SQLite database, auto-created)
└── README.md                     (User documentation)
```

---

## API SPECIFICATIONS

### INVENTORY ENDPOINTS (4)

#### GET /api/products
Returns all products
```
Response: { success: true, data: [{ id, name, category, quantity, price }], message }
```

#### POST /api/products
Create new product
```
Body: { name, category, quantity, price }
Response: { success: true, data: { id, name, category, quantity, price }, message }
Errors: 400 (missing fields), 409 (duplicate name)
```

#### PUT /api/products/:id
Update product
```
Body: { name?, category?, quantity?, price? }
Response: { success: true, data: { id, name, category, quantity, price }, message }
Errors: 400 (invalid quantity), 404 (not found)
```

#### DELETE /api/products/:id
Delete product
```
Response: { success: true, data: null, message: "Product deleted" }
Errors: 404 (not found)
```

---

### HR ENDPOINTS (9)

#### GET /api/employees
#### POST /api/employees
#### PUT /api/employees/:id
#### DELETE /api/employees/:id
#### POST /api/work-hours
#### GET /api/work-hours/:employee_id
#### DELETE /api/work-hours/:id
#### GET /api/employees/:id/salary
#### GET /api/work-hours (all work hours with employee info)

---

### SALES ENDPOINTS (6)

#### GET /api/customers
#### POST /api/customers
#### PUT /api/customers/:id
#### DELETE /api/customers/:id
#### GET /api/orders
#### POST /api/orders (with inventory integration)
#### DELETE /api/orders/:id (restores inventory)

---

### ANALYTICS ENDPOINTS (14)

#### GET /api/analytics/inventory-summary
#### GET /api/analytics/inventory-by-category
#### GET /api/analytics/low-stock-items
#### GET /api/analytics/hr-summary
#### GET /api/analytics/payroll
#### GET /api/analytics/employees-under-threshold
#### GET /api/analytics/sales-summary
#### GET /api/analytics/sales-trend
#### GET /api/analytics/top-customers
#### GET /api/analytics/top-products
#### GET /api/analytics/dashboard-summary
#### GET /api/analytics/export/sales-csv
#### GET /api/analytics/export/inventory-csv
#### GET /api/analytics/export/payroll-csv

---

### AUTH ENDPOINTS (Phase 11 - 7)

#### POST /api/auth/register
```
Body: { username, email, password }
Validation: username 3-32 chars, email valid, password min 8 chars + complexity
Response: { success: true, user_id, message }
Errors: 409 (duplicate), 400 (validation)
```

#### POST /api/auth/login
```
Body: { username, password }
Logic: Check lockout, verify bcrypt hash, create session
Response: { success: true, token, user_id, role, expires_in_seconds }
Errors: 401 (invalid), 429 (locked)
```

#### POST /api/auth/logout
```
Header: Authorization: Bearer {token}
Response: { success: true, message }
```

#### GET /api/auth/me
```
Header: Authorization: Bearer {token}
Response: { success: true, data: { user_id, username, email, role } }
Errors: 401 (invalid/expired)
```

#### POST /api/auth/password-reset-request
```
Body: { email }
Response: { success: true, message } (always, for security)
```

#### POST /api/auth/password-reset
```
Body: { token, new_password }
Response: { success: true, message }
Errors: 400 (invalid), 410 (expired)
```

#### PUT /api/auth/change-password
```
Header: Authorization: Bearer {token}
Body: { current_password, new_password }
Response: { success: true, message }
Errors: 401 (wrong password)
```

---

### ACCOUNTING ENDPOINTS (Phase 11 - 6)

#### GET /api/invoices
#### POST /api/invoices
#### GET /api/invoices/:id
#### PUT /api/invoices/:id/mark-paid
#### POST /api/payments
#### GET /api/financial-summary

---

## SALARY CALCULATION

### Formula
```
actual_salary = (total_hours_logged_this_month / 160) * monthly_salary
```

---

## QUALITY GATES

### Phase 1-7: MVP (COMPLETED)
All quality gates passed.

### Phase 8-10: Analytics Dashboard (COMPLETED)
All quality gates passed.

### Phase 11: Authentication + Accounting
See `contexts/phases 11-12/Phase-11-spec-FINAL.md` for full quality gates.

### Phase 11b: Email-to-Order
See `contexts/phases 11-12/Phase-11b-spec-FINAL.md` for full quality gates.

### Phase 12: Procurement
See `contexts/phases 11-12/Phase-12-spec-FINAL.md` for full quality gates.

---

## STARTUP INSTRUCTIONS

```
1. npm install (in backend folder)
2. npm start
3. Open http://localhost:3000
4. Navigate between modules
5. Login required for protected pages (Phase 11+)
```

---

## DEPENDENCIES

### Existing
- express
- sqlite3
- cors

### Phase 11 (NEW)
- bcryptjs (password hashing)
- uuid or crypto (token generation)

---

## DECISION LOG

### Design Decisions Made
1. **Vanilla JS, no frameworks**: Simpler setup, faster MVP
2. **SQLite, not PostgreSQL**: Local file, no server needed
3. **Prepared statements**: Security baseline (SQL injection prevention)
4. **Separate HTML pages**: Simpler than SPA routing, easier to debug
5. **Manual testing, not automated**: Faster MVP, PO manual QG
6. **Atomic transactions (Phase 6)**: Prevent inconsistent state
7. **Salary = derived, not stored**: Keeps data normalized
8. **Token in JS variable**: More secure than localStorage
9. **bcrypt for passwords**: Industry standard hashing
10. **Role-based access**: admin > manager > viewer hierarchy

---

## ARCHIVE REFERENCE

- `archive/Phase1-7/` - MVP Documentation
- `archive/Phase 8-10/` - Analytics Dashboard Documentation
