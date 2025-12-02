// User Management JavaScript

const alertContainer = document.getElementById('alert-container');
let editingUserId = null;

// Format date
function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('de-DE');
}

// Get status badge
function getStatusBadge(status) {
  const statusMap = {
    'active': { text: 'Aktiv', class: 'badge-success' },
    'suspended': { text: 'Gesperrt', class: 'badge-danger' },
    'locked': { text: 'Gesperrt (Login)', class: 'badge-warning' }
  };
  const s = statusMap[status] || { text: status, class: 'badge-secondary' };
  return `<span class="badge ${s.class}">${s.text}</span>`;
}

// Get role badge
function getRoleBadge(role) {
  const roleMap = {
    'admin': { text: 'Admin', class: 'badge-danger' },
    'manager': { text: 'Manager', class: 'badge-primary' },
    'viewer': { text: 'Viewer', class: 'badge-secondary' }
  };
  const r = roleMap[role] || { text: role, class: 'badge-secondary' };
  return `<span class="badge ${r.class}">${r.text}</span>`;
}

// Load users
async function loadUsers(status = '', role = '') {
  const table = document.getElementById('users-table');
  table.innerHTML = '<tr><td colspan="7" class="loading">Laden...</td></tr>';

  let endpoint = '/users?';
  if (status) endpoint += `status=${status}&`;
  if (role) endpoint += `role=${role}&`;

  const result = await api.get(endpoint);

  if (!result.success) {
    table.innerHTML = `<tr><td colspan="7" class="error">Fehler: ${result.error}</td></tr>`;
    return;
  }

  if (result.data.length === 0) {
    table.innerHTML = '<tr><td colspan="7" class="empty">Keine Benutzer gefunden</td></tr>';
    return;
  }

  const currentUser = auth.getUser();

  table.innerHTML = result.data.map(user => `
    <tr>
      <td>${user.id}</td>
      <td>${user.username}</td>
      <td>${user.email}</td>
      <td>${getRoleBadge(user.role)}</td>
      <td>${getStatusBadge(user.status)}</td>
      <td>${formatDate(user.last_login)}</td>
      <td>
        <button class="btn btn-small" onclick="editUser(${user.id})">Bearbeiten</button>
        <button class="btn btn-small btn-warning" onclick="openResetModal(${user.id}, '${user.username}')">Passwort</button>
        ${user.id !== currentUser.id ? `<button class="btn btn-small btn-danger" onclick="deleteUser(${user.id}, '${user.username}')">Loeschen</button>` : ''}
      </td>
    </tr>
  `).join('');
}

