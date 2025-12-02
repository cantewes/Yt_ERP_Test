// Email Orders Dashboard JavaScript - Phase 11b

const alertContainer = document.getElementById('alert-container');

// Format date for display
function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('de-DE');
}

// Get confidence color class
function getConfidenceClass(score) {
  if (score >= 0.8) return 'confidence-high';
  if (score >= 0.6) return 'confidence-medium';
  return 'confidence-low';
}

// Render confidence bar
function renderConfidenceBar(score) {
  const percent = Math.round(score * 100);
  const colorClass = getConfidenceClass(score);
  return `
    <div style="min-width: 80px;">
      <div class="confidence-bar">
        <div class="confidence-fill ${colorClass}" style="width: ${percent}%"></div>
      </div>
      <small>${percent}%</small>
    </div>
  `;
}

// Get status badge
function getStatusBadge(status) {
  const statusMap = {
    'PENDING_REVIEW': { text: 'Ausstehend', class: 'badge-warning' },
    'AUTO_APPROVED': { text: 'Auto-Genehmigt', class: 'badge-success' },
    'APPROVED': { text: 'Genehmigt', class: 'badge-success' },
    'REJECTED': { text: 'Abgelehnt', class: 'badge-danger' },
    'DUPLICATE_WARNING': { text: 'Duplikat?', class: 'badge-warning' },
    'PROCESSED': { text: 'Verarbeitet', class: 'badge-primary' }
  };
  const s = statusMap[status] || { text: status, class: 'badge-secondary' };
  return `<span class="badge ${s.class}">${s.text}</span>`;
}

// Load statistics
async function loadStats() {
  const result = await api.get('/email-orders/stats', { 'x-user-role': 'admin' });

  if (!result.success) {
    console.error('Failed to load stats:', result.error);
    return;
  }

  const data = result.data;
  document.getElementById('stat-pending').textContent = data.orders?.pending || 0;
  document.getElementById('stat-auto-approved').textContent = data.orders?.auto_approved || 0;
  document.getElementById('stat-approved').textContent = data.orders?.approved || 0;
  document.getElementById('stat-duplicates').textContent = data.orders?.duplicates || 0;
  document.getElementById('stat-errors').textContent = data.recentErrors || 0;
  document.getElementById('stat-avg-confidence').textContent = (data.avgConfidence * 100).toFixed(0) + '%';
}

// Load pending orders
async function loadPendingOrders() {
  const table = document.getElementById('pending-table');
  table.innerHTML = '<tr><td colspan="7" class="loading">Laden...</td></tr>';

  const result = await api.get('/email-orders/pending', { 'x-user-role': 'admin' });

  if (!result.success) {
    table.innerHTML = `<tr><td colspan="7" class="error">Fehler: ${result.error}</td></tr>`;
    return;
  }

  if (result.data.length === 0) {
    table.innerHTML = '<tr><td colspan="7" class="empty">Keine ausstehenden Bestellungen</td></tr>';
    return;
  }

  table.innerHTML = result.data.map(order => `
    <tr>
      <td>
        ${order.sender_email}
        ${order.status === 'DUPLICATE_WARNING' ? '<div class="duplicate-warning">Moegliches Duplikat!</div>' : ''}
      </td>
      <td>${order.product_name || order.extracted_product_name || '-'}</td>
      <td>${order.extracted_quantity}</td>
      <td>${renderConfidenceBar(order.confidence_score)}</td>
      <td>${formatDate(order.created_at)}</td>
      <td>${getStatusBadge(order.status)}</td>
      <td>
        <button class="btn btn-small btn-primary" onclick="openApproveModal(${order.id}, '${order.sender_email}', '${order.product_name || order.extracted_product_name}', ${order.extracted_quantity})">Genehmigen</button>
        <button class="btn btn-small btn-danger" onclick="openRejectModal(${order.id})">Ablehnen</button>
      </td>
    </tr>
  `).join('');
}

// Load auto-approved orders
async function loadAutoApproved() {
  const table = document.getElementById('auto-approved-table');
  table.innerHTML = '<tr><td colspan="5" class="loading">Laden...</td></tr>';

  const result = await api.get('/email-orders/auto-approved', { 'x-user-role': 'admin' });

  if (!result.success) {
    table.innerHTML = `<tr><td colspan="5" class="error">Fehler: ${result.error}</td></tr>`;
    return;
  }

  document.getElementById('auto-approved-summary').textContent =
    `${result.summary?.totalAutoApproved || 0} Bestellungen heute automatisch genehmigt`;

  if (result.data.length === 0) {
    table.innerHTML = '<tr><td colspan="5" class="empty">Keine automatisch genehmigten Bestellungen heute</td></tr>';
    return;
  }

  table.innerHTML = result.data.map(order => `
    <tr>
      <td>${order.sender_email}</td>
      <td>${order.product_name || order.extracted_product_name || '-'}</td>
      <td>${order.extracted_quantity}</td>
      <td>${renderConfidenceBar(order.confidence_score)}</td>
      <td>${formatDate(order.approved_at)}</td>
    </tr>
  `).join('');
}

