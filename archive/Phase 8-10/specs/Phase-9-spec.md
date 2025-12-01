# Phase 9: Analytics Frontend UI & Charts Specification

**Version:** 2.0 (Refactored)  
**Date:** December 1, 2025  
**Scope:** Dashboard layout, components, key code patterns only  
**Duration:** 4–5 days (realistic estimate)  

---

## OVERVIEW

**Goal:** Build dashboard page that displays KPI data from Phase 8 API.  
**Inputs:** Phase 8 API endpoints (read-only JSON)  
**Outputs:** Interactive HTML dashboard with Chart.js visualizations  
**Constraints:** Vanilla JS (no frameworks), responsive design, Chart.js lightweight  

**Tech:** HTML/CSS, Vanilla JS, Chart.js 3.x (from CDN), no new dependencies.

---

## UI LAYOUT (Desktop-First)

**Dashboard Structure (1024px+ width):**

```
┌─ HEADER ──────────────────────────────┐
│ ERP | Inventory | HR | Sales | [Analytics] │
└───────────────────────────────────────┘

┌─ FILTERS ────────────────────────────┐
│ Date Range: [Start] [End] [Apply] [Reset] │
└──────────────────────────────────────┘

┌─ KPI CARDS (3-column grid) ───────────┐
│ [Inventory] [HR] [Sales] │
└──────────────────────────────────────┘

┌─ CHARTS ROW 1 (2-column grid) ────────┐
│ [Inventory by Category] [Payroll] │
└──────────────────────────────────────┘

┌─ CHARTS ROW 2 (2-column grid) ────────┐
│ [Sales Trend] [Top Customers] │
└──────────────────────────────────────┘

┌─ DATA TABLES (2-column grid) ─────────┐
│ [Low Stock Items] [Employees <160h] │
└──────────────────────────────────────┘
```

---

## RESPONSIVE BREAKPOINTS

| Device | Width | Grid Layout |
|--------|-------|-------------|
| Desktop | 1024px+ | Multi-column (original layout) |
| Tablet | 768px–1023px | 2 columns, stack cards |
| Mobile | <768px | Single column, full width |

---

## COMPONENT ARCHITECTURE

### 1. Navigation Header (Existing, Updated)
Add link to analytics.html in existing navbar.

```html
<nav class="navbar">
    <ul>
        <li><a href="index.html">Dashboard</a></li>
        <li><a href="inventory.html">Inventory</a></li>
        <li><a href="hr.html">HR</a></li>
        <li><a href="sales.html">Sales</a></li>
        <li><a href="analytics.html" class="active">Analytics</a></li>
    </ul>
</nav>
```

---

### 2. KPI Card Component (Blueprint)

**Purpose:** Display single metric with label and value.  
**Reusable:** Yes, used 3 times (Inventory, HR, Sales)

**HTML Structure:**
```html
<div class="kpi-card inventory">
    <h3 class="kpi-title">Inventory</h3>
    <p class="kpi-value" id="kpi-total-products">--</p>
    <p class="kpi-label">Total Products</p>
</div>
```

**CSS (Design Tokens):**
```css
.kpi-card {
    background: white;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    border-left: 4px solid #ccc;
}

.kpi-card.inventory { border-left-color: #36a2eb; }
.kpi-card.hr { border-left-color: #ff6384; }
.kpi-card.sales { border-left-color: #4bc0c0; }

.kpi-value {
    font-size: 32px;
    font-weight: bold;
    color: #333;
    margin: 10px 0;
}

.kpi-label {
    font-size: 14px;
    color: #666;
    margin: 0;
}
```

---

### 3. Chart Container Component (Blueprint)

**Purpose:** Wrapper for Chart.js canvas elements.

**HTML Structure:**
```html
<div class="chart-container">
    <h3>Chart Title</h3>
    <canvas id="chart-unique-id"></canvas>
</div>
```

