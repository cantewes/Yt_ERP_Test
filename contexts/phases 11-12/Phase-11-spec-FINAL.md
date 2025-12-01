# Phase 11: Accounting + Authentication Specification (FINAL - REVISED)

**Version:** 2.0 (REVISED für Production Readiness)  
**Date:** December 1, 2025  
**Status:** Critical Revisions Applied (see Change Log)  
**Duration:** 10–12 days (realistic, mit Buffer)  

---

## CRITICAL CHANGES FROM V1.0

### Authentication Additions (V1.0 Gaps Filled)
- ✅ ADD: Password Reset Workflow
- ✅ ADD: Account Lockout Logic
- ✅ ADD: CORS Middleware Configuration
- ✅ ADD: Backend Token Validation (not just Frontend)
- ✅ ADD: Session Timeout + Expiry Enforcement
- ✅ ADD: Audit Log Table

### Effort Adjustment
- V1.0: 8-10 Tage
- V2.0: 10-12 Tage (realistic)

---

## OVERVIEW

**Goal:** Add invoicing, payment tracking, and secure user authentication.

**MVP vs Production Trade-offs:**
- MVP: Core auth (login/logout) + basic accounting
- Production (later): Password reset, advanced reporting, audit compliance

---

## SUBMODULE 1: AUTHENTICATION & USER MANAGEMENT

### Database Changes

**Table: users**
```
id (INTEGER PRIMARY KEY)
username (TEXT NOT NULL, UNIQUE)
email (TEXT NOT NULL, UNIQUE)
password_hash (TEXT NOT NULL)  -- bcrypt, never plain text
role (TEXT NOT NULL)  -- 'admin', 'manager', 'viewer'
status (TEXT NOT NULL, default 'active')  -- 'active', 'locked', 'suspended'
failed_login_attempts (INTEGER, default 0)
locked_until (DATETIME)  -- NULL if not locked
created_at (DATETIME, default CURRENT_TIMESTAMP)
last_login (DATETIME)
updated_at (DATETIME)
```

**Table: sessions**
```
id (INTEGER PRIMARY KEY)
user_id (INTEGER NOT NULL, FOREIGN KEY → users.id)
token (TEXT NOT NULL, UNIQUE)
token_type (TEXT)  -- 'bearer' (JWT alternative: include in schema for future)
expires_at (DATETIME NOT NULL)
created_at (DATETIME, default CURRENT_TIMESTAMP)
last_activity (DATETIME)  -- for session timeout
ip_address (TEXT)  -- for security audit
user_agent (TEXT)  -- browser fingerprint
```

**NEW Table: password_reset_tokens**
```
id (INTEGER PRIMARY KEY)
user_id (INTEGER NOT NULL, FOREIGN KEY → users.id)
token (TEXT NOT NULL, UNIQUE)
expires_at (DATETIME NOT NULL)
used_at (DATETIME)
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

**NEW Table: audit_logs**
```
id (INTEGER PRIMARY KEY)
user_id (INTEGER, FOREIGN KEY → users.id)  -- NULL if system action
action (TEXT NOT NULL)  -- 'login', 'logout', 'password_reset', 'role_change', etc.
resource (TEXT)  -- 'invoice', 'order', 'user', etc.
resource_id (INTEGER)
old_value (TEXT)  -- JSON for audit trail
new_value (TEXT)
ip_address (TEXT)
result (TEXT)  -- 'success', 'failure'
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

### API Endpoints (REVISED)

**POST /api/auth/register**
```
Body: { username, email, password }
Validation:
  - username: 3-32 chars, alphanumeric + underscore only
  - email: valid email format
  - password: min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
Returns: { success: true, user_id, message: "User created" }
Errors: 409 (duplicate), 400 (validation failed)
Audit: Logged in audit_logs
```

**POST /api/auth/login**
```
Body: { username, password }
Logic:
  1. Check if user exists + status != 'locked' + status != 'suspended'
  2. If user locked: check if lockout_until > now
  3. Verify password against bcrypt hash
  4. If FAIL: increment failed_login_attempts, if >= 5: set locked_until = now + 30min
  5. If SUCCESS: reset failed_login_attempts, create session token
  6. Return token + expiry
Returns: { success: true, token, user_id, role, expires_in_seconds, message }
Errors: 401 (invalid), 429 (locked)
Audit: Logged (success and failure)
```