// Load parsing errors
async function loadErrors() {
  const table = document.getElementById('errors-table');
  table.innerHTML = '<tr><td colspan="6" class="loading">Laden...</td></tr>';

  const result = await api.get('/email-orders/errors', { 'x-user-role': 'admin' });

  if (!result.success) {
    table.innerHTML = `<tr><td colspan="6" class="error">Fehler: ${result.error}</td></tr>`;
    return;
  }

  if (result.data.length === 0) {
    table.innerHTML = '<tr><td colspan="6" class="empty">Keine Fehler in den letzten 7 Tagen</td></tr>';
    return;
  }

  table.innerHTML = result.data.map(error => `
    <tr>
      <td>${error.sender_email}</td>
      <td><span class="badge badge-danger">${error.error_type}</span></td>
      <td>${error.error_message || '-'}</td>
      <td>${error.parse_attempt_count}</td>
      <td>${formatDate(error.created_at)}</td>
      <td>
        <button class="btn btn-small btn-danger" onclick="deleteError(${error.id})">Loeschen</button>
      </td>
    </tr>
  `).join('');
}

// Load service status
async function loadServiceStatus() {
  const result = await api.get('/email-orders/config/status', { 'x-user-role': 'admin' });

  if (!result.success) {
    console.error('Failed to load status:', result.error);
    return;
  }

  const data = result.data;
  document.getElementById('imap-status').textContent = data.imapConfigured ? 'Konfiguriert' : 'Nicht konfiguriert';
  document.getElementById('imap-status').className = 'badge ' + (data.imapConfigured ? 'badge-success' : 'badge-secondary');

  document.getElementById('smtp-status').textContent = data.smtpConfigured ? 'Konfiguriert' : 'Nicht konfiguriert';
  document.getElementById('smtp-status').className = 'badge ' + (data.smtpConfigured ? 'badge-success' : 'badge-secondary');

  document.getElementById('polling-status').textContent = data.isPolling ? 'Aktiv' : 'Inaktiv';
  document.getElementById('polling-status').className = 'badge ' + (data.isPolling ? 'badge-success' : 'badge-secondary');
}

// Open approve modal
function openApproveModal(orderId, email, product, quantity) {
  document.getElementById('approve-order-id').value = orderId;
  document.getElementById('approve-email').textContent = email;
  document.getElementById('approve-product').textContent = product;
  document.getElementById('approve-quantity').textContent = quantity;
  document.getElementById('approve-notes').value = '';
  document.getElementById('approve-modal').classList.remove('hidden');
}

// Confirm approve
async function confirmApprove() {
  const orderId = document.getElementById('approve-order-id').value;
  const notes = document.getElementById('approve-notes').value;

  const result = await api.post(`/email-orders/${orderId}/approve`, { notes }, { 'x-user-role': 'admin' });

  if (result.success) {
    showAlert(alertContainer, 'Bestellung genehmigt', 'success');
    document.getElementById('approve-modal').classList.add('hidden');
    loadPendingOrders();
    loadStats();
  } else {
    showAlert(alertContainer, result.error || 'Fehler beim Genehmigen', 'error');
  }
}

// Open reject modal
function openRejectModal(orderId) {
  document.getElementById('reject-order-id').value = orderId;
  document.getElementById('reject-reason').value = '';
  document.getElementById('reject-send-email').checked = true;
  document.getElementById('reject-modal').classList.remove('hidden');
}

// Confirm reject
async function confirmReject() {
  const orderId = document.getElementById('reject-order-id').value;
  const reason = document.getElementById('reject-reason').value;
  const sendEmail = document.getElementById('reject-send-email').checked;

  const result = await api.post(`/email-orders/${orderId}/reject`, { reason, sendEmail }, { 'x-user-role': 'admin' });

  if (result.success) {
    showAlert(alertContainer, 'Bestellung abgelehnt', 'success');
    document.getElementById('reject-modal').classList.add('hidden');
    loadPendingOrders();
    loadStats();
  } else {
    showAlert(alertContainer, result.error || 'Fehler beim Ablehnen', 'error');
  }
}

// Delete parsing error
async function deleteError(errorId) {
  if (!confirm('Fehler wirklich loeschen?')) return;

  const result = await api.delete(`/email-orders/errors/${errorId}`, { 'x-user-role': 'admin' });

  if (result.success) {
    showAlert(alertContainer, 'Fehler geloescht', 'success');
    loadErrors();
    loadStats();
  } else {
    showAlert(alertContainer, result.error || 'Fehler beim Loeschen', 'error');
  }
}

// Test parsing
async function testParsing() {
  const body = document.getElementById('test-email-body').value;

  if (!body) {
    showAlert(alertContainer, 'Bitte Email-Inhalt eingeben', 'error');
    return;
  }

  const result = await api.post('/email-orders/test-parse', { body }, { 'x-user-role': 'admin' });

  document.getElementById('parse-result').style.display = 'block';
  document.getElementById('parse-result-text').textContent = JSON.stringify(result.data || result, null, 2);
}