**CSS:**
```css
.chart-container {
    background: white;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    position: relative;
    height: 400px;
}

.chart-container canvas {
    max-height: 350px;
}
```

---

### 4. Filter Component (New)

**Purpose:** Date range filter for drill-down.

**HTML:**
```html
<section class="filter-section">
    <label for="start-date">Start Date:</label>
    <input type="date" id="start-date" value="2025-01-01">
    
    <label for="end-date">End Date:</label>
    <input type="date" id="end-date" value="2025-12-31">
    
    <button id="apply-filter" class="btn-primary">Apply Filter</button>
    <button id="reset-filter" class="btn-secondary">Reset</button>
</section>
```

**CSS:**
```css
.filter-section {
    background: white;
    padding: 15px;
    border-radius: 8px;
    margin-bottom: 20px;
    display: flex;
    gap: 15px;
    align-items: center;
    flex-wrap: wrap;
}

.filter-section label {
    font-weight: 600;
    font-size: 14px;
}

.filter-section input[type="date"] {
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
}

.btn-primary, .btn-secondary {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
}

.btn-primary {
    background: #36a2eb;
    color: white;
}

.btn-primary:hover {
    background: #2a7bb4;
}

.btn-secondary {
    background: #f0f0f0;
    color: #333;
}

.btn-secondary:hover {
    background: #e0e0e0;
}
```

---

## KEY CODE PATTERNS (Template)

### Pattern 1: Fetch & Display KPI Card

```javascript
async function loadKPICards() {
    try {
        const response = await fetch('/api/analytics/dashboard-summary');
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error);
        
        const data = result.data;
        document.getElementById('kpi-total-products').textContent = 
            data.inventory.total_products;
        document.getElementById('kpi-total-employees').textContent = 
            data.hr.total_employees;
        document.getElementById('kpi-total-orders').textContent = 
            data.sales.total_orders_all_time;
            
    } catch (error) {
        console.error('Error loading KPI cards:', error);
        showError('Failed to load KPI data');
    }
}
```

**Key Points:**
- Validate response.success before using data
- Use try-catch for all API calls
- Update DOM using getElementById + textContent (safe, no XSS risk)

---

### Pattern 2: Render Chart with Chart.js

```javascript
function renderChart(canvasId, chartType, labels, datasets, title) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) {
        console.error('Canvas element not found:', canvasId);
        return;
    }
    
    new Chart(ctx, {
        type: chartType,  // 'line', 'bar', 'doughnut', etc.
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                title: { display: true, text: title }
            }
        }
    });
}

// Usage Example:
const labels = ['Electronics', 'Clothing', 'Food'];
const datasets = [{
    data: [10, 5, 8],
    backgroundColor: ['#ff6384', '#36a2eb', '#ffce56']
}];
renderChart('chart-inventory-category', 'doughnut', labels, datasets, 'Inventory by Category');
```

**Key Points:**
- Check if canvas exists before creating chart
- Use responsive: true for mobile adaptation
- Store chart instances in variables if interactivity needed later

---

### Pattern 3: Load & Render Multiple Charts

```javascript
async function initDashboard() {
    showLoading();
    try {
        // Load data in parallel
        const [inventory, hr, sales] = await Promise.all([
            fetch('/api/analytics/inventory-summary').then(r => r.json()),
            fetch('/api/analytics/hr-summary').then(r => r.json()),
            fetch('/api/analytics/sales-summary?start_date=2025-01-01&end_date=2025-12-31').then(r => r.json())
        ]);
        
        // Validate all responses
        if (!inventory.success || !hr.success || !sales.success) {
            throw new Error('One or more API calls failed');
        }
        
        // Render charts
        renderInventoryChart(inventory.data);
        renderHRChart(hr.data);
        renderSalesChart(sales.data);
        
    } catch (error) {
        console.error('Dashboard error:', error);
        showError('Failed to load dashboard');
    } finally {
        hideLoading();
    }
}

document.addEventListener('DOMContentLoaded', initDashboard);
```

