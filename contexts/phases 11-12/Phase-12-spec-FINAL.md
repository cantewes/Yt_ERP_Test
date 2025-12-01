# Phase 12: Procurement Module Specification (FINAL - REVISED)

**Version:** 2.0 (REVISED für Production Readiness)  
**Date:** December 1, 2025  
**Status:** Critical Revisions Applied  
**Duration:** 8–10 days (realistic, +2 Tage für Edge-Cases)  
**Dependency:** Phase 11 PASS

---

## CRITICAL CHANGES FROM V1.0

### Procurement Improvements (V1.0 Gaps)
- ✅ ADD: Reconciliation Report (PO vs Actual Receipt)
- ✅ ADD: Goods Receipt Note (GRN) as formal document
- ✅ ADD: Partial Delivery State Management
- ✅ ADD: PO Version Control (history of changes)
- ✅ ADD: Supplier Performance Metrics
- ✅ ADD: Audit Trail (who did what, when)

### Effort Adjustment
- V1.0: 6-8 Tage
- V2.0: 8-10 Tage (realistic)

---

## OVERVIEW

**Goal:** Add supplier management and purchase order workflow WITH reconciliation.

**Key Change from V1.0:**
- Explicit handling of partial deliveries
- Reconciliation report for financial audit
- Goods Receipt Note as formal document (not just DB entry)

---

## DATABASE SCHEMA

### New Table: suppliers (unchanged from V1.0)

### New Table: purchase_orders (REVISED)

```
id (INTEGER PRIMARY KEY)
po_number (TEXT NOT NULL, UNIQUE)
supplier_id (INTEGER NOT NULL, FOREIGN KEY → suppliers.id)
order_date (DATE NOT NULL)
expected_delivery_date (DATE)
actual_delivery_date (DATE)
status (TEXT NOT NULL)  -- 'draft', 'sent', 'confirmed', 'partially_received', 'received', 'cancelled'
total_amount (REAL NOT NULL)
total_quantity_ordered (INTEGER)  -- NEW: total across all items
total_quantity_received (INTEGER, default 0)  -- NEW: sum of receipts
total_quantity_damaged (INTEGER, default 0)  -- NEW: sum of damaged
notes (TEXT)
created_by (INTEGER, FOREIGN KEY → users.id)
created_at (DATETIME, default CURRENT_TIMESTAMP)
version (INTEGER, default 1)  -- NEW: for change tracking
last_modified_by (INTEGER, FOREIGN KEY → users.id)  -- NEW
last_modified_at (DATETIME)  -- NEW
```

### New Table: purchase_order_versions (NEW)

```
id (INTEGER PRIMARY KEY)
purchase_order_id (INTEGER NOT NULL, FOREIGN KEY → purchase_orders.id)
version (INTEGER NOT NULL)
change_type (TEXT)  -- 'created', 'updated', 'status_changed', 'delivery_updated'
changed_by (INTEGER, FOREIGN KEY → users.id)
old_status (TEXT)
new_status (TEXT)
changes (TEXT)  -- JSON: what fields changed
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

### New Table: purchase_order_receipts (REVISED)

```
id (INTEGER PRIMARY KEY)
purchase_order_id (INTEGER NOT NULL, FOREIGN KEY → purchase_orders.id)
grn_number (TEXT NOT NULL, UNIQUE)  -- NEW: Goods Receipt Note number
received_date (DATE NOT NULL)
received_by (INTEGER, FOREIGN KEY → users.id)
items_received (TEXT)  -- JSON: [{ product_id, qty_received, qty_damaged }]
notes (TEXT)
receipt_status (TEXT)  -- 'draft', 'confirmed'
total_quantity_received (INTEGER)  -- NEW: sum for this receipt
total_quantity_damaged (INTEGER, default 0)  -- NEW
inspected_by (INTEGER, FOREIGN KEY → users.id)  -- NEW: Quality check
inspection_notes (TEXT)  -- NEW
created_at (DATETIME, default CURRENT_TIMESTAMP)
```

### New Table: supplier_performance (NEW)

```
id (INTEGER PRIMARY KEY)
supplier_id (INTEGER NOT NULL, FOREIGN KEY → suppliers.id)
period_month (TEXT)  -- 'YYYY-MM'
pos_count (INTEGER)
on_time_count (INTEGER)  -- POs received by expected_delivery_date
defect_rate (REAL)  -- (damaged_items / total_received) * 100
avg_delivery_days (INTEGER)  -- actual vs expected
quality_score (REAL)  -- 0-100, based on defect_rate
updated_at (DATETIME)
```

### Updated Table: products (unchanged from V1.0)

---

## SUBMODULE 1: SUPPLIER MANAGEMENT (unchanged from V1.0)

### API Endpoints
- GET /api/suppliers (unchanged)
- POST /api/suppliers (unchanged)
- PUT /api/suppliers/:id (unchanged)
- DELETE /api/suppliers/:id (unchanged)
- **NEW:** GET /api/suppliers/:id/performance-metrics

---

## SUBMODULE 2: PURCHASE ORDERS (REVISED)

### API Endpoints

**POST /api/purchase-orders**
```
Logic: Same as V1.0, but also initialize total_quantity_ordered
```

**PUT /api/purchase-orders/:id/send**
```
Logic: Same as V1.0, also create entry in purchase_order_versions
```

**PUT /api/purchase-orders/:id/receive (REVISED)**
```
Body: { received_items: [{ product_id, qty_received, qty_damaged }, ...] }
Logic:
  1. Create Goods Receipt Note (GRN)
  2. For each item: ADD to products.quantity (received - damaged)
  3. Update purchase_order.status:
     - If total_received >= total_ordered: status = 'received'
     - Else: status = 'partially_received'
  4. Create purchase_order_versions entry
  5. Update supplier_performance metrics
  6. Return GRN number for printing/PDF

