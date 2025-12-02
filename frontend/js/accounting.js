// Check authentication on page load
document.addEventListener('DOMContentLoaded', async () => {
  if (!requireAuth()) return;

  await auth.fetchCurrentUser();
  updateUIForRole();
  setupLogoutButton();

  loadSummary();
  loadInvoices();
  loadOrders();
  setupEventListeners();
});

const alertContainer = document.getElementById('alert-container');

// Pagination state
let currentPage = 1;
const itemsPerPage = 10;

// Format currency
function formatCurrency(amount) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR'
  }).format(amount || 0);
}

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('de-DE');
}

// Get status badge
function getStatusBadge(status) {
  const statusMap = {
    'draft': { text: 'Entwurf', class: 'badge-secondary' },
    'sent': { text: 'Gesendet', class: 'badge-primary' },
    'paid': { text: 'Bezahlt', class: 'badge-success' },
    'overdue': { text: 'Ueberfaellig', class: 'badge-danger' },
    'cancelled': { text: 'Storniert', class: 'badge-secondary' }
  };
  const s = statusMap[status] || { text: status, class: 'badge-secondary' };
  return `<span class="badge ${s.class}">${s.text}</span>`;
}

// Load financial summary
async function loadSummary() {
  const result = await api.get('/accounting/summary');

  if (result.success) {
    const data = result.data;
    document.getElementById('total-invoiced').textContent = formatCurrency(data.invoices.total_amount);
    document.getElementById('total-paid').textContent = formatCurrency(data.invoices.by_status.paid.amount);
    document.getElementById('outstanding').textContent = formatCurrency(data.outstanding_balance);
    document.getElementById('overdue').textContent = formatCurrency(data.invoices.by_status.overdue.amount);
  }
}

// Load invoices
async function loadInvoices(status = '', page = 1) {
  currentPage = page;
  const table = document.getElementById('invoices-table');
  table.innerHTML = '<tr><td colspan="8" class="loading">Laden...</td></tr>';

  const offset = (page - 1) * itemsPerPage;
  let endpoint = `/accounting/invoices?limit=${itemsPerPage}&offset=${offset}`;
  if (status) {
    endpoint += `&status=${status}`;
  }

  const result = await api.get(endpoint);

  if (!result.success) {
    table.innerHTML = `<tr><td colspan="8" class="error">Fehler: ${result.error}</td></tr>`;
    return;
  }

  if (result.data.length === 0) {
    table.innerHTML = '<tr><td colspan="8" class="empty">Keine Rechnungen gefunden</td></tr>';
    return;
  }

  const user = auth.getUser();
  const canEdit = user && (user.role === 'admin' || user.role === 'manager');

  table.innerHTML = result.data.map(inv => `
    <tr>
      <td>${inv.invoice_number}</td>
      <td>${inv.customer_name}</td>
      <td>${formatDate(inv.invoice_date)}</td>
      <td>${formatDate(inv.due_date)}</td>
      <td>${formatCurrency(inv.total_amount)}</td>
      <td>${formatCurrency(inv.paid_amount)}</td>
      <td>${getStatusBadge(inv.status)}</td>
      <td>
        <button class="btn btn-small" onclick="viewInvoice(${inv.id})">Details</button>
        ${canEdit && inv.status === 'draft' ? `<button class="btn btn-small btn-primary" onclick="sendInvoice(${inv.id})">Senden</button>` : ''}
        ${canEdit && ['sent', 'overdue'].includes(inv.status) ? `<button class="btn btn-small btn-success" onclick="openPaymentModal(${inv.id}, ${inv.total_amount}, ${inv.paid_amount})">Zahlung</button>` : ''}
      </td>
    </tr>
  `).join('');

  // Update pagination
  updatePagination(result.data.length);
}

// Update pagination controls
function updatePagination(resultCount) {
  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');
  const pageInfo = document.getElementById('page-info');

  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = resultCount < itemsPerPage;

  pageInfo.textContent = `Seite ${currentPage}`;
}

// Load orders for invoice creation
async function loadOrders() {
  const select = document.getElementById('order-id');

  const result = await api.get('/orders');

  if (result.success && result.data) {
    result.data.forEach(order => {
      const option = document.createElement('option');
      option.value = order.id;
      option.textContent = `#${order.id} - ${order.customer_name || 'Kunde ' + order.customer_id} (${formatDate(order.order_date)})`;
      select.appendChild(option);
    });
  }
}

