# JAZMINE — UI DESIGN SYSTEM V1

**Status:** DESIGN SYSTEM BASELINE / READY FOR PHASE 5B USE  
**Language:** Lao + English technical terms  
**Brand/System:** JAZMINE  
**Primary UI Font:** Noto Sans Lao  
**Scope:** Web App UI / Responsive Operational Interface / Shared Component Rules  
**Does NOT replace:** Phase 0–5 Business Rules, Domain Ownership, Contracts, State Machines, Server-side Validation, Commercial Document Business Logic, Production Sheet Business Logic

---

# 1. PURPOSE

ເອກະສານນີ້ຫຼອມລວມ:

```text
JAZMINE Phase 5 UX / UI Rules
+
apple-layout-guide.md
=
JAZMINE UI Design System
```

ເປົ້າໝາຍ:

```text
CONSISTENT
READABLE
FAST TO USE
ACCESSIBLE
RESPONSIVE
NO SPAGHETTI UI
```

ລະບົບຕ້ອງມີ UI language ດຽວກັນທັງ:

```text
Dashboard
Customers
POS / Orders
Production
Payments
Shipments
Tracking
Analytics
Admin
Search / Filter / QR
```

---

# 2. SOURCE PRIORITY / CONFLICT RULE

ຖ້າມີຂໍ້ຂັດແຍ່ງ:

```text
1. JAZMINE Phase 0–4 Business/System Rules
2. JAZMINE Phase 5 UX / Workflow Rules
3. JAZMINE UI Design System
4. apple-layout-guide.md
5. Page-specific visual preference
```

Rule:

```text
Visual Guide MUST NOT override Business Truth
```

ຕົວຢ່າງ: ຖ້າ generic form guide ແນະນຳ max-width 640px ແຕ່ Production Sheet Builder ຕ້ອງໃຊ້ 8/4 Builder + Summary, JAZMINE workflow ເປັນຫຼັກ.

---

# 3. DESIGN PHILOSOPHY

JAZMINE Web App:

```text
Minimal
Premium
Modern
Operational
Calm
Data-first
Clear hierarchy
Low visual noise
Fast scanning
```

ຫ້າມ:

```text
Emoji in production UI
Decorative gradients
Heavy shadows everywhere
Random colors
Multiple icon styles
Card-inside-card-inside-card
Oversized marketing typography in operational screens
Hidden critical actions
Color-only status meaning
```

Production UI is not a marketing website.

---

# 4. VISUAL FOUNDATION

## 4.1 Color Roles

```text
Canvas / Surface  → White / Near-white
Primary Text      → Near-black
Secondary Text    → Neutral gray
Primary Action    → Blue
Success           → Green
Warning           → Amber
Error/Destructive → Red
```

Recommended Light tokens:

```text
--canvas:          #FFFFFF
--canvas-soft:     #F5F5F7
--surface:         #FFFFFF
--ink:             #1D1D1F
--body:            #515157
--mute:            #64646B
--hairline:        #D2D2D7
--control-border:  #76767E
--primary:         #0066CC
--primary-hover:   #0055AA
--primary-soft:    #EAF3FF
--success:         #176B3A
--success-soft:    #EAF6EF
--warning:         #854D0E
--warning-soft:    #FFF8E6
--error:           #B42318
--error-soft:      #FFF1F0
```

## 4.2 JAZMINE Brand Red

JAZMINE Red may remain a stronger brand accent for:

```text
Quotation
Invoice
Receipt
Print Documents
Selected brand identity surfaces
```

Web App operational actions remain primarily Blue.

```text
Web App                → Operational Blue
Commercial Documents  → JAZMINE Brand Accent
```

---

# 5. DARK MODE

Supported:

```text
Light
Dark
System
```

Rule:

```text
NO CSS INVERT
```

Dark Mode uses semantic dark tokens for canvas, surfaces, text, borders, primary, success, warning and error. Every pair must be contrast-checked.

---

# 6. TYPOGRAPHY

Primary:

```text
Noto Sans Lao
```

Fallback:

```text
Phetsarath OT
system-ui
Segoe UI
sans-serif
```

## 6.1 Minimums

```text
Practical Web UI minimum → 14px
Absolute print minimum   → 10pt ≈ 13.33px
```

Do NOT shrink important information below readable size to make a layout fit.

## 6.2 Recommended Scale

```text
Page Title        28–36px / 600
Section Title     20–24px / 600
Panel Title       16–20px / 600
Normal UI         14–16px / 400
Label             14–16px / 600
Metadata          14px / 400
```

## 6.3 Lao Line Height