Returns: { success: true, grn_number, po_id, message }
```

**NEW: GET /api/purchase-orders/:id/reconciliation**
```
Logic: Compare PO vs actual receipts
Returns: {
  po_number,
  supplier,
  status,
  items: [
    {
      product,
      quantity_ordered,
      quantity_received,
      quantity_damaged,
      variance: quantity_ordered - quantity_received,
      variance_pct
    }
  ],
  summary: {
    total_ordered,
    total_received,
    total_damaged,
    total_variance,
    reconciliation_status: 'COMPLETE' | 'PARTIAL' | 'OVERSHIPMENT'
  }
}
```

**NEW: GET /api/purchase-orders/:id/grn/:grn_number (PDF)**
```
Generates GRN PDF with:
  - GRN Number + Date
  - PO Reference
  - Supplier Details
  - Items Received (qty + damaged)
  - Inspected By
  - Signature Lines
```

**NEW: GET /api/suppliers/:id/performance-metrics**
```
Returns: {
  supplier_id,
  last_12_months: [
    {
      month,
      pos_count,
      on_time_count,
      on_time_pct,
      defect_rate,
      quality_score
    }
  ],
  summary: {
    avg_on_time_pct,
    avg_defect_rate,
    overall_quality_score,
    trend: 'IMPROVING' | 'STABLE' | 'DECLINING'
  }
}
```

---

## SUBMODULE 3: AUTO-REORDERING (unchanged from V1.0)

---

## QUALITY GATE (Phase 12 - REVISED)

### Supplier Management (3 criteria - unchanged)
- ✓ CRUD operations work
- ✓ Cannot delete with active POs
- ✓ Performance metrics calculated

### Purchase Orders (8 criteria - expanded)
- ✓ PO creation + status workflow
- ✓ PDF generation (PO document)
- ✓ Low stock detection works
- ✓ Auto-create consolidates items
- ✓ **NEW:** Partial delivery tracked (status = 'partially_received')
- ✓ **NEW:** GRN generated with unique number
- ✓ **NEW:** Reconciliation report shows variance
- ✓ **NEW:** Supplier performance metrics calculated

### Procurement Workflow (6 criteria - expanded)
- ✓ Create → Send → Confirm → Receive → Inventory Updated
- ✓ Damaged items NOT added to inventory
- ✓ Multiple partial receipts supported
- ✓ Full reconciliation possible (PO vs actual)
- ✓ **NEW:** GRN document can be printed
- ✓ **NEW:** Supplier scorecard shows trend

---

## IMPLEMENTATION CHECKLIST

### Day 1: Schema + Backend Foundation
- [ ] Add 4 new tables (versions, receipts_v2, performance, grn_table)
- [ ] Update purchase_orders with new columns
- [ ] Implement GRN number generation
- [ ] Test schema migrations

### Day 2-3: Reconciliation Logic
- [ ] Implement receive endpoint (partial delivery handling)
- [ ] Implement reconciliation report endpoint
- [ ] Implement supplier performance metrics calculation
- [ ] Test edge cases (overshipment, damage tracking)

### Day 4: Frontend - Receiving Flow
- [ ] Create receive goods modal
- [ ] Show line items with qty_received + qty_damaged fields
- [ ] Display GRN number after receipt
- [ ] Add receipt history

### Day 5: Frontend - Reconciliation + Performance
- [ ] Create reconciliation report page
- [ ] Create supplier performance dashboard
- [ ] Add charts: on-time % trend, defect rate trend
- [ ] Add scorecard with performance badge

### Day 6-7: Integration + Testing
- [ ] Test full workflow: PO → Partial delivery 1 → Partial delivery 2 → Complete
- [ ] Test reconciliation accuracy
- [ ] Test supplier metrics calculation
- [ ] Test GRN PDF generation
- [ ] Validate error handling

---

## PARTIAL DELIVERY EXAMPLE

```
1. Create PO: 100x HP Laptops from Dell
   po.status = 'draft'
   po.total_quantity_ordered = 100

