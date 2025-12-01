# Phases 8–10: Refactored Development Plan (Overview)

---

## FILE ORGANIZATION

### Phase-8-spec.md (1,500 words)
**Focus:** Backend analytics API design

**Contains:**
- 10 REST endpoints (Inventory, HR, Sales KPIs)
- Request/response specifications
- Error handling scenarios
- Query complexity notes + optimization
- Quality gates (5 concrete criteria)
- Estimated effort: 4–5 days

**NOT Contains:**
- Full code implementations
- HTML/CSS examples
- Interactivity logic
- Frontend testing details

**For:** Developer-Agent (backend specialist)

---

### Phase-9-spec.md (1,800 words)
**Focus:** Frontend dashboard UI & Chart.js integration

**Contains:**
- UI layout (wireframe structure)
- Component architecture (KPI cards, chart containers, filters)
- 4 key code patterns (templates, not full code)
- Design tokens (colors, spacing, shadows)
- Responsive breakpoints (desktop, tablet, mobile)
- Quality gates (9 concrete criteria)
- Estimated effort: 4–5 days

**NOT Contains:**
- Full HTML templates (components only)
- Complete CSS stylesheet
- CSV export logic
- Drill-down implementation

**For:** Developer-Agent (frontend specialist)

---

### Phase-10-spec.md (1,200 words)
**Focus:** Interactivity, drill-down, and export features

**Contains:**
- PRIORITY 1 features (Must-Have): Date filter, drill-down
- PRIORITY 2 features (Nice-to-Have): CSV export
- Implementation checklist (Day 1–3 breakdown)
- Quality gates (13+ criteria, split MUST vs. NICE-TO-HAVE)
- Risk mitigation strategies
- Estimated effort: 3–4 days (or 2–3 if export skipped)

**NOT Contains:**
- API specifications (see Phase 8)
- UI layouts (see Phase 9)
- Full code examples (high-level patterns only)

**For:** Developer-Agent (full-stack on this phase)

---

## WORKFLOW: How the 3 Phases Connect

```
┌──────────────────────────────────────────────────────────────┐
│ DEVELOPER-AGENT: Phase 8 (Backend API)                      │
├──────────────────────────────────────────────────────────────┤
│ 1. Read Phase-8-spec.md                                      │
│ 2. Implement 10 REST endpoints in Express                    │
│ 3. Test with Postman (responses match spec exactly)          │
│ 4. Update project-status.md                                  │
│ → OUTPUTS: Working API, ready for Phase 9 frontend          │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ PO-AGENT: Phase 8 QA (Backend Validation)                   │
├──────────────────────────────────────────────────────────────┤
│ 1. Read Phase-8-spec.md + project-status.md                 │
│ 2. Run Postman tests: all 10 endpoints return 200 OK         │
│ 3. Validate error handling (400, 404, 500)                   │
│ 4. Check query performance (<300ms per endpoint)             │
│ 5. Write phase-8-feedback.md (PASS/FAIL)                    │
│ → Decision: Ready for Phase 9?                               │
└──────────────────────────────────────────────────────────────┘
                              ↓ (if PASS)
┌──────────────────────────────────────────────────────────────┐
│ DEVELOPER-AGENT: Phase 9 (Frontend UI)                      │
├──────────────────────────────────────────────────────────────┤
│ 1. Read Phase-9-spec.md                                      │
│ 2. Build analytics.html with KPI cards + chart containers   │
│ 3. Implement 4 key JS patterns for data fetch + rendering    │
│ 4. Add responsive CSS (3 breakpoints)                        │
│ 5. Test with static data first, then Phase 8 API            │
│ → OUTPUTS: Dashboard page with charts                       │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ PO-AGENT: Phase 9 QA (Frontend Validation)                  │
├──────────────────────────────────────────────────────────────┤
│ 1. Read Phase-9-spec.md + project-status.md                 │
│ 2. Manual testing: KPI cards, charts, tables all render      │
│ 3. Browser test: Chrome, Firefox, Safari                     │
│ 4. Responsive test: 1024px, 768px, 375px widths              │
│ 5. Performance: page load <3 seconds                         │
│ 6. Write phase-9-feedback.md (PASS/FAIL)                    │
│ → Decision: Ready for Phase 10?                              │
└──────────────────────────────────────────────────────────────┘
                              ↓ (if PASS)
┌──────────────────────────────────────────────────────────────┐
│ DEVELOPER-AGENT: Phase 10 (Interactivity)                   │
├──────────────────────────────────────────────────────────────┤
│ 1. Read Phase-10-spec.md                                     │
│ 2. Implement MUST-HAVE: Date filter + drill-down             │
│ 3. (Optional) Add NICE-TO-HAVE: CSV export                   │
│ 4. Test debounce, filter updates, drill-down UX              │
│ 5. Update project-status.md                                  │
│ → OUTPUTS: Fully interactive dashboard                      │
└──────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────┐
│ PO-AGENT: Phase 10 QA (Interactivity Validation)            │
├──────────────────────────────────────────────────────────────┤
│ 1. Read Phase-10-spec.md + project-status.md                │
│ 2. Test date filter: change dates → charts update <1.5s     │
│ 3. Test drill-down: click chart → detail view appears       │
│ 4. Test CSV export (if implemented)                          │
│ 5. Performance: DevTools network tab analysis                │
│ 6. Write phase-10-feedback.md (PASS/FAIL + Sign-off)       │
│ → Decision: Analytics dashboard complete!                    │
└──────────────────────────────────────────────────────────────┘
```