// Simulate email
async function simulateEmail() {
  const senderEmail = document.getElementById('sim-email').value;
  const subject = document.getElementById('sim-subject').value;
  const body = document.getElementById('sim-body').value;

  if (!senderEmail || !body) {
    showAlert(alertContainer, 'Bitte Email und Inhalt eingeben', 'error');
    return;
  }

  const result = await api.post('/email-orders/simulate', { senderEmail, subject, body }, { 'x-user-role': 'admin' });

  document.getElementById('simulate-result').style.display = 'block';
  document.getElementById('simulate-result-text').textContent = JSON.stringify(result.data || result, null, 2);

  if (result.success && result.data?.success) {
    showAlert(alertContainer, 'Email-Bestellung simuliert', 'success');
    loadPendingOrders();
    loadStats();
  }
}

// Save IMAP config
async function saveImapConfig() {
  const config = {
    host: document.getElementById('imap-host').value,
    port: document.getElementById('imap-port').value,
    user: document.getElementById('imap-user').value,
    password: document.getElementById('imap-password').value
  };

  if (!config.host || !config.user || !config.password) {
    showAlert(alertContainer, 'Bitte alle IMAP-Felder ausfuellen', 'error');
    return;
  }

  const result = await api.post('/email-orders/config/imap', config, { 'x-user-role': 'admin' });

  if (result.success) {
    showAlert(alertContainer, 'IMAP-Konfiguration gespeichert', 'success');
    loadServiceStatus();
  } else {
    showAlert(alertContainer, result.error || 'Fehler beim Speichern', 'error');
  }
}

// Save SMTP config
async function saveSmtpConfig() {
  const config = {
    host: document.getElementById('smtp-host').value,
    port: document.getElementById('smtp-port').value,
    user: document.getElementById('smtp-user').value,
    password: document.getElementById('smtp-password').value
  };

  if (!config.host || !config.user || !config.password) {
    showAlert(alertContainer, 'Bitte alle SMTP-Felder ausfuellen', 'error');
    return;
  }

  const result = await api.post('/email-orders/config/smtp', config, { 'x-user-role': 'admin' });

  if (result.success) {
    showAlert(alertContainer, 'SMTP-Konfiguration gespeichert', 'success');
    loadServiceStatus();
  } else {
    showAlert(alertContainer, result.error || 'Fehler beim Speichern', 'error');
  }
}

// Test IMAP connection
async function testImap() {
  const result = await api.post('/email-orders/config/test-imap', {}, { 'x-user-role': 'admin' });

  if (result.success) {
    showAlert(alertContainer, 'IMAP-Verbindung erfolgreich!', 'success');
  } else {
    showAlert(alertContainer, `IMAP-Fehler: ${result.error}`, 'error');
  }
}

// Test SMTP connection
async function testSmtp() {
  const result = await api.post('/email-orders/config/test-smtp', {}, { 'x-user-role': 'admin' });

  if (result.success) {
    showAlert(alertContainer, 'SMTP-Verbindung erfolgreich!', 'success');
  } else {
    showAlert(alertContainer, `SMTP-Fehler: ${result.error}`, 'error');
  }
}

// Start polling
async function startPolling() {
  const result = await api.post('/email-orders/polling/start', { intervalMinutes: 5 }, { 'x-user-role': 'admin' });

  if (result.success) {
    showAlert(alertContainer, 'Email-Polling gestartet (alle 5 Minuten)', 'success');
    loadServiceStatus();
  } else {
    showAlert(alertContainer, result.error || 'Fehler beim Starten', 'error');
  }
}

// Stop polling
async function stopPolling() {
  const result = await api.post('/email-orders/polling/stop', {}, { 'x-user-role': 'admin' });

  if (result.success) {
    showAlert(alertContainer, 'Email-Polling gestoppt', 'success');
    loadServiceStatus();
  } else {
    showAlert(alertContainer, result.error || 'Fehler beim Stoppen', 'error');
  }
}

// Trigger manual poll
async function triggerPoll() {
  showAlert(alertContainer, 'Pruefe Emails...', 'info');

  const result = await api.post('/email-orders/polling/trigger', {}, { 'x-user-role': 'admin' });

  if (result.success) {
    const data = result.data;
    showAlert(alertContainer, `Verarbeitet: ${data.processed}, Auto-Genehmigt: ${data.autoApproved}, Ausstehend: ${data.pendingReview}, Fehler: ${data.errors}`, 'success');
    loadPendingOrders();
    loadAutoApproved();
    loadStats();
  } else {
    showAlert(alertContainer, result.error || 'Fehler beim Abrufen', 'error');
  }
}

// Tab switching
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const tabId = tab.getAttribute('data-tab');
      document.getElementById(`tab-${tabId}`).classList.add('active');

      // Load data for tab
      if (tabId === 'pending') loadPendingOrders();
      else if (tabId === 'auto-approved') loadAutoApproved();
      else if (tabId === 'errors') loadErrors();
      else if (tabId === 'config') loadServiceStatus();
    });
  });
}

// Modal close handlers
function setupModals() {
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal').classList.add('hidden');
    });
  });

  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
      }
    });
  });
}

// Initialize
function init() {
  setupTabs();
  setupModals();
  loadStats();
  loadPendingOrders();
  loadServiceStatus();
}

init();
