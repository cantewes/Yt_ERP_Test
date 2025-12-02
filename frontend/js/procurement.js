// Procurement Module JavaScript

// State
let suppliers = [];
let purchaseOrders = [];
let products = [];

// DOM Elements
const alertContainer = document.getElementById('alertContainer');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadSuppliers();
  loadProducts();
  loadPurchaseOrders();
  setupEventListeners();
});

// Tab Navigation
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;

      // Update buttons
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update content
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(`${tabId}-tab`).classList.add('active');

      // Load tab-specific data
      if (tabId === 'reports') {
        loadPerformanceReport();
        loadLowStockAlerts();
      } else if (tabId === 'receipts') {
        loadReceivableOrders();
      }
    });
  });
}

// Setup Event Listeners
function setupEventListeners() {
  // Supplier Form
  document.getElementById('supplierForm').addEventListener('submit', handleSupplierSubmit);
  document.getElementById('supplierSearch').addEventListener('input', filterSuppliers);
  document.getElementById('supplierStatusFilter').addEventListener('change', filterSuppliers);

  // Purchase Order Form
  document.getElementById('purchaseOrderForm').addEventListener('submit', handlePOSubmit);
  document.getElementById('addPoItem').addEventListener('click', addPOItemRow);
  document.getElementById('poStatusFilter').addEventListener('change', filterPurchaseOrders);
  document.getElementById('poSupplierFilter').addEventListener('change', filterPurchaseOrders);

  // Receipt Form
  document.getElementById('receiptForm').addEventListener('submit', handleReceiptSubmit);
  document.getElementById('receiptPO').addEventListener('change', loadPOItemsForReceipt);

  // Reports
  document.getElementById('loadReconciliation').addEventListener('click', loadReconciliationReport);

  // Edit Supplier Form
  document.getElementById('editSupplierForm').addEventListener('submit', handleSupplierUpdate);

  // Modal close buttons
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal').style.display = 'none';
    });
  });

  // Close modal on outside click
  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      e.target.style.display = 'none';
    }
  });
}

// Alert helper
function showAlert(message, type = 'info') {
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  alertContainer.innerHTML = '';
  alertContainer.appendChild(alert);
  setTimeout(() => alert.remove(), 5000);
}

// ==================== SUPPLIERS ====================

async function loadSuppliers() {
  try {
    const response = await api.fetch('/api/suppliers');
    suppliers = await response.json();
    renderSupplierTable();
    populateSupplierDropdowns();
  } catch (error) {
    console.error('Error loading suppliers:', error);
    showAlert('Fehler beim Laden der Lieferanten', 'error');
  }
}