```text
Long reading/help text → 1.7–1.8
Normal UI              → 1.5–1.65
Dense table/metadata   → 1.4–1.5
letter-spacing         → normal
```

---

# 7. SPACING SYSTEM

Base scale:

```text
4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96
```

JAZMINE operational override:

```text
Page padding desktop  → 24–32px
Page padding tablet   → 24px
Page padding mobile   → 16px
Major section gap     → 32–48px
Normal group gap      → 16–24px
Dense operational gap → 8–16px
```

Do NOT force 64–96px whitespace inside dense operational screens.

---

# 8. RADIUS / ELEVATION

```text
Small radius       8px
Input/Button       12px
Card/Panel         16px
Large Modal        20–24px
Pill Badge         9999px
```

Elevation:

```text
Normal Card     → none
Dropdown/Raised → subtle
Modal/Overlay   → restrained stronger shadow
```

Default rule:

```text
Border + whitespace first
Shadow second
```

---

# 9. RESPONSIVE SYSTEM

```text
Mobile   < 768px    → 4-column reference
Tablet   768–1023   → 8-column reference
Desktop  ≥ 1024px   → 12-column reference
Wide     ≥ 1280px   → 12-column + wide content
```

Gutters:

```text
Mobile 16px
Tablet 24px
Desktop 32px
```

Content widths:

```text
General content     1200px
Dashboard / Tables  1440px
Reading column       720px
Simple Form          640px
Auth                  440px
Sidebar               240px
Aside / Summary       320px
```

These are max-width values, not fixed widths.

---

# 10. APP SHELL

Desktop:

```text
┌──────────────┬────────────────────────────────────┐
│ SIDEBAR      │ PAGE HEADER                        │
│ ~240px       ├────────────────────────────────────┤
│              │ MAIN CONTENT                       │
└──────────────┴────────────────────────────────────┘
```

Sidebar modules:

```text
Dashboard
Customers
Orders
Production
Shipments
Payments
Analytics
Admin
```

Show only modules allowed by Permission Matrix.

Mobile:

```text
Top Bar
→ Menu
→ Page Title
→ Context action

Drawer
→ Navigation
```

---

# 11. ICON SYSTEM

```text
ONE minimal outline icon family
```

Never mix outline, filled, 3D, emoji, or unrelated icon packs.

Icon-only controls should have a 44×44px target and accessible name. Unfamiliar actions should display visible text.

---

# 12. BUTTONS

Primary = main decision/action only.

Examples:

```text
Confirm Order
Mark PS Ready
Complete Stage
Confirm Shipment
Record Payment
```

Secondary:

```text
Save Draft
Preview
Print
Cancel
Back
```

Destructive actions must be visually separated.

Disabled controls MUST explain why when the reason is not obvious.

---

# 13. INPUTS / FORMS

Baseline:

```text
min-height 48px
font-size 14–16px
radius 12px
visible border
visible focus
```

Always:

```text
Label above input
Helper text when needed
Inline error near field
Placeholder is not a label
```

Long forms should provide an error summary linking/scrolling to invalid fields. Keep entered values after validation errors.

---

# 14. CARDS / PANELS

Use cards only for meaningful grouping.

Preferred:

```text
Page
↓
Section
↓
Optional Panel/Card
```

Avoid nested cards.

```text
Desktop padding 24px
Mobile padding  16px
```

---

# 15. TABLES

Use for Orders, Production Queue, Payments, Shipments, Admin records and analytics detail.

Rules:

```text
Clear headers
Numbers aligned consistently
Sort direction visible
Row hover/focus state
Selected row visible
Readable row density
Pagination
Server-side search/filter/sort
```

Mobile: do not squeeze a desktop table into tiny columns. Use table-container horizontal scroll only where true 2D comparison is necessary; otherwise use purpose-built cards.

---

# 16. BADGES / STATUS

Status must use:

```text
Color + Text + icon/shape where useful
```

Never color-only.

Examples:

```text
URGENT
LATE
DUE SOON
IN PROGRESS
COMPLETED
ISSUE
VOIDED
ARCHIVED
```

---

# 17. MODAL / DRAWER

Modal: short confirmation, destructive action, focused edit, resolution action.

Drawer: filters, mobile navigation, secondary detail.

Modal baseline:

```text
max-width 560px
```

Must manage focus correctly and return focus to the trigger when closed.

---

# 18. UPLOAD / IMAGE PREVIEW

Shared upload pattern:

```text
Drag & Drop
or
Choose File
```

After upload:

```text
Preview
Replace
Remove
```

Production-critical images use:

```text
object-fit: contain
```

