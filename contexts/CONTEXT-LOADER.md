# Context Loader Guide

Dieser Leitfaden definiert, welche Dateien die KI fuer jede Phase laden sollte.

---

## Phase 11: Accounting + Authentication

### Primaere Dateien (MUSS laden)
```
contexts/phases 11-12/Phase-11-spec-FINAL.md    # Auth + Accounting Spezifikation
contexts/master-context.md                      # DB-Schema, API Specs
backend/routes/inventory.js                     # Template fuer neue Routes
backend/db.js                                   # DB-Connection Pattern
```

### Sekundaere Dateien (bei Bedarf)
```
contexts/project-status.md                      # Aktueller Status
frontend/js/api.js                              # API-Wrapper Pattern
frontend/css/style.css                          # Design-Tokens
```

### NICHT laden
- archive/* (historisch)
- Phase-11b-spec-FINAL.md, Phase-12-spec-FINAL.md (noch nicht relevant)

---

## Phase 11b: Email-to-Order Automation

### Primaere Dateien (MUSS laden)
```
contexts/phases 11-12/Phase-11b-spec-FINAL.md   # Email-Parsing Spezifikation
contexts/phases 11-12/Phase-11-spec-FINAL.md    # Auth-Dependency (fuer pending_orders)
backend/routes/sales.js                         # Order-Creation Pattern
```

### Sekundaere Dateien (bei Bedarf)
```
contexts/master-context.md                      # DB-Schema
backend/routes/analytics.js                     # Export-Patterns
```

### Dependency
- Phase 11 MUSS bestanden sein (Authentication required)

---

## Phase 12: Procurement Module

### Primaere Dateien (MUSS laden)
```
contexts/phases 11-12/Phase-12-spec-FINAL.md    # Procurement Spezifikation
contexts/phases 11-12/Phase-11-spec-FINAL.md    # Auth-Integration
backend/routes/inventory.js                     # Stock-Management Pattern
```

### Sekundaere Dateien (bei Bedarf)
```
contexts/master-context.md                      # DB-Schema
frontend/js/api.js                              # API-Wrapper
```

### Dependency
- Phase 11 MUSS bestanden sein (Authentication required)

---

## Allgemeine Referenzen

### Database Schema (master-context.md)

**Core Tables (Phase 1-7):**
- products: id, name, category, quantity
- employees: id, name, position, email, start_date, monthly_salary
- work_hours: id, employee_id, date, hours
- customers: id, name, email, phone, address
- orders: id, customer_id, order_date, status
- order_items: id, order_id, product_id, quantity

**Phase 11 Tables (NEW):**
- users: id, username, email, password_hash, role, status, failed_login_attempts, locked_until
- sessions: id, user_id, token, expires_at, last_activity, ip_address, user_agent
- password_reset_tokens: id, user_id, token, expires_at, used_at
- audit_logs: id, user_id, action, resource, resource_id, old_value, new_value, ip_address, result
- invoices: id, order_id, invoice_number, invoice_date, due_date, total_amount, status, notes
- payments: id, invoice_id, payment_date, amount, payment_method, reference

**Phase 11b Tables (NEW):**
- parsed_emails: id, sender_email, subject, raw_body, parsed_at, status, error_message, imap_message_id, duplicate_of
- pending_orders: id, parsed_email_id, sender_email, extracted_quantity, extracted_product_name, product_id, confidence_score, status, admin_notes
- email_parsing_errors: id, sender_email, raw_body, error_type, error_message, parse_attempt_count
- email_rate_limits: id, sender_email, parse_count_this_minute, last_reset, is_throttled

**Phase 12 Tables (NEW):**
- suppliers: id, name, contact_email, phone, address, status, rating
- purchase_orders: id, supplier_id, created_by, status, total_amount, notes
- purchase_order_items: id, purchase_order_id, product_id, quantity, unit_price, received_quantity
- purchase_order_versions: id, purchase_order_id, version_number, changes_json
- purchase_order_receipts: id, purchase_order_id, received_by, notes
- supplier_performance: id, supplier_id, metric_type, value, period

### Folder Structure
```
backend/
  server.js, db.js, package.json
  routes/ (inventory.js, hr.js, sales.js, analytics.js, auth.js, accounting.js, email-orders.js, procurement.js)
frontend/
  *.html (index, inventory, hr, sales, analytics, login, accounting, email-orders, procurement)
  css/style.css
  js/*.js (api, inventory, hr, sales, analytics, auth, accounting, email-orders, procurement)
contexts/
  master-context.md, project-status.md, CONTEXT-LOADER.md
  phases 11-12/ (Phase-11-spec-FINAL.md, Phase-11b-spec-FINAL.md, Phase-12-spec-FINAL.md)
archive/
  Phase1-7/ (MVP Dokumentation)
  Phase 8-10/ (Analytics Dashboard Dokumentation)
```

---

## API Endpoints Summary

### Completed (33 total)
| Modul | Endpoints |
|-------|-----------|
| Inventory | 4 |
| HR | 9 |
| Sales | 6 |
| Analytics | 11 |
| Export | 3 |

### Phase 11 (NEW - 13 total)
| Modul | Endpoints |
|-------|-----------|
| Auth | 7 (register, login, logout, me, password-reset-request, password-reset, change-password) |
| Accounting | 6 (invoices CRUD, mark-paid, financial-summary) |

### Phase 11b (NEW - 6 total)
| Modul | Endpoints |
|-------|-----------|
| Email-Orders | 6 (pending-orders, approve, reject, parsing-errors, rate-limits, email-config) |

### Phase 12 (NEW - 12 total)
| Modul | Endpoints |
|-------|-----------|
| Suppliers | 4 (CRUD) |
| Purchase Orders | 5 (CRUD + status-change) |
| GRN | 3 (receive, list, detail) |

---

## Kontext-Optimierung

| Situation | Empfehlung |
|-----------|------------|
| Authentication implementieren | Phase-11-spec + master-context (DB) |
| Accounting implementieren | Phase-11-spec + sales.js (Order Pattern) |
| Email-Parsing implementieren | Phase-11b-spec + Phase-11-spec (Auth Dependency) |
| Procurement implementieren | Phase-12-spec + inventory.js (Stock Pattern) |
| Bug Fix | Betroffene Datei + Tests laden |
| QA Review | project-status.md + relevante Spec |

**Ziel**: Fokussierter Kontext (~500 Zeilen) statt vollstaendiger Dump (~3000+ Zeilen)
