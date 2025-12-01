const express = require('express');
const router = express.Router();
const db = require('../db');

// ==================== HELPER FUNCTIONS ====================

// Validate date format YYYY-MM-DD
function isValidDate(dateString) {
  if (!dateString) return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

// Validate month format YYYY-MM
function isValidMonth(monthString) {
  if (!monthString) return false;
  const regex = /^\d{4}-\d{2}$/;
  return regex.test(monthString);
}

// Get current month in YYYY-MM format
function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// ==================== INVENTORY ANALYTICS ====================

// GET /api/analytics/inventory-summary
router.get('/inventory-summary', (req, res) => {
  const threshold = parseInt(req.query.threshold) || 10;

  db.get(
    `SELECT
      COUNT(*) as total_products,
      COALESCE(SUM(quantity), 0) as total_stock_units,
      (SELECT COUNT(*) FROM products WHERE quantity < ?) as low_stock_count
    FROM products`,
    [threshold],
    (err, row) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database query failed',
          details: { message: err.message }
        });
      }
      res.json({
        success: true,
        data: {
          total_products: row.total_products || 0,
          total_stock_units: row.total_stock_units || 0,
          low_stock_count: row.low_stock_count || 0
        },
        message: 'Inventory summary retrieved'
      });
    }
  );
});

// GET /api/analytics/inventory-by-category
router.get('/inventory-by-category', (req, res) => {
  db.all(
    `SELECT
      category,
      COUNT(*) as product_count,
      COALESCE(SUM(quantity), 0) as total_units
    FROM products
    GROUP BY category
    ORDER BY product_count DESC`,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database query failed',
          details: { message: err.message }
        });
      }
      res.json({
        success: true,
        data: rows.map(row => ({
          category: row.category,
          product_count: row.product_count,
          total_units: row.total_units
        })),
        message: 'Inventory by category retrieved'
      });
    }
  );
});

// GET /api/analytics/low-stock-items
router.get('/low-stock-items', (req, res) => {
  const threshold = parseInt(req.query.threshold) || 10;

  db.all(
    `SELECT id, name, quantity, category
    FROM products
    WHERE quantity < ?
    ORDER BY quantity ASC`,
    [threshold],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database query failed',
          details: { message: err.message }
        });
      }
      res.json({
        success: true,
        data: rows,
        message: 'Low stock items retrieved'
      });
    }
  );
});

// ==================== HR ANALYTICS ====================

// GET /api/analytics/hr-summary
router.get('/hr-summary', (req, res) => {
  const currentMonth = getCurrentMonth();

  db.all(
    `SELECT
      e.id,
      e.monthly_salary,
      COALESCE(SUM(wh.hours), 0) as hours_logged
    FROM employees e
    LEFT JOIN work_hours wh ON e.id = wh.employee_id
      AND strftime('%Y-%m', wh.date) = ?
    GROUP BY e.id`,
    [currentMonth],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database query failed',
          details: { message: err.message }
        });
      }

      const totalEmployees = rows.length;
      const totalHours = rows.reduce((sum, r) => sum + r.hours_logged, 0);
      const avgHours = totalEmployees > 0 ? Math.round(totalHours / totalEmployees) : 0;
      const fullPaid = rows.filter(r => r.hours_logged >= 160).length;
      const partialPaid = rows.filter(r => r.hours_logged > 0 && r.hours_logged < 160).length;

      res.json({
        success: true,
        data: {
          total_employees: totalEmployees,
          avg_hours_this_month: avgHours,
          employees_full_paid: fullPaid,
          employees_partial_paid: partialPaid
        },
        message: 'HR summary retrieved'
      });
    }
  );
});

