# JAZMINE — PHASE 4 FULL SPECIFICATION

**Document Type:** Functional Feature Specification / Module Behavior / Cross-Module Integration  
**System:** JAZMINE Sportswear / Jersey Organization Management System  
**Phase:** PHASE 4  
**Revision:** Updated after QUOTATION / INVOICE / RECEIPT / COMMERCIAL STAGE decision  
**Status:** UPDATED + LOCKED FUNCTIONAL BASELINE  
**Language:** Lao + English Technical Terms  

> ໝາຍເຫດ: ເອກະສານນີ້ຮວບຮວມຈາກ Decision / Module / Rule ຂອງ PHASE 4 ທີ່ລັອກໄວ້. ຖ້າຂໍ້ໃດຖືກ supersede ໂດຍ Decision ພາຍຫຼັງ ຈະລະບຸໄວ້ໃນ “Later Locked Correction” ເພື່ອບໍ່ໃຫ້ສັບສົນ.

---

# 4.0 PURPOSE

PHASE 4 ແມ່ນຂັ້ນທີ່ປ່ຽນ Business Architecture / Ownership / Contracts / Rules ຈາກ PHASE 0–3 ໃຫ້ກາຍເປັນ **Functional Modules** ທີ່ລະບົບ JAZMINE ຕ້ອງມີ.

PHASE 4 ບໍ່ແມ່ນ Final Visual UI Design.

PHASE 4 ຕອບຄຳຖາມ:

```text
Module ໃດຕ້ອງມີ?
ແຕ່ລະ Module ເຮັດຫຍັງ?
ແຕ່ລະ Flow ເຊື່ອມກັນແນວໃດ?
ໃຜມີສິດເຮັດຫຍັງ?
ຂໍ້ມູນໃດອ່ານຈາກ Domain ໃດ?
Module ໃດຫ້າມ duplicate business logic?
```

---

# 4.1 AUTH / USER MODULE

## 4.1.1 Objective

Auth/User Module ຮັບຜິດຊອບ:

```text
User onboarding
Authentication
Role
Department
Status
Permission enforcement context
Admin user management
Session control
```

USER ແລະ AUTH ຍັງແຍກ Ownership ຕາມ PHASE 1:

```text
USER
→ profile / role / department / status

AUTH
→ password hash / login / session / reset
```

---

## 4.1.2 User Roles

Core roles:

```text
ADMIN_PROMAX
STAFF
```

Rule:

```text
Role != Department
```

Role ຄວບຄຸມ authority.

Department ຄວບຄຸມ operational assignment.

---

## 4.1.3 Departments

Core departments:

```text
ADMIN
GRAPHIC
PRINTING
HEAT_TRANSFER
LASER
SIZE_SORTING
SEWING
QC_PACKING
```

Department assignment must not replace permissions.

---

## 4.1.4 User Status

```text
PENDING
ACTIVE
DISABLED
```

New user:

```text
PENDING
```

Admin action is required before normal operational use:

```text
activate
assign role
assign department
```

---

## 4.1.5 Disabled User

When:

```text
status = DISABLED
```

System must revoke active sessions.

Disabled users cannot keep working via an old authenticated session.

---

## 4.1.6 Password Rules

No UI may display:

```text
existing password
password hash
credential secret
```

V1 does not require self-service forgot-password.

Admin reset is allowed.

Admin reset creates/replaces credentials but does not reveal the old password.

---

## 4.1.7 Permission Matrix

Permission logic is centralized.

Examples:

```text
OVERRIDE_ORDER_CUSTOMER_GROUP
RESOLVE_PRODUCTION_EXCEPTION
REFUND_PAYMENT
ACTIVATE_PRICING
RESOLVE_CANCELLATION_FINANCE
```

Exact permission list may expand.

Important invariant:

```text
Backend must enforce permission
```

Hiding buttons alone is insufficient.

---

## 4.1.8 ADMIN_PROMAX Safety

The system must preserve:

```text
at least one ACTIVE ADMIN_PROMAX
```

Do not allow the organization to disable/remove every super-admin.

---

# 4.2 DASHBOARD MODULE

## 4.2.1 Objective

Dashboard is an organization overview and operational attention surface.

Dashboard does NOT own business truth.

It reads from:

```text
ORDER
PAYMENT
PRODUCTION
SHIPMENT
CUSTOMER
ANALYTICS
```

---

## 4.2.2 Dashboard Must Be Permission-Aware

Dashboard content can differ by:

```text
Role
Department
Permission
```

Example:

ADMIN may see organization-wide overview.

Production Staff may see operational workload relevant to their department.

---

## 4.2.3 Dashboard Must Not Recalculate Business Rules Independently

Examples:

```text
Sales
Outstanding
Ready Orders
Late Orders
Production Workload
```

must use central definitions.

Dashboard is not allowed to implement its own alternative formulas.

---

## 4.2.4 Core Dashboard Information Categories

Functional categories include:

```text
KPI / Summary
Attention / Alerts
Production workload
Order status overview
Financial overview
Shipment readiness
```

Exact visual layout is deferred to Phase 5.

---

## 4.2.5 Dashboard Drill-Down

Dashboard information should lead users to the relevant filtered module rather than becoming a second management system.

Example:

```text
Late Orders card
→ open Orders filtered to Late
```

or:

```text
QC Active Jobs
→ open Production filtered to QC
```

---

# 4.3 POS / ORDER MODULE

## 4.3.1 Objective

POS/Order Module supports:

```text
Create Draft
Select Customer
Configure Jersey
Calculate Price
Choose Size/Qty
Apply Promotion
Attach/associate approved Mockup
Review
Confirm
Manage authorized Order edits
```

POS is the workflow.

ORDER is the business owner.

PRICING owns pricing.

---

## 4.3.2 Customer Selection

Order creation can start from:

```text
POS / New Order
Customer Profile → New Order
```

All entry points must converge on the same Order creation flow.

No duplicate order-creation implementation.

---

## 4.3.3 Required Customer Data Before Confirm

```text
Name
Phone
Customer Group
```

Phone has normalized representation for search/comparison.

At Confirm, customer snapshot is stored.

---

## 4.3.4 Jersey Configuration

Core component types:

```text
COLLAR
FABRIC
SLEEVE
SHOULDER
CUFF
WAIST
SHIRT_BOTTOM
```

Required manual selections:

```text
COLLAR
FABRIC
SHOULDER
CUFF
```

Defaultable:

```text
SLEEVE
WAIST
SHIRT_BOTTOM
```

---

## 4.3.5 Size / Quantity

Order supports item+size quantity.

Operational quantity distinction:

```text
purchasedQty
promotionalFreeQty
fulfillmentQty
```

Formula:

```text
fulfillmentQty
=
purchasedQty
+
promotionalFreeQty
```

---

## 4.3.6 Pricing

POS sends configuration to PRICING.

PRICING returns authoritative result.