**POST /api/auth/logout**
```
Header: Authorization: Bearer {token}
Logic: Delete session from sessions table
Returns: { success: true, message: "Logged out" }
Audit: Logged
```

**GET /api/auth/me**
```
Header: Authorization: Bearer {token}
Logic: 
  1. Find session with token
  2. Check if expires_at > now (Backend validation!)
  3. Update last_activity
Returns: { success: true, data: { user_id, username, email, role }, message }
Errors: 401 (invalid/expired token)
```

**POST /api/auth/password-reset-request** (NEW)
```
Body: { email }
Logic:
  1. Find user by email
  2. Generate reset token (random string, 32 chars)
  3. Store in password_reset_tokens with expires_at = now + 1 hour
  4. Send reset link: {BASE_URL}/reset-password?token={token}
  5. Return success (don't reveal if email exists for security)
Returns: { success: true, message: "Reset email sent (if account exists)" }
Audit: Logged (user email, not username, for privacy)
```

**POST /api/auth/password-reset** (NEW)
```
Body: { token, new_password }
Logic:
  1. Find password_reset_tokens with token
  2. Check if not expired + not already used
  3. Validate new_password (same rules as registration)
  4. Update users.password_hash
  5. Mark token as used (used_at = now)
  6. Invalidate all sessions for user (force re-login)
Returns: { success: true, message: "Password reset, please login" }
Errors: 400 (invalid token), 410 (expired), 400 (validation failed)
Audit: Logged
```

**PUT /api/auth/change-password** (NEW)
```
Header: Authorization: Bearer {token}
Body: { current_password, new_password }
Logic:
  1. Get logged-in user
  2. Verify current_password against hash
  3. Validate new_password
  4. Update hash
  5. Invalidate all sessions except current one
Returns: { success: true, message: "Password changed" }
Errors: 401 (current password wrong), 400 (validation failed)
Audit: Logged
```

### Frontend: Login + Password Reset Pages

**login.html**
```
Form: Username + Password + Submit
Error display: Invalid credentials (generic, no user enumeration)
Link: "Forgot Password?" → /reset-password-request.html
```

**reset-password-request.html**
```
Form: Email + Submit
Message: "Check your email for reset link (if account exists)"
Link: "Back to Login"
```

**reset-password.html?token={TOKEN}**
```
Form: New Password + Confirm Password + Submit
Error: If token invalid/expired
Message: "Password reset successful, redirecting to login..."
```

### Authentication Middleware

**Frontend (every page load)**
```javascript
function requireAuth() {
  if (!window.authToken) {
    window.location.href = '/login.html';
    return;
  }
  // Optional: Check token expiry on GET /api/auth/me
  // If expired: logout + redirect
}

// Call on every protected page:
requireAuth();
```

**Backend (Express middleware)**
```javascript
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Missing token' });
  
  const session = db.prepare(
    'SELECT * FROM sessions WHERE token = ? AND expires_at > datetime("now")'
  ).get(token);
  
  if (!session) return res.status(401).json({ error: 'Invalid/expired token' });
  
  req.user = { id: session.user_id, role: /* lookup role */ };
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Usage:
app.get('/api/invoices', authMiddleware, (req, res) => { ... });
app.post('/api/invoices', authMiddleware, requireRole('admin', 'manager'), (req, res) => { ... });
```

### Security: CORS Configuration

**backend/server.js (NEW)**
```javascript
const cors = require('cors');

const corsOptions = {
  origin: 'http://localhost:3000',  // Frontend URL
  credentials: true,  // Allow cookies (if used later)
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
```

### Security: Session Timeout

**Logic:**
- Token expires after 8 hours (configurable)
- If last_activity > 1 hour: Session invalidated
- Frontend: Check on every API call, auto-logout if expired

```javascript
// In GET /api/auth/me:
const session = db.prepare(
  'SELECT * FROM sessions WHERE token = ? AND expires_at > datetime("now")'
).get(token);

if (session) {
  const lastActivity = new Date(session.last_activity);
  const now = new Date();
  if ((now - lastActivity) / 1000 / 60 > 60) {  // 60 min idle
    db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);
    return res.status(401).json({ error: 'Session expired due to inactivity' });
  }
}
```

