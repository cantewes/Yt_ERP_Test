# ERP MVP PROJECT - MASTER CONTEXT

## PROJECT OVERVIEW

Building a lightweight 3-module ERP system with integrated inventory, HR, and sales capabilities.
- Scope: MVP only (core functionality, no extended features)
- Tech: Node.js/Express, SQLite, Vanilla JavaScript, HTML/CSS
- Duration: 7 phases, sequential
- Quality: Each phase has explicit Quality Gate before progression

Target: Functional, locally-runnable system with data persistence and cross-module integration.

---

## CORE REQUIREMENTS

### Functional Modules
1. Inventory Management: Product categories, stock levels, manual adjustments
2. HR Management: Employee data, work hours tracking, salary calculation
3. CRM/Sales: Customer management, orders, automatic inventory reduction with overstock blockade

### Key Feature: Cross-Module Integration
- Sales orders automatically reduce inventory
- Overstock attempts are blocked with error messages
- Order deletion restores inventory
- All data persists across page refreshes

### Non-Functional Requirements
- Local deployment only (localhost:3000)
- SQLite database (file-based, no server)
- No localStorage/sessionStorage/cookies (use JS variables)
- Clean error handling (no silent failures)
- Semantic HTML with accessibility basics

---

## TECHNOLOGY STACK

### Backend
- Runtime: Node.js (v14+)
- Framework: Express.js
- Database: SQLite3 with prepared statements
- Port: 3000

### Frontend
- Languages: HTML5, CSS3, Vanilla JavaScript (ES6+)
- No frameworks (React/Vue) for MVP
- Design system: CSS variables for colors, spacing, typography

### Development Environment
- Editor: VS Code
- OS: Windows 11
- Version Control: Git (recommended)

---

## DATABASE SCHEMA

### products
```
id (INTEGER PRIMARY KEY)
name (TEXT NOT NULL, UNIQUE)
category (TEXT NOT NULL)
quantity (INTEGER NOT NULL, default 0)
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

### employees
```
id (INTEGER PRIMARY KEY)
name (TEXT NOT NULL)
position (TEXT NOT NULL)
email (TEXT NOT NULL, UNIQUE)
start_date (DATE NOT NULL)
monthly_salary (REAL NOT NULL)
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

### work_hours
```
id (INTEGER PRIMARY KEY)
employee_id (INTEGER NOT NULL, FOREIGN KEY → employees.id)
date (DATE NOT NULL)
hours (REAL NOT NULL)
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

### customers
```
id (INTEGER PRIMARY KEY)
name (TEXT NOT NULL)
email (TEXT NOT NULL)
phone (TEXT)
address (TEXT)
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

