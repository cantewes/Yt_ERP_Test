// Chart instances for later updates
let chartInventoryCategory = null;
let chartPayroll = null;
let chartSalesTrend = null;
let chartTopCustomers = null;

// Data storage for drill-down
let inventoryCategoryData = [];
let topCustomersData = [];

// DOM Elements
const errorContainer = document.getElementById('errorContainer');
const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');
const applyFilterBtn = document.getElementById('applyFilter');
const resetFilterBtn = document.getElementById('resetFilter');

// Chart Colors
const COLORS = {
  inventory: '#36a2eb',
  hr: '#ff6384',
  sales: '#4bc0c0',
  palette: ['#36a2eb', '#ff6384', '#4bc0c0', '#ffce56', '#9966ff', '#ff9f40', '#c9cbcf']
};

// ==================== UTILITY FUNCTIONS ====================

// Debounce function to prevent rapid API calls
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

function showError(message) {
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert alert-error';
  alertDiv.textContent = message;
  errorContainer.innerHTML = '';
  errorContainer.appendChild(alertDiv);
  setTimeout(() => alertDiv.remove(), 5000);
}

function showSuccess(message) {
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert alert-success';
  alertDiv.textContent = message;
  errorContainer.innerHTML = '';
  errorContainer.appendChild(alertDiv);
  setTimeout(() => alertDiv.remove(), 3000);
}

function showLoading() {
  const spinner = document.createElement('div');
  spinner.id = 'loadingSpinner';
  spinner.className = 'loading-spinner';
  document.body.appendChild(spinner);
}

function hideLoading() {
  const spinner = document.getElementById('loadingSpinner');
  if (spinner) spinner.remove();
}

function getDateRange() {
  return {
    start_date: startDateInput.value,
    end_date: endDateInput.value
  };
}

function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// ==================== KPI CARDS ====================

async function loadKPICards() {
  try {
    const result = await api.get('/analytics/dashboard-summary');
    if (!result.success) throw new Error(result.error);

    const data = result.data;

    document.getElementById('kpiTotalProducts').textContent = data.inventory.total_products;
    document.getElementById('kpiLowStock').textContent = data.inventory.low_stock_items;
    document.getElementById('kpiTotalEmployees').textContent = data.hr.total_employees;
    document.getElementById('kpiFullPaidPct').textContent = data.hr.employees_full_paid_pct;
    document.getElementById('kpiTotalOrders').textContent = data.sales.total_orders_all_time;
    document.getElementById('kpiTotalItems').textContent = data.sales.total_items_sold;

  } catch (error) {
    console.error('Error loading KPI cards:', error);
    showError('Fehler beim Laden der KPI-Daten');
  }
}

// ==================== INVENTORY CHART ====================

async function loadInventoryChart() {
  try {
    const result = await api.get('/analytics/inventory-by-category');
    if (!result.success) throw new Error(result.error);

    const data = result.data;
    inventoryCategoryData = data; // Store for drill-down
    const labels = data.map(item => item.category || 'Unbekannt');
    const values = data.map(item => item.total_units);

    if (chartInventoryCategory) {
      chartInventoryCategory.destroy();
    }

    const ctx = document.getElementById('chartInventoryCategory');
    if (!ctx) return;

    chartInventoryCategory = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: COLORS.palette.slice(0, labels.length),
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.raw || 0;
                const categoryData = inventoryCategoryData[context.dataIndex];
                const productCount = categoryData ? categoryData.product_count : 0;
                return `${label}: ${value} Einheiten (${productCount} Produkte)`;
              }
            }
          }
        },
        onClick: (event, activeElements) => {
          if (activeElements.length > 0) {
            const index = activeElements[0].index;
            const category = labels[index];
            showProductsInCategory(category);
          }
        }
      }
    });

  } catch (error) {
    console.error('Error loading inventory chart:', error);
  }
}

