# JAZMINE — PHASE 5 LOCKED SPECIFICATION ONLY

**Document Type:** UX / UI / Interaction / Responsive / Document Behavior — Locked Decisions Only  
**System:** JAZMINE Sportswear / Jersey Organization Management System  
**Phase:** PHASE 5  
**Status:** PHASE 5A LOCKED / PHASE 5B PARTIALLY DEFERRED  
**Scope of this file:** ສະເພາະຂໍ້ມູນທີ່ **LOCKED** ແລ້ວເທົ່ານັ້ນ.  
**Language:** Lao + English Technical Terms  

> ເອກະສານນີ້ຈົ່ງໃຈ **ບໍ່ຮວມ Final Visual/Layout ທີ່ຍັງ Deferred ຫຼືຍັງບໍ່ Final**.  
> ຖ້າ Rule ເກົ່າໃດຖືກປ່ຽນໂດຍ Decision ພາຍຫຼັງ, ໃຫ້ໃຊ້ Final Locked Rule ໃນໄຟລ໌ນີ້.

---

# 5.0 PHASE 5 STATUS

Final status:

```text
PHASE 5A — Business UX / Rules / Flow
= FINAL LOCK

PHASE 5B — Final Visual / Layout Design
= NOT 100% COMPLETE
```

Phase 5A ກຳນົດ:

```text
Information Architecture
App Shell
Visual System Rules
Dashboard behavior
Customer flow
POS / Order UX
Payment UX
Production UX behavior
Shipment UX behavior
Tracking UX behavior
Analytics behavior
Admin/configuration behavior
Search / Filter / QR behavior
Document behavior
Responsive / Error behavior
Security-facing UX rules
```

Phase 5B ບາງສ່ວນຍັງ Deferred.

---

# 5.1 INFORMATION ARCHITECTURE — LOCKED

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

Shared application utilities:

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
```

Do not create separate duplicated business applications for the same workflow.

---

# 5.2 APP SHELL — LOCKED

Desktop shell:

```text
Sidebar
Topbar
Page Header
Main Content
```

Mobile shell:

```text
Drawer
Compact Top Bar
Mobile-appropriate Cards / Content
```

Shared top utilities:

```text
Search
QR
Notifications
Profile
```

Detail pages may use tabs.

List pages use common patterns:

```text
Search
Filter
Table / Card list
Pagination
```

Navigation/back behavior should preserve useful context where practical.

Production mobile presentation should favor cards instead of compressed wide tables.

Complex Admin screens are desktop-first.

---

# 5.3 VISUAL SYSTEM — LOCKED

Brand/System:

```text
JAZMINE
```

Primary UI font:

```text
Noto Sans Lao
```

Absolute minimum readable text:

```text
10pt
≈ 13.33px
```

Practical UI minimum:

```text
~14px
```

System MUST NOT shrink important printed/UI text below 10pt just to make content fit.

---

# 5.4 ICONOGRAPHY — LOCKED

Production UI MUST NOT use emoji.

Final rule:

```text
Emoji = STRICTLY PROHIBITED in production UI
```

Use:

```text
one consistent minimal outline icon family
```

Icons should be functional, not decorative.

---

# 5.5 THEME — LOCKED

Supported themes:

```text
Light
Dark
System
```

Dark mode uses semantic theme tokens.

Forbidden:

```text
CSS invert tricks
image/color inversion hacks
```

---

# 5.6 VISUAL DIRECTION — LOCKED

Design direction:

```text
minimal
premium
modern
clean
restrained
Apple-like material discipline
adapted for enterprise/data-heavy workflows
```

Visual characteristics:

```text
near-white surfaces
near-black text
blue accent
thin dividers
generous whitespace
very limited shadow
no decorative gradients
```

Reference light tokens:

```text
Background near #F5F5F7
Text near #1D1D1F
Accent near #0066CC
Divider near #D2D2D7
```

Dark accent may use a brighter semantic blue such as:

```text
#2997FF
```

Exact token implementation belongs to frontend system implementation, but the visual direction is locked.

---

# 5.7 SHARED UI PRIMITIVES — LOCKED

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
Empty states
Loading states
Error states
```

Do not create unrelated versions per module.

Primary button hierarchy:

```text
Primary
Secondary
Ghost
Danger
```

Normally one primary action should dominate a screen/dialog.

---

# 5.8 SURFACE / RADIUS / SPACING RULES — LOCKED

Cards should be relatively flat.

Tables should rely on clear dividers rather than heavy box styling.

Locked radius scale concept:

```text
6
10
14
16
pill where semantically appropriate
```

Locked spacing scale concept:

```text
4
8
12
16
24
32
48
```