// Load audit logs
async function loadAuditLogs() {
  const table = document.getElementById('audit-table');
  table.innerHTML = '<tr><td colspan="6" class="loading">Laden...</td></tr>';

  const result = await api.get('/users/audit/logs?limit=50');

  if (!result.success) {
    table.innerHTML = `<tr><td colspan="6" class="error">Fehler: ${result.error}</td></tr>`;
    return;
  }

  if (result.data.length === 0) {
    table.innerHTML = '<tr><td colspan="6" class="empty">Keine Eintraege gefunden</td></tr>';
    return;
  }

  table.innerHTML = result.data.map(log => `
    <tr>
      <td>${formatDate(log.created_at)}</td>
      <td>${log.username || '-'}</td>
      <td>${log.action}</td>
      <td>${log.resource}${log.resource_id ? ` #${log.resource_id}` : ''}</td>
      <td><span class="badge ${log.result === 'success' ? 'badge-success' : 'badge-danger'}">${log.result}</span></td>
      <td>${log.ip_address || '-'}</td>
    </tr>
  `).join('');
}

// Open create user modal
function openCreateModal() {
  editingUserId = null;
  document.getElementById('modal-title').textContent = 'Neuer Benutzer';
  document.getElementById('user-form').reset();
  document.getElementById('user-id').value = '';
  document.getElementById('username').disabled = false;
  document.getElementById('password').required = true;
  document.getElementById('password-group').style.display = 'block';
  document.getElementById('status-group').style.display = 'none';
  document.getElementById('user-modal').classList.remove('hidden');
}

// Open edit user modal
async function editUser(id) {
  const result = await api.get(`/users/${id}`);

  if (!result.success) {
    showAlert(alertContainer, result.error || 'Fehler beim Laden', 'error');
    return;
  }

  const user = result.data;
  editingUserId = id;

  document.getElementById('modal-title').textContent = 'Benutzer bearbeiten';
  document.getElementById('user-id').value = id;
  document.getElementById('username').value = user.username;
  document.getElementById('username').disabled = true;
  document.getElementById('email').value = user.email;
  document.getElementById('role').value = user.role;
  document.getElementById('status').value = user.status;
  document.getElementById('password').value = '';
  document.getElementById('password').required = false;
  document.getElementById('password-group').style.display = 'none';
  document.getElementById('status-group').style.display = 'block';

  document.getElementById('user-modal').classList.remove('hidden');
}

// Open reset password modal
function openResetModal(id, username) {
  document.getElementById('reset-user-id').value = id;
  document.getElementById('reset-user-info').textContent = `Passwort fuer Benutzer "${username}" zuruecksetzen`;
  document.getElementById('reset-form').reset();
  document.getElementById('reset-modal').classList.remove('hidden');
}

// Delete user
async function deleteUser(id, username) {
  if (!confirm(`Benutzer "${username}" wirklich loeschen? Diese Aktion kann nicht rueckgaengig gemacht werden.`)) {
    return;
  }

  const result = await api.delete(`/users/${id}`);

  if (result.success) {
    showAlert(alertContainer, 'Benutzer geloescht', 'success');
    loadUsers(
      document.getElementById('status-filter').value,
      document.getElementById('role-filter').value
    );
    loadAuditLogs();
  } else {
    showAlert(alertContainer, result.error || 'Fehler beim Loeschen', 'error');
  }
}

// Setup event listeners
function setupEventListeners() {
  // Create user button
  document.getElementById('create-user-btn').addEventListener('click', openCreateModal);

  // Status filter
  document.getElementById('status-filter').addEventListener('change', () => {
    loadUsers(
      document.getElementById('status-filter').value,
      document.getElementById('role-filter').value
    );
  });

  // Role filter
  document.getElementById('role-filter').addEventListener('change', () => {
    loadUsers(
      document.getElementById('status-filter').value,
      document.getElementById('role-filter').value
    );
  });

  // User form submit
  document.getElementById('user-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const userId = document.getElementById('user-id').value;
    const isEdit = !!userId;

    const data = {
      email: document.getElementById('email').value,
      role: document.getElementById('role').value
    };

    if (isEdit) {
      data.status = document.getElementById('status').value;
    } else {
      data.username = document.getElementById('username').value;
      data.password = document.getElementById('password').value;

      if (!data.password) {
        showAlert(alertContainer, 'Passwort ist erforderlich', 'error');
        return;
      }
    }

    let result;
    if (isEdit) {
      result = await api.put(`/users/${userId}`, data);
    } else {
      result = await api.post('/users', data);
    }

    if (result.success) {
      showAlert(alertContainer, isEdit ? 'Benutzer aktualisiert' : 'Benutzer erstellt', 'success');
      document.getElementById('user-modal').classList.add('hidden');
      loadUsers(
        document.getElementById('status-filter').value,
        document.getElementById('role-filter').value
      );
      loadAuditLogs();
    } else {
      showAlert(alertContainer, result.error || 'Fehler beim Speichern', 'error');
    }
  });

  // Reset password form submit
  document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const userId = document.getElementById('reset-user-id').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (newPassword !== confirmPassword) {
      showAlert(alertContainer, 'Passwoerter stimmen nicht ueberein', 'error');
      return;
    }

    const result = await api.put(`/users/${userId}/reset-password`, {
      new_password: newPassword
    });

    if (result.success) {
      showAlert(alertContainer, 'Passwort zurueckgesetzt', 'success');
      document.getElementById('reset-modal').classList.add('hidden');
      loadAuditLogs();
    } else {
      showAlert(alertContainer, result.error || 'Fehler beim Zuruecksetzen', 'error');
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
}

// Initialize
loadUsers();
loadAuditLogs();
setupEventListeners();