// Drill-down: Show products in selected category
async function showProductsInCategory(category) {
  try {
    const result = await api.get('/products');
    if (!result.success) throw new Error(result.error);

    const products = result.data.filter(p => p.category === category);

    const drillDownSection = document.getElementById('drillDownSection');
    const drillDownTitle = document.getElementById('drillDownTitle');
    const drillDownTableHead = document.getElementById('drillDownTableHead');
    const drillDownTableBody = document.getElementById('drillDownTableBody');

    drillDownTitle.textContent = `Produkte in Kategorie: ${category}`;

    drillDownTableHead.innerHTML = `
      <tr>
        <th>ID</th>
        <th>Name</th>
        <th>Bestand</th>
      </tr>
    `;

    if (products.length === 0) {
      drillDownTableBody.innerHTML = '<tr><td colspan="3">Keine Produkte gefunden</td></tr>';
    } else {
      drillDownTableBody.innerHTML = products.map(p => `
        <tr>
          <td>${p.id}</td>
          <td>${p.name}</td>
          <td class="${p.quantity < 5 ? 'stock-critical' : p.quantity < 10 ? 'stock-warning' : ''}">${p.quantity}</td>
        </tr>
      `).join('');
    }

    drillDownSection.style.display = 'block';
    drillDownSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (error) {
    console.error('Error loading products for category:', error);
    showError('Fehler beim Laden der Produktdetails');
  }
}

// ==================== PAYROLL CHART ====================

async function loadPayrollChart() {
  try {
    const month = getCurrentMonth();
    const result = await api.get(`/analytics/payroll?month=${month}`);
    if (!result.success) throw new Error(result.error);

    const data = result.data;
    const employees = data.employees || [];
    const labels = employees.map(e => e.name);
    const salaries = employees.map(e => e.calculated_salary);

    if (chartPayroll) {
      chartPayroll.destroy();
    }

    const ctx = document.getElementById('chartPayroll');
    if (!ctx) return;

    chartPayroll = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels.length > 0 ? labels : ['Keine Daten'],
        datasets: [{
          label: 'Berechnetes Gehalt (EUR)',
          data: salaries.length > 0 ? salaries : [0],
          backgroundColor: COLORS.hr,
          borderColor: COLORS.hr,
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return value.toLocaleString('de-DE') + ' EUR';
              }
            }
          }
        }
      }
    });

  } catch (error) {
    console.error('Error loading payroll chart:', error);
  }
}

// ==================== SALES TREND CHART ====================

async function loadSalesTrendChart() {
  try {
    const { start_date, end_date } = getDateRange();
    const result = await api.get(`/analytics/sales-trend?start_date=${start_date}&end_date=${end_date}&interval=daily`);
    if (!result.success) throw new Error(result.error);

    const data = result.data || [];
    const labels = data.map(item => item.date);
    const orders = data.map(item => item.orders);
    const items = data.map(item => item.items_sold);

    if (chartSalesTrend) {
      chartSalesTrend.destroy();
    }

    const ctx = document.getElementById('chartSalesTrend');
    if (!ctx) return;

    chartSalesTrend = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels.length > 0 ? labels : ['Keine Daten'],
        datasets: [
          {
            label: 'Bestellungen',
            data: orders.length > 0 ? orders : [0],
            borderColor: COLORS.sales,
            backgroundColor: 'rgba(75, 192, 192, 0.1)',
            fill: true,
            tension: 0.4
          },
          {
            label: 'Artikel verkauft',
            data: items.length > 0 ? items : [0],
            borderColor: COLORS.inventory,
            backgroundColor: 'rgba(54, 162, 235, 0.1)',
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });

  } catch (error) {
    console.error('Error loading sales trend chart:', error);
  }
}

// ==================== TOP CUSTOMERS CHART ====================

async function loadTopCustomersChart() {
  try {
    const { start_date, end_date } = getDateRange();
    let endpoint = '/analytics/top-customers?limit=5';
    if (start_date && end_date) {
      endpoint += `&start_date=${start_date}&end_date=${end_date}`;
    }

    const result = await api.get(endpoint);
    if (!result.success) throw new Error(result.error);

    const data = result.data || [];
    topCustomersData = data; // Store for drill-down
    const labels = data.map(c => c.name);
    const orders = data.map(c => c.orders);

    if (chartTopCustomers) {
      chartTopCustomers.destroy();
    }

    const ctx = document.getElementById('chartTopCustomers');
    if (!ctx) return;

    chartTopCustomers = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels.length > 0 ? labels : ['Keine Daten'],
        datasets: [{
          label: 'Bestellungen',
          data: orders.length > 0 ? orders : [0],
          backgroundColor: COLORS.palette.slice(0, labels.length || 1),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const customerData = topCustomersData[context.dataIndex];
                const itemsPurchased = customerData ? customerData.items_purchased : 0;
                return `${context.raw} Bestellungen (${itemsPurchased} Artikel)`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true
          }
        },
        onClick: (event, activeElements) => {
          if (activeElements.length > 0 && topCustomersData.length > 0) {
            const index = activeElements[0].index;
            const customer = topCustomersData[index];
            if (customer && customer.id) {
              showCustomerOrders(customer.id, customer.name);
            }
          }
        }
      }
    });

  } catch (error) {
    console.error('Error loading top customers chart:', error);
  }
}