---

## EFFORT TIMELINE (Realistic)

| Phase | Task | Days | Responsibility | Dependencies |
|-------|------|------|-----------------|--------------|
| 8 | Backend API | 4–5 | Developer-Agent | None |
| 8 | QA / Postman | 1 | PO-Agent | After Dev |
| 9 | Frontend UI | 4–5 | Developer-Agent | Phase 8 PASS |
| 9 | QA / Browser test | 1 | PO-Agent | After Dev |
| 10 | Interactivity | 3–4 | Developer-Agent | Phase 9 PASS |
| 10 | QA / E2E test | 1 | PO-Agent | After Dev |
| **Total** | **All phases** | **14–17 days** | Dev + PO | Sequential |

**Key:** Phases are sequential (Phase 9 waits for Phase 8 PASS, etc.). Dev and PO work serially per phase.

---

## AGENT ROLES & RESPONSIBILITIES

### Developer-Agent

**Role:** Implement features across all 3 phases

**Phase 8 (Backend API):**
- Read Phase-8-spec.md (15 min)
- Implement 10 REST endpoints following exact specification
- Focus: prepared statements, error handling, query performance
- Test: Create Postman test file (10+ test cases)
- Deliverable: Working backend, project-status.md update
- Handoff: Code ready for PO validation

**Phase 9 (Frontend UI):**
- Read Phase-9-spec.md (20 min)
- Review Phase 8 API responses (understand endpoints)
- Build analytics.html + CSS + JS patterns from spec
- Focus: responsive design, Chart.js integration, vanilla JS
- Test: Static data first, then integrate Phase 8 API
- Deliverable: Working dashboard, project-status.md update
- Handoff: UI ready for PO validation

**Phase 10 (Interactivity):**
- Read Phase-10-spec.md (15 min)
- Implement MUST-HAVE features first (Date filter + Drill-down)
- Optional: Add NICE-TO-HAVE (CSV export) if time permits
- Focus: UX (debounce, validation), drill-down clarity, performance
- Test: E2E workflow (filter → drill-down → export)
- Deliverable: Fully interactive dashboard, project-status.md update
- Handoff: Ready for final PO validation

**Inputs (each phase):**
- erp-context.md (MASTER reference)
- project-status.md (current status, PO feedback from previous phase)
- Phase-X-spec.md (active phase specification)