POS MUST NOT hardcode:

```text
collar prices
size add-ons
fabric surcharge
promotion formula
exchange rate
```

---

## 4.3.7 Customer Group

Customer has:

```text
defaultCustomerGroup
```

Authorized per-order override is supported.

Override requires:

```text
reason
user
timestamp
```

At Confirm:

```text
customerGroupAtConfirmation
```

is snapshotted.

---

## 4.3.8 Promotion

Supported:

```text
BUY_X_GET_Y
PERCENTAGE
FIXED_AMOUNT
```

Promotion configuration follows PHASE 3 rules.

Free units are real fulfillment units.

---

## 4.3.9 Draft

Draft:

```text
editable
no permanent Order Number
not a confirmed sale
eligible for cleanup if inactive
```

Draft cleanup default:

```text
15 inactive days
```

---

## 4.3.10 Review Before Confirm

Order must have a review step before final Confirm.

Review must use authoritative current server-side pricing/validation.

---

## 4.3.11 Confirm

At Confirm:

```text
Order Number generated
Snapshots created
Due date established
OrderStatus = CONFIRMED
Production preparation can begin
```

Operational production-preparation state:

```text
WAITING_FOR_PRODUCTION_SHEET
```

---

## 4.3.12 Order Number

Permanent Order Number:

```text
generated at Confirm
backend/database safe
unique
never reused
```

POS must not generate it.

---

## 4.3.13 Confirmed Order Edit

Confirmed Order edit requires:

```text
permission
audit
controlled workflow
pricing revalidation
historical revision semantics
```

It is not the same as editing Draft.

---

## 4.3.14 Production-Affecting Edit

If production has started and the Order edit affects production:

```text
PS version / production resolution
+
affected department notification
```

must be considered.

---

## 4.3.15 Later Locked Correction — Price-Affecting Part Fabric

If Part Fabric can affect price, it must be selected in Order/POS before Confirm.

Examples:

```text
Body Fabric
Sleeve Fabric
Cuff Fabric
Collar Fabric
Other Part Fabric
```

PRICING may apply surcharge by Part.

Production Sheet inherits the confirmed choices.

---

# 4.4 PAYMENT MODULE

## 4.4.1 Objective

Payment Module manages all money movement.

Payment does not own Order price.

---

## 4.4.2 Payment Types

```text
DEPOSIT
ADDITIONAL
FINAL
```

---

## 4.4.3 Payment Summary

Payment view must support a clear financial summary using authoritative Order + Payment truth:

```text
Order Total
Net Paid
Remaining / Outstanding
Payment Status
Financial Resolution
```

---

## 4.4.4 Payment Status

```text
UNPAID
PARTIALLY_PAID
PAID
OVERPAID
```

Financial resolution:

```text
CLEAR
RESOLUTION_REQUIRED
```

---

## 4.4.5 No Minimum Deposit

V1 does not enforce a hardcoded deposit percentage.

---

## 4.4.6 Record Payment

Normal rule:

```text
Payment Amount <= Remaining
```

Payment recording must be server-validated.

---

## 4.4.7 Wrong Payment

Wrong payment is not silently deleted.

Use controlled:

```text
Void / Cancel
```

with audit/history.

---

## 4.4.8 Refund

Refund is controlled.

```text
Refund <= eligible Net Paid
```

Refund history remains.

---

## 4.4.9 Overpaid

If Order value is reduced below money already paid:

```text
Payment history remains unchanged
Payment Status = OVERPAID
Financial Resolution = RESOLUTION_REQUIRED
```

No automatic refund.

---

## 4.4.10 Payment Does Not Gate Production

Payment status does not automatically block production.

---

## 4.4.11 Shipment Warning

If money is outstanding:

```text
show warning
```

but authorized shipment may continue.

At shipment confirmation:

```text
outstandingBalanceAtShipment
```

is preserved.

---

## 4.4.12 Cancellation Financial Resolution — Later Locked Correction

On Order cancellation:

```text
FINANCIAL RESOLUTION REQUIRED
```

Authorized resolver determines:

```text
Shop Keeps
Refund Due
Additional Amount Due
Reason
```

System must not guess automatically.

---

# 4.5 PRODUCTION MODULE

## 4.5.1 Objective

Production Module handles:

```text
Production Sheet
Allocation
Preparation
Versioning
Physical stages
History
Exceptions
Readiness
```

---

## 4.5.2 Core Relationship

```text
1 Order
→ 1..N Production Sheets
```

Multiple PS are used for independently progressing/ready batches.

---

## 4.5.3 Preparation Flow

```text
Confirmed Order
↓
WAITING_FOR_PRODUCTION_SHEET
↓
Production Sheet Preparation
↓
PS READY
↓
Physical Production
```

Production Sheet Preparation is a gate.

Printing must not start before PS is READY.

---

## 4.5.4 Physical Stages

```text
PRINTING
HEAT_TRANSFER
LASER
SIZE_SORTING
SEWING
QC
```

Each:

```text
NOT_STARTED
IN_PROGRESS
COMPLETED
```

---

## 4.5.5 Overlap / Handoff

Next stage may START when previous is:

```text
IN_PROGRESS
or
COMPLETED
```

Next stage may COMPLETE only when previous is:

```text
COMPLETED
```

No skipping.

---

## 4.5.6 Multiple Active Stages

Multiple stages may be:

```text
IN_PROGRESS
```

at once.

Production cannot be modeled only with one `currentStage`.

---

## 4.5.7 latestReachedStage

```text
latestReachedStage
=
furthest stage that has started
```

It does not mean all pieces are there.

---

## 4.5.8 Normal Quantity Tracking

No normal per-stage:

```text
receivedQty
completedQty
remainingQty
```

Use PS allocation + stage state.

---

## 4.5.9 Readiness

Normal rule:

```text
QC IN_PROGRESS
→ Ready contribution = 0

QC COMPLETED
→ usable eligible allocation contributes Ready
```

Multiple PS enable partial readiness.

---

## 4.5.10 Exception — STOP & RESOLVE

When real production exception occurs, exact quantities may be tracked:

```text
Allocated
Usable
Scrap / Unusable
Unstarted
Release
Replacement
```

Workers:

```text
REPORT
STOP
FLAG
```

Authorized resolver:

```text
ADMIN_PROMAX
or permission RESOLVE_PRODUCTION_EXCEPTION
```

---

## 4.5.11 Usable ≠ Ready

Exception resolution does not bypass QC/readiness.

---

## 4.5.12 PS Versioning

```text
v1
v2
v3
...
```

Old versions remain.

Current/superseded state is preserved.

Meaningful change after production started requires version/audit and department notification.

---

## 4.5.13 Production Does Not Calculate Price

If a production-related material change affects commercial price:

```text
Controlled Order Edit
→ PRICING
→ Order revision
```

Production itself must not change selling price.

---