Do not crop important artwork just to fill a box.

---

# 19. SEARCH / FILTER / PAGINATION

All large operational lists:

```text
Server-side Search
Server-side Filter
Server-side Sort
Pagination
Indexes
```

Never load everything and filter only in the frontend.

Returning from Detail should preserve search, filters, sort, page and scroll position where practical.

---

# 20. SYSTEM STATES

Every important screen must define:

```text
Loading
Empty
No Results
Error
Success
Disabled
Permission Denied
Conflict
Offline / Network Error
```

Loading uses a skeleton close to the final layout. Unknown values must not appear as 0.

Conflict example:

```text
This record was updated by another user.

[ Reload Latest ]
[ Review Changes ]
```

Never silently overwrite concurrent updates.

---

# 21. ACCESSIBILITY BASELINE

```text
44px comfortable touch target
Visible focus
Keyboard usable
Color not sole meaning
Responsive reflow
Readable Lao
Reduced motion
```

Target normal text contrast:

```text
4.5:1
```

Sticky elements must not cover focused controls.

---

# 22. MOTION

```text
Fast    ~120ms
Normal  ~180ms
```

Use only for state transition, drawer/modal, hover/focus and small expand/collapse. No decorative auto animation in operational workflows.

---

# 23. DASHBOARD PATTERN

```text
Sidebar
↓
Page Header
↓
Important Attention
↓
3–4 Key Metrics
↓
Overview / Main Chart + Next Actions
↓
Search / Filter
↓
Recent / Actionable Table
```

Unknown data is not 0. Stale data must be labeled.

---

# 24. CUSTOMER PATTERN

Customer List:

```text
Search
Filter
Customer Table/List
Status
Group
Production Branding indicator
Quick action
```

Customer Profile:

```text
Overview
Production Branding
Orders
Financial
Analytics
```

Production Branding shows Branding Type, Neck Label Preview, Neck Tape Preview and authorized Update action.

No multi-brand selector per Customer record.

---

# 25. POS / ORDER CREATE PATTERN

Desktop:

```text
8 columns → ORDER BUILDER
4 columns → STICKY SUMMARY
```

Builder:

```text
Customer
Production Branding preview
Jersey Configuration
Size / Qty
Promotion
Approved Mockup
Review
```

Summary:

```text
Calculated Price
Qty
Promotion
Validation
Commercial context
Confirm action
```

Primary:

```text
Confirm Order
```

Secondary:

```text
Save Draft
Preview
Cancel
```

---

# 26. ORDER REVIEW PATTERN

Review before Confirm must show:

```text
Customer
Customer Group
Production Branding
Neck Label
Neck Tape
Jersey Components
Fabric
Part Fabrics
Size / Qty
Promotion
Mockup
Final Price
```

Server validation remains authoritative.

---

# 27. PRODUCTION MAIN QUEUE PATTERN

Desktop:

```text
Full-width operational table
```

Top:

```text
Department
Search
Filter
QR
```

Summary:

```text
URGENT
LATE
DUE SOON
IN PROGRESS
```

Queue:

```text
1 PS = 1 row
```

Default order:

```text
1. URGENT
2. Nearest Due Date
3. Oldest
```

Columns:

```text
Priority
Due
PS No
Order No
Customer
PS Qty
Stage
State
Version
Issue
Action
```

Mobile uses cards. Do not use misleading percentage progress bars.

---

# 28. PRODUCTION JOB DETAIL PATTERN

Desktop:

```text
8 columns MAIN
4 columns STICKY CONTROL
```

Main:

```text
Approved Mockup
Production Branding
Size / PS Qty
Production Parts
Names / Numbers
History
```

Control:

```text
Current Stage
Stage Status
Start / Complete
Issue
Version state
```

Superseded PS must be operationally read-only and show a link to the current version.

---

# 29. PRODUCTION SHEET BUILDER PATTERN

Desktop:

```text
8 columns Builder
4 columns Sticky Summary
```

Builder:

```text
1. Allocation
2. Approved Mockup read-only
3. Production Branding read-only
4. Body
5. Sleeves
6. Cuffs
7. Collar
8. Other Parts
9. Notes
```

Summary:

```text
PS Qty
Version
Validation
Preview PS
Save
Mark Ready
```

Dynamic Parts:

```text
Part exists     → show section
Part not exists → do not render empty section
```

Confirmed Fabric is read-only in PS Builder.

---

# 30. PRODUCTION SHEET A4 RELATIONSHIP

Web UI and A4 are related but not identical.

Web:

```text
Interactive
Responsive
Editable
Operational
```