**Outputs (each phase):**
- Working code committed to repo
- Updated project-status.md with completion details
- Known blockers or issues documented

---

### PO-Agent

**Role:** Validate quality gates, approve/reject phases, provide feedback

**Phase 8 QA (Backend Validation):**
- Read Phase-8-spec.md Quality Gate section (5 min)
- Read project-status.md (developer's completion report)
- Run Postman test suite: all 10 endpoints
- Validate: Responses match spec, error handling (400/404/500)
- Check: Query performance <300ms per endpoint
- Decision: PASS / FAIL
- Output: phase-8-feedback.md with findings
- Gate: If FAIL, document issues for Developer-Agent to fix

**Phase 9 QA (Frontend Validation):**
- Read Phase-9-spec.md Quality Gate section (5 min)
- Read project-status.md (developer's completion report)
- Manual testing: KPI cards populate, charts render
- Browser test: Chrome, Firefox, Safari
- Responsive test: 1024px, 768px, 375px
- Performance: Page load <3 seconds (use DevTools)
- Decision: PASS / FAIL
- Output: phase-9-feedback.md with findings
- Gate: If FAIL, document issues for Developer-Agent to fix

**Phase 10 QA (Interactivity Validation):**
- Read Phase-10-spec.md Quality Gate section (5 min)
- Read project-status.md (developer's completion report)
- Test date filter: change dates → charts update <1.5s (max 1 API call per change)
- Test drill-down: click chart segment → detail view appears
- Test reset: clears filter → reloads defaults
- Test CSV export: if implemented, verify download + formatting
- Performance: DevTools network tab, <1.5s filter response
- Decision: PASS / FAIL
- Output: phase-10-feedback.md with sign-off
- Gate: If PASS, Analytics Dashboard is complete!

**Inputs (each phase):**
- Phase-X-spec.md (acceptance criteria checklist)
- project-status.md (what developer completed)

**Outputs (each phase):**
- phase-X-feedback.md (PASS/FAIL/CONDITIONAL PASS + issues found)
- Clear go/no-go decision for next phase

---

## PHASE FEEDBACK TEMPLATE

**File:** phase-X-feedback.md

```markdown
# Phase X Feedback

**PO Decision:** PASS / CONDITIONAL PASS / FAIL

## Quality Gate Validation

### Required Criteria
- [x] Criterion 1: Description
- [x] Criterion 2: Description
- [ ] Criterion 3: Description (ISSUE: reason)

### Issues Found
1. Issue #1: Description, severity (BLOCKER / HIGH / MEDIUM / LOW)
2. Issue #2: Description, severity

### Performance Metrics
- Response time: X ms (target: <Yms)
- Page load: X s (target: <3s)
- API calls: X per action (target: 1)

## Approval Status
✅ PASS - Ready for next phase
⚠️  CONDITIONAL PASS - Minor issues, proceed with caution
❌ FAIL - Blocker found, return to developer

## Notes for Developer
[Specific guidance on what to fix, if FAIL]

## Sign-Off
PO-Agent: [Date]
```

---

## INTEGRATION WITH erp-context.md

**To include in MASTER_CONTEXT.md:**

```markdown
## PHASE OVERVIEW (Extended)

| Phase | Deliverable | Duration | Spec File |
|-------|-------------|----------|-----------|
| 1–7 | MVP (Inventory, HR, Sales) | Complete | (original MVP phases) |
| 8 | Analytics Backend API | 4–5 days | Phase-8-spec.md |
| 9 | Analytics Frontend UI | 4–5 days | Phase-9-spec.md |
| 10 | Analytics Interactivity | 3–4 days | Phase-10-spec.md |

## API SPECIFICATIONS (Extended)

### Analytics (Phases 8–10)
```
GET /api/analytics/inventory-summary
GET /api/analytics/inventory-by-category
GET /api/analytics/low-stock-items
GET /api/analytics/hr-summary
GET /api/analytics/payroll?month=YYYY-MM
GET /api/analytics/employees-under-threshold
GET /api/analytics/sales-summary?start_date=X&end_date=Y
GET /api/analytics/sales-trend?start_date=X&end_date=Y&interval=daily
GET /api/analytics/top-customers?limit=5&start_date=X&end_date=Y
GET /api/analytics/top-products?limit=5&start_date=X&end_date=Y
GET /api/analytics/dashboard-summary
GET /api/analytics/export/sales-csv?start_date=X&end_date=Y (Phase 10 optional)
```
```

---

## QUALITY GATES SUMMARY

### Phase 8 (5 criteria)
- All 10 endpoints return correct JSON
- Prepared statements used throughout
- Error handling: 400/404/500 responses
- Response time: <300ms per endpoint
- Postman tests pass

### Phase 9 (9 criteria)
- Page loads in <3 seconds
- All KPI cards populate
- All 4 charts render
- Tables display data
- No console errors
- Responsive: 1024px, 768px, 375px
- Navigation works
- Loading spinner shows/hides
- Error banner displays

### Phase 10 (13 criteria)
**MUST-HAVE:**
- Date filter: charts update <1.5s
- Filter validation: errors shown
- Reset button: clears + reloads
- Drill-down: works on click
- Detail data: correct for segment
- No console errors
- Responsive: all breakpoints
- Performance: <3s page load, <1.5s filter update

**NICE-TO-HAVE:**
- CSV export: downloads + correct format
- Mobile drill-down: works on small screens

---

## DEVELOPER-AGENT CHECKLIST

**Before each phase:**
- [ ] Read relevant Phase-X-spec.md
- [ ] Read project-status.md (current status + PO feedback from previous phase)
- [ ] Review erp-context.md (MASTER reference)
- [ ] Understand dependencies (what must be complete before starting)

**During implementation:**
- [ ] Code follows spec exactly (responses, endpoints, quality gates)
- [ ] Test locally before submitting
- [ ] Document any blockers or assumptions
- [ ] Update project-status.md with completion status

**Before handoff to PO:**
- [ ] All Quality Gate criteria met (self-check)
- [ ] No console errors
- [ ] Performance targets met
- [ ] Commit all code to repo
- [ ] Update project-status.md

---

## PO-AGENT CHECKLIST

**Before each phase validation:**
- [ ] Read Phase-X-spec.md Quality Gate section
- [ ] Read project-status.md
- [ ] Prepare test environment (Postman, browser, DevTools)

**During validation:**
- [ ] Test each Quality Gate criterion
- [ ] Document findings (working, failing, observations)
- [ ] Measure performance (response times, page load)
- [ ] Note any usability issues

**Before sign-off:**
- [ ] All required criteria validated
- [ ] Issues documented with severity
- [ ] Decision made: PASS / CONDITIONAL PASS / FAIL
- [ ] Write phase-X-feedback.md
- [ ] Communicate decision to Developer-Agent

---

## NEXT STEPS AFTER PHASE 10

1. **Review Analytics Dashboard:** Demo to stakeholders, gather feedback
2. **Plan Phase 11 (Accounting Module)** or iterate on Phase 8–10
3. **Consider Phase 8 extension:** Scheduled reports, email exports, data caching
4. **Database optimization:** Add indexes if performance degrades at scale

---

## DOCUMENT CONTROL

| Version | Date | Change |
|---------|------|--------|
| 1.0 | Dec 1, 2025 | Original monolithic plan (11,000 words) |
| 2.0 | Dec 1, 2025 | Refactored into 3 focused specs (1,500–1,800 words each) |
| 2.1 | Dec 1, 2025 | Removed Project Lead, focused on Developer-Agent + PO-Agent roles |

**Feedback welcome:** Document issues or estimate adjustments in phase-X-feedback.md
