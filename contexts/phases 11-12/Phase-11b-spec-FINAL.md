# Phase 11b: Email-to-Order Automation Specification (FINAL - REVISED)

**Version:** 2.0 (REVISED für Production Readiness)  
**Date:** December 1, 2025  
**Status:** Critical Revisions Applied  
**Duration:** 9–12 days (realistic, +2 Tage für Parsing Improvements)  
**Dependency:** Phase 11 PASS (Authentication REQUIRED)

---

## CRITICAL CHANGES FROM V1.0

### Email Parsing Improvements (V1.0 Gaps)
- ✅ ADD: Parsing Confidence Scoring (reject < 80%)
- ✅ ADD: Duplicate Detection (same sender + product + day)
- ✅ ADD: Rate Limiting (max 1 parse per minute per sender)
- ✅ ADD: Multi-Format Support (DE + EN + variations)
- ✅ ADD: Fallback Flow (unparseable → manual order template)
- ✅ REVISED: Realistic success rate 50-70% instead of 90%+

### Effort Adjustment
- V1.0: 7-10 Tage
- V2.0: 9-12 Tage (realistic)

---

## OVERVIEW

**Goal:** Automate order creation from inbound emails WITH realistic parsing capabilities.

**Key Change from V1.0:**
- Parsing success rate: 50-70% (V1.0 implied 90%)
- For unrecognized patterns: Create draft order template for manual review
- Confidence score: Only auto-approve if >= 80%

---

## DATABASE SCHEMA

**Table: parsed_emails**
```
id (INTEGER PRIMARY KEY)
sender_email (TEXT NOT NULL)
subject (TEXT)
raw_body (TEXT NOT NULL)
parsed_at (DATETIME, default CURRENT_TIMESTAMP)
status (TEXT NOT NULL)  -- 'NEW', 'PARSED', 'PROCESSED', 'ERROR'
error_message (TEXT)
imap_message_id (TEXT)  -- idempotency
duplicate_of (INTEGER)  -- self-reference if duplicate detected
```

**NEW COLUMN in pending_orders: confidence_score**
```
id (INTEGER PRIMARY KEY)
parsed_email_id (INTEGER, FOREIGN KEY → parsed_emails.id)
sender_email (TEXT NOT NULL)
extracted_quantity (INTEGER)
extracted_product_name (TEXT)
product_id (INTEGER, FOREIGN KEY → products.id)
confidence_score (REAL)  -- 0.0 to 1.0 (NEW)
status (TEXT NOT NULL)  -- 'PENDING_REVIEW', 'AUTO_APPROVED', 'APPROVED', 'REJECTED'
admin_notes (TEXT)
approved_at (DATETIME)
approved_by (INTEGER, FOREIGN KEY → users.id)
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

**NEW Table: email_parsing_errors**
```
id (INTEGER PRIMARY KEY)
sender_email (TEXT NOT NULL)
raw_body (TEXT NOT NULL)
error_type (TEXT)  -- 'NO_QUANTITY', 'NO_PRODUCT', 'UNPARSEABLE', 'DUPLICATE'
error_message (TEXT)
parse_attempt_count (INTEGER, default 0)
first_attempt_at (DATETIME)
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

**NEW Table: email_rate_limits**
```
id (INTEGER PRIMARY KEY)
sender_email (TEXT NOT NULL)
parse_count_this_minute (INTEGER)
last_reset (DATETIME)
is_throttled (BOOLEAN, default 0)
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

---

## SUB-PHASE 1: EMAIL PARSER BACKEND (4–5 Days)

### Parsing Strategy (REVISED)

**Multi-Pattern Matching (not just Regex):**

Pattern 1: German Format (strict)
```
"Ich (möchte|will|brauche) (\d+)(x|\s)+ ([A-Z][^0-9]+)"
→ Match: "Ich will 2x HP Laptop"
→ Groups: qty=2, product="HP Laptop"
```

Pattern 2: English Format
```
"I (need|want|would like|order) (\d+) ([A-Z][^0-9]+)"
→ Match: "I want 2 HP Laptops"
→ Groups: qty=2, product="HP Laptop" (normalize plurals)
```

Pattern 3: Number-First Format
```
"(\d+)x? ([A-Z][^.!?]+)"
→ Match: "2 HP Laptop" or "2x HP Laptop"
→ Groups: qty=2, product="HP Laptop"
```

Pattern 4: Quantity-Text Format (fallback, lower confidence)
```
"(zwei|three|three|...) ([A-Z][^.!?]+)"
→ Match: "Zwei HP Laptops"
→ Groups: qty=2 (translate), product="HP Laptop"
```

**Product Name Normalization:**
```javascript
function normalizeProductName(raw) {
  // "HP Laptop" → lookup "HP Laptop" in products
  // "HP Laptops" → remove plural, lookup "HP Laptop"
  // "hp laptop" → uppercase, lookup "HP Laptop"
  // Typo tolerance: "HP Ltop" → suggest closest match (Levenshtein distance)
}
```

**Confidence Scoring:**
```
auto_approve_threshold = 0.80