function renderSupplierTable(filteredSuppliers = null) {
  const data = filteredSuppliers || suppliers;
  const tbody = document.getElementById('supplierTableBody');

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">Keine Lieferanten gefunden</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(s => `
    <tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.email || '-')}</td>
      <td>${escapeHtml(s.phone || '-')}</td>
      <td>${escapeHtml(s.contact_person || '-')}</td>
      <td>${formatPaymentTerms(s.payment_terms)}</td>
      <td><span class="status-badge status-${s.status}">${s.status === 'active' ? 'Aktiv' : 'Inaktiv'}</span></td>
      <td>
        <button class="btn btn-small" onclick="editSupplier(${s.id})">Bearbeiten</button>
        <button class="btn btn-small btn-info" onclick="viewSupplierPerformance(${s.id})">Performance</button>
      </td>
    </tr>
  `).join('');
}

function filterSuppliers() {
  const search = document.getElementById('supplierSearch').value.toLowerCase();
  const status = document.getElementById('supplierStatusFilter').value;

  const filtered = suppliers.filter(s => {
    const matchesSearch = !search ||
      s.name.toLowerCase().includes(search) ||
      (s.email && s.email.toLowerCase().includes(search)) ||
      (s.contact_person && s.contact_person.toLowerCase().includes(search));
    const matchesStatus = !status || s.status === status;
    return matchesSearch && matchesStatus;
  });

  renderSupplierTable(filtered);
}

async function handleSupplierSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  try {
    const response = await api.fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Fehler beim Erstellen');
    }

    showAlert('Lieferant erfolgreich erstellt', 'success');
    form.reset();
    loadSuppliers();
  } catch (error) {
    showAlert(error.message, 'error');
  }
}

function editSupplier(id) {
  const supplier = suppliers.find(s => s.id === id);
  if (!supplier) return;

  document.getElementById('editSupplierId').value = supplier.id;
  document.getElementById('editSupplierName').value = supplier.name;
  document.getElementById('editSupplierEmail').value = supplier.email || '';
  document.getElementById('editSupplierPhone').value = supplier.phone || '';
  document.getElementById('editSupplierContact').value = supplier.contact_person || '';
  document.getElementById('editSupplierPaymentTerms').value = supplier.payment_terms || 'NET30';
  document.getElementById('editSupplierStatus').value = supplier.status || 'active';
  document.getElementById('editSupplierAddress').value = supplier.address || '';
  document.getElementById('editSupplierNotes').value = supplier.notes || '';

  document.getElementById('supplierModal').style.display = 'block';
}

async function handleSupplierUpdate(e) {
  e.preventDefault();
  const id = document.getElementById('editSupplierId').value;
  const data = {
    name: document.getElementById('editSupplierName').value,
    email: document.getElementById('editSupplierEmail').value,
    phone: document.getElementById('editSupplierPhone').value,
    contact_person: document.getElementById('editSupplierContact').value,
    payment_terms: document.getElementById('editSupplierPaymentTerms').value,
    status: document.getElementById('editSupplierStatus').value,
    address: document.getElementById('editSupplierAddress').value,
    notes: document.getElementById('editSupplierNotes').value
  };

  try {
    const response = await api.fetch(`/api/suppliers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Fehler beim Aktualisieren');
    }

    showAlert('Lieferant erfolgreich aktualisiert', 'success');
    document.getElementById('supplierModal').style.display = 'none';
    loadSuppliers();
  } catch (error) {
    showAlert(error.message, 'error');
  }
}

async function viewSupplierPerformance(id) {
  try {
    const response = await api.fetch(`/api/suppliers/${id}/performance`);
    const perf = await response.json();

    const content = `
      <div class="performance-details">
        <h3>${escapeHtml(perf.name)}</h3>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Bestellungen</span>
            <span class="stat-value">${perf.total_orders || 0}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Pünktlichkeit</span>
            <span class="stat-value">${perf.on_time_percentage || 0}%</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Qualitätsbewertung</span>
            <span class="stat-value">${perf.avg_quality_rating || '-'}/5</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Fehlerrate</span>
            <span class="stat-value">${perf.defect_rate || 0}%</span>
          </div>
        </div>
      </div>
    `;

    document.getElementById('poModalContent').innerHTML = content;
    document.getElementById('poModal').style.display = 'block';
  } catch (error) {
    showAlert('Fehler beim Laden der Performance-Daten', 'error');
  }
}

function populateSupplierDropdowns() {
  const activeSuppliers = suppliers.filter(s => s.status === 'active');
  const options = activeSuppliers.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');

  document.getElementById('poSupplier').innerHTML = '<option value="">Lieferant wählen</option>' + options;
  document.getElementById('poSupplierFilter').innerHTML = '<option value="">Alle Lieferanten</option>' + options;
}

// ==================== PRODUCTS ====================

async function loadProducts() {
  try {
    const response = await api.fetch('/api/products');
    products = await response.json();
    populateProductDropdowns();
  } catch (error) {
    console.error('Error loading products:', error);
  }
}

function populateProductDropdowns() {
  const options = products.map(p => `<option value="${p.id}" data-price="${p.price}">${escapeHtml(p.name)} (${p.quantity} auf Lager)</option>`).join('');

  document.querySelectorAll('.po-product').forEach(select => {
    const currentValue = select.value;
    select.innerHTML = '<option value="">Produkt wählen</option>' + options;
    if (currentValue) select.value = currentValue;
  });
}

// ==================== PURCHASE ORDERS ====================

async function loadPurchaseOrders() {
  try {
    const response = await api.fetch('/api/purchase-orders');
    purchaseOrders = await response.json();
    renderPOTable();
  } catch (error) {
    console.error('Error loading purchase orders:', error);
    showAlert('Fehler beim Laden der Bestellungen', 'error');
  }
}