2. Send PO
   po.status = 'sent'

3. Confirm
   po.status = 'confirmed'

4. First Receipt: 60 items, 2 damaged
   POST /api/purchase-orders/{id}/receive
   Body: { received_items: [{ product_id: 1, qty_received: 60, qty_damaged: 2 }] }
   
   Results:
   - GRN-001 created
   - products.quantity += (60 - 2) = 58
   - purchase_orders.total_quantity_received = 60
   - purchase_orders.status = 'partially_received'

5. Second Receipt: 40 items, 0 damaged
   POST /api/purchase-orders/{id}/receive
   Body: { received_items: [{ product_id: 1, qty_received: 40, qty_damaged: 0 }] }
   
   Results:
   - GRN-002 created
   - products.quantity += 40
   - purchase_orders.total_quantity_received = 100
   - purchase_orders.status = 'received'
   - reconciliation_status = 'COMPLETE'

6. Reconciliation Report:
   - Ordered: 100
   - Received: 100
   - Damaged: 2
   - Variance: 0
   - Status: COMPLETE
```

---

## EFFORT ESTIMATE (REVISED)

- Backend (Schema + Reconciliation): 3–4 days
- Frontend (Receiving + Reports): 3–4 days
- Integration + Testing: 2–3 days
- **Total: 8–10 days (realistic)**

---

## FUTURE ENHANCEMENTS (POST-MVP)

1. **3-Way Matching:** PO + Receipt + Supplier Invoice
2. **Automated Rejections:** Flag overshipments automatically
3. **Return POs:** Track returned/defective items
4. **Price History:** Track price changes over time
5. **Supplier Comparison:** Multi-source analysis
6. **EDI Integration:** Automated order transmission (EDI 850)
7. **Barcode Scanning:** Receiving by QR code
8. **Complaints Management:** Track and resolve supplier issues

---

## SECURITY & COMPLIANCE

- [ ] Role-based access: Only manager/admin can receive goods
- [ ] Audit trail: Log who performed every action
- [ ] Approval: Optional 2-person receipt approval
- [ ] Inspection: Quality check before inventory update
- [ ] Change tracking: Full history of PO modifications

---

## EDGE CASES & TESTING

1. **Overshipment:** Supplier sends more than ordered
   - Alert: "Received 120 but only ordered 100"
   - Option: Accept excess or return to supplier
   - Status: 'OVERSHIPMENT' (custom handling)

2. **Underdelivery:** Never receive all items
   - After expected_delivery + 14 days
   - Alert: "PO XYZ outstanding for 14+ days"
   - Allow: Mark as complete with partial qty

3. **All Damaged:** Receive 100 items, all damaged
   - No inventory update
   - Alert: "100% defect rate from Supplier X"
   - Require inspection sign-off before acceptance

4. **Multiple Receipts Over Time:**
   - Accurately track cumulative received
   - Reconciliation works correctly
   - Each receipt independent but linked

---

## NOTES FOR DEVELOPER

1. **GRN Numbering:**
   - Format: GRN-YYYY-MM-NNNN (e.g., GRN-2025-01-0001)
   - Auto-increment per month
   - Unique constraint in database

2. **Performance Metrics:**
   - Calculate nightly (cron job) to avoid real-time overhead
   - Cache results (update_at timestamp)
   - Trend analysis: 12-month rolling average

3. **Reconciliation Logic:**
   - Always: ordered - received = variance
   - variance > 0: Underdelivery
   - variance < 0: Overshipment
   - variance = 0: Complete

4. **Testing Suppliers:**
   - Create test supplier "TestCo"
   - Create PO with 50 units
   - Test partial delivery (30 + 20)
   - Verify reconciliation accuracy

5. **Performance Optimization:**
   - Add index on supplier_id, po_number, status
   - Pagination for large PO lists (20 per page)
   - Cache supplier performance (monthly update)