score = base_score (0-1)
  - Pattern 1 (strict German): 0.95
  - Pattern 2 (strict English): 0.90
  - Pattern 3 (simple qty + product): 0.75
  - Pattern 4 (text qty): 0.60
  
modifier = (0-1)
  - Exact product match: +0.0 (baseline)
  - Typo-corrected product: -0.10
  - Fuzzy product match: -0.15
  - Qty normalized (e.g., "zwei" → 2): -0.05

final_score = max(0, min(1, base_score + modifier))

if final_score >= 0.80: status = "AUTO_APPROVED" (create order directly)
else: status = "PENDING_REVIEW" (admin review)
```

### Duplicate Detection (NEW)

```javascript
function detectDuplicate(sender_email, product_id, quantity) {
  // Check if same order received in last 24 hours
  const recent = db.prepare(`
    SELECT id FROM pending_orders 
    WHERE sender_email = ? 
    AND product_id = ? 
    AND quantity = ? 
    AND created_at > datetime('now', '-1 day')
  `).get(sender_email, product_id, quantity);
  
  if (recent) {
    return { isDuplicate: true, originalOrderId: recent.id };
  }
  return { isDuplicate: false };
}
```

### Rate Limiting (NEW)

```javascript
function checkRateLimit(sender_email) {
  const limit = db.prepare(
    'SELECT * FROM email_rate_limits WHERE sender_email = ?'
  ).get(sender_email);
  
  if (!limit) {
    db.prepare(`
      INSERT INTO email_rate_limits (sender_email, parse_count_this_minute)
      VALUES (?, 1)
    `).run(sender_email);
    return { allowed: true };
  }
  
  const minuteAgo = Date.now() - 60000;
  if (limit.last_reset < minuteAgo) {
    // Reset counter
    db.prepare(`
      UPDATE email_rate_limits 
      SET parse_count_this_minute = 1, last_reset = datetime('now')
      WHERE sender_email = ?
    `).run(sender_email);
    return { allowed: true };
  }
  
  if (limit.parse_count_this_minute >= 5) {
    // Too many attempts
    return { allowed: false, message: 'Rate limit exceeded' };
  }
  
  db.prepare(`
    UPDATE email_rate_limits 
    SET parse_count_this_minute = parse_count_this_minute + 1
    WHERE sender_email = ?
  `).run(sender_email);
  return { allowed: true };
}
```

### Email Polling Service (REVISED)

```javascript
// Every 5 min:
// 1. Fetch unread emails
// 2. For each email:
//    a. Check rate limit → if throttled, skip
//    b. Check duplicate → if duplicate, log warning
//    c. Parse with confidence scoring
//    d. If confidence >= 0.80: Auto-approve (create order + invoice + send email)
//    e. If confidence < 0.80: Store as PENDING_REVIEW (admin dashboard)
//    f. If parse error: Store in email_parsing_errors
// 3. Mark email as read + log
```

---

## SUB-PHASE 2: ADMIN APPROVAL DASHBOARD (2–3 Days)

### Updated Page: `/admin/email-orders.html`

**Section 1: Pending Review Queue**
- Table: Email | Product | Qty | Confidence | Sent | Actions
- Filter by confidence (show <80% confidence only)
- Sort by confidence ascending (lowest priority first)

**Section 2: Auto-Approved Summary**
- Count: "12 orders auto-approved today"
- Last auto-approved order with timestamp

**Section 3: Parsing Errors**
- Table: Email | Error Type | Count | First Seen | Actions (Retry, Delete)
- Allow manual retry for emails with temporary errors

**Section 4: Duplicate Warnings**
- Alert: "This order looks like a duplicate of [Original Order]"
- Allow force-create or reject as duplicate

---

## SUB-PHASE 3: CONFIRMATION EMAILS (2–3 Days)

### Approval Email Template (REVISED)

```
Subject: Bestellung bestätigt #[ORDER_ID]

Hallo [CUSTOMER_NAME],

vielen Dank für Ihre Email-Bestellung!

**Bestellnummer:** [ORDER_ID]
**Empfangen:** [DATE]
**Status:** ✅ Genehmigt und verarbeitet