# 4.6 SHIPMENT MODULE

## 4.6.1 Objective

Shipment Module manages physical dispatch and pickup.

Relationship:

```text
1 Order
→ 0..N Shipments
```

---

## 4.6.2 Partial Shipment

Shipment supports:

```text
partial item
partial size
partial quantity
```

---

## 4.6.3 AvailableToShip

```text
AvailableToShip
=
ReadyQty
-
AlreadyConfirmedShippedQty
```

Server revalidates at confirmation.

---

## 4.6.4 Shipment Status

```text
DRAFT
CONFIRMED
VOID
```

---

## 4.6.5 Draft Shipment

Draft:

```text
does not count as shipped
does not reserve by default
must revalidate before Confirm
```

---

## 4.6.6 Confirm Shipment

Confirmed means:

```text
goods physically left the shop
```

Pickup counts as fulfillment.

---

## 4.6.7 VOID

VOID only applies when the shipment record is invalid and physical dispatch did not happen.

Real goods that left the shop cannot be “voided away”.

---

## 4.6.8 Payment Warning

Outstanding payment is a warning.

It is not an automatic shipment block.

Authorized user can proceed.

---

## 4.6.9 Order Completion

Order becomes:

```text
COMPLETED
```

when all fulfillment quantity has left via valid Shipment/Pickup.

---

## 4.6.10 QR

Shipment QR may open shipment context.

QR scan alone does not Confirm shipment.

---

# 4.7 CUSTOMER TRACKING MODULE

## 4.7.1 Objective

Tracking is a public/customer-facing projection.

It does not expose raw internal Order data.

---

## 4.7.2 Access

Public tracking uses:

```text
random tracking token / QR
+
phone verification
```

Phone verification uses:

```text
phoneAtConfirmation
```

from Order snapshot.

---

## 4.7.3 Tracking Reads From

```text
ORDER
PRODUCTION
SHIPMENT
PAYMENT
```

Tracking does not own those truths.

---

## 4.7.4 Public Contract

Public contract must be limited.

Do not expose:

```text
password/auth data
internal notes
raw production exception internals
internal-only IDs
unnecessary financial internals
```

---

## 4.7.5 Production Visibility

Later locked decision:

Customer can see detailed production progress, but as a public projection.

If multiple PS exist:

```text
aggregate to Order-level public progress
```

Do not need to expose internal PS numbers.

---

## 4.7.6 Approved Mockup

Customer may see:

```text
Approved Mockup
```

Customer must not see internal manufacturing artwork/files such as:

```text
Body production artwork
Sleeve production artwork
Cuff production artwork
Collar manufacturing files
```

---

## 4.7.7 Payment Visibility

Public tracking shows simplified payment status.

Example:

```text
UNPAID
PARTIALLY PAID
PAID
```

Internal overpayment/resolution details remain private.

---

## 4.7.8 Bill Visibility — Later Locked Correction

Customer Tracking must NOT expose:

```text
Bill
Invoice
Bill PDF
Download Bill
```

Internal documents may exist but are not public Tracking content.

---

## 4.7.9 Public Requests — Later Locked Correction

V1 allows:

```text
GENERAL REQUEST
DELIVERY REQUEST
EXPEDITE REQUEST
```

But:

```text
Request != automatic mutation
```

Admin reviews first.

Not allowed as structured public direct changes:

```text
Change Size
Change Qty
Change Fabric
Change Design
```

---

# 4.8 ANALYTICS MODULE

## 4.8.1 Objective

Analytics is read-only.

It must never mutate business data.

---

## 4.8.2 Central Metric Definitions

Same metric definition must be used across:

```text
Dashboard
Customer Profile
Analytics
Reports
```

---

## 4.8.3 Sales

```text
Sales period = confirmedAt
Sales / Order Value = Confirmed Order Value
```

Sales is not the same as Cash Received.

---

## 4.8.4 Cash

Payment activity:

```text
paidAt
```

Refund activity:

```text
refundedAt
```

---

## 4.8.5 Best Selling

Final definition:

```text
Best Selling = purchasedQty
```

---

## 4.8.6 Most Produced

```text
Most Produced = fulfillmentQty
```

with:

```text
fulfillmentQty = purchasedQty + promotionalFreeQty
```

---

## 4.8.7 Confirmed Order Edit

If an Order is edited after confirmation:

```text
metric value may update
```

but remains attributed to the original `confirmedAt` period.

---

## 4.8.8 Cancelled / Voided / Archived

Cancelled:

```text
excluded from Sales/current demand
actual payment/refund/production activity retained
```

Voided:

```text
excluded from normal KPI
```

Archived valid Order:

```text
included in historical Analytics
```

---

## 4.8.9 Department Workload

A PS may be active in multiple departments.

Department workload may count it in multiple department views.

Do not globally sum department units because this double-counts.

Overall active jobs must deduplicate by PS.

---

## 4.8.10 Historical Outstanding

System must support:

```text
Current Outstanding
Outstanding as-of historical date
```

This requirement is implemented technically later.

---

# 4.9 DOCUMENTS MODULE

## 4.9.1 Objective

Documents are generated from authoritative domain truth.

Documents do not own business data.

---

## 4.9.2 Core Document Types

Functional document families include:

```text
Order / Bill / Invoice
Payment Receipt
Production Sheet
Shipment Document
```

Exact visual templates are deferred.

---

## 4.9.3 Snapshot-Based Documents

Historical documents must use confirmed snapshots.

Do not rebuild an old Order document from today's current Customer/Product/Pricing master.

---

## 4.9.4 Bill Revision

Confirmed commercial Order change can require:

```text
Bill v1 → SUPERSEDED
Bill v2 → CURRENT
```

Old revision remains.

No silent overwrite.

---

## 4.9.5 Bill vs Payment Receipt — Later Locked Correction

```text
Order Bill / Invoice
!=
Payment Receipt
```

Invoice = commercial Order truth.

Receipt = individual money movement.

New payment does not rewrite invoice just to change paid balance.

---

## 4.9.6 Production Sheet Document

Production Sheet document reads:

```text
confirmed Order context
Approved Mockup
production instructions/assets
size/qty
PS version
```

Exact A4 visual layout is later/deferred.

---

## 4.9.7 Shipment Document

Shipment document uses shipment snapshot/context.

Historical shipment recipient/address information must not silently follow later Customer profile changes.

---

# 4.10 ADMIN / CONFIGURATION MODULE

## 4.10.1 Objective

Admin exposes controlled configuration of business masters/settings.

Admin UI is not the business owner.

---

## 4.10.2 Product / Component Management

Admin can manage:

```text
Collar
Fabric
Sleeve
Shoulder
Cuff
Waist
Shirt Bottom
```

Used historical options must not be hard deleted.

Use:

```text
disable / inactive
```

---

## 4.10.3 Pricing Management

Pricing configuration includes:

```text
customer-group base pricing
size add-ons
component adjustments
fabric adjustments
promotion rules
exchange rate
pricing versions
```

Later locked lifecycle:

```text
Draft
→ Review
→ Activate
```

Existing active version stays active until new version is activated.

Historical Orders retain snapshots.

---

## 4.10.4 Part Fabric Pricing — Later Locked Correction

ADMIN_PROMAX can configure per Pricing Version whether fabric surcharge is active for Parts such as:

```text
Body
Sleeve
Cuff
Collar
Other
```

If multiple enabled Part surcharges apply:

```text
calculate separately
then sum
```

---

## 4.10.5 Inventory Management

V1 availability:

```text
IN_STOCK
LOW_STOCK
OUT_OF_STOCK
```

Fabric identity belongs to PRODUCT.

Stock status belongs to INVENTORY.

Price adjustment belongs to PRICING.

Admin UI may compose all three.

---

## 4.10.6 User Administration

Admin manages:

```text
activation
role
department
status
credential reset
```

Must preserve at least one active ADMIN_PROMAX.

---

## 4.10.7 Payment / Shipment Methods

Admin can manage configurable payment and shipment methods where applicable.

These are configuration entries, not transaction history.

---

## 4.10.8 Operational Settings

Examples:

```text
default lead time
due-soon threshold
draft cleanup
archive timing
system locale/currency preference
```

P0 integrity rules are not ordinary toggles.

---

# 4.11 SEARCH / FILTER / QR MODULE

## 4.11.1 Objective

Search, Filter and QR are shared infrastructure.

They are not business data owners.

---

## 4.11.2 Search

Search may resolve:

```text
Order Number
Customer Name
Normalized Phone
Production Sheet Number
Shipment Number
Tracking reference
```

Search must obey permissions.

---

## 4.11.3 Filter

Filter works across module lists.

Examples:

```text
status
date
department
priority
payment
readiness
delivery
```

Exact UI is Phase 5.

---

## 4.11.4 QR

QR contexts may include:

```text
Production QR
Tracking QR
Shipment QR
Document QR
```

QR resolver must know context.

---

## 4.11.5 QR Does Not Mutate By Scan Alone

Core rule:

```text
Scan
!= state change
```

Later Production QR flow may show explicit confirmation.

Shipment QR also requires explicit confirmation.

---

# 4.12 INTEGRATION MODULE / CROSS-MODULE RULES

## 4.12.1 Objective

Integration rules ensure Modules use one implementation/source instead of duplicating logic.

---

## 4.12.2 Customer → Order

Customer Profile may start New Order.

It passes customer identity/context into the same Order flow.

No separate “Customer Order” implementation.

---

## 4.12.3 Order → Production

Only confirmed Order can enter normal production preparation.

Production reads confirmed snapshots and fulfillment quantities.

Production does not own commercial price.

---

## 4.12.4 Production → Shipment

Shipment reads:

```text
ReadyQty
```

from Production.

Shipment must not rewrite Production state.

---

## 4.12.5 Order → Payment

Payment references Order commercial total.

Payment does not own/edit Order price.

---

## 4.12.6 Payment → Shipment

Payment may provide warning context.

Payment does not automatically block authorized shipment.

---

## 4.12.7 Order / Production / Shipment / Payment → Tracking

Tracking composes a limited public projection.

Tracking does not return raw internal aggregates.

---

## 4.12.8 Owner Domains → Analytics

Analytics reads owner domains and central definitions.

Analytics does not write back.

---

## 4.12.9 Domains → Documents

Document Generator reads authoritative domain snapshots/contracts.

Documents do not become Source of Truth.

---

## 4.12.10 Settings / Admin → Business Domains

Admin changes configuration through the owning domain.

Examples:

```text
Admin changes Price
→ PRICING

Admin changes Fabric status
→ INVENTORY

Admin disables Component
→ PRODUCT
```

Admin UI itself is not the owner.

---

# 4.13 CUSTOMER PROFILE PATCH

A later Phase 4 patch expanded Customer Profile requirements.

## 4.13.1 Core Profile Fields

Customer Profile includes:

```text
Name
Phone
Default Group
Customer Since
Status
Notes
```

Phone is not required to be globally unique.

---

## 4.13.2 Duplicate Phone Warning

Normalized phone can be used to warn about potential duplicates.

Rule:

```text
duplicate normalized phone
→ warning
```

But:

```text
phone != unique identity
```

Customer ID remains the stable identity.

---

## 4.13.3 Customer Profile Sections

Customer Profile can compose:

```text
Overview
Orders
Financial
Analytics
```

These are read from their owner domains.

---

## 4.13.4 Customer Summary

Profile may show summaries derived from:

```text
Order history
Payment history
Customer analytics
```

But Customer domain does not own duplicated totals.

---

## 4.13.5 Customer Analytics

Customer-level analytics can include:

```text
trends
top components
order behavior summaries
```

These are read-only.

---

## 4.13.6 No Automatic Customer Level

Analytics must not automatically change Customer Group.

Any customer level/group change remains controlled.

---

# 4.14 CROSS-MODULE STATUS MODEL

PHASE 4 modules must preserve separate status dimensions:

```text
Order Status
Payment Status
Financial Resolution
Readiness
Delivery Status
Storage Status
Production Stage Status
User Status
Shipment Status
```

Do not collapse into one generic `status`.

---

# 4.15 ORDER STATUS

```text
DRAFT
CONFIRMED
COMPLETED
CANCELLED
VOIDED
```

Operational:

```text
WAITING_FOR_PRODUCTION_SHEET
```

is not OrderStatus.

---

# 4.16 PAYMENT STATUS

```text
UNPAID
PARTIALLY_PAID
PAID
OVERPAID
```

---

# 4.17 FINANCIAL RESOLUTION

```text
CLEAR
RESOLUTION_REQUIRED
```

---

# 4.18 READINESS

```text
NOT_READY
PARTIALLY_READY
READY_TO_SHIP
```

---

# 4.19 DELIVERY

```text
NOT_SHIPPED
PARTIALLY_SHIPPED
COMPLETED
```

---

# 4.20 STORAGE

```text
ACTIVE
ARCHIVED
```

Archive is not deletion.

---

# 4.21 ARCHIVE FUNCTIONAL RULES

Later locked final rule for completed Orders:

```text
COMPLETED
+
PAID
+
CLEAR
+
15 days
→ AUTO ARCHIVE
```

If completed but still partially paid:

```text
do not auto archive
```

Cancelled Orders follow cancellation-resolution eligibility instead.

---

# 4.22 ARCHIVED ORDER REACTIVATION

Later locked rule:

If an archived Order develops a new financial issue:

```text
ARCHIVED
→ ACTIVE
```

automatically.

Example:

```text
Refund
or
RESOLUTION_REQUIRED
```

After resolution, archive eligibility can apply again.

---

# 4.23 INVENTORY FUNCTIONAL PATCH