A4:

```text
Static
Print-safe
2-page preferred
Minimum 10pt
No overlap
No missing artwork
```

Page 1:

```text
Job identity
Customer
Due/Priority
Approved Mockup
Neck Label/Tape
Size/QTY
PS Allocation
Name/Number
```

Page 2:

```text
Production Artwork
Fabric by Part
Note by Part
```

Do not force Web card aesthetics onto printed A4.

---

# 31. SHIPMENT UI PATTERN

List:

```text
Search / Filter
Shipment Status
Order / Customer
Qty
Ready Qty
Shipment Date
Action
```

Create Shipment:

```text
Eligible fulfillment
Partial/full selection
Payment warning
Delivery/Pickup context
Review
Confirm Shipment
```

Critical state changes require explicit confirmation + server validation.

---

# 32. TRACKING UI PATTERN

Public tracking is simpler than internal UI.

Show only allowed data:

```text
Order summary
Approved Mockup where allowed
Progress
Ready / Shipped status
Payment summary where allowed
Request area
```

Do not expose internal production detail or internal document URLs.

---

# 33. ANALYTICS UI PATTERN

Use:

```text
KPI
Chart
Table
Period filter
Drill-down
```

Every chart must answer a question and show metric definition, period and context/population.

---

# 34. ADMIN UI PATTERN

Admin may be denser.

Use:

```text
Search
Filters
Table
Row actions
Permission-aware controls
```

Configuration areas:

```text
Customers
Products
Fabrics
Pricing
Promotions
Users
Permissions
Departments
Settings
JAZMINE Branding Assets
```

Critical configuration changes require confirmation, audit and permission.

---

# 35. DOCUMENTS VS WEB APP

Commercial Documents:

```text
Quotation
Invoice
Receipt
```

may use stronger JAZMINE branding.

Web App:

```text
clean
neutral
operational
blue actions
```

Documents:

```text
brand-forward
print-safe
A4
```

Do not force the exact same visual language.

---

# 36. KEEP / ADAPT / OVERRIDE MATRIX

## KEEP from apple-layout-guide.md

```text
Noto Sans Lao foundation
White/gray/near-black base
Blue action accent
4/8/12 responsive grid
1200/1440 content widths
240px sidebar baseline
320px aside baseline
44px action target
48px input baseline
16px card radius
12px button/input radius
Accessible focus
Responsive reflow
Explicit states
Clear hierarchy
Minimal shadow
```

## ADAPT for JAZMINE

```text
Spacing
Density
Table row height
Line height
Cards
List/detail behavior
Sticky panels
Mobile operational layouts
```

## OVERRIDE with JAZMINE Rules

```text
Business workflows
Domain ownership
Pricing rules
Order confirmation
Production State Machine
Permissions
Server-side validation
Search/filter backend behavior
Payment rules
Shipment rules
Commercial Document rules
Production Sheet content rules
Production Branding snapshot behavior
```

---

# 37. QUALITY CHECKLIST

Before locking any screen:

```text
[ ] User knows what page this is
[ ] Main action is obvious
[ ] One dominant Primary action per decision group
[ ] Required information appears before confirmation
[ ] Lao text wraps correctly
[ ] No text overlap
[ ] No image overlap
[ ] Production-critical images use contain
[ ] 14px practical UI minimum respected
[ ] Mobile works
[ ] Tablet works
[ ] Desktop works
[ ] 1440px wide layout works
[ ] Keyboard focus visible
[ ] State not color-only
[ ] Loading state exists
[ ] Empty state exists
[ ] Error state exists
[ ] Permission denied state exists
[ ] Conflict state exists where concurrent edits can occur
[ ] Search/filter is server-side for large lists
[ ] No duplicate business logic in UI
[ ] No emoji
[ ] One icon family
[ ] Dark mode uses semantic tokens
```

---

# 38. FINAL DESIGN PRINCIPLE

```text
Business Truth first
User Task second
Readability third
Visual Beauty fourth
```

But:

```text
Clean + Beautiful
MUST NOT cause
missing data
hidden state
overlap
cropped production artwork
ambiguous action
or broken workflow
```

---

# 39. STATUS

This document is the shared visual/UI foundation for remaining Phase 5B screens.

It DOES NOT modify locked Phase 0–5 business behavior.

Use it as the single UI reference for:

```text
Dashboard
Customers
Orders / POS
Production
Shipments
Payments
Tracking
Analytics
Admin
Search / Filters
Shared UI States
```

Future Phase 5B screen specs should reference this Design System instead of redefining typography, spacing, buttons, tables, states and responsive behavior independently.