// GET /api/analytics/payroll
router.get('/payroll', (req, res) => {
  const { month } = req.query;

  if (!month) {
    return res.status(400).json({
      success: false,
      error: 'Missing parameter: month',
      details: { field: 'month' }
    });
  }

  if (!isValidMonth(month)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid date format. Use YYYY-MM',
      details: { field: 'month', received: month }
    });
  }

  db.all(
    `SELECT
      e.id,
      e.name,
      e.monthly_salary,
      COALESCE(SUM(wh.hours), 0) as hours_logged
    FROM employees e
    LEFT JOIN work_hours wh ON e.id = wh.employee_id
      AND strftime('%Y-%m', wh.date) = ?
    GROUP BY e.id
    ORDER BY e.name`,
    [month],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database query failed',
          details: { message: err.message }
        });
      }

      const employees = rows.map(row => {
        const calculatedSalary = (row.hours_logged / 160) * row.monthly_salary;
        const status = row.hours_logged >= 160 ? 'full_paid' : 'partial_paid';
        return {
          id: row.id,
          name: row.name,
          monthly_salary: row.monthly_salary,
          hours_logged: row.hours_logged,
          calculated_salary: Math.round(calculatedSalary * 100) / 100,
          status: status
        };
      });

      const totalPayroll = employees.reduce((sum, e) => sum + e.calculated_salary, 0);
      const fullPaidCount = employees.filter(e => e.status === 'full_paid').length;
      const partialPaidCount = employees.filter(e => e.status === 'partial_paid').length;

      res.json({
        success: true,
        data: {
          month: month,
          employees: employees,
          summary: {
            total_payroll: Math.round(totalPayroll * 100) / 100,
            employees_full_paid: fullPaidCount,
            employees_partial_paid: partialPaidCount
          }
        },
        message: 'Payroll data retrieved'
      });
    }
  );
});

// GET /api/analytics/employees-under-threshold
router.get('/employees-under-threshold', (req, res) => {
  const threshold = parseInt(req.query.threshold) || 160;
  const month = req.query.month || getCurrentMonth();

  if (!isValidMonth(month)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid date format. Use YYYY-MM',
      details: { field: 'month', received: month }
    });
  }

  db.all(
    `SELECT
      e.id,
      e.name,
      e.monthly_salary,
      COALESCE(SUM(wh.hours), 0) as hours_logged
    FROM employees e
    LEFT JOIN work_hours wh ON e.id = wh.employee_id
      AND strftime('%Y-%m', wh.date) = ?
    GROUP BY e.id
    HAVING hours_logged < ?
    ORDER BY hours_logged ASC`,
    [month, threshold],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database query failed',
          details: { message: err.message }
        });
      }

      const data = rows.map(row => {
        const calculatedSalary = (row.hours_logged / 160) * row.monthly_salary;
        const percentage = Math.round((row.hours_logged / 160) * 100);
        return {
          id: row.id,
          name: row.name,
          hours_logged: row.hours_logged,
          monthly_salary: row.monthly_salary,
          calculated_salary: Math.round(calculatedSalary * 100) / 100,
          percentage: percentage
        };
      });

      res.json({
        success: true,
        data: data,
        message: 'Employees under threshold retrieved'
      });
    }
  );
});

// ==================== SALES ANALYTICS ====================

// GET /api/analytics/sales-summary
router.get('/sales-summary', (req, res) => {
  const { start_date, end_date } = req.query;

  if (!start_date || !end_date) {
    return res.status(400).json({
      success: false,
      error: 'Missing parameters: start_date and end_date are required',
      details: { fields: ['start_date', 'end_date'] }
    });
  }

  if (!isValidDate(start_date)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid date format. Use YYYY-MM-DD',
      details: { field: 'start_date', received: start_date }
    });
  }

  if (!isValidDate(end_date)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid date format. Use YYYY-MM-DD',
      details: { field: 'end_date', received: end_date }
    });
  }

  if (start_date > end_date) {
    return res.status(400).json({
      success: false,
      error: 'Start date must be before end date',
      details: { start_date, end_date }
    });
  }

  db.get(
    `SELECT
      COUNT(DISTINCT o.id) as total_orders,
      COALESCE(SUM(oi.quantity), 0) as total_items_sold
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.order_date BETWEEN ? AND ?`,
    [start_date, end_date],
    (err, row) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database query failed',
          details: { message: err.message }
        });
      }

      const totalOrders = row.total_orders || 0;
      const totalItems = row.total_items_sold || 0;
      const avgOrderValue = totalOrders > 0 ? Math.round((totalItems / totalOrders) * 100) / 100 : 0;

      res.json({
        success: true,
        data: {
          period: `${start_date} to ${end_date}`,
          total_orders: totalOrders,
          total_items_sold: totalItems,
          avg_items_per_order: avgOrderValue
        },
        message: 'Sales summary retrieved'
      });
    }
  );
});

