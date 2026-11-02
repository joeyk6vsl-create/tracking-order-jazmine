# JAZMINE — PHASE 5 FINAL CONSOLIDATED SPECIFICATION

**System:** JAZMINE Sportswear / Jersey Organization Management System  
**Phase:** PHASE 5 — UX / UI / Interaction / Responsive / Document Behavior  
**Status:** FINAL LOCKED / CONSOLIDATED  
**Language:** Lao + English Technical Terms  
**Supersedes:** Earlier Phase 5 files that still said `PHASE 5B = PARTIALLY DEFERRED`

---

# 5.0 FINAL STATUS

```text
PHASE 5A — Business UX / Rules / Flow
= FINAL LOCK

PHASE 5B — Final Layout Architecture / Screen Composition
= FINAL LOCK
```

Pixel-level implementation details such as a specific 24px vs 28px spacing decision are not Business Architecture decisions. They are implemented through the shared Design System / design tokens.

No Phase 5 screen is allowed to override Phase 0–4 Business Truth.

---

# 5.1 SOURCE PRIORITY / CONFLICT RULE

```text
1. Phase 0–4 Business/System Rules
2. Phase 5 UX / Workflow Rules
3. JAZMINE UI Design System
4. apple-layout-guide.md
5. Page-specific visual preference
```

Rule:

```text
Visual Guide MUST NOT override Business Truth
```

---

# 5.2 INFORMATION ARCHITECTURE

Main navigation:

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

Shared utilities:

```text
Global Search
QR
Notifications
Profile
```

Core rules:

```text
One App / One Main Navigation
Production remains one module
POS lives inside Orders
Customer Profile is a central customer workspace
Navigation is permission-aware
No duplicated business app for the same workflow
```

---

# 5.3 APP SHELL

Desktop:

```text
Sidebar
Topbar
Page Header
Main Content
```

Mobile:

```text
Drawer
Compact Top Bar
Mobile-appropriate cards/content
```

List pages:

```text
Search
Filter
Table / Card List
Pagination
```

Detail pages may use tabs.

Production mobile presentation uses cards instead of squeezing wide operational tables.

Complex Admin screens are desktop-first while remaining responsive.

---

# 5.4 VISUAL SYSTEM

Brand/System:

```text
JAZMINE
```

Primary UI font:

```text
Noto Sans Lao
```

Minimums:

```text
Practical Web UI minimum = ~14px
Absolute Print minimum   = 10pt ≈ 13.33px
```

Production UI:

```text
Emoji = STRICTLY PROHIBITED
One consistent minimal outline icon family
```

Themes:

```text
Light
Dark
System
```

Forbidden:

```text
CSS invert
image/color inversion hacks
decorative gradients
heavy shadows everywhere
random icon families
nested-card clutter
color-only state meaning
```

Visual direction:

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

Operational Web App uses near-white/white surfaces, near-black text, operational blue primary action, thin dividers, whitespace, and minimal shadow.

Commercial documents may use stronger JAZMINE brand red.

Shared spacing family:

```text
4 / 8 / 12 / 16 / 24 / 32 / 48
```

Inputs ~48px baseline, action target >=44px.

---

# 5.5 SHARED UI PRIMITIVES

Use one shared implementation family for:

```text
Buttons
Inputs
Selects
Cards
Tables
Badges
Dialogs
Tabs
Filters
Pagination
Alerts
Empty States
Loading States
Error States
```

Action hierarchy:

```text
Primary
Secondary
Ghost
Danger
```

Normally one dominant Primary action per decision group.

---

# 5.6 DASHBOARD

Dashboard is permission-aware.

Possible views:

```text
Admin organization overview
Staff operational view
Production department view
```

Information categories:

```text
KPI
Attention / Alerts
Production Workload
Order Status Overview
Financial Overview
Shipment Readiness
```

Rules:

```text
Dashboard does NOT own business truth
Dashboard MUST use central metric definitions
Dashboard widgets drill down to authoritative modules
```

Example:

```text
Late Orders
→ Orders filtered to Late
```

Mobile Dashboard simplifies/reflows instead of squeezing desktop layout.

---

# 5.7 CUSTOMER UX

Flow:

```text
Customers
→ Customer List
→ Add Customer
→ Customer Profile
```

Customer Profile tabs:

```text
Overview
Production Branding
Orders
Financial
Analytics
```

Core fields:

```text
Name
Phone
Default Group
Customer Since
Status
Notes
Production Branding
```

Phone:

```text
Not globally unique
Normalized phone may show duplicate warning
Customer ID remains stable identity
```

Customer totals are derived from owner domains.

Analytics MUST NOT auto-change Customer Group.

---

# 5.8 CUSTOMER PRODUCTION BRANDING