Large decorative stadium-radius styling should not dominate dense business tables/cards.

Shadows should be minimal.

---

# 5.9 PRINT THEME — LOCKED

Printed documents use a light print-friendly theme.

Do not print dark-mode backgrounds.

Noto Sans Lao remains the primary Lao-capable typography direction.

---

# 5.10 DASHBOARD — LOCKED

Dashboard uses one permission-aware framework.

Views may include:

```text
Admin organization overview
Staff operational view
Production department view
```

Functional categories:

```text
KPI
Attention
Production workload
```

Dashboard widgets must use authoritative backend metrics.

Widgets should link to the relevant filtered module.

Example:

```text
Late Orders
→ Orders filtered to Late
```

Period-based metrics and current-state metrics must be labeled clearly.

Charts should be used only when they add meaning.

Mobile Dashboard should simplify presentation instead of squeezing desktop layouts.

---

# 5.11 CUSTOMER MODULE — LOCKED

Main flow:

```text
Customers
→ Customer List
→ Add Customer
→ Customer Profile
```

Customer Profile tabs:

```text
Overview
Orders
Financial
Analytics
```

Customer Profile core fields:

```text
Name
Phone
Default Group
Customer Since
Status
Notes
```

---

# 5.12 CUSTOMER PROFILE DATA OWNERSHIP — LOCKED

Customer Profile may compose:

```text
Order history
Financial summary
Analytics
Trends
Top components
```

But it MUST NOT become owner of those data.

Customer totals remain derived.

---

# 5.13 CUSTOMER DUPLICATE PHONE — LOCKED

Phone is not globally unique.

Normalized phone may trigger:

```text
duplicate warning
```

but Customer ID remains the stable identity.

---

# 5.14 CUSTOMER GROUP — LOCKED UX

Persistent customer group and per-order group override are separate concepts.

Customer Profile may show default group.

Per-order override occurs only in the controlled Order flow.

Analytics MUST NOT auto-change Customer Group.

---

# 5.15 CUSTOMER → NEW ORDER — LOCKED

Customer Profile may have:

```text
New Order
```

This MUST enter the same shared Order creation flow used elsewhere.

Only initial customer context/customerId is preselected.

Do NOT create a separate Customer-specific order engine.

---

# 5.16 POS / ORDER MAIN FLOW — LOCKED

Final Order creation flow:

```text
Customer
↓
Jersey Configuration
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

Required selections:

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

---

# 5.17 POS PRICING — LOCKED

Server-side PRICING is authoritative.

POS MUST NOT become a duplicate pricing engine.

Draft may display calculation.

Review before Confirm is required.

Permanent Order Number is generated only at Confirm.

---

# 5.18 POS COMPONENT SELECTION — LOCKED

Component selection uses reusable image-card/grid behavior.

Desktop concept:

```text
Main configuration area
+
Sticky summary
```

Shared components conceptually include:

```text
ProductOptionGrid
ProductOptionCard
```

Component imagery direction:

```text
1:1
```

Selected state should be clearly visible via accent/check icon.

No emoji.

---

# 5.19 SIZE / QUANTITY SUMMARY — LOCKED

Size/Qty selection should clearly distinguish:

```text
purchasedQty
promotionalFreeQty
fulfillmentQty
```

Sticky/visible summary should help the user understand totals before Confirm.

---

# 5.20 PRICE-AFFECTING PART FABRIC — FINAL LOCKED

Any Fabric selection that can affect customer price MUST be selected in Order/POS before Confirm.

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
↓
Select Part Fabrics
↓
PRICING calculates enabled surcharges
↓
Review
↓
Confirm
↓
Snapshot
```

Production Sheet inherits these choices.

---

# 5.21 PART FABRIC SURCHARGE — LOCKED

Pricing Version may control surcharge applicability per Part.

Concept:

```text
Body        ON/OFF
Sleeve      ON/OFF
Cuff        ON/OFF
Collar      ON/OFF
Other Part  ON/OFF
```

Owner:

```text
PRICING
```

not Production.

If multiple enabled Parts have surcharge:

```text
calculate separately
then sum
```

Example:

```text
Cuff     +15,000
Collar    +5,000
----------------
Total    +20,000
```

---

# 5.22 OUT_OF_STOCK BEFORE CONFIRM — LOCKED

If selected Fabric becomes:

```text
OUT_OF_STOCK
```

before Order Confirm:

```text
BLOCK CONFIRM
```

User must:

```text
select another Fabric
or
authorized Admin correct Inventory status if the status is wrong
```

---

# 5.23 PART FABRIC CHANGE AFTER CONFIRM — LOCKED

Price-affecting Fabric change after Confirm:

```text
Controlled Order Edit
↓
Reprice using valid pricing context
↓
Order revision
↓
Invoice/Bill revision
↓
PS version when applicable
```

Production MUST NOT silently change selling price.

---

# 5.24 APPROVED MOCKUP — LOCKED

Approved Mockup:

```text
1–2 images
```

May be:

```text
combined front/back
or
separate front + back
```

It is prepared/confirmed before or at Order Confirm.

Production reuses the Approved Mockup from the confirmed Order.

Production MUST NOT require re-uploading the same Approved Mockup into every PS.

---

# 5.25 PAYMENT MODULE — LOCKED

Payment remains a separate Domain/module.

All entry points use one:

```text
Record Payment
```

flow.

Payment Summary shows:

```text
Order Total
Net Paid
Remaining
Payment Status
Financial Resolution
```

---

# 5.26 PAYMENT RULES — LOCKED UX

Rules:

```text
No minimum deposit
Normal Payment <= Remaining
Payment history immutable/auditable
Void != Refund
Overpaid requires resolution
Payment does not gate Production
Shipment payment issue is warning-only
```

Use one shared Payment Summary implementation.

---

# 5.27 OVERPAID — LOCKED

Internal:

```text
PaymentStatus = OVERPAID
FinancialResolution = RESOLUTION_REQUIRED
```

Do not auto-refund.

Do not rewrite payment history.

---

# 5.28 CANCELLATION FINANCIAL RESOLUTION — FINAL LOCKED

When Order is cancelled:

```text
FINANCIAL RESOLUTION REQUIRED
```

Authorized resolver decides per case:

```text
Amount Shop Keeps
Refund Due
Additional Amount Due
Reason
```

Original Order total remains for audit.

The system MUST NOT guess a settlement automatically.

---

# 5.29 CANCELLED ORDER OUTSTANDING — LOCKED CORRECTION

After cancellation, the system MUST NOT blindly calculate customer debt as:

```text
Original Order Total - Paid
```

Cancellation financial truth uses:

```text
Cancellation Settlement
```

Example:

```text
Original Order Total  10,000,000
Paid                   3,000,000
Shop Keeps             3,000,000
Refund Due                     0
Additional Due                 0
```

Customer owes:

```text
0
```

not 7,000,000.

---

# 5.30 PRODUCTION MODULE — LOCKED ARCHITECTURE

Production architecture:

```text
1 Order
→ 1..N Production Sheets
```

Preparation flow:

```text
Confirmed Order
↓
WAITING_FOR_PRODUCTION_SHEET
↓
Production Sheet Preparation
↓
PS READY
↓
PRINTING
↓
HEAT_TRANSFER
↓
LASER
↓
SIZE_SORTING
↓
SEWING
↓
QC
↓
READY
```

---

# 5.31 PRODUCTION STAGE STATES — LOCKED

Each physical stage:

```text
NOT_STARTED
IN_PROGRESS
COMPLETED
```

Next stage may START when previous is:

```text
IN_PROGRESS
or
COMPLETED
```

Next stage may COMPLETE only when immediate previous is:

```text
COMPLETED
```

No stage skipping.

Multiple stages may be IN_PROGRESS.

---

# 5.32 latestReachedStage — LOCKED

```text
latestReachedStage
=
furthest stage started
```

It does NOT prove every piece is physically at that stage.

---

# 5.33 NORMAL PRODUCTION QUANTITY TRACKING — LOCKED

Normal operation does NOT track per-stage:

```text
receivedQty
completedQty
remainingQty
```

Use:

```text
Production Sheet allocation
+
Stage states
```

For independent batches/readiness:

```text
create multiple PS
```

---

# 5.34 PRODUCTION EXCEPTION — LOCKED

Exception mode:

```text
STOP & RESOLVE
```

Can track:

```text
Allocated
Usable
Scrap / Unusable
Unstarted
Release
Replacement
```

Worker:

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

Usable does NOT automatically mean Ready.

---

# 5.35 PRODUCTION READINESS — LOCKED

Normal:

```text
QC IN_PROGRESS
→ Ready contribution = 0
```

When:

```text
QC COMPLETED
```

eligible usable allocation contributes to Ready.

Partial readiness is achieved via multiple Production Sheets.

---

# 5.36 PRODUCTION IMAGES — LOCKED

Production image rules:

```text
Main Body production images
= 1–2 front/back

Sleeves
= exactly 2
Left / Right

Cuffs
= exactly 2
Left / Right

Collar
= 1–3 depending on collar type

Other Parts
= dynamic when needed
```

Production images show manufacturing reference/artwork/shape required for production.

---