function renderPOTable(filteredOrders = null) {
  const data = filteredOrders || purchaseOrders;
  const tbody = document.getElementById('poTableBody');

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">Keine Bestellungen gefunden</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(po => `
    <tr>
      <td>${escapeHtml(po.po_number)}</td>
      <td>${escapeHtml(po.supplier_name || '-')}</td>
      <td>${formatDate(po.order_date)}</td>
      <td>${formatDate(po.expected_delivery)}</td>
      <td>${formatCurrency(po.total_amount)}</td>
      <td><span class="status-badge status-${po.status}">${formatPOStatus(po.status)}</span></td>
      <td>
        <button class="btn btn-small" onclick="viewPODetails(${po.id})">Details</button>
        ${getPOActions(po)}
      </td>
    </tr>
  `).join('');
}

function getPOActions(po) {
  const actions = [];

  if (po.status === 'draft') {
    actions.push(`<button class="btn btn-small btn-primary" onclick="sendPO(${po.id})">Senden</button>`);
  }
  if (po.status === 'sent') {
    actions.push(`<button class="btn btn-small btn-success" onclick="confirmPO(${po.id})">Bestätigen</button>`);
  }
  if (['draft', 'sent', 'confirmed', 'partially_received'].includes(po.status)) {
    actions.push(`<button class="btn btn-small btn-danger" onclick="cancelPO(${po.id})">Stornieren</button>`);
  }

  return actions.join(' ');
}

function filterPurchaseOrders() {
  const status = document.getElementById('poStatusFilter').value;
  const supplierId = document.getElementById('poSupplierFilter').value;

  const filtered = purchaseOrders.filter(po => {
    const matchesStatus = !status || po.status === status;
    const matchesSupplier = !supplierId || po.supplier_id == supplierId;
    return matchesStatus && matchesSupplier;
  });

  renderPOTable(filtered);
}

function addPOItemRow() {
  const container = document.getElementById('poItemsContainer');
  const options = products.map(p => `<option value="${p.id}" data-price="${p.price}">${escapeHtml(p.name)}</option>`).join('');

  const row = document.createElement('div');
  row.className = 'po-item-row';
  row.innerHTML = `
    <select class="po-product" required>
      <option value="">Produkt wählen</option>
      ${options}
    </select>
    <input type="number" class="po-quantity" placeholder="Menge" min="1" value="1" required>
    <input type="number" class="po-price" placeholder="Stückpreis" min="0" step="0.01" required>
    <span class="po-total">0.00 EUR</span>
    <button type="button" class="btn btn-danger btn-small remove-item">X</button>
  `;

  container.appendChild(row);
  setupPOItemRowEvents(row);
}

function setupPOItemRowEvents(row) {
  const productSelect = row.querySelector('.po-product');
  const quantityInput = row.querySelector('.po-quantity');
  const priceInput = row.querySelector('.po-price');
  const totalSpan = row.querySelector('.po-total');
  const removeBtn = row.querySelector('.remove-item');

  productSelect.addEventListener('change', () => {
    const option = productSelect.options[productSelect.selectedIndex];
    if (option.dataset.price) {
      priceInput.value = option.dataset.price;
      updateRowTotal();
    }
  });

  quantityInput.addEventListener('input', updateRowTotal);
  priceInput.addEventListener('input', updateRowTotal);

  removeBtn.addEventListener('click', () => {
    if (document.querySelectorAll('.po-item-row').length > 1) {
      row.remove();
      updatePOTotal();
    }
  });

  function updateRowTotal() {
    const qty = parseFloat(quantityInput.value) || 0;
    const price = parseFloat(priceInput.value) || 0;
    totalSpan.textContent = formatCurrency(qty * price);
    updatePOTotal();
  }
}

function updatePOTotal() {
  let total = 0;
  document.querySelectorAll('.po-item-row').forEach(row => {
    const qty = parseFloat(row.querySelector('.po-quantity').value) || 0;
    const price = parseFloat(row.querySelector('.po-price').value) || 0;
    total += qty * price;
  });
  document.getElementById('poTotalAmount').textContent = total.toFixed(2);
}

// Initialize first row events
document.querySelectorAll('.po-item-row').forEach(row => setupPOItemRowEvents(row));

async function handlePOSubmit(e) {
  e.preventDefault();

  const items = [];
  document.querySelectorAll('.po-item-row').forEach(row => {
    const productId = row.querySelector('.po-product').value;
    const quantity = row.querySelector('.po-quantity').value;
    const unitPrice = row.querySelector('.po-price').value;

    if (productId && quantity && unitPrice) {
      items.push({
        product_id: parseInt(productId),
        quantity: parseInt(quantity),
        unit_price: parseFloat(unitPrice)
      });
    }
  });

  if (items.length === 0) {
    showAlert('Mindestens eine Position erforderlich', 'error');
    return;
  }

  const data = {
    supplier_id: document.getElementById('poSupplier').value,
    expected_delivery: document.getElementById('poExpectedDelivery').value,
    notes: document.getElementById('poNotes').value,
    items
  };

  try {
    const response = await api.fetch('/api/purchase-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Fehler beim Erstellen');
    }

    const result = await response.json();
    showAlert(`Bestellung ${result.po_number} erfolgreich erstellt`, 'success');
    document.getElementById('purchaseOrderForm').reset();

    // Reset items to single row
    document.getElementById('poItemsContainer').innerHTML = `
      <div class="po-item-row">
        <select class="po-product" required>
          <option value="">Produkt wählen</option>
        </select>
        <input type="number" class="po-quantity" placeholder="Menge" min="1" value="1" required>
        <input type="number" class="po-price" placeholder="Stückpreis" min="0" step="0.01" required>
        <span class="po-total">0.00 EUR</span>
        <button type="button" class="btn btn-danger btn-small remove-item">X</button>
      </div>
    `;
    populateProductDropdowns();
    document.querySelectorAll('.po-item-row').forEach(row => setupPOItemRowEvents(row));
    document.getElementById('poTotalAmount').textContent = '0.00';

    loadPurchaseOrders();
  } catch (error) {
    showAlert(error.message, 'error');
  }
}

async function viewPODetails(id) {
  try {
    const response = await api.fetch(`/api/purchase-orders/${id}`);
    const po = await response.json();

    const itemsHtml = po.items.map(item => `
      <tr>
        <td>${escapeHtml(item.product_name)}</td>
        <td>${item.quantity_ordered}</td>
        <td>${item.quantity_received}</td>
        <td>${formatCurrency(item.unit_price)}</td>
        <td>${formatCurrency(item.total_price)}</td>
      </tr>
    `).join('');

    const content = `
      <div class="po-details">
        <div class="po-header-info">
          <p><strong>PO-Nr.:</strong> ${escapeHtml(po.po_number)}</p>
          <p><strong>Lieferant:</strong> ${escapeHtml(po.supplier_name)}</p>
          <p><strong>Status:</strong> <span class="status-badge status-${po.status}">${formatPOStatus(po.status)}</span></p>
          <p><strong>Bestelldatum:</strong> ${formatDate(po.order_date)}</p>
          <p><strong>Erwartete Lieferung:</strong> ${formatDate(po.expected_delivery)}</p>
          ${po.actual_delivery ? `<p><strong>Tatsächliche Lieferung:</strong> ${formatDate(po.actual_delivery)}</p>` : ''}
        </div>
        <h4>Positionen</h4>
        <table>
          <thead>
            <tr>
              <th>Produkt</th>
              <th>Bestellt</th>
              <th>Erhalten</th>
              <th>Stückpreis</th>
              <th>Gesamt</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
          <tfoot>
            <tr>
              <td colspan="4"><strong>Gesamtsumme</strong></td>
              <td><strong>${formatCurrency(po.total_amount)}</strong></td>
            </tr>
          </tfoot>
        </table>
        ${po.notes ? `<p><strong>Notizen:</strong> ${escapeHtml(po.notes)}</p>` : ''}
      </div>
    `;

    document.getElementById('poModalContent').innerHTML = content;
    document.getElementById('poModal').style.display = 'block';
  } catch (error) {
    showAlert('Fehler beim Laden der Bestelldetails', 'error');
  }
}

async function sendPO(id) {
  if (!confirm('Bestellung an Lieferanten senden?')) return;

  try {
    const response = await api.fetch(`/api/purchase-orders/${id}/send`, { method: 'POST' });
    if (!response.ok) throw new Error('Fehler beim Senden');
    showAlert('Bestellung erfolgreich gesendet', 'success');
    loadPurchaseOrders();
  } catch (error) {
    showAlert(error.message, 'error');
  }
}

async function confirmPO(id) {
  if (!confirm('Bestellung als bestätigt markieren?')) return;

  try {
    const response = await api.fetch(`/api/purchase-orders/${id}/confirm`, { method: 'POST' });
    if (!response.ok) throw new Error('Fehler beim Bestätigen');
    showAlert('Bestellung erfolgreich bestätigt', 'success');
    loadPurchaseOrders();
    loadReceivableOrders();
  } catch (error) {
    showAlert(error.message, 'error');
  }
}

async function cancelPO(id) {
  const reason = prompt('Stornierungsgrund (optional):');
  if (reason === null) return;

  try {
    const response = await api.fetch(`/api/purchase-orders/${id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    if (!response.ok) throw new Error('Fehler beim Stornieren');
    showAlert('Bestellung erfolgreich storniert', 'success');
    loadPurchaseOrders();
  } catch (error) {
    showAlert(error.message, 'error');
  }
}