// GET /api/analytics/sales-trend
router.get('/sales-trend', (req, res) => {
  const { start_date, end_date } = req.query;
  const interval = req.query.interval || 'daily';

  if (!start_date || !end_date) {
    return res.status(400).json({
      success: false,
      error: 'Missing parameters: start_date and end_date are required',
      details: { fields: ['start_date', 'end_date'] }
    });
  }

  if (!isValidDate(start_date) || !isValidDate(end_date)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid date format. Use YYYY-MM-DD',
      details: { fields: ['start_date', 'end_date'] }
    });
  }

  if (start_date > end_date) {
    return res.status(400).json({
      success: false,
      error: 'Start date must be before end date',
      details: { start_date, end_date }
    });
  }

  const groupBy = interval === 'monthly'
    ? "strftime('%Y-%m', o.order_date)"
    : "o.order_date";

  db.all(
    `SELECT
      ${groupBy} as date,
      COUNT(DISTINCT o.id) as orders,
      COALESCE(SUM(oi.quantity), 0) as items_sold
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.order_date BETWEEN ? AND ?
    GROUP BY ${groupBy}
    ORDER BY date ASC`,
    [start_date, end_date],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database query failed',
          details: { message: err.message }
        });
      }

      res.json({
        success: true,
        data: rows.map(row => ({
          date: row.date,
          orders: row.orders,
          items_sold: row.items_sold
        })),
        message: 'Sales trend retrieved'
      });
    }
  );
});

// GET /api/analytics/top-customers
router.get('/top-customers', (req, res) => {
  let limit = parseInt(req.query.limit) || 5;
  if (limit > 20) limit = 20;
  if (limit < 1) limit = 1;

  const { start_date, end_date } = req.query;

  let whereClause = '';
  const params = [];

  if (start_date && end_date) {
    if (!isValidDate(start_date) || !isValidDate(end_date)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD',
        details: { fields: ['start_date', 'end_date'] }
      });
    }
    if (start_date > end_date) {
      return res.status(400).json({
        success: false,
        error: 'Start date must be before end date',
        details: { start_date, end_date }
      });
    }
    whereClause = 'WHERE o.order_date BETWEEN ? AND ?';
    params.push(start_date, end_date);
  }

  params.push(limit);

  db.all(
    `SELECT
      c.id,
      c.name,
      COUNT(DISTINCT o.id) as orders,
      COALESCE(SUM(oi.quantity), 0) as items_purchased
    FROM customers c
    LEFT JOIN orders o ON c.id = o.customer_id ${whereClause ? whereClause.replace('WHERE', 'AND') : ''}
    LEFT JOIN order_items oi ON o.id = oi.order_id
    ${whereClause ? '' : ''}
    GROUP BY c.id
    HAVING orders > 0
    ORDER BY orders DESC
    LIMIT ?`,
    params,
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database query failed',
          details: { message: err.message }
        });
      }

      res.json({
        success: true,
        data: rows.map(row => ({
          id: row.id,
          name: row.name,
          orders: row.orders,
          items_purchased: row.items_purchased
        })),
        message: 'Top customers retrieved'
      });
    }
  );
});