# 5.37 PRODUCTION IMAGE COMPONENT MODEL — LOCKED

Use shared dynamic concepts:

```text
ProductionPartEditor
ProductionImageUpload
```

Do NOT hardcode a separate implementation for every component type.

---

# 5.38 PRODUCTION IMAGE VERSIONING — LOCKED

Production images/assets follow Production Sheet versioning.

Old version assets remain tied to old PS version.

Do not silently overwrite historical production files.

---

# 5.39 FABRIC PER PRODUCTION PART — LOCKED

Main Body Fabric:

```text
comes from Confirmed Order/POS snapshot
```

Production cannot silently change it.

Other Parts may use:

```text
Same as Body
or
Custom Fabric
```

But if the Fabric is price-affecting, the commercial selection must already have been handled before Confirm or via controlled Order edit.

---

# 5.40 FABRIC MASTER / INVENTORY / PRICING OWNERSHIP — LOCKED

```text
PRODUCT / FABRIC MASTER
→ Fabric identity

INVENTORY
→ availability

PRICING
→ price adjustment

ORDER SNAPSHOT
→ confirmed historical choice

PRODUCTION
→ manufacturing usage/reference
```

Admin UI may show these together.

Backend ownership remains separate.

---

# 5.41 INVENTORY V1 — LOCKED

Fabric availability statuses:

```text
IN_STOCK
LOW_STOCK
OUT_OF_STOCK
```

New selection:

```text
OUT_OF_STOCK
→ visible but disabled / not confirmable
```

Already-confirmed Fabric later becomes OUT_OF_STOCK:

```text
warning
no automatic substitution
no rewrite of Order snapshot
```

---

# 5.42 PRODUCTION SHEET CONTENT — LOCKED

Production Sheet content concept includes:

```text
Confirmed Order information
Approved Mockup
Production images
Fabric / Part information
Size / Qty
Production Notes
PS Version
```

---

# 5.43 PRODUCTION SHEET PRINT CONSTRAINTS — LOCKED

Even though final A4 layout is not yet locked, these constraints ARE locked:

```text
1 page preferred
2 pages normal maximum
3 pages exceptional
```

And:

```text
Never shrink text below 10pt just to fit
```

PDF may consolidate Fabric information as:

```text
Main Fabric
+
Fabric Exceptions
```

when appropriate.

Production Sheet Builder can be detailed.

Printed PDF can be compressed/organized for readability.

---

# 5.44 PRODUCTION QR — FINAL LOCKED

Production QR flow:

```text
Scan
↓
Validate QR
↓
Validate User
↓
Validate Permission
↓
Validate State
↓
Quick Confirmation
```

Quick confirmation displays context such as:

```text
PS Number
Order Number
Stage
Action
```

Then explicit:

```text
Start
or
Complete
```

Scan alone NEVER mutates production state.

---

# 5.45 SHIPMENT MODULE — LOCKED

Flow:

```text
Production ReadyQty
↓
Create Shipment
↓
Select Method
↓
Select item/size quantities
↓
Recipient
↓
Payment Warning
↓
Review
↓
Save Draft / Confirm
```

---

# 5.46 AVAILABLE TO SHIP — LOCKED

```text
AvailableToShip
=
ReadyQty
-
AlreadyConfirmedShippedQty
```

per item+size.

---

# 5.47 SHIPMENT STATE — LOCKED

```text
DRAFT
CONFIRMED
VOID
```

Only CONFIRMED counts as physically shipped.

Draft does not reserve quantity by default.

Draft must revalidate availability before Confirm.

---

# 5.48 ACTUAL SHIPMENT — LOCKED

Confirmed Shipment means:

```text
goods physically left the shop
```

Real dispatched goods MUST NOT be voided away.

Cancelled/Voided Order cannot create normal new Shipment.

---

# 5.49 SHIPMENT PAYMENT WARNING — LOCKED

Outstanding payment:

```text
warning only
```

Authorized user may proceed.

System records:

```text
outstandingBalanceAtShipment
```

---

# 5.50 SHIPMENT RECIPIENT SNAPSHOT — LOCKED

Shipment retains historical recipient/contact/address context.

Later Customer profile edits must not silently rewrite the old Shipment record.

---

# 5.51 CUSTOMER TRACKING ACCESS — LOCKED

Public Tracking is mobile-first.

V1 does not require customer account login.

Access uses:

```text
Random Token / QR
+
Phone Verification
```

Verification phone comes from:

```text
Order phone snapshot
```

---

# 5.52 CUSTOMER TRACKING PRODUCTION VIEW — LOCKED

Customer can see detailed public production progress including:

```text
Production Sheet Preparation
Printing
Heat Transfer
Laser
Size Sorting
Sewing
QC
Ready / Shipped context
```