Inventory was added after initial Phase 4 structure and is part of the final baseline.

V1:

```text
IN_STOCK
LOW_STOCK
OUT_OF_STOCK
```

Future architecture must allow:

```text
quantityOnHand
reserved
available
unit
stock movements
```

without redesigning POS/Production/Fabric Master.

---

# 4.24 OUT_OF_STOCK IN ORDER FLOW

Later locked rule:

If Draft selected fabric becomes:

```text
OUT_OF_STOCK
```

before Confirm:

```text
BLOCK Confirm
```

User must select another Fabric or authorized Admin must correct stock status if wrong.

---

# 4.25 OUT_OF_STOCK AFTER CONFIRM

If Fabric was valid at Confirm and later becomes OUT_OF_STOCK:

```text
Production warning only
```

Do not silently substitute another fabric.

Historical Order snapshot remains.

---

# 4.26 TRACKING REQUEST PATCH

Final V1 functional rule:

Allowed:

```text
GENERAL REQUEST
DELIVERY REQUEST
EXPEDITE REQUEST
```

Not allowed as direct structured public change:

```text
Change Size
Change Qty
Change Fabric
Change Design
```

Admin reviews all allowed requests.

---

# 4.27 DOCUMENT REVISION PATCH

Confirmed Order edit that changes commercial truth:

```text
automatically creates new Bill/Invoice revision
```

Normal staff should operate on current revision.

Historical revisions remain available to authorized users.

Exact visual/permission behavior is finalized later in Phase 5.

---

# 4.28 SECURITY BASELINE APPLICABLE TO PHASE 4

The functional modules must be compatible with the locked security direction:

```text
NEVER trust frontend validation alone
NEVER expose raw internal Order publicly
NEVER build SQL from user input
NEVER use predictable tracking identifiers as sole access control
NEVER execute uploaded files
NEVER allow public QR scan to mutate core business state
MUST use server validation
MUST enforce permissions
MUST maintain security/audit logs where required
MUST support backup/restore strategy later
```

---

# 4.29 PUBLIC TRACKING SECURITY FLOW

Concept:

```text
Internet
↓
Public Tracking Entry
↓
random token / QR
↓
rate/security checks
↓
phone verification
↓
limited tracking projection
```

Public Tracking does not return the internal Order object.

---

# 4.30 UPLOAD FUNCTIONAL SECURITY

Any module accepting files/images must be compatible with later secure upload requirements:

```text
allowlist
size limits
random storage names
no execution
object storage
malware/security scanning where applicable
```

Exact implementation is deferred to technical architecture.

---

# 4.31 FUNCTIONAL ANTI-SPAGHETTI RULES

There should be one implementation path for shared workflows.

Examples:

```text
ONE Order Creation flow
ONE Payment flow
ONE Production state machine
ONE Shipment flow
ONE Pricing engine
ONE Customer Profile source
ONE Search infrastructure
ONE QR resolver concept
ONE Document Generator
ONE Permission Matrix
```

Multiple entry points may exist.

Multiple business implementations must not.

---

# 4.32 EXAMPLE — CUSTOMER TO ORDER

Correct:

```text
Customer Profile
→ New Order
→ same Order Creation flow
```

Incorrect:

```text
Customer Profile
→ special Customer Order implementation

Orders page
→ separate POS implementation
```

---

# 4.33 EXAMPLE — DASHBOARD TO PRODUCTION

Correct:

```text
Dashboard QC Active Jobs
→ Production filtered to QC
```

Incorrect:

```text
Dashboard has independent QC state management
```

---

# 4.34 EXAMPLE — TRACKING TO EXPEDITE

Customer:

```text
Submit Expedite Request
```

System:

```text
Request = PENDING
```

Admin review:

```text
may decide Priority = URGENT
```

Tracking request itself never changes priority.

---

# 4.35 EXAMPLE — PART FABRIC

Order/POS before Confirm:

```text
Body Fabric = Micro 180g
Cuff Fabric = Jacquard 01
Collar Fabric = Honeycomb
```

Pricing:

```text
Cuff surcharge +15,000
Collar surcharge +5,000
```

Final:

```text
+20,000
```

Production Sheet inherits these choices.

If changed later and price-affecting:

```text
Controlled Order Edit
→ Reprice
→ Bill Revision
→ PS Version if required
```

---

# 4.36 EXAMPLE — PARTIAL READY / SHIPMENT

Order:

```text
100 pcs
```

Production:

```text
PS1 = 40
QC Complete

PS2 = 60
Printing
```

Result:

```text
Ready = 40
Readiness = PARTIALLY_READY
```

Shipment may send up to:

```text
40
```

After confirmed shipment:

```text
Delivery = PARTIALLY_SHIPPED
```

Order remains CONFIRMED.

---

# 4.37 EXAMPLE — COMPLETED BUT UNPAID

Order:

```text
all goods left shop
```

Result:

```text
Order = COMPLETED
Delivery = COMPLETED
```

Payment may still be:

```text
PARTIALLY_PAID
```

Storage:

```text
ACTIVE
```

No auto archive until:

```text
PAID + CLEAR + archive delay
```

---

# 4.38 EXAMPLE — CANCELLED WITH MONEY

Order:

```text
Total = 10m
Paid = 8m
Production already started
```

Cancel:

```text
CANCELLED
+
FINANCIAL RESOLUTION REQUIRED
```

Authorized resolver decides:

```text
Shop Keeps
Refund Due
Additional Due
Reason
```

The system does not guess.

---


# 4.39 COMMERCIAL DOCUMENT WORKFLOW — NEW LOCKED FUNCTION

JAZMINE now supports three controlled business document types:

```text
QUOTATION
INVOICE
RECEIPT
```

They share a common JAZMINE document design system, but they do NOT share the same business meaning or data source.

```text
QUOTATION
→ Order Draft + PRICING

INVOICE
→ Confirmed ORDER snapshot

RECEIPT
→ Confirmed PAYMENT
```

---

# 4.40 DOCUMENT TYPE SELECTOR

The document UI may present a controlled selector:

```text
Document Type

[ Quotation ▼ ]

- Quotation
- Invoice
- Receipt
```

The user does NOT type an arbitrary business document title.

The selected Document Type controls:

```text
header
allowed source data
required fields
document behavior
document history
```

---

# 4.41 POS / ORDER MODULE — QUOTATION SUPPORT

The POS / Order module must support generating a Quotation from an Order Draft.

Functional flow:

```text
Create / Edit Draft
↓
Select Customer
↓
Configure Jersey
↓
Size / Qty
↓
Authoritative Pricing
↓
Promotion
↓
Review
↓
Generate QUOTATION
```

Generating a Quotation:

```text
does NOT Confirm Order
does NOT generate permanent Order Number
does NOT authorize Production
does NOT count as Sales
```

---

# 4.42 ORDER DRAFT COMMERCIAL STAGE

