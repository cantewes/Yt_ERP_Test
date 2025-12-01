# Phase 10: Interactivity, Drill-Down & Export Specification

**Version:** 2.0 (Refactored)  
**Date:** December 1, 2025  
**Scope:** Interactive features for Phase 9 dashboard  
**Duration:** 3–4 days (realistic estimate)  

---

## OVERVIEW

**Goal:** Add interactivity, date filtering, drill-down, and export to Phase 9 dashboard.  
**Inputs:** Phase 9 dashboard + Phase 8 API  
**Outputs:** Fully interactive analytics dashboard with drill-down and export  
**Priority:** MUST-HAVE (date filter, drill-down) vs. NICE-TO-HAVE (CSV export)  

---

## FEATURES (Prioritized)

### PRIORITY 1: Must-Have (Days 1–2)

#### Feature 1.1: Date Range Filter
**Requirement:** Filter charts/tables by date range without page reload.

**User Flow:**
1. User selects start date and end date
2. Clicks "Apply Filter"
3. Dashboard queries API with new date range
4. Charts update (old data cleared, new data shown)
5. No errors on invalid ranges

**Implementation (High-Level):**
```javascript
document.getElementById('apply-filter').addEventListener('click', async () => {
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    
    // Validate dates
    if (!validateDateRange(startDate, endDate)) {
        showError('Invalid date range');
        return;
    }
    
    // Fetch new data
    const response = await fetch(
        `/api/analytics/sales-summary?start_date=${startDate}&end_date=${endDate}`
    );
    const result = await response.json();
    
    if (!result.success) {
        showError(result.error);
        return;
    }
    
    // Update charts
    updateSalesTrendChart(result.data);
});

function validateDateRange(startDate, endDate) {
    // Check format YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        return false;
    }
    
    // Check start <= end
    return new Date(startDate) <= new Date(endDate);
}
```

**API Calls Affected:**
- GET /api/analytics/sales-summary?start_date=X&end_date=Y
- GET /api/analytics/sales-trend?start_date=X&end_date=Y&interval=daily
- GET /api/analytics/top-customers?start_date=X&end_date=Y

**Reset Button:**
```javascript
document.getElementById('reset-filter').addEventListener('click', () => {
    document.getElementById('start-date').value = '2025-01-01';
    document.getElementById('end-date').value = '2025-12-31';
    initDashboard(); // Reload with default dates
});
```

**Performance Note:**
- Debounce filter changes by 500ms (avoid rapid API calls)
```javascript
const debouncedApplyFilter = debounce(() => {
    applyDateFilter();
}, 500);

document.getElementById('end-date').addEventListener('change', debouncedApplyFilter);

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}
```

---

#### Feature 1.2: Drill-Down (Click Chart → Detail View)
**Requirement:** Click on chart element (bar, slice) → show detailed data for that segment.

**Example 1: Click Inventory Category → Show all products in category**
```javascript
function renderInventoryChart(data) {
    const ctx = document.getElementById('chart-inventory-category').getContext('2d');
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.category_breakdown.map(c => c.category),
            datasets: [{
                data: data.category_breakdown.map(c => c.count),
                backgroundColor: ['#ff6384', '#36a2eb', '#ffce56', '#4bc0c0', '#9966ff']
            }]
        },
        options: {
            responsive: true,
            onClick: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const index = activeElements[0].index;
                    const category = data.category_breakdown[index].category;
                    
                    // Drill-down: show products in this category
                    showProductsInCategory(category);
                }
            }
        }
    });
}

function showProductsInCategory(category) {
    // Fetch products by category
    fetch(`/api/products?category=${category}`)
        .then(r => r.json())
        .then(result => {
            if (result.success) {
                // Show modal or expand table with products
                displayProductTable(result.data, category);
            }
        });
}
```

**Example 2: Click Top Customer → Show orders from that customer**
```javascript
function renderTopCustomersChart(data) {
    const ctx = document.getElementById('chart-top-customers').getContext('2d');
    
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.top_customers.map(c => c.name),
            datasets: [{
                label: 'Orders',
                data: data.top_customers.map(c => c.orders),
                backgroundColor: '#4bc0c0'
            }]
        },
        options: {
            responsive: true,
            onClick: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const customerId = data.top_customers[activeElements[0].index].id;
                    showCustomerOrders(customerId);
                }
            }
        }
    });
}

function showCustomerOrders(customerId) {
    fetch(`/api/orders?customer_id=${customerId}`)
        .then(r => r.json())
        .then(result => {
            if (result.success) {
                displayOrderTable(result.data, customerId);
            }
        });
}
```

**Drill-Down UI:**
- Option A: Modal popup with detail table
- Option B: Expand section below chart
- Recommendation: Option B (simpler, no modal library)

```html
<div class="drill-down-detail" id="drill-down-detail" style="display: none;">
    <h3 id="drill-down-title"></h3>
    <table id="drill-down-table">
        <thead></thead>
        <tbody></tbody>
    </table>
    <button onclick="closeDrillDown()">Close</button>
</div>
```

---

### PRIORITY 2: Nice-to-Have (Day 3, if time permits)

#### Feature 2.1: CSV Export
**Requirement:** Export table data as CSV file.