// ==================== RECEIPTS (GRN) ====================

async function loadReceivableOrders() {
  try {
    const response = await api.fetch('/api/purchase-orders?status=confirmed');
    const confirmed = await response.json();

    const response2 = await api.fetch('/api/purchase-orders?status=partially_received');
    const partial = await response2.json();

    const orders = [...confirmed, ...partial];
    const select = document.getElementById('receiptPO');
    select.innerHTML = '<option value="">Bestellung wählen</option>' +
      orders.map(po => `<option value="${po.id}">${po.po_number} - ${escapeHtml(po.supplier_name)}</option>`).join('');
  } catch (error) {
    console.error('Error loading receivable orders:', error);
  }
}

async function loadPOItemsForReceipt() {
  const poId = document.getElementById('receiptPO').value;
  const container = document.getElementById('receiptItemsContainer');

  if (!poId) {
    container.innerHTML = '';
    return;
  }

  try {
    const response = await api.fetch(`/api/purchase-orders/${poId}`);
    const po = await response.json();

    container.innerHTML = po.items.filter(item => item.quantity_received < item.quantity_ordered).map(item => `
      <div class="receipt-item-row" data-item-id="${item.id}">
        <div class="receipt-item-info">
          <strong>${escapeHtml(item.product_name)}</strong>
          <span>Bestellt: ${item.quantity_ordered} | Erhalten: ${item.quantity_received} | Ausstehend: ${item.quantity_ordered - item.quantity_received}</span>
        </div>
        <div class="receipt-item-inputs">
          <input type="number" class="receipt-quantity" placeholder="Menge" min="0" max="${item.quantity_ordered - item.quantity_received}" value="${item.quantity_ordered - item.quantity_received}">
          <select class="receipt-quality">
            <option value="accepted">Akzeptiert</option>
            <option value="defective">Fehlerhaft</option>
            <option value="rejected">Abgelehnt</option>
          </select>
        </div>
      </div>
    `).join('');

    if (container.innerHTML === '') {
      container.innerHTML = '<p>Alle Positionen wurden bereits vollständig geliefert.</p>';
    }
  } catch (error) {
    showAlert('Fehler beim Laden der Bestellpositionen', 'error');
  }
}