Order Draft supports:

```text
CommercialStage = NONE
or
CommercialStage = QUOTATION
```

Example:

```text
New Draft
→ NONE

Generate Quotation
→ QUOTATION
```

OrderStatus remains:

```text
DRAFT
```

---

# 4.43 QUOTATION IS OPTIONAL

JAZMINE supports both flows:

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

Quotation is NOT mandatory before Order Confirm.

---

# 4.44 QUOTATION HISTORY / REVISION

After a Quotation is issued, later Draft changes must not silently rewrite the issued document.

Example:

```text
Quotation v1
Total = 4,500,000
```

Then user edits:

```text
Qty
Fabric
Part Fabric
Promotion
Price-affecting configuration
```

The old Quotation remains historical.

The updated proposal is issued as a new Quotation revision/context:

```text
Quotation v1 = SUPERSEDED
Quotation v2 = CURRENT
```

The exact visual numbering format is deferred to Phase 5/6.

---

# 4.45 ONE CURRENT QUOTATION

Normal workflow should expose one active/current Quotation revision for a Draft.

Historical revisions remain accessible according to permission.

This avoids two or more proposals appearing to be simultaneously current.

---

# 4.46 CUSTOMER ACCEPTANCE DOES NOT AUTO-CONFIRM

Customer agreeing to a Quotation does not directly mutate the Order.

Functional flow:

```text
Customer agrees
↓
Staff reviews
↓
Explicit Confirm Order
↓
Server validation
```

Only the explicit Confirm action changes the Order from Draft to Confirmed.

---

# 4.47 CONFIRM ORDER → INVOICE

On successful Confirm:

```text
Permanent Order Number generated
Confirmed snapshots created
OrderStatus = CONFIRMED
CommercialStage = INVOICE
```

The current Invoice becomes available from the confirmed Order.

---

# 4.48 INVOICE FUNCTION

Invoice is the confirmed commercial document.

It is rendered from:

```text
Confirmed Customer Snapshot
Confirmed Product / Component Snapshot
Confirmed Part Fabric Snapshot
Confirmed Pricing Snapshot
Confirmed Promotion Snapshot
Confirmed Exchange Rate Snapshot
Confirmed Order Total
```

Invoice must not use current mutable master data to reconstruct historical truth.

---

# 4.49 INVOICE IS NOT PAYMENT PROOF

Invoice may exist while:

```text
PaymentStatus = UNPAID
```

or:

```text
PaymentStatus = PARTIALLY_PAID
```

or:

```text
PaymentStatus = PAID
```

Therefore:

```text
Invoice
≠ Receipt
```

---

# 4.50 PAYMENT MODULE — RECEIPT SUPPORT

Payment Module must support a Payment Receipt for each confirmed Payment context.

Flow:

```text
Record Payment
↓
Server validation
↓
Confirmed Payment
↓
Receipt available
```

Receipt uses PAYMENT truth.

---

# 4.51 MULTIPLE RECEIPTS PER ORDER

One Order may have multiple Payments.

Therefore one Order may have multiple Receipts.

Example:

```text
Order #1001

Deposit
→ Receipt 1

Additional Payment
→ Receipt 2

Final Payment
→ Receipt 3
```

This is expected behavior.

---

# 4.52 RECEIPT DOES NOT CHANGE COMMERCIAL STAGE

Recording Payment and creating Receipt do not change:

```text
CommercialStage = INVOICE
```

Payment Status changes independently.

Example:

```text
CommercialStage = INVOICE
PaymentStatus = PARTIALLY_PAID
```

After final payment:

```text
CommercialStage = INVOICE
PaymentStatus = PAID
```

Receipt is a Payment document, not an Order stage.

---

# 4.53 PAYMENT VOID / RECEIPT HISTORY

If a Payment is voided/cancelled through a valid controlled workflow:

```text
Payment history remains
```

Receipt history associated with the Payment must remain traceable.

The UI/document template may later show:

```text
VOID
CANCELLED
```

or another controlled marking.

The historical record must not disappear.

---

# 4.54 REFUND / RECEIPT RULE

Refund does NOT silently rewrite the original Payment Receipt.

Original Payment remains historical.

Refund is a separate financial event.

A separate Refund document type is NOT added in the current scope.

---

# 4.55 CONFIRMED ORDER EDIT → INVOICE REVISION

Existing Bill Revision rule is now explicitly treated as Invoice Revision.

If confirmed commercial Order truth changes:

```text
Controlled Order Edit
↓
Reprice
↓
Order Revision
↓
Invoice v2
```

Previous:

```text
Invoice v1 = SUPERSEDED
```

Current:

```text
Invoice v2 = CURRENT
```

---

# 4.56 PAYMENT DOES NOT CREATE INVOICE REVISION

Normal Payment:

```text
does NOT create Invoice v2
```

because Payment does not modify confirmed commercial Order value.

Payment updates:

```text
Payment Summary
Receipt
```

Invoice remains based on Order commercial truth.

---

# 4.57 DOCUMENTS MODULE — FINAL FUNCTIONAL TYPES

Documents Module now includes:

```text
QUOTATION
INVOICE
PAYMENT RECEIPT
PRODUCTION SHEET
SHIPMENT DOCUMENT
```

The first three are commercial/payment documents and share a common document design family.

---

# 4.58 SHARED JAZMINE DOCUMENT DESIGN SYSTEM

Quotation, Invoice and Receipt may share visual primitives such as:

```text
JAZMINE logo
Company information
Typography
Spacing
Page margins
Footer
Print color system
Document metadata style
```

But each type has different business sections and allowed data.

Shared visual layout does NOT mean shared business truth.

---

# 4.59 QUOTATION DOCUMENT CONTENT FUNCTION

Quotation functional content can include:

```text
Quotation reference
Customer
Draft configuration
Items
Size / Qty
Unit / calculated prices
Adjustments
Promotion
Quotation total
Issued date
Current revision context
Notes / validity if configured later
```

Exact final print layout remains Phase 5B.

---

# 4.60 INVOICE DOCUMENT CONTENT FUNCTION

Invoice functional content includes confirmed commercial Order data such as:

```text
Invoice reference
Order Number
Customer Snapshot
Items / Jersey configuration
Size / Qty
Unit Price
Adjustments
Promotion
Order Total
Invoice Revision
Issued date
```

Exact final print layout remains Phase 5B.

---

# 4.61 PAYMENT RECEIPT CONTENT FUNCTION

Receipt functional content includes:

```text
Receipt reference
Order Number
Customer context
Payment Amount
Payment Method
Paid At
Payment Reference
Payment identity/context
```

Receipt must not pretend to be the commercial Invoice.

---

# 4.62 DOCUMENT LIST / HISTORY FUNCTION

Authorized staff should be able to view relevant document history within Order context.

Concept:

```text
Documents

Quotation
- v1 SUPERSEDED
- v2 CURRENT

Invoice
- v1 CURRENT

Receipts
- Receipt 1
- Receipt 2
```

The exact UI layout is Phase 5.

---

# 4.63 COMMERCIAL STAGE — ORDER LIST FUNCTION

Orders module must expose/filter the Order-level:

```text
CommercialStage
```

Values:

```text
NONE
QUOTATION
INVOICE
```

---

# 4.64 ORDER FILTER — COMMERCIAL STAGE

Order list should support:

```text
Commercial Stage:
[ All ]
[ None ]
[ Quotation ]
[ Invoice ]
```

This is server-side filtering.

Do not load every Order and filter only in frontend memory.

---

# 4.65 ORDER FILTER — PAYMENT COMBINATION

Commercial Stage filter can combine with Payment Status.

Example:

```text
Commercial Stage = INVOICE
Payment Status = UNPAID
```

→ invoices with no payment.

Example:

```text
Commercial Stage = INVOICE
Payment Status = PARTIALLY_PAID
```

→ invoices still owing money.

---

# 4.66 ORDER FILTER — ORDER STATUS COMBINATION

Commercial Stage can combine with OrderStatus.

Example:

```text
CommercialStage = INVOICE
OrderStatus = CONFIRMED
```

→ active confirmed Orders.

Example:

```text
CommercialStage = INVOICE
OrderStatus = COMPLETED
```

→ completed fulfillment Orders retaining Invoice commercial context.

---

# 4.67 FILTERS MUST REMAIN MULTI-DIMENSIONAL

Do NOT create one combined status such as:

```text
INVOICE_UNPAID
INVOICE_PARTIALLY_PAID
QUOTATION_WAITING
```

as the only business state.

Keep:

```text
CommercialStage
PaymentStatus
OrderStatus
Readiness
Delivery
```

separate and combine them in queries/filters.

---

# 4.68 CUSTOMER PROFILE — COMMERCIAL SUMMARY

Customer Profile may display derived commercial summaries:

```text
Active Quotations
Active Invoices
Outstanding
```

Example:

```text
Customer: ABC FC

Active Quotations   1
Active Invoices     2
Outstanding         3,500,000
```

These values are derived.

CUSTOMER domain does not own them.

---

# 4.69 CUSTOMER PROFILE — COMMERCIAL DOCUMENT ACCESS

From Customer Profile, authorized staff may navigate to the customer's Orders and related commercial documents.

Example:

```text
Customer Profile
↓
Orders
↓
Filter: QUOTATION
```

or:

```text
Customer Profile
↓
Orders
↓
Filter: INVOICE
```

No separate duplicate sales system should be created inside Customer Profile.

---

# 4.70 DASHBOARD — COMMERCIAL ATTENTION

Dashboard may later show attention summaries such as:

```text
Active Quotations
Active Invoices
Unpaid Invoices
Partially Paid Invoices
```

These must link to the central Orders list with matching filters.

Dashboard must not create an independent commercial pipeline data source.

---

# 4.71 ANALYTICS — QUOTATION IS NOT SALES

Analytics must NOT include Quotation value in Sales.

Sales remains:

```text
Confirmed Order Value
```

and period remains:

```text
confirmedAt
```

---

# 4.72 ANALYTICS — OPTIONAL FUTURE COMMERCIAL METRICS

The architecture may support future read-only metrics such as:

```text
Quotation Count
Active Invoice Count
Quotation-to-Confirm Conversion
Average Time from Quotation to Confirm
```

These are NOT automatically official KPI definitions until explicitly locked.

---

# 4.73 SEARCH — DOCUMENT REFERENCES

Shared Search may later support authorized lookup by:

```text
Quotation reference
Invoice reference
Receipt reference
Order Number
Customer
Phone
```

Exact indexed fields/implementation are Phase 6.

---

# 4.74 GLOBAL SEARCH RESULT CONTEXT

Search result should distinguish document/business context.

Example:

```text
QT-....
QUOTATION

INV-....
INVOICE

Receipt reference
RECEIPT
```

Search must not confuse a document number with Order lifecycle.

---

# 4.75 DOCUMENT NUMBERING

Each document family must have stable identity/reference.

Conceptually:

```text
Quotation Number
Invoice Number
Receipt Number
```

Exact visible pattern is NOT locked in Phase 4.

Do not hardcode a numbering format before document design/technical rules are finalized.

---

# 4.76 TRACKING MODULE — NO PUBLIC DOCUMENT EXPOSURE

Existing rule remains:

```text
Customer Tracking
does NOT expose:
Quotation PDF
Invoice PDF
Receipt PDF
```

unless a later explicit business decision changes public document access.

Current Tracking continues to show limited Order/Production/Shipment/Payment status projection only.

---

# 4.77 ADMIN / CONFIGURATION — DOCUMENT TYPE CONTROL

Document Type semantics are system-controlled.

Admin may later configure safe presentation fields such as:

```text
company details
logo
footer text
document notes
```

but MUST NOT redefine:

```text
QUOTATION as Payment document
INVOICE as Receipt
RECEIPT as Order stage
```

Core meaning is not configurable.

---

# 4.78 INTEGRATION — DRAFT TO QUOTATION

```text
POS / Order Draft
↓
PRICING
↓
QUOTATION
```

Quotation generator reads authoritative pricing result.

It does not implement its own pricing engine.

---

# 4.79 INTEGRATION — QUOTATION TO ORDER CONFIRM

```text
QUOTATION
↓
Customer agreement / staff decision
↓
Explicit Confirm Order
↓
ORDER
```

Quotation itself does not Confirm.

---

# 4.80 INTEGRATION — ORDER TO INVOICE

```text
Confirmed ORDER
↓
Document Generator
↓
INVOICE
```

Invoice is based on confirmed snapshots.

---

# 4.81 INTEGRATION — PAYMENT TO RECEIPT

```text
Confirmed PAYMENT
↓
Document Generator
↓
RECEIPT
```

Receipt reads Payment truth.

---

# 4.82 INTEGRATION — ORDER LIST TO COMMERCIAL FILTER

```text
Orders
↓
CommercialStage filter
↓
Server-side query
```

Optional additional filters:

```text
PaymentStatus
OrderStatus
Customer
Date
Priority
```

---

# 4.83 COMMERCIAL PIPELINE — FUNCTIONAL FLOW

```text
Order Draft
CommercialStage = NONE
↓
optional Quotation
↓
CommercialStage = QUOTATION
↓
Customer agrees
↓
Confirm Order
↓
OrderStatus = CONFIRMED
CommercialStage = INVOICE
↓
Payment
↓
Receipt
↓
Additional Payment
↓
Additional Receipt
```

---

# 4.84 DIRECT CONFIRM FLOW

Also valid:

```text
Order Draft
CommercialStage = NONE
↓
Confirm Order
↓
CommercialStage = INVOICE
```