// Drill-down: Show orders from selected customer
async function showCustomerOrders(customerId, customerName) {
  try {
    const result = await api.get('/orders');
    if (!result.success) throw new Error(result.error);

    const orders = result.data.filter(o => o.customer_id === customerId);

    const drillDownSection = document.getElementById('drillDownSection');
    const drillDownTitle = document.getElementById('drillDownTitle');
    const drillDownTableHead = document.getElementById('drillDownTableHead');
    const drillDownTableBody = document.getElementById('drillDownTableBody');

    drillDownTitle.textContent = `Bestellungen von: ${customerName}`;

    drillDownTableHead.innerHTML = `
      <tr>
        <th>ID</th>
        <th>Datum</th>
        <th>Status</th>
        <th>Positionen</th>
      </tr>
    `;

    if (orders.length === 0) {
      drillDownTableBody.innerHTML = '<tr><td colspan="4">Keine Bestellungen gefunden</td></tr>';
    } else {
      drillDownTableBody.innerHTML = orders.map(o => {
        const itemCount = o.items ? o.items.length : 0;
        const totalQty = o.items ? o.items.reduce((sum, item) => sum + item.quantity, 0) : 0;
        return `
          <tr>
            <td>${o.id}</td>
            <td>${o.order_date}</td>
            <td>${o.status || 'created'}</td>
            <td>${itemCount} Produkte (${totalQty} Artikel)</td>
          </tr>
        `;
      }).join('');
    }

    drillDownSection.style.display = 'block';
    drillDownSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (error) {
    console.error('Error loading customer orders:', error);
    showError('Fehler beim Laden der Kundenbestellungen');
  }
}

// ==================== DATA TABLES ====================

async function loadLowStockTable() {
  try {
    const result = await api.get('/analytics/low-stock-items?threshold=10');
    if (!result.success) throw new Error(result.error);

    const tbody = document.getElementById('lowStockTableBody');
    const data = result.data || [];

    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3">Keine Produkte mit niedrigem Bestand</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(item => `
      <tr>
        <td>${item.name}</td>
        <td>${item.category}</td>
        <td class="${item.quantity < 5 ? 'stock-critical' : 'stock-warning'}">${item.quantity}</td>
      </tr>
    `).join('');

  } catch (error) {
    console.error('Error loading low stock table:', error);
    document.getElementById('lowStockTableBody').innerHTML = '<tr><td colspan="3">Fehler beim Laden</td></tr>';
  }
}

async function loadUnderThresholdTable() {
  try {
    const month = getCurrentMonth();
    const result = await api.get(`/analytics/employees-under-threshold?threshold=160&month=${month}`);
    if (!result.success) throw new Error(result.error);

    const tbody = document.getElementById('underThresholdTableBody');
    const data = result.data || [];

    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4">Alle Mitarbeiter haben 160+ Stunden</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(emp => `
      <tr>
        <td>${emp.name}</td>
        <td>${emp.hours_logged}h</td>
        <td>${emp.calculated_salary.toLocaleString('de-DE')} EUR</td>
        <td class="${emp.percentage < 50 ? 'pct-low' : 'pct-medium'}">${emp.percentage}%</td>
      </tr>
    `).join('');

  } catch (error) {
    console.error('Error loading under threshold table:', error);
    document.getElementById('underThresholdTableBody').innerHTML = '<tr><td colspan="4">Fehler beim Laden</td></tr>';
  }
}

// ==================== FILTER HANDLERS ====================

function validateDateRange(startDate, endDate) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    return { valid: false, error: 'Ungueltiges Datumsformat. Verwende YYYY-MM-DD' };
  }
  if (new Date(startDate) > new Date(endDate)) {
    return { valid: false, error: 'Startdatum muss vor Enddatum liegen' };
  }
  return { valid: true };
}

async function applyFilter() {
  const { start_date, end_date } = getDateRange();

  if (!start_date || !end_date) {
    showError('Bitte beide Datumswerte angeben');
    return;
  }

  const validation = validateDateRange(start_date, end_date);
  if (!validation.valid) {
    showError(validation.error);
    return;
  }

  // Disable button during load
  applyFilterBtn.disabled = true;
  applyFilterBtn.textContent = 'Laden...';

  try {
    await Promise.all([
      loadSalesTrendChart(),
      loadTopCustomersChart()
    ]);
  } finally {
    applyFilterBtn.disabled = false;
    applyFilterBtn.textContent = 'Filter anwenden';
  }
}

// Debounced version for auto-apply on date change
const debouncedApplyFilter = debounce(() => {
  const { start_date, end_date } = getDateRange();
  if (start_date && end_date) {
    const validation = validateDateRange(start_date, end_date);
    if (validation.valid) {
      applyFilter();
    }
  }
}, 500);

function resetFilter() {
  startDateInput.value = '2025-01-01';
  endDateInput.value = '2025-12-31';
  loadSalesTrendChart();
  loadTopCustomersChart();
}

// Close drill-down section
function closeDrillDown() {
  const drillDownSection = document.getElementById('drillDownSection');
  if (drillDownSection) {
    drillDownSection.style.display = 'none';
  }
}

// ==================== CSV EXPORT FUNCTIONS ====================

function exportSalesCSV() {
  const { start_date, end_date } = getDateRange();

  if (!start_date || !end_date) {
    showError('Bitte Datumsfilter setzen fuer den Export');
    return;
  }

  const validation = validateDateRange(start_date, end_date);
  if (!validation.valid) {
    showError(validation.error);
    return;
  }

  // Trigger file download
  window.location.href = `/api/analytics/export/sales-csv?start_date=${start_date}&end_date=${end_date}`;
  showSuccess('Sales CSV wird heruntergeladen...');
}

function exportInventoryCSV() {
  window.location.href = '/api/analytics/export/inventory-csv';
  showSuccess('Inventar CSV wird heruntergeladen...');
}

function exportPayrollCSV() {
  const month = getCurrentMonth();
  window.location.href = `/api/analytics/export/payroll-csv?month=${month}`;
  showSuccess('Gehalts CSV wird heruntergeladen...');
}

// ==================== INIT ====================

async function initDashboard() {
  showLoading();

  try {
    await Promise.all([
      loadKPICards(),
      loadInventoryChart(),
      loadPayrollChart(),
      loadSalesTrendChart(),
      loadTopCustomersChart(),
      loadLowStockTable(),
      loadUnderThresholdTable()
    ]);
  } catch (error) {
    console.error('Dashboard initialization error:', error);
    showError('Fehler beim Laden des Dashboards');
  } finally {
    hideLoading();
  }
}

// Event Listeners
applyFilterBtn.addEventListener('click', applyFilter);
resetFilterBtn.addEventListener('click', resetFilter);

// Auto-apply filter on date change (debounced)
startDateInput.addEventListener('change', debouncedApplyFilter);
endDateInput.addEventListener('change', debouncedApplyFilter);

// Export buttons
document.addEventListener('DOMContentLoaded', () => {
  const exportSalesBtn = document.getElementById('exportSalesCSV');
  const exportInventoryBtn = document.getElementById('exportInventoryCSV');
  const exportPayrollBtn = document.getElementById('exportPayrollCSV');
  const closeDrillDownBtn = document.getElementById('closeDrillDown');

  if (exportSalesBtn) exportSalesBtn.addEventListener('click', exportSalesCSV);
  if (exportInventoryBtn) exportInventoryBtn.addEventListener('click', exportInventoryCSV);
  if (exportPayrollBtn) exportPayrollBtn.addEventListener('click', exportPayrollCSV);
  if (closeDrillDownBtn) closeDrillDownBtn.addEventListener('click', closeDrillDown);
});

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initDashboard);
