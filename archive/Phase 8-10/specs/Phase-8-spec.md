# Phase 8: Analytics Backend API Specification

**Version:** 2.0 (Refactored)  
**Date:** December 1, 2025  
**Scope:** Backend API design & database queries only  
**Duration:** 4–5 days (realistic estimate)  

---

## OVERVIEW

**Goal:** Expose analytics data via REST API endpoints (read-only).  
**Inputs:** Existing database (Products, Employees, Work_Hours, Customers, Orders, Order_Items)  
**Outputs:** JSON responses with KPIs, aggregations, trends  
**Constraints:** Prepared statements (SQL injection prevention), error handling, response format standardized  

**Tech:** Node.js/Express, SQLite, prepared statements. No new dependencies.

---

## API SPECIFICATION

### Response Format (Standard - All Endpoints)

**Success (200/201):**
```json
{
  "success": true,
  "data": { /* endpoint-specific data */ },
  "message": "Operation successful"
}
```

**Error (400/404/500):**
```json
{
  "success": false,
  "error": "Descriptive error message",
  "details": { "field": "value" }
}
```

---

## INVENTORY ENDPOINTS

### GET /api/analytics/inventory-summary
Returns overview metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "total_products": 42,
    "total_stock_units": 1250,
    "low_stock_count": 5
  }
}
```

**Query Notes:**
- Low stock = quantity < 10 (configurable threshold)
- Use: `SELECT COUNT(*) FROM products WHERE quantity < 10`
- Prepared statement required for threshold parameter

---

### GET /api/analytics/inventory-by-category
Returns aggregation by category.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "category": "Electronics",
      "product_count": 10,
      "total_units": 150,
      "categories_value_est": 7500
    }
  ]
}
```

**Query Notes:**
- Aggregate by `category` with SUM(quantity)
- Estimated value = sum(quantity) * avg_price (no actual prices stored; use formula or default)
- Sort by product_count DESC

---

### GET /api/analytics/low-stock-items
Lists products below threshold.

**Parameters:**
- `threshold` (optional, default=10): quantity level

**Response:**
```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "Item A", "quantity": 5, "category": "Electronics" }
  ]
}
```

**Query Notes:**
- Use prepared statement: `SELECT * FROM products WHERE quantity < ? ORDER BY quantity ASC`
- Bind parameter: threshold value

---

## HR ENDPOINTS

### GET /api/analytics/hr-summary
Returns overview metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "total_employees": 12,
    "avg_hours_this_month": 145,
    "employees_full_paid": 10,
    "employees_partial_paid": 2
  }
}
```

**Query Notes:**
- Current month = January 2025 (hardcoded for MVP)
- Full paid = 160h logged
- Partial paid = < 160h logged
- Use: SUM(hours) GROUP BY employee_id, then calculate ratios

---

### GET /api/analytics/payroll?month=YYYY-MM
Salary breakdown for specific month.

**Parameters:**
- `month` (required): YYYY-MM format, e.g., "2025-01"

**Response:**
```json
{
  "success": true,
  "data": {
    "month": "2025-01",
    "employees": [
      {
        "id": 1,
        "name": "John",
        "monthly_salary": 5000,
        "hours_logged": 160,
        "calculated_salary": 5000,
        "status": "full_paid"
      }
    ],
    "summary": {
      "total_payroll": 15750,
      "employees_full_paid": 10,
      "employees_partial_paid": 2
    }
  }
}
```

**Query Notes:**
- Calculated salary = (hours_logged / 160) * monthly_salary (DERIVED, not stored)
- Validate month format: use regex or try-catch
- Return 400 if invalid month format

---

### GET /api/analytics/employees-under-threshold?threshold=160&month=2025-01
List employees below hour threshold.

**Parameters:**
- `threshold` (default=160)
- `month` (default=current month)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 2,
      "name": "Jane",
      "hours_logged": 120,
      "monthly_salary": 5000,
      "calculated_salary": 3750,
      "percentage": 75
    }
  ]
}
```

**Query Notes:**
- Filter by month using STRFTIME('%Y-%m', date) in SQLite
- Join employees + work_hours tables
- SUM hours per employee

---

## SALES ENDPOINTS

### GET /api/analytics/sales-summary?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
Overall sales metrics for date range.