Quotation is optional.

---

# 4.85 MULTI-ORDER CUSTOMER EXAMPLE

Customer:

```text
ABC FC
```

May simultaneously have:

```text
Draft A
CommercialStage = QUOTATION

Order B
CommercialStage = INVOICE
PaymentStatus = PARTIALLY_PAID

Order C
OrderStatus = COMPLETED
CommercialStage = INVOICE
PaymentStatus = PAID
```

Therefore commercial workflow is Order-based.

---

# 4.86 COMMERCIAL FILTER SCREEN CONCEPT

Functional requirement:

```text
Orders / Sales

Search
Commercial Stage
Payment Status
Order Status
Customer
Date
```

Example:

```text
Commercial Stage:
[ All ] [ Quotation ] [ Invoice ]

Payment:
[ All ] [ Unpaid ] [ Partially Paid ] [ Paid ]
```

Exact visual design belongs to Phase 5.

---

# 4.87 ANTI-SPAGHETTI — COMMERCIAL DOCUMENTS

There must be:

```text
ONE Pricing Engine
ONE Order Confirm flow
ONE Quotation document family
ONE Invoice document family
ONE Payment Receipt family
ONE Commercial Stage definition
ONE server-side filtering implementation
```

Do NOT create:

```text
POS Quotation logic
Customer Profile Quotation logic
Dashboard Quotation logic
```

as separate business implementations.

---

# 4.88 COMMERCIAL DOCUMENT SECURITY

Generating/issuing documents must respect centralized permission and server validation.

Document generation must not allow unauthorized users to:

```text
change commercial price
change Payment amount
change historical snapshot
change Invoice revision
```

---

# 4.89 DOCUMENT GENERATION IS NOT BUSINESS MUTATION BY ITSELF

Rendering/downloading/printing an existing document does not mutate business truth.

Examples:

```text
Reprint Invoice
→ no Order change

Reprint Receipt
→ no Payment change
```

Issuing a new revision is a controlled business/document action and must be audited.

---

# 4.90 COMMERCIAL DOCUMENT HISTORY MUST BE AUDITABLE

System must later be able to answer:

```text
Who issued Quotation?
When?
Which revision?
Who confirmed Order?
Which Invoice revision is current?
Which Payment produced this Receipt?
Was the Payment later voided?
```

Exact audit storage is Phase 6.

---

# 4.39 PHASE 4 MODULE STATUS

Final functional baseline:

```text
4.1  Auth / User                   LOCKED
4.2  Dashboard                     UPDATED + LOCKED
4.3  POS / Order                   UPDATED + LOCKED
4.4  Payment                       UPDATED + LOCKED
4.5  Production                    LOCKED
4.6  Shipment                      LOCKED
4.7  Tracking                      UPDATED + LOCKED
4.8  Analytics                     UPDATED + LOCKED
4.9  Documents                     UPDATED + LOCKED
4.10 Admin / Configuration         UPDATED + LOCKED
4.11 Search / Filter / QR          UPDATED + LOCKED
4.12 Integration                   UPDATED + LOCKED
Customer Profile Patch             UPDATED + LOCKED
Commercial Document Architecture   LOCKED
Cross-cutting Security Direction   LOCKED
```

---

# 4.40 PHASE 4 NON-GOALS

PHASE 4 does NOT finalize:

```text
pixel-perfect UI
responsive layout
color tokens
font sizes
A4 final Production Sheet layout
database schema
API endpoints
transaction isolation
index design
cache implementation
deployment
```

These belong to Phase 5 and Phase 6.

---

# 4.41 MASTER PHASE 0–4 REVIEW RESULT

The consolidated review after Phase 4 found the Phase 0–4 business/functional architecture aligned enough to continue into UX/UI design.

Core cross-module principles preserved:

```text
1 Business Rule = 1 Owner
1 Metric = 1 Definition
1 State Change = Server-side Validation
Historical data preserved by snapshots/versioning
Stable IDs
Central Permission Matrix
No duplicate Pricing logic
No duplicate Production logic
No duplicate Analytics logic
```

---

# 4.42 LATER LOCKED CORRECTIONS INCLUDED IN THIS FILE

The following later decisions are included because they refine/supersede Phase 4 functional behavior:

```text
Customer Tracking allows GENERAL / DELIVERY / EXPEDITE requests
but not direct structured Order-change requests

Customer Tracking does NOT expose Bill/Invoice

Public multi-PS production is aggregated to Order level

Price-affecting Part Fabric is selected before Confirm

ADMIN_PROMAX may enable/disable Part Fabric surcharge via Pricing Version

Multiple enabled Part surcharges are summed

Draft fabric OUT_OF_STOCK blocks Confirm

Cancelled Order uses controlled Financial Settlement

Completed unpaid Order does not Auto Archive

Archived Order with new financial issue Auto Reactivates

Order Bill / Invoice is separate from Payment Receipt

PurchasedQty replaces ambiguous Paid Qty terminology

Commercial document types are controlled:
QUOTATION / INVOICE / RECEIPT

Commercial Stage is per Order:
NONE / QUOTATION / INVOICE

Quotation may be issued from Draft
without confirming Order

Quotation revisions preserve history

Confirm Order
→ CommercialStage = INVOICE

Invoice uses confirmed Order snapshots

Payment does not rewrite Invoice

Confirmed Payment
→ Payment Receipt

Receipt is not Commercial Stage

Orders can be filtered by
Commercial Stage + Payment Status + Order Status

Customer Profile may show derived
Active Quotation / Active Invoice counts
```

---

# 4.43 FINAL PHASE 4 INVARIANTS

```text
Auth/User does not expose credentials

Dashboard reads central metrics

POS orchestrates but does not own Pricing

Order Confirm generates permanent number and snapshots

Payment does not own Order price

Production does not depend on Payment status

Production owns readiness

Shipment owns goods-leaving truth

Tracking is a limited public projection

Analytics is read-only

Documents render snapshots/truth

Admin configures through owner domains

Search/Filter/QR are shared infrastructure

Customer Profile composes Orders/Finance/Analytics
without owning those truths

All critical state changes require authoritative backend validation

Quotation uses Order Draft + PRICING
Invoice uses Confirmed ORDER snapshot
Receipt uses confirmed PAYMENT

Document Type is controlled
and cannot be faked by changing header text

Commercial Stage is tracked per Order
not per Customer

Receipt is not Commercial Stage

Commercial filtering is server-side
and can combine with Payment / Order status

Issued document history is preserved
```

---

# 4.44 PHASE 4 COMPLETION STATUS

```text
PHASE 4
Functional Modules / Feature Architecture

STATUS:
UPDATED + LOCKED BASELINE
```

The system is functionally defined enough to proceed to:

```text
PHASE 5
UX / UI / Responsive / Visual / Interaction Design
```

without redefining the core business ownership and rules.

---

# END OF PHASE 4