**New Backend Endpoints (Phase 8 Extension):**
```
GET /api/analytics/export/sales-csv?start_date=X&end_date=Y
GET /api/analytics/export/inventory-csv
GET /api/analytics/export/payroll-csv?month=2025-01
```

**Backend Implementation Example:**
```javascript
app.get('/api/analytics/export/sales-csv', (req, res) => {
    const { start_date, end_date } = req.query;
    
    // Validate dates
    if (!start_date || !end_date) {
        return res.status(400).json({
            success: false,
            error: 'Missing start_date or end_date'
        });
    }
    
    try {
        const stmt = db.prepare(`
            SELECT 
                o.id, 
                c.name as customer, 
                o.order_date, 
                COUNT(oi.id) as item_count
            FROM orders o
            JOIN customers c ON o.customer_id = c.id
            LEFT JOIN order_items oi ON o.id = oi.order_id
            WHERE o.order_date BETWEEN ? AND ?
            GROUP BY o.id
            ORDER BY o.order_date DESC
        `);
        
        const rows = stmt.all(start_date, end_date);
        
        // Generate CSV
        let csv = 'Order ID,Customer,Date,Items\n';
        rows.forEach(row => {
            csv += `${row.id},"${row.customer}",${row.order_date},${row.item_count}\n`;
        });
        
        // Return as file download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="sales-export.csv"');
        res.send(csv);
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to generate CSV'
        });
    }
});
```

**Frontend Export Button:**
```html
<button id="export-csv" class="btn-secondary">📥 Export as CSV</button>

<script>
document.getElementById('export-csv').addEventListener('click', () => {
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    
    // Trigger file download
    window.location.href = 
        `/api/analytics/export/sales-csv?start_date=${startDate}&end_date=${endDate}`;
});
</script>
```

**Status:** NICE-TO-HAVE (implement only if Phase 10 progress ahead of schedule)

---

## IMPLEMENTATION CHECKLIST

### Day 1–2: Date Filter
- [ ] Validate date inputs (format, range)
- [ ] Debounce API calls (500ms delay)
- [ ] Update charts with new data
- [ ] Handle empty results (show message, not blank charts)
- [ ] Test on all supported dates

### Day 2–3: Drill-Down
- [ ] Implement drill-down click handlers for each chart
- [ ] Create drill-down detail section (HTML + CSS)
- [ ] Fetch and display detail data
- [ ] Add "Close" or "Back" functionality
- [ ] Test drill-down flow end-to-end

### Day 3 (Optional): CSV Export
- [ ] Add backend export endpoints
- [ ] Create export buttons in UI
- [ ] Test CSV file generation and download
- [ ] Validate CSV formatting (Excel/Sheets compatible)

---

## QUALITY GATE (Phase 10)

**MUST-HAVE (Blocking):**
- ✓ Date filter: changes dates → API called → charts update (no page reload)
- ✓ Filter validation: invalid range → 400 error shown to user
- ✓ Reset button: clears filters → dashboard reloads with defaults
- ✓ Drill-down: click chart → detail section appears (or modal)
- ✓ Detail data: shows correct rows for selected segment
- ✓ Response time: all filter changes <1.5 seconds

**NICE-TO-HAVE (Non-Blocking):**
- ✓ CSV export: file downloads with correct data
- ✓ Mobile drill-down: works on small screens

**General:**
- ✓ No console errors
- ✓ Responsive: desktop, tablet, mobile all work
- ✓ Performance: page load <3s, filter update <1.5s
- ✓ Accessibility: keyboard navigation functional

---

## ESTIMATED EFFORT

- Date filter + API integration: 1 day
- Drill-down implementation: 1.5 days
- CSV export (optional): 0.5 day
- Testing + refinement: 1 day
- **Total: 3–4 days** (realistic)

**If CSV export is SKIPPED:** 2–3 days

---

## RISK MITIGATION

| Risk | Mitigation |
|------|-----------|
| Filter API calls too frequent | Implement debounce (500ms) + disable button during load |
| Drill-down slow with large datasets | Add LIMIT to detail queries, show pagination if needed |
| CSV file encoding issues | Use UTF-8, test with non-ASCII characters |
| Chart updates cause memory leaks | Destroy old chart instance before creating new one |

---

## NOTES FOR DEVELOPER

1. **Test filter with edge cases:** empty results, single day, full year
2. **Drill-down UX:** make it clear how to close detail view
3. **CSV export:** test file opens correctly in Excel, Google Sheets, vs Code
4. **Performance:** monitor network tab (should be 1 API call per filter change)
5. **Mobile:** test touch interactions on actual phone, not just DevTools

---

## NOTES FOR PO (QA)

**Test Cases for Phase 10:**
1. Apply date filter → verify 3 charts update with new data
2. Invalid date range (start > end) → verify error message shown
3. Click chart segment (e.g., category slice) → verify drill-down appears
4. Drill-down detail shows correct rows for selected segment
5. Reset button → clears filter, reloads dashboard
6. (Optional) Click "Export CSV" → verify file downloads and opens correctly
7. Responsive: resize browser to 1024px, 768px, 375px → layout adapts
8. Performance: use DevTools → page load <3s, filter change <1.5s, no memory warnings