**Parameters:**
- `start_date` (required): YYYY-MM-DD
- `end_date` (required): YYYY-MM-DD

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "2025-01-01 to 2025-12-31",
    "total_orders": 45,
    "total_items_sold": 230,
    "avg_order_value": 277.78
  }
}
```

**Query Notes:**
- Validate date format: YYYY-MM-DD using regex or try-catch
- Return 400 if dates invalid or start > end
- Use: `WHERE order_date BETWEEN ? AND ?`

---

### GET /api/analytics/sales-trend?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&interval=daily
Sales trend over time.

**Parameters:**
- `start_date`, `end_date`: date range
- `interval`: "daily" or "monthly" (default: "daily")

**Response:**
```json
{
  "success": true,
  "data": [
    { "date": "2025-01-01", "orders": 2, "items_sold": 10, "revenue_est": 500 },
    { "date": "2025-01-02", "orders": 1, "items_sold": 5, "revenue_est": 250 }
  ]
}
```

**Query Notes:**
- GROUP BY DATE(order_date) for daily, DATE(strftime('%Y-%m', order_date)) for monthly
- SQLite: use STRFTIME function
- Order by date ASC
- Revenue estimated (no prices stored; use default formula)

---

### GET /api/analytics/top-customers?limit=5&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
Top customers by order count.

**Parameters:**
- `limit` (default=5, max=20): number of customers
- `start_date`, `end_date`: date range (optional, all-time if omitted)

**Response:**
```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "ACME Corp", "orders": 8, "items_purchased": 50 },
    { "id": 2, "name": "TechCorp", "orders": 6, "items_purchased": 35 }
  ]
}
```

**Query Notes:**
- Join orders + customers + order_items
- GROUP BY customer_id, COUNT(*) as orders
- LIMIT validated: if limit > 20, set to 20
- ORDER BY orders DESC

---

### GET /api/analytics/top-products?limit=5&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
Top products by quantity sold.

**Parameters:**
- `limit` (default=5, max=20): number of products
- Date range (optional)

**Response:**
```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "Product A", "qty_sold": 50, "times_ordered": 8 },
    { "id": 2, "name": "Product B", "qty_sold": 35, "times_ordered": 6 }
  ]
}
```

**Query Notes:**
- Join order_items + products + orders
- SUM(order_items.quantity)
- GROUP BY product_id
- ORDER BY qty_sold DESC, LIMIT applied with validation

---

## DASHBOARD ENDPOINT

### GET /api/analytics/dashboard-summary
Single call for main KPI card data (no drill-down).

**Response:**
```json
{
  "success": true,
  "data": {
    "inventory": {
      "total_products": 42,
      "low_stock_items": 5
    },
    "hr": {
      "total_employees": 12,
      "payroll_this_month": 45000,
      "employees_full_paid_pct": 83
    },
    "sales": {
      "total_orders_all_time": 45,
      "total_items_sold": 230
    }
  }
}
```

**Query Notes:**
- Combines 3 quick queries (or 1 complex query if performance critical)
- No date parameters (uses hardcoded current month/all-time)
- Fast response: <500ms target

---

## ERROR HANDLING

| Scenario | HTTP Status | Response |
|----------|-------------|----------|
| Invalid date format | 400 | `{ "error": "Invalid date format. Use YYYY-MM-DD" }` |
| start_date > end_date | 400 | `{ "error": "Start date must be before end date" }` |
| Missing required param | 400 | `{ "error": "Missing parameter: start_date" }` |
| Database query fails | 500 | `{ "error": "Database query failed", "details": { "code": "SQLITE_ERROR" } }` |
| Empty result set | 200 | `{ "success": true, "data": [] }` |

**Implementation:**
```javascript
try {
    // ... query logic
} catch (error) {
    console.error('Query error:', error);
    res.status(500).json({
        success: false,
        error: 'Database query failed',
        details: { message: error.message }
    });
}
```

---

## QUERY COMPLEXITY NOTES

| Endpoint | Query Type | Complexity | Est. Time |
|----------|-----------|-----------|-----------|
| inventory-summary | Simple aggregation | O(n) | <10ms |
| sales-summary | Date range + aggregation | O(n) | 10-50ms |
| sales-trend | Grouping + ordering | O(n log n) | 50-200ms |
| top-customers | 3-way join + grouping | O(n²) | 100-300ms |
| payroll | 2-way join + calculation | O(n log n) | 50-150ms |
| dashboard-summary | 3 parallel simple queries | O(n) | <100ms |

**Optimization:** If response times exceed targets, add indexes on:
- `orders(order_date)`
- `work_hours(employee_id, date)`
- `order_items(product_id)`

---

## FILE STRUCTURE

```
backend/
├── routes/
│   └── analytics.js              ← NEW: all analytics endpoints
├── queries/
│   └── analytics-queries.js      ← NEW: reusable query functions
├── middleware/
│   └── validation.js             ← UPDATED: date/param validation helpers
└── server.js                     ← UPDATED: import analytics routes
```

---

## QUALITY GATE (Phase 8)

- ✓ All 10 endpoints return 200 with correct JSON structure
- ✓ All queries use prepared statements (no SQL injection risk)
- ✓ Invalid date ranges → 400 error with descriptive message
- ✓ Empty datasets → 200 with empty array (not error)
- ✓ Response time for all endpoints <300ms (on localhost)
- ✓ Postman test suite: all 10+ test cases pass
- ✓ No console errors on startup
- ✓ project-status.md updated with completion checklist

---

## ESTIMATED EFFORT

- API design & specification: 0.5 day
- Query implementation (SQLite): 1.5 days
- Error handling & validation: 1 day
- Postman testing + performance check: 1 day
- **Total: 4–5 days** (realistic, with buffer)

---

## NOTES FOR DEVELOPER

1. **Test queries locally first** before integrating into Express routes
2. **Use prepared statements** for ALL parameterized queries (this is non-negotiable)
3. **Validate input** before binding to queries
4. **Log queries** during development (remove before production)
5. **Group similar endpoints** by domain (inventory, hr, sales) in routes file