Because internal stages can overlap, public projection must remain truthful about partial/in-progress conditions.

---

# 5.53 MULTI-PS PUBLIC TRACKING — FINAL LOCKED

If Order has multiple Production Sheets:

```text
Public Tracking
→ aggregate to Order level
```

Example:

```text
Order = 100

PS1 = 40
QC Complete

PS2 = 60
Printing
```

Public may show:

```text
Printing       IN PROGRESS
QC             PARTIAL
Ready          40 / 100
```

Internal PS numbers/batches do not need to be exposed publicly.

---

# 5.54 APPROVED MOCKUP IN TRACKING — LOCKED

Customer may see:

```text
Approved Mockup
```

Customer MUST NOT see internal manufacturing artwork/files.

---

# 5.55 CUSTOMER TRACKING PAYMENT — LOCKED

Tracking shows simplified Payment status only.

It does NOT expose full internal Payment history.

Internal:

```text
OVERPAID
+
RESOLUTION_REQUIRED
```

may be projected publicly as:

```text
PAID
```

The internal finance issue remains private.

---

# 5.56 CUSTOMER TRACKING DOCUMENT VISIBILITY — LOCKED

Customer Tracking MUST NOT expose:

```text
Bill
Invoice
Quotation PDF
Receipt PDF
internal document history
```

unless a future explicit decision changes this.

---

# 5.57 CUSTOMER TRACKING REQUESTS — FINAL LOCKED

Allowed V1 requests:

```text
GENERAL REQUEST
DELIVERY REQUEST
EXPEDITE REQUEST
```

Flow:

```text
Customer submits Request
↓
PENDING
↓
Admin Review
↓
RESOLVED
or
DECLINED
```

Request does NOT directly mutate:

```text
Order
Shipment
Priority
Production
```

---

# 5.58 DIRECT ORDER-CHANGE REQUESTS — LOCKED

Public Tracking V1 does NOT provide structured direct request actions for:

```text
Change Size
Change Qty
Change Fabric
Change Design
```

Business changes must go through staff-controlled workflow.

---

# 5.59 ANALYTICS — LOCKED

Analytics is:

```text
READ-ONLY
```

One metric has one shared definition across:

```text
Dashboard
Customer Profile
Analytics
Reports
```

---

# 5.60 SALES METRIC — LOCKED

```text
Sales / Order Value
=
Confirmed Order Value
```

Period:

```text
confirmedAt
```

Confirmed Order edit may update metric value but stays in the original confirmation period.

---

# 5.61 CASH / REFUND PERIOD — LOCKED

Cash received:

```text
paidAt
```

Refund:

```text
refundedAt
```

Sales and Cash are separate concepts.

---

# 5.62 BEST SELLING — LOCKED

```text
Best Selling
=
purchasedQty
```

The old phrase:

```text
Paid Qty
```

is superseded.

---

# 5.63 MOST PRODUCED — LOCKED

```text
Most Produced
=
fulfillmentQty
```

where:

```text
fulfillmentQty
=
purchasedQty
+
promotionalFreeQty
```

---

# 5.64 CANCELLED / VOIDED / ARCHIVED ANALYTICS — LOCKED

Cancelled:

```text
excluded from Sales
excluded from current demand
actual production/payment/refund activity retained
```

Voided:

```text
excluded from normal KPI
```

Archived valid Orders:

```text
included in historical Analytics
```

---

# 5.65 DEPARTMENT WORKLOAD — LOCKED

A PS may count in multiple departments if stages overlap.

Department metric:

```text
Active Jobs
```

and:

```text
Units in Active Jobs
=
sum full PS quantity for relevant IN_PROGRESS stages
```

This is not exact piece location.

Do NOT globally sum department unit totals.

Overall unique workload deduplicates PS.

---

# 5.66 HISTORICAL OUTSTANDING — LOCKED REQUIREMENT

System must support:

```text
Current Outstanding
```

and:

```text
Outstanding as-of historical date
```

Technical implementation is Phase 6.

---

# 5.67 ADMIN / CONFIGURATION — LOCKED

Admin areas include:

```text
Products / Components
Fabrics / Inventory
Pricing
Promotions
Sizes
Users
Roles / Permissions
Departments
Order Settings
Production Settings
Payment Methods
Shipment Methods
Tracking Settings
System
```

Admin UI is not business data owner.

---

# 5.68 PRICING ACTIVATION — LOCKED

Pricing lifecycle:

```text
Draft
↓
Review
↓
Activate
```

Current active Pricing Version stays active until next version is activated.

Confirmed historical Orders keep their pricing snapshot.

Pricing version audit context includes:

```text
Created
Reviewed
Activated
Reason
```

---

# 5.69 FABRIC ADMIN OWNERSHIP — LOCKED

One Admin screen may visually show:

```text
Name
Image
Pricing Adjustment
Inventory Status
```

But backend ownership remains:

```text
PRODUCT
→ Name / Image / Active / Sort

PRICING
→ Fabric adjustment / version

INVENTORY
→ Stock status
```

---

# 5.70 EXCHANGE RATE OWNERSHIP — LOCKED

```text
PRICING
→ Exchange Rate
```

System Settings only owns:

```text
currency preference
locale
defaults
```

No duplicate exchange-rate source.

---

# 5.71 CENTRAL PERMISSION MATRIX — LOCKED

Role:

```text
≠ Department
```

Permission enforcement:

```text
Backend required
```

At least one:

```text
ACTIVE ADMIN_PROMAX
```

must remain.

---

# 5.72 SEARCH — LOCKED

Global search supports authorized search across key references such as:

```text
Order Number
Customer Name
Normalized Phone
Shipment Number
Production Sheet Number
Tracking Reference
```

With Commercial Document update, authorized search architecture must also support document references when implemented:

```text
Quotation reference
Invoice reference
Receipt reference
```

Search remains permission-aware.

---

# 5.73 SEARCH INCLUDES ARCHIVED VALID ORDERS — LOCKED

Global Search includes valid Archived Orders.

Archived results must be visibly labeled:

```text
ARCHIVED
```

Archive is not deletion.

---

# 5.74 FILTER PATTERN — LOCKED

Shared filter UX:

```text
primary filters
More Filters
server-side query
pagination
sorting
```

Preserve filters/page/context where practical.

Do NOT load all records and filter in frontend.

---

# 5.75 COMMERCIAL STAGE FILTER — FINAL LOCKED

Order-level Commercial Stage:

```text
NONE
QUOTATION
INVOICE
```

Tracked per Order.

NOT per Customer.

Order list can filter:

```text
Commercial Stage
Payment Status
Order Status
Customer
Date
```

Filters may be combined.

Example:

```text
CommercialStage = INVOICE
PaymentStatus = UNPAID
```

or:

```text
CommercialStage = INVOICE
PaymentStatus = PARTIALLY_PAID
```

---

# 5.76 CUSTOMER COMMERCIAL SUMMARY — LOCKED

Customer Profile may display derived:

```text
Active Quotations
Active Invoices
Outstanding
```

These are derived from Order/Payment data.

Customer domain does NOT own one global Commercial Stage.

---

# 5.77 QR — LOCKED

Internal and Public QR contexts are separate.

Concept:

```text
One QR Resolver
+
context-specific validation
```

QR possession does NOT equal authorization.

Manual search fallback should exist.

---

# 5.78 DOCUMENT TYPES — FINAL LOCKED

Controlled Document Types:

```text
QUOTATION
INVOICE
RECEIPT
```

Document Type is NOT arbitrary free-text.

The type determines:

```text
business meaning
allowed source data
header
history semantics
```

---

# 5.79 QUOTATION — LOCKED

Quotation:

```text
comes from Order Draft + authoritative Pricing
```

It can be generated before Confirm.

It does NOT:

```text
Confirm Order
generate permanent Order Number
count as Sales
authorize Production
prove Payment
```

Quotation is optional.

Valid flows:

```text
Draft
→ Quotation
→ Confirm
→ Invoice
```

and:

```text
Draft
→ Confirm
→ Invoice
```

---

# 5.80 QUOTATION REVISION — LOCKED

Issued Quotation is historical.

Later Draft edit MUST NOT silently rewrite it.

Updated proposal:

```text
Quotation v1 = SUPERSEDED
Quotation v2 = CURRENT
```

One current Quotation revision should represent the active proposal.

Old revisions remain accessible according to permission.

---

# 5.81 INVOICE — LOCKED

Confirm Order:

```text
OrderStatus = CONFIRMED
CommercialStage = INVOICE
```

Invoice uses Confirmed Order snapshots.

Invoice is not proof of Payment.

---

# 5.82 INVOICE REVISION — LOCKED

Confirmed commercial Order edit:

```text
Controlled Order Edit
↓
Reprice
↓
Order revision
↓
Invoice revision
```

Example:

```text
Invoice v1 = SUPERSEDED
Invoice v2 = CURRENT
```

Old revision is retained.

---

# 5.83 RECEIPT — LOCKED

Receipt comes from:

```text
Confirmed Payment
```

Normal relationship:

```text
1 Payment
→ 1 Payment Receipt context
```

One Order may have multiple Receipts.

Receipt is:

```text
Payment Document
```

not Commercial Stage.

---

# 5.84 PAYMENT DOES NOT REWRITE INVOICE — LOCKED

Normal Payment:

```text
does NOT create Invoice revision
```

It updates:

```text
Payment Summary
Receipt
```

Invoice remains the confirmed commercial Order document.

---

# 5.85 PAYMENT VOID / RECEIPT HISTORY — LOCKED

If Payment is voided/cancelled:

```text
Payment history remains
Receipt history remains traceable
```

Do not erase historical evidence.

---

# 5.86 REFUND / RECEIPT — LOCKED

Refund does NOT rewrite original Receipt.

Refund is a separate financial event.

A dedicated Refund document type has NOT been locked.

---

# 5.87 DOCUMENT SOURCE MATRIX — LOCKED

| Document | Source | Meaning |
|---|---|---|
| QUOTATION | Order Draft + PRICING | Commercial offer |
| INVOICE | Confirmed Order Snapshot | Confirmed commercial charge |
| RECEIPT | Confirmed PAYMENT | Payment evidence |

---

# 5.88 DOCUMENT DESIGN SYSTEM — LOCKED

Quotation, Invoice and Receipt should use one JAZMINE document visual family for:

```text
Logo
Company information
Typography
Spacing
Margins
Footer style
Metadata style
Print theme
```

But their business sections/data remain different.

---

# 5.89 DOCUMENT GENERATOR — LOCKED

Use one shared:

```text
Document Generator
```

It is NOT business data owner.

It renders authoritative source data.

---

# 5.90 DOCUMENT HISTORY — LOCKED

Historical documents MUST NOT silently follow current changes to:

```text
Customer master
Product master
Pricing
Exchange Rate
Payment
```

Use the appropriate historical/source data.

---

# 5.91 DOCUMENT TITLE — LOCKED

Rendered title follows controlled Document Type.

Examples:

```text
QUOTATION
→ Quotation

INVOICE
→ Invoice

RECEIPT
→ Receipt
```

Do not allow title/data contradiction.

---

# 5.92 DOCUMENT PUBLIC VISIBILITY — LOCKED

Customer Tracking does NOT expose:

```text
Quotation
Invoice
Receipt
Bill PDFs
document revision history
```

Current feature is internal/authorized staff document workflow.

---

# 5.93 RESPONSIVE — LOCKED

Business flow stays the same across:

```text
Desktop
Tablet
Mobile
```

Presentation adapts.

Wide tables should become mobile cards when appropriate.

Do not squeeze desktop tables into unreadable mobile layouts.

Mobile should normally expose one clear primary action.

Sticky actions are allowed where useful.

---

# 5.94 SHARED UX STATES — LOCKED

Shared system patterns include:

```text
Skeleton / Loading
Empty
Error
Permission Denied
Conflict / Stale Data
Confirm
Success
```

Do not fake success before authoritative server response.

---

# 5.95 BUSINESS RULE ERROR — LOCKED

Validation errors should be specific and understandable.

Examples:

```text
Missing required Fabric
Fabric OUT_OF_STOCK
Payment exceeds Remaining
Production transition not allowed
Shipment quantity exceeds AvailableToShip
```

Avoid generic “Something went wrong” for known business-rule failures.

---

# 5.96 CONFLICT / STALE DATA — LOCKED

If server detects stale/conflicting state:

```text
do not silently overwrite
```

User must receive a conflict/reload/review path.

Exact optimistic-locking implementation belongs to Phase 6.

---

# 5.97 OFFLINE / CRITICAL MUTATION — LOCKED

V1:

```text
Critical state changes require Online
```

No offline mutation queue for:

```text
Confirm Order
Payment
Production Stage change
Shipment Confirm
Pricing Activate
```

---

# 5.98 AUTOSAVE — LOCKED

Autosave is limited to editable Drafts such as:

```text
Order Draft
PS Draft
Pricing Draft
```

Autosave MUST NOT auto-perform high-impact actions such as:

```text
Confirm Order
Record Payment
Confirm Shipment
Complete Production Stage
Activate Pricing
```

---

# 5.99 DRAFT CLEANUP + AUTOSAVE — LOCKED

Draft cleanup uses:

```text
lastMeaningfulUserEditAt
```

not background autosave timestamp.

Background autosave must not keep abandoned drafts alive forever.

---

# 5.100 PS AUTOSAVE / VERSION — LOCKED

PS Draft autosave:

```text
does NOT create new version
```

Example:

```text
Draft
→ autosave
→ autosave
→ finalize
→ v1
```

Meaningful finalized change later:

```text
→ v2
```

---

# 5.101 SECURITY — LOCKED BASELINE