// View invoice details
async function viewInvoice(id) {
  const modal = document.getElementById('detail-modal');
  const content = document.getElementById('invoice-detail');
  content.innerHTML = '<p class="loading">Laden...</p>';
  modal.classList.remove('hidden');

  const result = await api.get(`/accounting/invoices/${id}`);

  if (!result.success) {
    content.innerHTML = `<p class="error">Fehler: ${result.error}</p>`;
    return;
  }

  const inv = result.data;

  content.innerHTML = `
    <div class="invoice-header">
      <div>
        <h3>${inv.invoice_number}</h3>
        <p>Kunde: ${inv.customer_name}</p>
        <p>E-Mail: ${inv.customer_email || '-'}</p>
      </div>
      <div>
        ${getStatusBadge(inv.status)}
      </div>
    </div>

    <div class="invoice-dates">
      <p><strong>Rechnungsdatum:</strong> ${formatDate(inv.invoice_date)}</p>
      <p><strong>Faelligkeitsdatum:</strong> ${formatDate(inv.due_date)}</p>
    </div>

    <h4>Positionen</h4>
    <table class="data-table">
      <thead>
        <tr>
          <th>Produkt</th>
          <th>Menge</th>
          <th>Preis</th>
          <th>Summe</th>
        </tr>
      </thead>
      <tbody>
        ${inv.items.map(item => {
          const unitPrice = item.unit_price || 10;
          return `
          <tr>
            <td>${item.product_name}</td>
            <td>${item.quantity}</td>
            <td>${formatCurrency(unitPrice)}</td>
            <td>${formatCurrency(item.quantity * unitPrice)}</td>
          </tr>
        `}).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3"><strong>Gesamt</strong></td>
          <td><strong>${formatCurrency(inv.total_amount)}</strong></td>
        </tr>
      </tfoot>
    </table>

    <h4>Zahlungen</h4>
    ${inv.payments.length > 0 ? `
      <table class="data-table">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Betrag</th>
            <th>Zahlungsart</th>
            <th>Referenz</th>
          </tr>
        </thead>
        <tbody>
          ${inv.payments.map(p => `
            <tr>
              <td>${formatDate(p.payment_date)}</td>
              <td>${formatCurrency(p.amount)}</td>
              <td>${p.payment_method || '-'}</td>
              <td>${p.reference || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<p>Keine Zahlungen erfasst</p>'}

    <div class="invoice-totals">
      <p><strong>Gesamtbetrag:</strong> ${formatCurrency(inv.total_amount)}</p>
      <p><strong>Bezahlt:</strong> ${formatCurrency(inv.paid_amount)}</p>
      <p><strong>Offen:</strong> ${formatCurrency(inv.remaining_amount)}</p>
    </div>

    ${inv.notes ? `<div class="invoice-notes"><h4>Notizen</h4><p>${inv.notes}</p></div>` : ''}
  `;

  // Store current invoice data for printing
  window.currentInvoiceData = inv;
}

// Print invoice as PDF
function printInvoice() {
  const inv = window.currentInvoiceData;
  if (!inv) {
    alert('Keine Rechnungsdaten verfuegbar');
    return;
  }

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <title>Rechnung ${inv.invoice_number}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
        .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
        .company { font-size: 24px; font-weight: bold; color: #2c3e50; }
        .invoice-title { font-size: 28px; color: #3498db; margin-bottom: 10px; }
        .invoice-number { font-size: 14px; color: #666; }
        .customer-info { margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-radius: 5px; }
        .customer-info h3 { margin: 0 0 10px 0; color: #2c3e50; }
        .dates { display: flex; gap: 40px; margin-bottom: 30px; }
        .dates div { padding: 10px; background: #ecf0f1; border-radius: 5px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #3498db; color: white; }
        .text-right { text-align: right; }
        .total-row { font-weight: bold; font-size: 18px; background: #f8f9fa; }
        .footer { margin-top: 50px; padding-top: 20px; border-top: 2px solid #3498db; text-align: center; color: #666; }
        .status { display: inline-block; padding: 5px 15px; border-radius: 3px; font-weight: bold; }
        .status-draft { background: #95a5a6; color: white; }
        .status-sent { background: #3498db; color: white; }
        .status-paid { background: #27ae60; color: white; }
        .status-overdue { background: #e74c3c; color: white; }
        @media print { body { margin: 20px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="company">ERP System GmbH</div>
          <div>Musterstrasse 123<br>12345 Musterstadt<br>Deutschland</div>
        </div>
        <div style="text-align: right;">
          <div class="invoice-title">RECHNUNG</div>
          <div class="invoice-number">${inv.invoice_number}</div>
          <div class="status status-${inv.status}">${inv.status.toUpperCase()}</div>
        </div>
      </div>

      <div class="customer-info">
        <h3>Rechnungsempfaenger</h3>
        <div>${inv.customer_name}</div>
        <div>${inv.customer_email || ''}</div>
      </div>

      <div class="dates">
        <div><strong>Rechnungsdatum:</strong> ${formatDate(inv.invoice_date)}</div>
        <div><strong>Faelligkeitsdatum:</strong> ${formatDate(inv.due_date)}</div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Produkt</th>
            <th class="text-right">Menge</th>
            <th class="text-right">Einzelpreis</th>
            <th class="text-right">Summe</th>
          </tr>
        </thead>
        <tbody>
          ${inv.items.map(item => {
            const unitPrice = item.unit_price || 10;
            return `
            <tr>
              <td>${item.product_name}</td>
              <td class="text-right">${item.quantity}</td>
              <td class="text-right">${formatCurrency(unitPrice)}</td>
              <td class="text-right">${formatCurrency(item.quantity * unitPrice)}</td>
            </tr>
          `}).join('')}
          <tr class="total-row">
            <td colspan="3" class="text-right">Gesamtbetrag:</td>
            <td class="text-right">${formatCurrency(inv.total_amount)}</td>
          </tr>
        </tbody>
      </table>

      ${inv.paid_amount > 0 ? `
        <div style="margin-bottom: 20px;">
          <strong>Bereits bezahlt:</strong> ${formatCurrency(inv.paid_amount)}<br>
          <strong>Noch offen:</strong> ${formatCurrency(inv.remaining_amount)}
        </div>
      ` : ''}

      ${inv.notes ? `<div style="margin-bottom: 20px; padding: 15px; background: #fff3cd; border-radius: 5px;"><strong>Notizen:</strong> ${inv.notes}</div>` : ''}

      <div class="footer">
        <p>Vielen Dank fuer Ihren Auftrag!</p>
        <p>Zahlungsziel: ${formatDate(inv.due_date)} | Bank: Musterbank | IBAN: DE89 3704 0044 0532 0130 00</p>
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 250);
}

// Send invoice (change status to sent)
async function sendInvoice(id) {
  if (!confirm('Rechnung als gesendet markieren?')) return;

  const result = await api.put(`/accounting/invoices/${id}`, { status: 'sent' });

  if (result.success) {
    showAlert(alertContainer, 'Rechnung als gesendet markiert', 'success');
    loadInvoices(document.getElementById('status-filter').value);
    loadSummary();
  } else {
    showAlert(alertContainer, result.error || 'Fehler beim Aktualisieren', 'error');
  }
}

// Open payment modal
function openPaymentModal(invoiceId, total, paid) {
  const modal = document.getElementById('payment-modal');
  document.getElementById('payment-invoice-id').value = invoiceId;
  document.getElementById('invoice-total').textContent = formatCurrency(total);
  document.getElementById('invoice-paid').textContent = formatCurrency(paid);
  document.getElementById('invoice-remaining').textContent = formatCurrency(total - paid);
  document.getElementById('payment-amount').value = '';
  document.getElementById('payment-amount').max = total - paid;
  modal.classList.remove('hidden');
}

// Setup event listeners
function setupEventListeners() {
  // Status filter
  document.getElementById('status-filter').addEventListener('change', (e) => {
    loadInvoices(e.target.value);
  });

  // Create invoice button
  const createBtn = document.getElementById('create-invoice-btn');
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      const modal = document.getElementById('invoice-modal');
      // Set default due date to 30 days from now
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
      document.getElementById('due-date').value = dueDate.toISOString().slice(0, 10);
      modal.classList.remove('hidden');
    });
  }

  // Invoice form
  document.getElementById('invoice-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const orderId = document.getElementById('order-id').value;
    const dueDate = document.getElementById('due-date').value;
    const notes = document.getElementById('invoice-notes').value;

    if (!orderId) {
      showAlert(alertContainer, 'Bitte waehlen Sie eine Bestellung aus', 'error');
      return;
    }

    const result = await api.post('/accounting/invoices', {
      order_id: parseInt(orderId),
      due_date: dueDate,
      notes: notes || undefined
    });

    if (result.success) {
      showAlert(alertContainer, `Rechnung ${result.data.invoice_number} erstellt`, 'success');
      document.getElementById('invoice-modal').classList.add('hidden');
      document.getElementById('invoice-form').reset();
      loadInvoices();
      loadSummary();
    } else {
      showAlert(alertContainer, result.error || 'Fehler beim Erstellen', 'error');
    }
  });

  // Payment form
  document.getElementById('payment-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const invoiceId = document.getElementById('payment-invoice-id').value;
    const amount = parseFloat(document.getElementById('payment-amount').value);
    const method = document.getElementById('payment-method').value;
    const reference = document.getElementById('payment-reference').value;

    if (!amount || amount <= 0) {
      showAlert(alertContainer, 'Bitte geben Sie einen gueltigen Betrag ein', 'error');
      return;
    }

    const result = await api.post('/accounting/payments', {
      invoice_id: parseInt(invoiceId),
      amount: amount,
      payment_method: method,
      reference: reference || undefined
    });

    if (result.success) {
      showAlert(alertContainer, 'Zahlung erfasst', 'success');
      document.getElementById('payment-modal').classList.add('hidden');
      document.getElementById('payment-form').reset();
      loadInvoices(document.getElementById('status-filter').value);
      loadSummary();
    } else {
      showAlert(alertContainer, result.error || 'Fehler beim Erfassen', 'error');
    }
  });

  // Modal close buttons
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal').classList.add('hidden');
    });
  });

  // Close modal on outside click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });

  // Pagination buttons
  document.getElementById('prev-page').addEventListener('click', () => {
    loadInvoices(document.getElementById('status-filter').value, currentPage - 1);
  });

  document.getElementById('next-page').addEventListener('click', () => {
    loadInvoices(document.getElementById('status-filter').value, currentPage + 1);
  });
}
