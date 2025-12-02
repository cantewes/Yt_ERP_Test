const API_BASE = '/api';

// Helper to get auth headers
function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = typeof auth !== 'undefined' ? auth.getToken() : null;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Handle 401 responses (redirect to login)
async function handleResponse(response) {
  if (response.status === 401) {
    if (typeof auth !== 'undefined') {
      auth.clearAuth();
    }
    // Add ?expired param so login page knows to clear stale tokens
    window.location.href = '/login.html?expired=1';
    return { success: false, error: 'Session expired' };
  }
  return response.json();
}

const api = {
  async get(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: getAuthHeaders()
    });
    return handleResponse(response);
  },

  async post(endpoint, data) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse(response);
  },

  async put(endpoint, data) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return handleResponse(response);
  },

  async delete(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return handleResponse(response);
  }
};

function showAlert(container, message, type = 'error') {
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type}`;
  alertDiv.textContent = message;
  container.innerHTML = '';
  container.appendChild(alertDiv);
  setTimeout(() => alertDiv.remove(), 5000);
}