Public/internal architecture must preserve:

```text
NEVER trust frontend validation alone
NEVER expose raw internal Order publicly
NEVER build SQL directly from user input
NEVER use predictable tracking IDs as sole access
NEVER execute uploaded files
NEVER let public QR scan mutate core business data
MUST validate on server
MUST rate limit public access
MUST use least privilege
MUST audit security-sensitive actions
MUST support backup/restore strategy
```

---

# 5.102 PUBLIC TRACKING SECURITY FLOW — LOCKED

Concept:

```text
Internet
↓
CDN / DDoS / WAF layer
↓
Rate / Bot Protection
↓
Public Tracking API
↓
Validation
↓
Token / Phone Verification
↓
Limited Public Contract
↓
Database
```

Exact providers/implementation are Phase 6.

---

# 5.103 UPLOAD SECURITY — LOCKED DIRECTION

Uploaded files/images must follow:

```text
allowlist
size limit
randomized storage name
no execute
object storage
malware/security scanning where appropriate
```

Exact implementation belongs to Phase 6.

---

# 5.104 PHASE 5 FINAL BUSINESS AUDIT — LOCKED RESULT

Final audit resolved all known business/flow conflicts.

The last locked decisions included:

```text
Part Fabric surcharge
→ calculated separately per applicable Part and summed

Cancellation settlement
→ per-case authorized financial resolution

Archived Order with new financial issue
→ auto-reactivate

Multi-PS public Tracking
→ aggregate Order-level view

Invoice and Payment Receipt
→ separate document meanings

Draft Fabric OUT_OF_STOCK
→ block Confirm

Best Selling metric
→ purchasedQty

Price-affecting Part Fabric
→ select before Confirm
```

Final Phase 5A result:

```text
Known Business / Flow Conflicts
= NONE REMAINING
```

---

# 5.105 PHASE 5 LOCKED COMMERCIAL DOCUMENT UPDATE

Final locked commercial document flow:

```text
Order Draft
↓
CommercialStage = NONE
↓
optional QUOTATION
↓
CommercialStage = QUOTATION
↓
Customer agrees
↓
Explicit Confirm
↓
OrderStatus = CONFIRMED
CommercialStage = INVOICE
↓
Payment 1
→ Receipt 1
↓
Payment 2
→ Receipt 2
```

Direct flow is also valid:

```text
Draft
→ Confirm
→ INVOICE
```

Quotation is optional.

Receipt never replaces INVOICE as Commercial Stage.

---

# 5.106 PHASE 5 LOCKED STATUS SUMMARY

```text
5.1  Information Architecture              LOCKED
5.2  App Shell                             LOCKED
5.3  Visual System Rules                   LOCKED
5.4  Dashboard Behavior                    LOCKED
5.5  Customer UX                           LOCKED
5.6  POS / Order UX                        LOCKED
5.7  Payment UX                            LOCKED
5.8  Production UX Rules                   LOCKED
5.9  Shipment UX Rules                     LOCKED
5.10 Customer Tracking UX Rules            LOCKED
5.11 Analytics Behavior                    LOCKED
5.12 Admin / Configuration Behavior        LOCKED
5.13 Search / Filter / QR Behavior         LOCKED
5.14 Document Business Behavior            LOCKED
5.15 Responsive / Error Behavior           LOCKED
Commercial Document Architecture           LOCKED
Phase 5A Business UX / Rules / Flow         FINAL LOCK
```

---

# 5.107 ITEMS INTENTIONALLY NOT INCLUDED AS LOCKED FINAL LAYOUT

The following remain outside the “locked-only” specification in this file because their final visual/layout is still deferred or not fully finalized:

```text
Production Main Queue final visual layout
Production Job Detail final visual layout
Production Sheet Builder final visual layout
Production Sheet final A4 layout
Quotation final print layout
Invoice final print layout
Receipt final print layout
Shipment final visual layout
Customer Tracking final visual polish
Analytics final chart/report arrangement
Admin final visual arrangement
Search / Filter / QR final visual polish
Loading / Empty / Error final visual polish
```

Important:

Some rules/constraints for these screens/documents ARE locked and appear earlier in this document.

Only the final visual composition is deferred.

---

# 5.108 PHASE 5 STATUS

```text
PHASE 5A
Business UX / Rules / Flow
= FINAL LOCK

PHASE 5B
Final Visual / Layout Design
= PARTIALLY DEFERRED
```

Therefore this file should be treated as:

```text
Authoritative Locked Phase 5 Baseline
for all completed decisions
```

but NOT as the final pixel-perfect layout specification.

---

# END OF PHASE 5 LOCKED SPECIFICATION