### orders
```
id (INTEGER PRIMARY KEY)
customer_id (INTEGER NOT NULL, FOREIGN KEY → customers.id)
order_date (DATE NOT NULL, default CURRENT_DATE)
status (TEXT, default 'created')
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

### order_items
```
id (INTEGER PRIMARY KEY)
order_id (INTEGER NOT NULL, FOREIGN KEY → orders.id)
product_id (INTEGER NOT NULL, FOREIGN KEY → products.id)
quantity (INTEGER NOT NULL)
```

---

## FOLDER STRUCTURE

```
erp-project/
├── backend/
│   ├── server.js                 (Express app, routes setup)
│   ├── db.js                     (SQLite init, connection)
│   ├── package.json
│   └── routes/
│       ├── inventory.js          (GET, POST, PUT, DELETE /api/products)
│       ├── hr.js                 (GET, POST, PUT, DELETE /api/employees, /api/work-hours)
│       └── sales.js              (GET, POST, DELETE /api/customers, /api/orders)
│
├── frontend/
│   ├── index.html                (Main page, navigation)
│   ├── inventory.html            (Products page)
│   ├── hr.html                   (Employees & timesheets page)
│   ├── sales.html                (Customers & orders page)
│   ├── css/
│   │   └── style.css             (All styling, design tokens)
│   └── js/
│       ├── api.js                (Fetch wrapper, centralized API calls)
│       ├── inventory.js          (Logic for inventory.html)
│       ├── hr.js                 (Logic for hr.html)
│       └── sales.js              (Logic for sales.html)
│
├── contexts/
│   ├── MASTER_CONTEXT.md         (This file)
│   ├── project-status.md         (Dynamic, updated per phase)
│   └── phase-X-feedback.md       (PO reviews, archived)
│
├── erp.db                        (SQLite database, auto-created)
└── README.md                     (User documentation)
```

---

## API SPECIFICATIONS

### INVENTORY ENDPOINTS

#### GET /api/products
Returns all products
```
Response: { success: true, data: [{ id, name, category, quantity }], message }
```

#### POST /api/products
Create new product
```
Body: { name, category, quantity }
Response: { success: true, data: { id, name, category, quantity }, message }
Errors: 400 (missing fields), 409 (duplicate name)
```

#### PUT /api/products/:id
Update product (name, category, quantity)
```
Body: { name?, category?, quantity? }
Response: { success: true, data: { id, name, category, quantity }, message }
Errors: 400 (invalid quantity), 404 (not found)
```

#### DELETE /api/products/:id
Delete product
```
Response: { success: true, data: null, message: "Product deleted" }
Errors: 404 (not found)
```

---

### HR ENDPOINTS

#### GET /api/employees
Returns all employees
```
Response: { success: true, data: [{ id, name, position, email, start_date, monthly_salary }], message }
```

#### POST /api/employees
Create new employee
```
Body: { name, position, email, start_date, monthly_salary }
Response: { success: true, data: { id, name, position, email, start_date, monthly_salary }, message }
Errors: 400 (missing fields), 409 (duplicate email)
```

#### PUT /api/employees/:id
Update employee
```
Body: { name?, position?, email?, start_date?, monthly_salary? }
Response: { success: true, data: { id, name, ... }, message }
Errors: 400, 404
```

#### DELETE /api/employees/:id
Delete employee and all associated work hours
```
Response: { success: true, data: null, message: "Employee deleted" }
Errors: 404
```

#### POST /api/work-hours
Add work hours entry
```
Body: { employee_id, date, hours }
Response: { success: true, data: { id, employee_id, date, hours }, message }
Errors: 400 (invalid hours), 404 (employee not found)
```

#### GET /api/work-hours/:employee_id
Get work hours for specific employee
```
Response: { success: true, data: [{ id, employee_id, date, hours }], message }
Errors: 404
```

#### DELETE /api/work-hours/:id
Delete work hours entry
```
Response: { success: true, data: null, message: "Entry deleted" }
Errors: 404
```

#### GET /api/employees/:id/salary
Calculate salary based on hours (this month)
```
Response: { success: true, data: { employee_id, monthly_salary, hours_logged, calculated_salary }, message }
Formula: (hours_logged / 160) * monthly_salary [160 = standard full-time hours/month]
Errors: 404
```

---

### SALES ENDPOINTS

#### GET /api/customers
Returns all customers
```
Response: { success: true, data: [{ id, name, email, phone, address }], message }
```

#### POST /api/customers
Create new customer
```
Body: { name, email, phone, address }
Response: { success: true, data: { id, name, email, phone, address }, message }
Errors: 400 (missing fields), 409 (duplicate email)
```

#### PUT /api/customers/:id
Update customer
```
Body: { name?, email?, phone?, address? }
Response: { success: true, data: { id, ... }, message }
Errors: 400, 404
```

#### DELETE /api/customers/:id
Delete customer
```
Response: { success: true, data: null, message: "Customer deleted" }
Errors: 404
```

#### GET /api/orders
Returns all orders with details
```
Response: { success: true, data: [{ id, customer_id, order_date, status, items: [{ product_id, quantity }] }], message }
```

#### POST /api/orders
Create new order (WITH INVENTORY INTEGRATION)
```
Body: { customer_id, items: [{ product_id, quantity }, ...] }

CRITICAL LOGIC (Phase 6):
1. For each item in request:
   - Check if product exists
   - Check if available_quantity >= requested_quantity
   - If ANY item fails: return 400 error, NO order created, NO inventory changed