---

## SUBMODULE 2: ACCOUNTING MODULE

### Database Changes (same as V1.0, no changes needed)

**New Table: invoices**
```
id, order_id, invoice_number, invoice_date, due_date, total_amount, status, notes, created_at, created_by
```

**New Table: payments**
```
id, invoice_id, payment_date, amount, payment_method, reference, created_at
```

### API Endpoints (same as V1.0)

**POST /api/invoices**
**GET /api/invoices**
**GET /api/invoices/:id**
**PUT /api/invoices/:id/mark-paid**
**GET /api/financial-summary**

(See V1.0 for full specifications - no changes needed)

### Role-Based Access Control

```
admin: Create invoices, manage users, view all, delete invoices
manager: Create invoices, view accounting data, NOT manage users
viewer: Read-only access to invoices and financial summary
```

---

## QUALITY GATE (Phase 11 - REVISED)

### Authentication (8 criteria - was 5)
- ✓ Login: Valid credentials → token issued
- ✓ Login: Invalid credentials → 401 error + attempt counter
- ✓ Login: Account locked after 5 failures → 30 min lockout
- ✓ Logout: Token invalidated
- ✓ Unauthorized access → redirect to login
- ✓ Password Reset: Email link expires after 1 hour
- ✓ Password Reset: Old sessions invalidated after reset
- ✓ Session Timeout: 8 hour expiry + 1 hour inactivity timeout

### Accounting (8 criteria - unchanged)
- ✓ Invoice created from order
- ✓ Invoice status workflow works
- ✓ Payment recording updates status
- ✓ Financial summary calculates correctly
- ✓ Charts render
- ✓ Invoices persist after refresh
- ✓ Only admin/manager can create invoices
- ✓ Overdue detection works

---

## IMPLEMENTATION CHECKLIST (REVISED)

### Day 1-2: Authentication Backend (was 1-2, now 2-3)
- [ ] Add users + sessions + password_reset_tokens + audit_logs tables
- [ ] Implement bcrypt password hashing
- [ ] Create login endpoint with lockout logic
- [ ] Create password reset endpoints (3 new endpoints)
- [ ] Create middleware (auth + requireRole)
- [ ] Add CORS configuration
- [ ] Test with Postman

### Day 3: Authentication Frontend (unchanged)
- [ ] Create login.html
- [ ] Create reset-password-request.html
- [ ] Create reset-password.html
- [ ] Implement logout button
- [ ] Protect all pages
- [ ] Test workflows

### Day 4-5: Accounting Backend (unchanged)
- [ ] Add invoices + payments tables
- [ ] Implement invoice CRUD
- [ ] Implement financial summary
- [ ] Test with Postman

### Day 6-7: Accounting Frontend (unchanged)
- [ ] Create accounting.html
- [ ] Build invoice UI
- [ ] Build financial dashboard
- [ ] Implement role-based visibility

### Day 8-9: Integration + Hardening (NEW, was Day 8)
- [ ] Test auth + accounting integration
- [ ] Test all role combinations
- [ ] Test session timeout
- [ ] Test password reset flow
- [ ] Test account lockout
- [ ] PO validation

---

## EFFORT ESTIMATE (REVISED)

- Backend Auth: 4–5 days (added Password Reset, Lockout, CORS)
- Frontend Auth: 2–3 days (added 2 new pages)
- Backend Accounting: 3–4 days
- Frontend Accounting: 3–4 days
- Integration + Hardening: 2–3 days
- **Total: 10–12 days (realistic)**

---

## DEPENDENCIES

```
npm install bcryptjs    -- Password hashing
npm install cors        -- CORS middleware
npm install uuid        -- Generate reset tokens (optional, can use crypto)
```

---

## SECURITY CHECKLIST (NEW)

- [ ] Passwords hashed with bcrypt (salt rounds >= 10)
- [ ] Token stored in JS variable ONLY (not localStorage)
- [ ] Token validated on Backend for every request
- [ ] Session timeout enforced (8 hour + 1 hour idle)
- [ ] Account lockout after 5 failed attempts
- [ ] Password reset token expires after 1 hour
- [ ] CORS configured (only localhost in dev)
- [ ] Audit logs capture all auth actions
- [ ] Email templates don't expose system info
- [ ] Error messages don't reveal user existence