**Key Points:**
- Use Promise.all() for parallel requests
- Validate all responses before rendering
- Show/hide loading spinner in try-finally

---

### Pattern 4: Error Handling & User Feedback

```javascript
function showError(message) {
    const banner = document.getElementById('error-message');
    if (!banner) {
        const newBanner = document.createElement('div');
        newBanner.id = 'error-message';
        newBanner.className = 'error-banner';
        document.querySelector('main').prepend(newBanner);
    }
    
    document.getElementById('error-message').textContent = message;
    document.getElementById('error-message').style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        document.getElementById('error-message').style.display = 'none';
    }, 5000);
}

function showLoading() {
    const spinner = document.createElement('div');
    spinner.id = 'loading-spinner';
    spinner.className = 'spinner';
    document.body.appendChild(spinner);
}

function hideLoading() {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) spinner.remove();
}
```

**CSS for Error & Loading:**
```css
.error-banner {
    background-color: #f8d7da;
    border: 1px solid #f5c6cb;
    color: #721c24;
    padding: 12px;
    border-radius: 4px;
    margin-bottom: 20px;
}

.spinner {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 1000;
    width: 40px;
    height: 40px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid #36a2eb;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% { transform: translate(-50%, -50%) rotate(0deg); }
    100% { transform: translate(-50%, -50%) rotate(360deg); }
}
```

---

## DESIGN TOKENS (CSS)

**Colors:**
```css
:root {
    --color-primary: #36a2eb;
    --color-secondary: #4bc0c0;
    --color-accent: #ff6384;
    --color-bg: #f8f9fa;
    --color-text: #333;
    --color-text-light: #666;
    --color-border: #ddd;
    --color-error: #721c24;
}
```

**Spacing:**
```css
--spacing-xs: 8px;
--spacing-sm: 12px;
--spacing-md: 20px;
--spacing-lg: 30px;
```

**Shadows:**
```css
--shadow-sm: 0 1px 3px rgba(0,0,0,0.1);
--shadow-md: 0 2px 8px rgba(0,0,0,0.1);
```

---

## FILE STRUCTURE

```
frontend/
├── analytics.html              ← NEW: dashboard page
├── js/
│   ├── analytics.js            ← NEW: dashboard logic
│   └── api.js                  ← UPDATED: add analytics helper
├── css/
│   └── style.css               ← UPDATED: add dashboard styles
└── index.html                  ← UPDATED: nav link
```

---

## CHART.JS SETUP

**Include from CDN:**
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js"></script>
```

**Fallback (if CDN fails):**
```javascript
if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded. Using fallback visualization.');
    // Render simple table instead
    renderTableFallback();
}
```

---

## QUALITY GATE (Phase 9)

- ✓ analytics.html loads without errors (<3 seconds)
- ✓ All KPI cards populate with correct values
- ✓ All 4 charts render (Inventory, HR, Sales Trend, Top Customers)
- ✓ Tables display with sample data (Low Stock, Under 160h)
- ✓ No console errors (F12 Developer Tools)
- ✓ Responsive: desktop (1024px+), tablet (768px), mobile (<768px)
- ✓ Navigation links: all modules accessible
- ✓ Loading spinner shows/hides correctly
- ✓ Error banner displays on API failure

---

## ESTIMATED EFFORT

- HTML structure + layout: 0.5 day
- Chart.js integration + rendering: 1.5 days
- CSS styling + responsive design: 1.5 days
- Component refinement + testing: 0.5 day
- **Total: 4–5 days** (realistic, includes browser testing)

---

## NOTES FOR DEVELOPER

1. **Start with static data** before connecting to Phase 8 API
2. **Test responsiveness** at all breakpoints (use DevTools)
3. **Chart.js options** reference: https://www.chartjs.org/docs/latest/
4. **Use const/let** throughout (no var)
5. **Comment only complex logic** (code should self-document)
6. **Test on actual devices** before QA (desktop, tablet, phone)