// GET /api/analytics/top-products
router.get('/top-products', (req, res) => {
  let limit = parseInt(req.query.limit) || 5;
  if (limit > 20) limit = 20;
  if (limit < 1) limit = 1;

  const { start_date, end_date } = req.query;

  let whereClause = '';
  const params = [];

  if (start_date && end_date) {
    if (!isValidDate(start_date) || !isValidDate(end_date)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD',
        details: { fields: ['start_date', 'end_date'] }
      });
    }
    if (start_date > end_date) {
      return res.status(400).json({
        success: false,
        error: 'Start date must be before end date',
        details: { start_date, end_date }
      });
    }
    whereClause = 'WHERE o.order_date BETWEEN ? AND ?';
    params.push(start_date, end_date);
  }

  params.push(limit);

  db.all(
    `SELECT
      p.id,
      p.name,
      COALESCE(SUM(oi.quantity), 0) as qty_sold,
      COUNT(DISTINCT oi.order_id) as times_ordered
    FROM products p
    INNER JOIN order_items oi ON p.id = oi.product_id
    INNER JOIN orders o ON oi.order_id = o.id
    ${whereClause}
    GROUP BY p.id
    ORDER BY qty_sold DESC
    LIMIT ?`,
    params,
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database query failed',
          details: { message: err.message }
        });
      }

      res.json({
        success: true,
        data: rows.map(row => ({
          id: row.id,
          name: row.name,
          qty_sold: row.qty_sold,
          times_ordered: row.times_ordered
        })),
        message: 'Top products retrieved'
      });
    }
  );
});

// ==================== DASHBOARD SUMMARY ====================

// GET /api/analytics/dashboard-summary
router.get('/dashboard-summary', (req, res) => {
  const currentMonth = getCurrentMonth();

  // Run all queries in parallel using Promise.all pattern with callbacks
  let inventoryData = null;
  let hrData = null;
  let salesData = null;
  let completedQueries = 0;
  let hasError = false;

  function checkComplete() {
    completedQueries++;
    if (completedQueries === 3 && !hasError) {
      res.json({
        success: true,
        data: {
          inventory: inventoryData,
          hr: hrData,
          sales: salesData
        },
        message: 'Dashboard summary retrieved'
      });
    }
  }

  // Inventory query
  db.get(
    `SELECT
      COUNT(*) as total_products,
      (SELECT COUNT(*) FROM products WHERE quantity < 10) as low_stock_items
    FROM products`,
    [],
    (err, row) => {
      if (err) {
        hasError = true;
        return res.status(500).json({
          success: false,
          error: 'Database query failed',
          details: { message: err.message }
        });
      }
      inventoryData = {
        total_products: row.total_products || 0,
        low_stock_items: row.low_stock_items || 0
      };
      checkComplete();
    }
  );

  // HR query
  db.all(
    `SELECT
      e.id,
      e.monthly_salary,
      COALESCE(SUM(wh.hours), 0) as hours_logged
    FROM employees e
    LEFT JOIN work_hours wh ON e.id = wh.employee_id
      AND strftime('%Y-%m', wh.date) = ?
    GROUP BY e.id`,
    [currentMonth],
    (err, rows) => {
      if (err) {
        if (!hasError) {
          hasError = true;
          return res.status(500).json({
            success: false,
            error: 'Database query failed',
            details: { message: err.message }
          });
        }
        return;
      }

      const totalEmployees = rows.length;
      const totalPayroll = rows.reduce((sum, r) => {
        const calculated = (r.hours_logged / 160) * r.monthly_salary;
        return sum + calculated;
      }, 0);
      const fullPaidCount = rows.filter(r => r.hours_logged >= 160).length;
      const fullPaidPct = totalEmployees > 0 ? Math.round((fullPaidCount / totalEmployees) * 100) : 0;

      hrData = {
        total_employees: totalEmployees,
        payroll_this_month: Math.round(totalPayroll * 100) / 100,
        employees_full_paid_pct: fullPaidPct
      };
      checkComplete();
    }
  );

  // Sales query
  db.get(
    `SELECT
      COUNT(DISTINCT o.id) as total_orders_all_time,
      COALESCE(SUM(oi.quantity), 0) as total_items_sold
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id`,
    [],
    (err, row) => {
      if (err) {
        if (!hasError) {
          hasError = true;
          return res.status(500).json({
            success: false,
            error: 'Database query failed',
            details: { message: err.message }
          });
        }
        return;
      }
      salesData = {
        total_orders_all_time: row.total_orders_all_time || 0,
        total_items_sold: row.total_items_sold || 0
      };
      checkComplete();
    }
  );
});

