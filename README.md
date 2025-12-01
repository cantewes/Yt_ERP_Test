# ERP System MVP

A lightweight 3-module ERP system with integrated inventory, HR, and sales capabilities.

## Features

### Inventory Module
- Product management (name, category, quantity)
- CRUD operations for products
- Inline quantity editing
- Stock tracking

### HR Module
- Employee management (name, position, email, start date, salary)
- Work hours tracking per employee
- Automatic salary calculation: `(hours_logged / 160) * monthly_salary`
- Supports overtime calculation (>160 hours = >100% salary)

### Sales Module
- Customer management (name, email, phone, address)
- Order creation with multiple items
- **Automatic inventory integration:**
  - Stock check before order creation (blocks insufficient stock)
  - Automatic inventory reduction when order created
  - Automatic inventory restoration when order deleted

## Technology Stack

- **Backend:** Node.js, Express.js
- **Database:** SQLite3
- **Frontend:** HTML5, CSS3, Vanilla JavaScript

## Installation

```bash
# Navigate to backend folder
cd backend

# Install dependencies
npm install

# Start server
npm start
```

## Usage

1. Open http://localhost:3000 in your browser
2. Navigate between modules using the top navigation:
   - **Inventar** - Manage products and stock
   - **Personal** - Manage employees and work hours
   - **Vertrieb** - Manage customers and orders

## API Endpoints

### Inventory
- `GET /api/products` - Get all products
- `POST /api/products` - Create product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### HR
- `GET /api/employees` - Get all employees
- `POST /api/employees` - Create employee
- `PUT /api/employees/:id` - Update employee
- `DELETE /api/employees/:id` - Delete employee (and work hours)
- `GET /api/work-hours/:employee_id` - Get work hours
- `POST /api/work-hours` - Add work hours
- `DELETE /api/work-hours/:id` - Delete work hours entry
- `GET /api/employees/:id/salary` - Calculate salary

### Sales
- `GET /api/customers` - Get all customers
- `POST /api/customers` - Create customer
- `PUT /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Delete customer
- `GET /api/orders` - Get all orders with items
- `POST /api/orders` - Create order (with stock check)
- `DELETE /api/orders/:id` - Delete order (restores inventory)

## Cross-Module Integration

When creating an order:
1. System checks if all products have sufficient stock
2. If insufficient: Error message with available/requested quantities
3. If sufficient: Order created, inventory automatically reduced

When deleting an order:
1. Inventory automatically restored for all order items

## Project Structure

```
erp-project/
├── backend/
│   ├── server.js          # Express server setup
│   ├── db.js              # SQLite database initialization
│   ├── package.json
│   └── routes/
│       ├── inventory.js   # Product endpoints
│       ├── hr.js          # Employee & work hours endpoints
│       └── sales.js       # Customer & order endpoints
│
├── frontend/
│   ├── index.html         # Dashboard
│   ├── inventory.html     # Inventory module
│   ├── hr.html            # HR module
│   ├── sales.html         # Sales module
│   ├── css/
│   │   └── style.css      # All styling
│   └── js/
│       ├── api.js         # API wrapper
│       ├── inventory.js   # Inventory logic
│       ├── hr.js          # HR logic
│       └── sales.js       # Sales logic
│
└── erp.db                 # SQLite database file
```

## License

MIT