async function handleReceiptSubmit(e) {
  e.preventDefault();
  const poId = document.getElementById('receiptPO').value;

  if (!poId) {
    showAlert('Bitte wählen Sie eine Bestellung', 'error');
    return;
  }

  const items = [];
  document.querySelectorAll('.receipt-item-row').forEach(row => {
    const itemId = row.dataset.itemId;
    const quantity = parseInt(row.querySelector('.receipt-quantity').value) || 0;
    const quality = row.querySelector('.receipt-quality').value;

    if (quantity > 0) {
      items.push({
        purchase_order_item_id: parseInt(itemId),
        quantity_received: quantity,
        quality_status: quality
      });
    }
  });

  if (items.length === 0) {
    showAlert('Keine Positionen zum Empfangen ausgewählt', 'error');
    return;
  }

  const data = {
    items,
    quality_notes: document.getElementById('receiptNotes').value
  };

  try {
    const response = await api.fetch(`/api/purchase-orders/${poId}/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Fehler beim Buchen');
    }

    const result = await response.json();
    showAlert(`Wareneingang ${result.grn_number} erfolgreich gebucht`, 'success');
    document.getElementById('receiptForm').reset();
    document.getElementById('receiptItemsContainer').innerHTML = '';
    loadPurchaseOrders();
    loadReceivableOrders();
  } catch (error) {
    showAlert(error.message, 'error');
  }
}

// ==================== REPORTS ====================

async function loadPerformanceReport() {
  try {
    const response = await api.fetch('/api/suppliers/reports/performance');
    const data = await response.json();
    const tbody = document.getElementById('performanceTableBody');

    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6">Keine Performance-Daten vorhanden</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(s => `
      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td>${s.total_orders || 0}</td>
        <td>${s.on_time_percentage || 0}%</td>
        <td>${s.avg_quality_rating || '-'}/5</td>
        <td>${s.defect_rate || 0}%</td>
        <td>${formatCurrency(s.total_spend || 0)}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error loading performance report:', error);
  }
}

async function loadLowStockAlerts() {
  try {
    const response = await api.fetch('/api/purchase-orders/reports/low-stock');
    const data = await response.json();
    const tbody = document.getElementById('lowStockTableBody');

    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7">Keine Niedrigbestand-Warnungen</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(p => `
      <tr>
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.category)}</td>
        <td>${p.current_stock}</td>
        <td>${p.reorder_level}</td>
        <td class="text-danger">${p.shortage}</td>
        <td>${p.preferred_supplier_name ? escapeHtml(p.preferred_supplier_name) : '-'}</td>
        <td>
          ${p.preferred_supplier_id ?
      `<button class="btn btn-small btn-primary" onclick="quickOrder(${p.id}, ${p.preferred_supplier_id}, ${p.shortage})">Bestellen</button>` :
      '-'}
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error loading low stock alerts:', error);
  }
}