**Bestelldetails:**
- Produkt: [PRODUCT_NAME]
- Menge: [QTY]
- Gesamtbetrag: €[TOTAL]
- Lieferdatum: [EXPECTED_DELIVERY_DATE]

**Rechnungsdetails:**
Rechnungsnummer: [INVOICE_NUMBER]
Rechnungslink: [INVOICE_LINK]

Falls Sie Fragen haben, antworten Sie auf diese E-Mail.

Beste Grüße,
ERP System
```

### Rejection Email Template (for unparseable)

```
Subject: Re: Bestellung - Manuelle Bearbeitung erforderlich

Hallo,

vielen Dank für Ihre Bestellung!

Leider konnte Ihre Email nicht automatisch verarbeitet werden:

Grund: [ERROR_MESSAGE]
  Beispiel: "Produkt nicht erkannt"

**Nächste Schritte:**
1. Bitte antworten Sie auf diese Email mit den genauen Produktdetails
2. Oder kontaktieren Sie unseren Sales-Support unter: [EMAIL]

Wir werden Ihre Bestellung dann manuell verarbeiten.

Beste Grüße,
ERP System
```

---

## ERROR HANDLING & FALLBACK

**Scenario: Email cannot be parsed reliably**

Workflow:
```
1. Parsing confidence < 0.50 → Not even shown to admin
2. Store in email_parsing_errors with error details
3. Send email to sender: "Could not understand order, please clarify"
4. Admin can manually review pending_orders with low confidence scores
5. OR: Sender receives auto-reply with example format: "Order like: 'I want 2 HP Laptops'"
```

---

## QUALITY GATE (Phase 11b - REVISED)

### Email Parsing (5 criteria - was 4, now includes Confidence)
- ✓ Polling works (5-min intervals, no crashes)
- ✓ Multi-pattern parsing: DE + EN formats recognized
- ✓ Confidence scoring: >= 80% → auto-approve, < 80% → review
- ✓ Duplicates detected (same sender + product + day)
- ✓ Rate limiting: Max 5 emails per sender per minute

### Admin Workflow (6 criteria - updated)
- ✓ Dashboard shows PENDING_REVIEW orders (confidence < 80%)
- ✓ Dashboard shows AUTO_APPROVED summary
- ✓ Approve button works (creates order + invoice)
- ✓ Reject button works (sends rejection email)
- ✓ Duplicate alert shown when applicable
- ✓ Only admins can access (role check)

### Confirmation Emails (4 criteria - unchanged)
- ✓ Approval email received within 2 sec
- ✓ Rejection/Clarification email sent for unparseable
- ✓ Email templates render correctly
- ✓ Invoice link in email works

---

## IMPLEMENTATION CHECKLIST

### Day 1-2: Enhanced Parser (was 1, now 2)
- [ ] Implement 4 parsing patterns (DE + EN + variations)
- [ ] Implement confidence scoring
- [ ] Implement product normalization
- [ ] Add duplicate detection
- [ ] Add rate limiting
- [ ] Test with 50+ email samples (various formats)

### Day 3: Dashboard (unchanged)
- [ ] Update list to show confidence scores
- [ ] Add auto-approved summary
- [ ] Add parsing errors section

### Day 4: Integration (new, focused testing)
- [ ] Test high-confidence auto-approval
- [ ] Test low-confidence pending review
- [ ] Test duplicate detection
- [ ] Test rate limiting

---

## EFFORT ESTIMATE (REVISED)

- Sub-Phase 1 (Parser): 4–5 days (added Confidence + Duplicate + Rate Limit)
- Sub-Phase 2 (Dashboard): 2–3 days (minor updates)
- Sub-Phase 3 (Emails): 2–3 days (unchanged)
- Integration: 1–2 days (more focused testing needed)
- **Total: 9–12 days (realistic)**

---

## REALISTIC EXPECTATIONS

**Parsing Success Rates:**
- High confidence (>= 80%): 55-70%
- Medium confidence (60-80%): 15-25%
- Low confidence (< 60%): 10-20%
- Unparseable: 5-10%

**MVP Scope:**
- Auto-approve only highest confidence (>= 80%)
- Medium confidence → admin review
- Low/Unparseable → reject + ask user to clarify

**Production Improvements (Future):**
- Add NLP library (spaCy, Google NLP API)
- Add user pattern learning (common formats for specific customers)
- Add supplier-specific parsing rules

---

## SECURITY CHECKLIST (NEW)

- [ ] Email bodies sanitized before display (XSS prevention)
- [ ] Rate limiting prevents DOS
- [ ] Confirmation emails don't expose system details
- [ ] Approval endpoint checks auth + role (not shown in V1.0)
- [ ] Audit log captures all approvals/rejections
