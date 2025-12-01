const API_BASE = '/api';

const api = {
  async get(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`);
    return response.json();
  },

  async post(endpoint, data) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return response.json();
  },

  async put(endpoint, data) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return response.json();
  },

  async delete(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'DELETE'
    });
    return response.json();
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
