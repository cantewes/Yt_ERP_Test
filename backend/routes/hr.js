const express = require('express');
const router = express.Router();
const db = require('../db');

// ==================== EMPLOYEES ====================

// GET /api/employees - Get all employees
router.get('/employees', (req, res) => {
  db.all('SELECT id, name, position, email, start_date, monthly_salary FROM employees', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    res.json({ success: true, data: rows, message: 'Employees retrieved' });
  });
});

// GET /api/employees/:id - Get single employee
router.get('/employees/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT id, name, position, email, start_date, monthly_salary FROM employees WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ success: false, error: 'Not found', message: 'Employee not found' });
    }
    res.json({ success: true, data: row, message: 'Employee retrieved' });
  });
});

// POST /api/employees - Create new employee
router.post('/employees', (req, res) => {
  const { name, position, email, start_date, monthly_salary } = req.body;

  if (!name || !position || !email || !start_date || monthly_salary === undefined) {
    return res.status(400).json({ success: false, error: 'Missing fields', message: 'All fields are required' });
  }

  if (typeof monthly_salary !== 'number' || monthly_salary < 0) {
    return res.status(400).json({ success: false, error: 'Invalid salary', message: 'Salary must be a non-negative number' });
  }

  const stmt = db.prepare('INSERT INTO employees (name, position, email, start_date, monthly_salary) VALUES (?, ?, ?, ?, ?)');
  stmt.run([name, position, email, start_date, monthly_salary], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ success: false, error: 'Duplicate email', message: 'Email already exists' });
      }
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    res.status(201).json({ success: true, data: { id: this.lastID, name, position, email, start_date, monthly_salary }, message: 'Employee created' });
  });
  stmt.finalize();
});

// PUT /api/employees/:id - Update employee
router.put('/employees/:id', (req, res) => {
  const { id } = req.params;
  const { name, position, email, start_date, monthly_salary } = req.body;

  if (monthly_salary !== undefined && (typeof monthly_salary !== 'number' || monthly_salary < 0)) {
    return res.status(400).json({ success: false, error: 'Invalid salary', message: 'Salary must be a non-negative number' });
  }

  db.get('SELECT * FROM employees WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ success: false, error: 'Not found', message: 'Employee not found' });
    }

    const updatedName = name || row.name;
    const updatedPosition = position || row.position;
    const updatedEmail = email || row.email;
    const updatedStartDate = start_date || row.start_date;
    const updatedSalary = monthly_salary !== undefined ? monthly_salary : row.monthly_salary;

    const stmt = db.prepare('UPDATE employees SET name = ?, position = ?, email = ?, start_date = ?, monthly_salary = ? WHERE id = ?');
    stmt.run([updatedName, updatedPosition, updatedEmail, updatedStartDate, updatedSalary, id], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(409).json({ success: false, error: 'Duplicate email', message: 'Email already exists' });
        }
        return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
      }
      res.json({ success: true, data: { id: parseInt(id), name: updatedName, position: updatedPosition, email: updatedEmail, start_date: updatedStartDate, monthly_salary: updatedSalary }, message: 'Employee updated' });
    });
    stmt.finalize();
  });
});

// DELETE /api/employees/:id - Delete employee and all work hours
router.delete('/employees/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM employees WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ success: false, error: 'Not found', message: 'Employee not found' });
    }

    // Delete work hours first, then employee
    db.run('DELETE FROM work_hours WHERE employee_id = ?', [id], (err) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
      }

      db.run('DELETE FROM employees WHERE id = ?', [id], (err) => {
        if (err) {
          return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
        }
        res.json({ success: true, data: null, message: 'Employee deleted' });
      });
    });
  });
});

// ==================== WORK HOURS ====================

// GET /api/work-hours/:employee_id - Get work hours for employee
router.get('/work-hours/:employee_id', (req, res) => {
  const { employee_id } = req.params;

  db.get('SELECT id FROM employees WHERE id = ?', [employee_id], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ success: false, error: 'Not found', message: 'Employee not found' });
    }

    db.all('SELECT id, employee_id, date, hours FROM work_hours WHERE employee_id = ? ORDER BY date DESC', [employee_id], (err, rows) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
      }
      res.json({ success: true, data: rows, message: 'Work hours retrieved' });
    });
  });
});

// POST /api/work-hours - Add work hours entry
router.post('/work-hours', (req, res) => {
  const { employee_id, date, hours } = req.body;

  if (!employee_id || !date || hours === undefined) {
    return res.status(400).json({ success: false, error: 'Missing fields', message: 'employee_id, date and hours are required' });
  }

  if (typeof hours !== 'number' || hours < 0 || hours > 24) {
    return res.status(400).json({ success: false, error: 'Invalid hours', message: 'Hours must be between 0 and 24' });
  }

  db.get('SELECT id FROM employees WHERE id = ?', [employee_id], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ success: false, error: 'Not found', message: 'Employee not found' });
    }

    const stmt = db.prepare('INSERT INTO work_hours (employee_id, date, hours) VALUES (?, ?, ?)');
    stmt.run([employee_id, date, hours], function(err) {
      if (err) {
        return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
      }
      res.status(201).json({ success: true, data: { id: this.lastID, employee_id, date, hours }, message: 'Work hours added' });
    });
    stmt.finalize();
  });
});

// DELETE /api/work-hours/:id - Delete work hours entry
router.delete('/work-hours/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM work_hours WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ success: false, error: 'Not found', message: 'Work hours entry not found' });
    }

    db.run('DELETE FROM work_hours WHERE id = ?', [id], (err) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
      }
      res.json({ success: true, data: null, message: 'Work hours entry deleted' });
    });
  });
});

// ==================== SALARY CALCULATION ====================

// GET /api/employees/:id/salary - Calculate salary based on hours
router.get('/employees/:id/salary', (req, res) => {
  const { id } = req.params;

  db.get('SELECT id, name, monthly_salary FROM employees WHERE id = ?', [id], (err, employee) => {
    if (err) {
      return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
    }
    if (!employee) {
      return res.status(404).json({ success: false, error: 'Not found', message: 'Employee not found' });
    }

    // Get current month's work hours
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const monthStart = `${year}-${month}-01`;
    const monthEnd = `${year}-${month}-31`;

    db.get(
      'SELECT COALESCE(SUM(hours), 0) as total_hours FROM work_hours WHERE employee_id = ? AND date >= ? AND date <= ?',
      [id, monthStart, monthEnd],
      (err, result) => {
        if (err) {
          return res.status(500).json({ success: false, error: err.message, message: 'Database error' });
        }

        const hoursLogged = result.total_hours;
        const calculatedSalary = (hoursLogged / 160) * employee.monthly_salary;

        res.json({
          success: true,
          data: {
            employee_id: parseInt(id),
            employee_name: employee.name,
            monthly_salary: employee.monthly_salary,
            hours_logged: hoursLogged,
            calculated_salary: Math.round(calculatedSalary * 100) / 100
          },
          message: 'Salary calculated'
        });
      }
    );
  });
});

module.exports = router;