```text
1 Customer / Agent Record
=
1 Production Brand
```

Types:

```text
JAZMINE_STANDARD
CUSTOM_AGENT
```

Customer Group and Production Branding are separate:

```text
Customer Group
→ pricing context

Production Branding
→ Neck Label / Neck Tape production context
```

If one real-world person operates two brands:

```text
Brand A → Customer Record A
Brand B → Customer Record B
```

Same phone may appear on both.

JAZMINE_STANDARD uses central JAZMINE Neck Label + Neck Tape assets.

CUSTOM_AGENT uses Customer-specific Neck Label + Neck Tape asset refs.

Selecting Customer:

```text
Customer
→ resolve current Production Branding
→ preview Neck Label
→ preview Neck Tape
```

Changing current branding:

```text
affects future Draft resolution only
MUST NOT rewrite confirmed Orders / PS / PS Versions
```

---

# 5.9 POS / ORDER CREATION UX

Shared flow:

```text
Customer
↓
Resolve Production Branding
↓
Jersey Configuration
↓
Part Fabrics
↓
Size / Qty
↓
Promotion
↓
Approved Mockup
↓
Review
↓
Confirm
```

Required manual selections:

```text
Collar
Fabric
Shoulder
Cuff
```

Defaultable:

```text
Sleeve
Waist
Shirt Bottom
```

Review before Confirm shows:

```text
Customer
Customer Group
Production Branding
Neck Label
Neck Tape
Jersey Components
Fabric / Part Fabrics
Size / Qty
Promotion
Mockup
Final Price
```

Missing required branding:

```text
JAZMINE_STANDARD
→ configured system Label/Tape must resolve

CUSTOM_AGENT
→ Customer Label/Tape must resolve

missing required asset
→ BLOCK CONFIRM
```

Server-side PRICING is authoritative.

POS MUST NOT hardcode pricing logic.

Size summary distinguishes:

```text
purchasedQty
promotionalFreeQty
fulfillmentQty
```

---

# 5.10 PRICE-AFFECTING PART FABRIC

Price-affecting Fabric choices must be selected in Order/POS before Confirm.

Examples:

```text
Body Fabric
Sleeve Fabric
Cuff Fabric
Collar Fabric
Other Part Fabric
```

Flow:

```text
Order Configuration
→ Part Fabric selection
→ PRICING
→ Review
→ Confirm
→ Snapshot
```

Pricing Version can control surcharge applicability:

```text
Body        ON/OFF
Sleeve      ON/OFF
Cuff        ON/OFF
Collar      ON/OFF
Other Part  ON/OFF
```

Multiple enabled Part surcharges:

```text
calculate separately
then sum
```

OUT_OF_STOCK before Confirm:

```text
BLOCK CONFIRM
```

Already confirmed Fabric later becomes OUT_OF_STOCK:

```text
WARNING
NEVER silently substitute another Fabric
```

Price-affecting Part Fabric change after Confirm:

```text
Controlled Order Edit
→ Reprice
→ Order Revision
→ Invoice Revision
→ PS Version when applicable
```

---

# 5.11 COMMERCIAL DOCUMENT UX

Controlled document types:

```text
QUOTATION
INVOICE
RECEIPT
```

Business source:

```text
QUOTATION → Order Draft + PRICING
INVOICE   → Confirmed Order Snapshot
RECEIPT   → Confirmed Payment
```

Commercial Stage:

```text
NONE
QUOTATION
INVOICE
```

Receipt is NOT a Commercial Stage.

Supported flows:

```text
Draft → Quotation → Confirm → Invoice
Draft → Confirm → Invoice
```

Quotation is optional.

Issued Quotation revisions preserve history.

Confirmed commercial edit:

```text
New Order Revision
→ New Invoice Revision
```

Payment does NOT create Invoice revision.

Receipt represents exact Payment truth.

Void/cancel does not delete Receipt history.

Refund does not rewrite original Receipt.

Lao/English is presentation only and keeps same document identity/revision.

---

# 5.12 COMMERCIAL DOCUMENT QR

```text
Quotation QR
→ Internal exact document/revision lookup
→ authenticated staff + permission

Receipt QR
→ Internal exact Payment/Receipt lookup
→ authenticated staff + permission

Invoice QR #1
→ Public Tracking token

Invoice QR #2
→ Bank / Payment QR
```

Rule:

```text
Scan alone NEVER mutates business state
```

Customer Tracking does not expose internal commercial PDF files.

---

# 5.13 PAYMENT UX

Payment view:

```text
Order Total
Net Paid
Remaining / Outstanding
Payment Status
Financial Resolution
```

Types:

```text
DEPOSIT
ADDITIONAL
FINAL
```

No global minimum deposit.

Normal:

```text
Payment Amount <= Remaining
```

Wrong payment:

```text
Void / Cancel with reason + audit
NEVER silent delete
```

Refund:

```text
controlled
Refund <= eligible net paid
history remains
```

Overpaid after Order total reduction:

```text
PaymentStatus = OVERPAID
FinancialResolution = RESOLUTION_REQUIRED
No automatic refund
```

Payment does not gate Production.

Shipment with outstanding amount:

```text
strong warning
authorized user may proceed
```

---

# 5.14 PRODUCTION UX

Core relationship:

```text
1 Order
→ 1..N Production Sheets
```

Preparation:

```text
Confirmed Order
→ WAITING_FOR_PRODUCTION_SHEET
→ PS Preparation
→ PS READY
→ Physical Production
```

Stages:

```text
PRINTING
HEAT_TRANSFER
LASER
SIZE_SORTING
SEWING
QC
```

States:

```text
NOT_STARTED
IN_PROGRESS
COMPLETED
```

Transition:

```text
Next Stage START
→ previous IN_PROGRESS or COMPLETED

Next Stage COMPLETE
→ previous MUST be COMPLETED

No skipping
Multiple stages may be IN_PROGRESS
```

`latestReachedStage` = furthest stage started, not quantity proof.

Normal production does NOT track normal per-stage:

```text
receivedQty
completedQty
remainingQty
```

Use:

```text
PS allocation + Stage states
```

Independent batches/readiness use multiple PS.

---

# 5.15 PRODUCTION EXCEPTION / READINESS

Exception mode:

```text
STOP & RESOLVE
```

Can track exact exception quantities:

```text
Allocated
Usable
Scrap / Unusable
Unstarted
Release
Replacement
```

Worker actions:

```text
REPORT
STOP
FLAG
```

Resolver:

```text
ADMIN_PROMAX
or
RESOLVE_PRODUCTION_EXCEPTION permission
```

Readiness:

```text
QC IN_PROGRESS
→ Ready contribution = 0

QC COMPLETED
→ eligible usable allocation contributes Ready
```

Rule:

```text
Usable ≠ Ready
```

Partial readiness uses multiple PS.

Replacement production:

```text
separate REPLACEMENT PS
linked to exception
no customer charge by default
```

---

# 5.16 PRODUCTION IMAGES / PARTS

Production images:

```text
Main Body = 1–2 (front/back)
Sleeves   = exactly 2 (Left/Right)
Cuffs     = exactly 2 (Left/Right)
Collar    = 1–3 depending on collar
Other     = dynamic
```

Shared dynamic concepts:

```text
ProductionPartEditor
ProductionImageUpload
```

Sources:

```text
Approved Mockup
→ reuse from Order

Neck Label / Neck Tape
→ Confirmed Order Branding Snapshot

Body/Sleeve/Cuff/Collar/Other artwork
→ Production asset upload/attach
```

Fabric per part:

```text
Main Body → confirmed Order snapshot
Other Parts → same as Body or custom Fabric
```

If price-affecting, commercial choice must already be handled through Order/Pricing.

---

# 5.17 PS VERSION UX

```text
v1
v2
v3
...
```

Old versions remain.

Superseded:

```text
read-only
prominent link to Current version
```

Production-affecting confirmed edit may require:

```text
New PS Version
Affected department notification
History preserved
```

Historical assets MUST NOT be silently overwritten.

---

# 5.18 PRODUCTION MAIN QUEUE — FINAL LAYOUT ARCHITECTURE

Desktop:

```text
Production
[Search] [Filter]

[All] [Urgent] [Late] [Due Soon] [My Department]

Order / PS | Customer | Due | Priority | Latest Stage | State
```

Default sort:

```text
URGENT
→ nearest due
→ oldest
```

One PS = one operational row.

Mobile:

```text
cards
not compressed wide table
```

---

# 5.19 PRODUCTION JOB DETAIL — FINAL LAYOUT ARCHITECTURE

Desktop:

```text
8 columns MAIN
4 columns STICKY CONTROL
```

MAIN:

```text
Approved Mockup
Production Branding
Size / PS Allocation
Production Parts
Name / Number
Notes
Version History
```

CONTROL:

```text
Current Stage
Stage State
Start / Complete
Exception / Report Issue
Version State
```

Superseded version:

```text
read-only
View Current Version
```

---

# 5.20 PRODUCTION SHEET BUILDER — FINAL

Desktop:

```text
8 columns Builder
4 columns Sticky Summary
```

Builder:

```text
1 Allocation
2 Approved Mockup — read-only
3 Production Branding — read-only
4 Body
5 Sleeves
6 Cuffs
7 Collar
8 Other Parts
9 Notes
```

Summary:

```text
PS Qty
Version
Validation
Preview A4
Save Draft
Mark Ready
```

Dynamic:

```text
Part exists
→ render section

Part not present
→ do not waste UI/A4 space
```

Confirmed Fabric is read-only in PS Builder.

---

# 5.21 PRODUCTION SHEET A4 — FINAL COMPOSITION

Preferred:

```text
2 pages
3 pages allowed if needed
```

Never:

```text
crop
overlap
omit artwork
shrink below 10pt
```

Page 1:

```text
Header
Order No
PS No
Version
QR

Customer
Confirmed At
Due Date
Priority
Created By

Approved Mockup
Production Branding
Neck Label
Neck Tape

Size / Qty
PS Allocation

Name / Number
```

Page 2:

```text
Header
Order No
PS No
Version
QR

Production Parts

Body
→ image / Fabric / note

Sleeve L/R
→ image / Fabric / notes

Cuff L/R
→ image / Fabric / notes

Collar
→ 1–3 images / Fabric / note

Dynamic Other Parts
```

Historical issued PDF never silently changes to reflect later live state.

---

# 5.22 SHIPMENT UX

List:

```text
Search
Status
Date
Delivery / Pickup
```

Context:

```text
Shipment No
Order
Customer
Qty
Method
Status
Date
```

Create Shipment:

```text
Order
→ Ready Qty
→ Select Size + Qty
→ Delivery / Pickup
→ Recipient / Address if needed
→ Payment Warning
→ Review
→ Confirm Shipment
```

Sticky summary:

```text
Ready
Already Shipped
This Shipment
Remaining
Payment Warning
```

Confirm Shipment is a critical explicit confirmation.

---

# 5.23 CUSTOMER TRACKING UX

May show:

```text
Order Summary
Approved Mockup where allowed
Production Progress
Ready / Shipped
Simplified Payment Status
Request Area
```

Must NOT show:

```text
Internal PS numbers
Operators
Internal exceptions
Internal comments
Manufacturing artwork
Internal document URLs
Unnecessary financial internals
```

Multiple PS aggregate to Order-level public progress.

Requests:

```text
GENERAL
DELIVERY
EXPEDITE
```

Requests do NOT directly mutate Order/Shipment/Priority/Production.

---

# 5.24 ANALYTICS UX

Structure:

```text
Period / Filters

KPI Row
Sales | Orders | Cash | Outstanding | Qty

Trend Chart

Production / Product Metrics

Department Workload

Detailed Table
```

Every metric/chart shows:

```text
Metric Name
Period
Definition / context
```

No independent formula in UI.

---

# 5.25 ADMIN UX

Areas:

```text
Users
Permissions
Departments
Products
Fabrics
Pricing
Promotions
Settings
JAZMINE Branding Assets
```

Pattern:

```text
Search / Filter
→ Table
→ Detail / Edit
```

Critical changes require:

```text
Permission
+ Confirmation
+ Audit
```

P0 integrity/security rules do not get an OFF switch.

---

# 5.26 GLOBAL SEARCH / FILTER / QR

Search:

```text
server-side
indexed
permission-aware
paginated
```

Search result shows entity type clearly.

Filter pattern:

```text
[Search] [Status] [Date] [More Filters] [Clear]
```

QR:

```text
Scan
→ resolve QR type
→ security/permission check
→ open target
```

Rule:

```text
Scan != mutation
```

---

# 5.27 SYSTEM STATES

Applicable screens implement:

```text
LOADING
EMPTY
NO_RESULTS
ERROR
NETWORK_ERROR
BUSINESS_RULE_ERROR
DISABLED
PERMISSION_DENIED
STALE_STATE / CONFLICT
OFFLINE where relevant
CONFIRM
DESTRUCTIVE_CONFIRM
SUCCESS
```

No silent conflict overwrite.

---

# 5.28 RESPONSIVE / ACCESSIBILITY QUALITY GATE

Before locking a screen:

```text
User knows what page this is
Main action is obvious
Required information appears before confirmation
Lao wraps correctly
No text overlap
No image overlap
Production artwork uses contain where required
14px practical UI minimum respected
Mobile works
Tablet works
Desktop works
1440px layout works
Keyboard focus visible
State not color-only
Loading state exists
Empty state exists
Error state exists
Permission state exists
Conflict state exists where needed
No duplicate business logic in UI
No emoji
One icon family
Dark mode uses semantic tokens
```

---

# 5.29 FINAL PRINCIPLE

```text
Business Truth first
User Task second
Readability third
Visual Beauty fourth
```

Clean + beautiful MUST NOT cause:

```text
missing data
hidden state
overlap
cropped production artwork
ambiguous action
broken workflow
```

**PHASE 5 = FINAL LOCKED**
