// Auth token stored in sessionStorage for persistence across page loads
// sessionStorage is cleared when browser tab/window closes (more secure than localStorage)
let authToken = sessionStorage.getItem('authToken');
let currentUser = JSON.parse(sessionStorage.getItem('currentUser'));

const auth = {
  // Get current token
  getToken() {
    return authToken;
  },

  // Get current user
  getUser() {
    return currentUser;
  },

  // Check if user is logged in
  isLoggedIn() {
    return authToken !== null;
  },

  // Set auth data after login
  setAuth(token, user) {
    authToken = token;
    currentUser = user;
    sessionStorage.setItem('authToken', token);
    sessionStorage.setItem('currentUser', JSON.stringify(user));
  },

  // Clear auth data on logout
  clearAuth() {
    authToken = null;
    currentUser = null;
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('currentUser');
  },

  // Check if user has required role
  hasRole(...roles) {
    if (!currentUser) return false;
    return roles.includes(currentUser.role);
  },

  // Login
  async login(username, password) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const result = await response.json();

    if (result.success) {
      const user = {
        id: result.user_id,
        role: result.role
      };
      this.setAuth(result.token, user);
    }

    return result;
  },

  // Logout
  async logout() {
    if (!authToken) return { success: true };

    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        }
      });

      const result = await response.json();
      this.clearAuth();
      return result;
    } catch (err) {
      this.clearAuth();
      return { success: true };
    }
  },

  // Get current user info
  async fetchCurrentUser() {
    if (!authToken) return null;

    const response = await fetch('/api/auth/me', {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    // Handle 401 - token is invalid/expired
    if (response.status === 401) {
      this.clearAuth();
      window.location.href = '/login.html?expired=1';
      return null;
    }

    const result = await response.json();

    if (result.success) {
      currentUser = result.data;
      // Also update sessionStorage with full user data
      sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
      return currentUser;
    }

    return null;
  },

  // Register new user
  async register(username, email, password, role) {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, role })
    });

    return response.json();
  },

  // Request password reset
  async requestPasswordReset(email) {
    const response = await fetch('/api/auth/password-reset-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    return response.json();
  },

  // Reset password with token
  async resetPassword(token, newPassword) {
    const response = await fetch('/api/auth/password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password: newPassword })
    });

    return response.json();
  },

  // Change password (while logged in)
  async changePassword(currentPassword, newPassword) {
    if (!authToken) return { success: false, error: 'Not logged in' };

    const response = await fetch('/api/auth/change-password', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword
      })
    });

    return response.json();
  }
};

// Redirect to login if not authenticated
function requireAuth() {
  if (!auth.isLoggedIn()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

// Redirect to home if already logged in (for login page)
function redirectIfLoggedIn() {
  if (auth.isLoggedIn()) {
    window.location.href = '/index.html';
    return true;
  }
  return false;
}

// Update UI based on user role
function updateUIForRole() {
  const user = auth.getUser();
  if (!user) return;

  // Show/hide elements based on role
  document.querySelectorAll('[data-role]').forEach(el => {
    const allowedRoles = el.dataset.role.split(',');
    if (allowedRoles.includes(user.role)) {
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });

  // Update username display
  const usernameEl = document.getElementById('current-username');
  if (usernameEl && user.username) {
    usernameEl.textContent = user.username;
  }

  // Update role display
  const roleEl = document.getElementById('current-role');
  if (roleEl && user.role) {
    roleEl.textContent = user.role;
  }
}

// Handle logout button click
function setupLogoutButton() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await auth.logout();
      window.location.href = '/login.html';
    });
  }
}