2. If ALL items pass:
   - Create order in DB
   - For each item: UPDATE products SET quantity = quantity - requested_quantity
   - Return 201 Created

Response: { success: true, data: { id, customer_id, order_date, status, items }, message }
Errors: 
  - 400 (missing fields): { success: false, error: "Missing customer_id or items" }
  - 400 (stock insufficient): { success: false, error: "Insufficient stock for ProductName. Available: X, requested: Y" }
  - 404 (customer/product not found)
```

#### DELETE /api/orders/:id
Delete order and restore inventory
```
CRITICAL LOGIC:
1. Get order details (find all order_items)
2. For each item: UPDATE products SET quantity = quantity + item_quantity
3. Delete order_items
4. Delete order

Response: { success: true, data: null, message: "Order deleted and inventory restored" }
Errors: 404
```

---

## SALARY CALCULATION

### Formula
```
actual_salary = (total_hours_logged_this_month / 160) * monthly_salary

Examples:
- Employee has €3000/month
- Logged 160h → €3000 (full salary)
- Logged 80h → €1500 (50%)
- Logged 40h → €750 (25%)
- Logged 0h → €0
- Logged 200h → €3750 (125%, overtime)
```

### Implementation
- Calculate dynamically when GET /api/employees/:id/salary is called
- Do NOT store calculated salary in DB (derive from work_hours)
- Current month = January 2025 (demo purposes, can be made dynamic later)

---

## UI/UX SPECIFICATIONS

### Layout
- Single-page navigation (separate HTML pages per module, not SPA)
- Main index.html with navigation menu to 3 modules
- Each module has dedicated page (inventory.html, hr.html, sales.html)

### Design System
Use CSS variables for all styling:
```
--color-primary: teal-500
--color-text: text
--color-border: border
--color-error: red
--color-success: green
```

### Components
- Forms: Input, dropdown, date picker (HTML5)
- Tables: Standard HTML table with data rows
- Buttons: Primary (submit), secondary (delete/cancel)
- Alerts: Error/success messages (inline, no notifications)
- Validation: Frontend (for UX), backend (for security)

### Module-Specific Requirements

#### Inventory
- Product list as table: ID | Name | Category | Quantity | Actions (Edit, Delete)
- Add product form: Name input, Category dropdown, Quantity input, Submit
- Edit quantity: Click quantity cell or Edit button → modal/inline input
- Delete: Confirmation popup

#### HR
- Employee list as table: ID | Name | Position | Email | Start Date | Monthly Salary | Actions
- Add employee form: Name, Position, Email, Start Date (date picker), Salary (number), Submit
- Work hours section: Date picker + Hours input + Submit
- Work hours list: Chronological, with Delete option per entry
- Salary display: "Calculated salary for [employee]: €X based on Y hours logged"

#### Sales
- Customer list as table: ID | Name | Email | Phone | Address | Actions
- Add customer form: Name, Email, Phone, Address, Submit
- Order creation: Customer dropdown + Product selector (shows available quantity) + Quantity input × N products
- Order submit: "Create Order" button
- Error handling: If stock insufficient → show error, order NOT created
- Order list: ID | Customer | Date | Items | Actions (Delete)
- On delete: Show message "Order deleted, inventory restored"

---

## QUALITY GATES (Acceptance Criteria per Phase)

### Phase 1: Setup & Architecture
- ✓ npm start runs without errors
- ✓ Server listens on localhost:3000
- ✓ Frontend loads (index.html visible)
- ✓ Navigation menu present and clickable (3 links)
- ✓ Each link loads corresponding page (inventory.html, hr.html, sales.html)
- ✓ SQLite database file created (erp.db)
- ✓ No console errors (F12 → Console tab clean)

### Phase 2: Inventory Backend
- ✓ GET /api/products returns empty array initially
- ✓ POST /api/products creates product (returns ID)
- ✓ PUT /api/products/:id updates quantity (verified in GET)
- ✓ DELETE /api/products/:id removes product
- ✓ Invalid input (empty name, negative quantity) returns 400 error
- ✓ Data persists (restart server, data still there)

### Phase 3: Inventory Frontend
- ✓ Products displayed in table
- ✓ Form allows adding product (name, category, quantity)
- ✓ New product appears in table immediately
- ✓ Quantity can be edited (inline or modal)
- ✓ Product can be deleted (with confirmation)
- ✓ Page refresh (F5) → data persists
- ✓ Multiple products (5+) can be added and managed
- ✓ Error messages for invalid input (e.g., empty name)

### Phase 4: HR Module
- ✓ Employees displayed in table
- ✓ Add employee form works (all fields save)
- ✓ Work hours can be added (date, hours)
- ✓ Work hours display chronologically
- ✓ Salary calculated correctly: (hours / 160) * monthly_salary
- ✓ Salary updates when work hours added/deleted
- ✓ Edit/delete employee and work hours work
- ✓ Page refresh → all data persists
- ✓ Edge cases tested: 0 hours, 200 hours, partial month

### Phase 5: Sales Backend (no integration yet)
- ✓ Customers can be created/read/updated/deleted (CRUD)
- ✓ Orders can be created with items (no stock check yet)
- ✓ Order structure includes customer_id and items array
- ✓ Data persists across server restarts

### Phase 6: Sales Frontend + Integration (CRITICAL)
**Stock Sufficient Test:**
- ✓ Product exists with quantity 15
- ✓ Create order: Customer + 5x Product
- ✓ Order created successfully ✓
- ✓ Inventory page shows quantity now 10 ✓
- ✓ All data persists after refresh ✓

**Stock Insufficient Test (BLOCKADE):**
- ✓ Product has quantity 10
- ✓ Create order: Customer + 20x Product
- ✓ Error message shown: "Insufficient stock. Available: 10, requested: 20" ✓
- ✓ Order is NOT created ✓
- ✓ Inventory remains 10 (unchanged) ✓

**Order Deletion Test:**
- ✓ Delete previous order
- ✓ Inventory page shows quantity restored to original ✓

### Phase 7: Polish & Documentation
- ✓ No console errors anywhere (F12)
- ✓ Invalid input handled gracefully (no crashes)
- ✓ Error messages are user-friendly
- ✓ All buttons and links functional
- ✓ UI looks clean (colors consistent, spacing ok, readable fonts)
- ✓ README.md documents how to run
- ✓ README.md explains all 3 modules
- ✓ Full workflow test: Inventory → HR → Sales → Verify integration
- ✓ Cross-module test: Create product, employee, customer, order → verify all work together

---

## STARTUP INSTRUCTIONS (for Developer)

```
1. npm install (in backend folder)
2. npm start
3. Open http://localhost:3000
4. Navigate between modules
5. Each module has full CRUD functionality
```

---

## KNOWN CONSTRAINTS & FUTURE ENHANCEMENTS

### MVP Scope (DONE)
- Inventory: manual adjustments, categories
- HR: basic tracking, salary calculation
- Sales: orders with blockade, integration

### Not in MVP (Future)
- Authentication/login
- Reporting/analytics
- Multi-user support
- Cloud deployment
- Mobile app
- API documentation (Swagger)
- Automated testing (unit tests, integration tests)
- Email notifications
- Audit logging
- Backup/restore

---

## DECISION LOG

### Design Decisions Made
1. **Vanilla JS, no frameworks**: Simpler setup, faster MVP
2. **SQLite, not PostgreSQL**: Local file, no server needed
3. **Prepared statements**: Security baseline (SQL injection prevention)
4. **Separate HTML pages**: Simpler than SPA routing, easier to debug
5. **Manual testing, not automated**: Faster MVP, PO manual QG
6. **Atomic transactions (Phase 6)**: Prevent inconsistent state on order + inventory
7. **Salary = derived, not stored**: Keeps data normalized, always accurate

---

## CONTACTS & ESCALATION

None defined for MVP (single developer + PO)
Revisit if team expands.