async function loadReconciliationReport() {
  const fromDate = document.getElementById('reconcileFromDate').value;
  const toDate = document.getElementById('reconcileToDate').value;

  let url = '/api/purchase-orders/reports/reconciliation';
  const params = new URLSearchParams();
  if (fromDate) params.append('from_date', fromDate);
  if (toDate) params.append('to_date', toDate);
  if (params.toString()) url += '?' + params.toString();

  try {
    const response = await api.fetch(url);
    const data = await response.json();
    const tbody = document.getElementById('reconciliationTableBody');

    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7">Keine Daten im ausgewählten Zeitraum</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(r => `
      <tr>
        <td>${escapeHtml(r.po_number)}</td>
        <td>${escapeHtml(r.supplier_name)}</td>
        <td>${formatDate(r.order_date)}</td>
        <td>${r.total_ordered}</td>
        <td>${r.total_received}</td>
        <td>${r.pending_quantity}</td>
        <td><span class="status-badge status-${r.delivery_status.toLowerCase().replace(' ', '-')}">${r.delivery_status}</span></td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Error loading reconciliation report:', error);
    showAlert('Fehler beim Laden des Berichts', 'error');
  }
}

async function quickOrder(productId, supplierId, quantity) {
  const product = products.find(p => p.id === productId);
  if (!product) return;

  if (!confirm(`Schnellbestellung: ${quantity}x ${product.name}?`)) return;

  const data = {
    supplier_id: supplierId,
    items: [{
      product_id: productId,
      quantity: quantity,
      unit_price: product.price
    }]
  };

  try {
    const response = await api.fetch('/api/purchase-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error('Fehler beim Erstellen');
    const result = await response.json();
    showAlert(`Bestellung ${result.po_number} erstellt`, 'success');
    loadLowStockAlerts();
    loadPurchaseOrders();
  } catch (error) {
    showAlert(error.message, 'error');
  }
}

// ==================== HELPERS ====================

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('de-DE');
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount || 0);
}

function formatPaymentTerms(terms) {
  const map = {
    'NET30': '30 Tage netto',
    'NET60': '60 Tage netto',
    'NET14': '14 Tage netto',
    'PREPAID': 'Vorkasse'
  };
  return map[terms] || terms;
}

function formatPOStatus(status) {
  const map = {
    'draft': 'Entwurf',
    'sent': 'Gesendet',
    'confirmed': 'Bestätigt',
    'partially_received': 'Teillieferung',
    'received': 'Vollständig',
    'cancelled': 'Storniert'
  };
  return map[status] || status;
}