// ==================== CSV EXPORT ENDPOINTS ====================

// GET /api/analytics/export/sales-csv
router.get('/export/sales-csv', (req, res) => {
  const { start_date, end_date } = req.query;

  if (!start_date || !end_date) {
    return res.status(400).json({
      success: false,
      error: 'Missing start_date or end_date'
    });
  }

  if (!isValidDate(start_date) || !isValidDate(end_date)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid date format. Use YYYY-MM-DD'
    });
  }

  db.all(
    `SELECT
      o.id as order_id,
      c.name as customer_name,
      o.order_date,
      o.status,
      COUNT(oi.id) as item_count,
      COALESCE(SUM(oi.quantity), 0) as total_quantity
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.order_date BETWEEN ? AND ?
    GROUP BY o.id
    ORDER BY o.order_date DESC`,
    [start_date, end_date],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database query failed'
        });
      }

      // Generate CSV with BOM for Excel UTF-8 compatibility
      let csv = '\ufeffBestellungs-ID;Kunde;Datum;Status;Produkte;Gesamtmenge\n';
      rows.forEach(row => {
        csv += `${row.order_id};"${row.customer_name}";${row.order_date};${row.status || 'created'};${row.item_count};${row.total_quantity}\n`;
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="vertrieb-export-${start_date}-${end_date}.csv"`);
      res.send(csv);
    }
  );
});

// GET /api/analytics/export/inventory-csv
router.get('/export/inventory-csv', (req, res) => {
  db.all(
    `SELECT id, name, category, quantity FROM products ORDER BY category, name`,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database query failed'
        });
      }

      // Generate CSV with BOM for Excel UTF-8 compatibility
      let csv = '\ufeffProdukt-ID;Name;Kategorie;Bestand\n';
      rows.forEach(row => {
        csv += `${row.id};"${row.name}";"${row.category}";${row.quantity}\n`;
      });

      const today = new Date().toISOString().split('T')[0];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="inventar-export-${today}.csv"`);
      res.send(csv);
    }
  );
});

// GET /api/analytics/export/payroll-csv
router.get('/export/payroll-csv', (req, res) => {
  const month = req.query.month || getCurrentMonth();

  if (!isValidMonth(month)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid month format. Use YYYY-MM'
    });
  }

  db.all(
    `SELECT
      e.id,
      e.name,
      e.position,
      e.monthly_salary,
      COALESCE(SUM(wh.hours), 0) as hours_logged
    FROM employees e
    LEFT JOIN work_hours wh ON e.id = wh.employee_id
      AND strftime('%Y-%m', wh.date) = ?
    GROUP BY e.id
    ORDER BY e.name`,
    [month],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          success: false,
          error: 'Database query failed'
        });
      }

      // Generate CSV with BOM for Excel UTF-8 compatibility
      let csv = '\ufeffMitarbeiter-ID;Name;Position;Monatliches Gehalt;Stunden gearbeitet;Berechnetes Gehalt;Status\n';
      rows.forEach(row => {
        const calculatedSalary = Math.round((row.hours_logged / 160) * row.monthly_salary * 100) / 100;
        const status = row.hours_logged >= 160 ? 'Voll bezahlt' : 'Teilweise bezahlt';
        csv += `${row.id};"${row.name}";"${row.position}";${row.monthly_salary};${row.hours_logged};${calculatedSalary};"${status}"\n`;
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="gehalt-export-${month}.csv"`);
      res.send(csv);
    }
  );
});

module.exports = router;
