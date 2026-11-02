# JAZMINE — PHASE 1 FULL SPECIFICATION

**Document Type:** Domain Ownership / Responsibility Boundaries / Dependency Architecture  
**System:** JAZMINE Sportswear / Jersey Organization Management System  
**Phase:** PHASE 1  
**Status:** LOCKED BASELINE  
**Language:** Lao + English Technical Terms  
**Purpose:** ເອກະສານນີ້ເປັນສະບັບເຕັມຂອງ PHASE 1 ສຳລັບການແບ່ງ Domain Ownership, Source of Truth, Responsibility Boundary, Dependency Direction ແລະ Anti-Spaghetti Architecture ຂອງລະບົບ JAZMINE.

> PHASE 1 ບໍ່ໄດ້ເນັ້ນ UI, Database schema ຫຼື API endpoint. ຈຸດປະສົງຄືກຳນົດວ່າ “ຂໍ້ມູນນີ້ໃຜເປັນ Owner?”, “Rule ນີ້ຢູ່ Domain ໃດ?”, “Module ໃດອ່ານໄດ້ ແຕ່ຫ້າມຄິດ logic ເອງ?” ເພື່ອປ້ອງກັນ Spaghetti Architecture.

---

# 1.0 PHASE 1 OBJECTIVE

PHASE 1 ກຳນົດ:

```text
Domain Ownership
Responsibility Boundaries
Source of Truth
Dependency Direction
Shared Services
Non-owner Rules
```

Core principle:

```text
1 Business Rule = 1 Owner
1 Business Truth = 1 Source
Shared Feature ≠ Business Data Owner
```

ເປົ້າໝາຍ:

- ບໍ່ໃຫ້ Pricing logic ຊ້ຳຢູ່ POS / Order / Production
- ບໍ່ໃຫ້ Payment ໄປປ່ຽນ Order price
- ບໍ່ໃຫ້ Shipment ໄປ rewrite Production
- ບໍ່ໃຫ້ Analytics ເປັນ Owner ຂອງ Business Data
- ບໍ່ໃຫ້ Tracking ເກັບ Production truth ຊ້ຳ
- ບໍ່ໃຫ້ POS ກາຍເປັນ giant module ທີ່ຖືທຸກຢ່າງ

---

# 1.1 MASTER DOMAIN MAP

Final Phase 1 domain map:

```text
CUSTOMER
PRODUCT
PRICING
POS
ORDER
PRODUCTION
SHIPMENT
PAYMENT
USER
AUTH
SETTINGS
TRACKING
ANALYTICS
INVENTORY
```

Shared / cross-cutting features:

```text
Search
Filter
QR
Document Generator
Notification / Inbox
```

Shared features are NOT business data owners.

---

# 1.2 DOMAIN OWNERSHIP SUMMARY

```text
CUSTOMER
→ customer identity/profile truth

PRODUCT
→ product/component/fabric master truth

PRICING
→ pricing rules/calculation/version/exchange/promotion truth

POS
→ order creation workflow only

ORDER
→ confirmed commercial order aggregate / order lifecycle truth

PRODUCTION
→ production execution / PS / readiness truth

SHIPMENT
→ goods-leaving-shop truth

PAYMENT
→ money movement truth

USER
→ user profile / role / department / status truth

AUTH
→ authentication / password hash / session truth

SETTINGS
→ configurable global operational settings

TRACKING
→ public projection / customer tracking context

ANALYTICS
→ read-only metrics / reporting projection

INVENTORY
→ stock availability truth
```

---

# 1.3 CUSTOMER DOMAIN

## 1.3.1 CUSTOMER OWNS

CUSTOMER is the Source of Truth for customer identity/profile data.

Core ownership:

```text
customerId
name
phone
defaultCustomerGroup
status
customerSince
```

Later profile expansion may include customer notes and customer-facing profile metadata, but ownership remains CUSTOMER.

CUSTOMER answers:

```text
Who is this customer?
What is their current profile?
What is their default customer group?
Is the customer active?
```

---

## 1.3.2 CUSTOMER DOES NOT OWN

CUSTOMER does NOT own:

```text
Order history truth
Order totals
Payment balances
Production state
Shipment state
Sales analytics
Customer lifetime sales calculation
Pricing engine
```

Customer Profile UI may display:

```text
Orders
Financial Summary
Analytics
```

but these are read/composed from owner domains.

---

## 1.3.3 CUSTOMER MUST NOT STORE ANALYTICS TOTALS AS BUSINESS TRUTH

Avoid fields such as:

```text
customer.totalSales
customer.totalOrders
customer.totalPaid
customer.totalProduction
```

as authoritative mutable business fields.

Why:

```text
Those values derive from
ORDER / PAYMENT / ANALYTICS
```

If cached later for performance, cache is not Source of Truth.

---

# 1.4 PRODUCT DOMAIN

## 1.4.1 PRODUCT OWNS MASTER DATA

PRODUCT owns product/component master identities.

Examples:

```text
COLLAR
FABRIC
SLEEVE
SHOULDER
CUFF
WAIST
SHIRT_BOTTOM
```

PRODUCT answers:

```text
What components exist?
What is the stable component ID?
What is the display name?
What image represents it?
Is it active/disabled?
What is its sort order / configuration identity?
```

---

## 1.4.2 STABLE ID PRINCIPLE

Business relations must reference stable IDs.

Example:

```text
fabricId
collarId
cuffId
```

Do NOT use mutable display names as relational identity.

Bad:

```text
fabric = "Micro 180g"
```

as the only relational key.

Good:

```text
fabricId = FABRIC_001
name = "Micro 180g"
```

Name may change.

ID remains stable.

---

## 1.4.3 PRODUCT DOES NOT OWN PRICE

PRODUCT may know:

```text
fabric identity
fabric image
active status
```

but does NOT own:

```text
fabric price adjustment
collar price
customer group pricing
promotion
exchange rate
```

Those belong to PRICING.

---

## 1.4.4 PRODUCT DOES NOT OWN STOCK

PRODUCT does NOT own:

```text
IN_STOCK
LOW_STOCK
OUT_OF_STOCK
quantityOnHand
reserved
available
```

Those belong to INVENTORY.

This separation was later reinforced when Inventory was added.

---

# 1.5 PRICING DOMAIN

## 1.5.1 PRICING OWNS

PRICING is Source of Truth for commercial price calculation.

Ownership includes:

```text
pricing rules
pricing tables
customer-group pricing
component adjustments
fabric adjustments
size adjustments
promotions
exchange rates
pricing versions
pricing activation
calculation logic
```

PRICING answers:

```text
Given this configuration,
customer group,
size,
fabric,
component choices,
promotion,
currency/exchange context,
what is the calculated/final price?
```

---

## 1.5.2 PRICING VERSION OWNERSHIP

Pricing changes must be version-aware.

Concept:

```text
Pricing Version
→ Draft
→ Review
→ Activate
```

Only active pricing version is used for new calculations.

Historical Order must preserve pricing snapshot/version context.

---

## 1.5.3 PRICING OWNS EXCHANGE RATE

Final ownership correction:

```text
PRICING
→ Exchange Rate
→ Exchange Rate Version
→ Exchange Rate Snapshot
```

SETTINGS may own default locale/currency preferences.

SETTINGS must NOT become a second Exchange Rate Source of Truth.

---

## 1.5.4 PRICING OWNS PROMOTIONS

Promotion calculation belongs to PRICING.

Examples:

```text
BUY_X_GET_Y
PERCENTAGE
FIXED_AMOUNT
```

Order stores resulting confirmed snapshots.

Order does not reimplement promotion formulas.

---

## 1.5.5 PRICING MUST NOT DEPEND ON POS

Locked dependency rule:

```text
PRICING MUST NOT depend on POS
```

Reason:

PRICING should be reusable by:

```text
POS
Order Edit
Admin Pricing Preview
Future channels
```

If Pricing depends on POS, business logic becomes trapped in UI/workflow code.

---

# 1.6 POS DOMAIN

## 1.6.1 POS IS A WORKFLOW / ORCHESTRATION SURFACE

POS is not the owner of customer, product, price, payment, production or shipment truth.

POS owns the order creation experience/workflow.

Concept:

```text
Customer Selection
↓
Product Configuration
↓
Pricing Request
↓
Size / Qty
↓
Promotion
↓
Mockup
↓
Review
↓
Confirm Order
```

---

## 1.6.2 POS READS FROM

POS reads:

```text
CUSTOMER
PRODUCT
PRICING
INVENTORY
SETTINGS
```

and creates/updates Order Draft through ORDER contracts.

---

## 1.6.3 POS DOES NOT OWN PRICING

POS must NOT:

```text
hardcode collar prices
hardcode size add-ons
hardcode fabric surcharges
calculate promotions independently
own exchange rate
```

POS sends configuration to PRICING.

PRICING returns authoritative result.

---

## 1.6.4 POS DOES NOT GENERATE ORDER NUMBER

Locked rule:

```text
POS MUST NOT generate Order Number
```

Permanent Order Number belongs to ORDER and is generated at Confirm through backend/database-safe mechanism.

---

## 1.6.5 POS DOES NOT OWN ORDER LIFECYCLE

POS may expose:

```text
Save Draft
Review
Confirm
```

but ORDER owns:

```text
DRAFT
CONFIRMED
COMPLETED
CANCELLED
VOIDED
```

---

# 1.7 ORDER DOMAIN

## 1.7.1 ORDER OWNS THE COMMERCIAL AGGREGATE

ORDER is Source of Truth for the commercial Order aggregate.

ORDER owns:

```text
orderId
orderNumber
order items
sizes
quantities
commercial configuration
confirmed snapshots
due date
priority
order lifecycle
order-level summary
```

---

## 1.7.2 ORDER NUMBER OWNERSHIP

ORDER owns permanent Order Number generation.

Rules inherited from Phase 0:

```text
Draft
→ no permanent Order Number

Confirm
→ backend/database generates permanent unique Order Number

Order Number
→ never reused
```

POS does not own this.

---

## 1.7.3 ORDER OWNS CONFIRMED SNAPSHOTS

At Confirm, ORDER stores historical commercial truth.

Examples:

```text
customer snapshot
customer group snapshot
product/component snapshot
pricing snapshot
promotion snapshot
exchange-rate snapshot
final commercial values
```

This protects historical truth from later master-data changes.

---

## 1.7.4 ORDER OWNS DUE DATE AND PRIORITY

ORDER owns:

```text
dueDate
priority
```

Priority:

```text
NORMAL
URGENT
```

Customer expedite request does not directly own or change priority.

---

## 1.7.5 ORDER OWNS LIFECYCLE

Business lifecycle:

```text
DRAFT
CONFIRMED
COMPLETED
CANCELLED
VOIDED
```

Other dimensions such as Payment, Readiness, Delivery, Storage are not collapsed into OrderStatus.

---

## 1.7.6 ORDER DOES NOT OWN MONEY MOVEMENT

ORDER may expose payment summary.

But ORDER does not own:

```text
payment records
refund records
payment method records
money transaction history
```

PAYMENT owns them.

---

## 1.7.7 ORDER DOES NOT OWN PRODUCTION EXECUTION

ORDER may reference Production Sheets.

But ORDER does not own:

```text
stage start/complete
production exception
PS version execution
readiness calculation logic
```

PRODUCTION owns them.

---

## 1.7.8 ORDER DOES NOT OWN SHIPMENT RECORDS

ORDER may expose fulfillment/delivery summary.

But SHIPMENT owns actual goods-leaving records.

---

# 1.8 PRODUCTION DOMAIN

## 1.8.1 PRODUCTION OWNS

PRODUCTION is Source of Truth for production execution.

Ownership includes:

```text
Production Sheets
PS allocation
production instructions
production assets
production images
PS versions
stage states
stage history
production exception
production resolution
readiness
production execution history
```

---

## 1.8.2 PRODUCTION SHEET OWNERSHIP

Final architecture:

```text
1 Order
→ 1..N Production Sheets
```

PRODUCTION owns the PS objects.

ORDER does not implement PS stage logic.

---

## 1.8.3 PRODUCTION OWNS STAGE STATE MACHINE

Physical stages:

```text
PRINTING
HEAT_TRANSFER
LASER
SIZE_SORTING
SEWING
QC
```

Each stage:

```text
NOT_STARTED
IN_PROGRESS
COMPLETED
```

Stage transition rules belong only to PRODUCTION.

---

## 1.8.4 PRODUCTION OWNS READINESS

Readiness comes from production truth.

Examples:

```text
NOT_READY
PARTIALLY_READY
READY_TO_SHIP
```

Shipment reads ReadyQty.

Shipment does not calculate readiness independently.

---

## 1.8.5 PRODUCTION OWNS EXCEPTION HISTORY

Production exception may include:

```text
Allocated
Usable
Scrap / Unusable
Unstarted
Release
Replacement
```

Workers report/stop/flag.

Authorized resolver resolves.

PRODUCTION owns the resulting exception truth/history.

---

## 1.8.6 PRODUCTION DOES NOT CALCULATE PRICE

Locked rule:

```text
PRODUCTION MUST NOT calculate pricing
```

Production may display Order pricing context if needed.

But Production cannot:

```text
calculate fabric surcharge
change final price
apply promotion
change customer group pricing
```

If a production-driven change affects commercial pricing:

```text
Controlled Order Edit
→ PRICING
→ ORDER snapshot/revision
```

---

## 1.8.7 PRODUCTION DOES NOT DEPEND ON PAYMENT STATUS

Locked rule:

```text
PRODUCTION MUST NOT depend on Payment status
```

Payment is not a production gate.

Example:

```text
Payment = PARTIALLY_PAID
```

does not automatically block Printing/Sewing.

If the business later introduces a separate explicit production-hold rule, it must be a consciously owned rule, not implicit Payment coupling.

---

# 1.9 SHIPMENT DOMAIN

## 1.9.1 SHIPMENT OWNS

SHIPMENT is Source of Truth for physical dispatch/pickup records.

Ownership includes:

```text
shipmentId / shipmentNumber
shipment records
shipment items
size quantities
shipping method
recipient snapshot
address snapshot
shipment history
confirmed dispatch
```

---

## 1.9.2 SHIPMENT OWNS GOODS-LEAVING TRUTH

A Confirmed Shipment/Pickup means:

```text
Goods physically left the shop
```

ORDER completion derives from valid confirmed shipment/pickup truth.

---

## 1.9.3 SHIPMENT READS READY QTY

SHIPMENT reads production readiness.

Concept:

```text
AvailableToShip
=
ReadyQty
-
AlreadyConfirmedShippedQty
```

Readiness owner remains PRODUCTION.

Shipment owns shipped quantity.

---

## 1.9.4 SHIPMENT MUST NOT REWRITE PRODUCTION

Locked rule:

```text
SHIPMENT MUST NOT rewrite Production
```

Confirming Shipment does not silently:

```text
complete QC
complete Sewing
change PS stage
```

Shipment only records valid dispatch based on readiness.

---

# 1.10 PAYMENT DOMAIN

## 1.10.1 PAYMENT OWNS

PAYMENT is Source of Truth for money movement.

Ownership includes:

```text
payment transactions
payment amount
payment type
payment method
payment date
refunds
void/cancel payment history
payment status derivation
net paid
payment history
```

---

## 1.10.2 PAYMENT DOES NOT OWN ORDER PRICE

Locked rule:

```text
PAYMENT MUST NOT change Order Price
```

If Order price changes:

```text
ORDER + PRICING controlled edit
```

Payment recalculates financial position against the new valid Order truth.

Payment does not rewrite commercial price.

---

## 1.10.3 ORDER MUST NOT REWRITE PAYMENT HISTORY

Locked rule:

```text
ORDER MUST NOT rewrite Payment history
```

Example:

Order changes from:

```text
10,000,000
→ 8,000,000
```

Existing Payment:

```text
9,000,000
```

must remain a historical money record.

Do NOT change the Payment record to 8,000,000.

Instead:

```text
Payment Status = OVERPAID
Financial Resolution = RESOLUTION_REQUIRED
```

---

## 1.10.4 PAYMENT IS NOT PRODUCTION OWNER

Payment state does not mutate Production state.

Payment may create warnings for Shipment according to business rules.

It does not start/stop Production by itself.

---

# 1.11 USER DOMAIN

## 1.11.1 USER OWNS

USER owns user business/profile identity.

Core ownership:

```text
userId
name/profile
phone
role
department
status
```

User status may include:

```text
PENDING
ACTIVE
DISABLED
```

---

## 1.11.2 ROLE ≠ DEPARTMENT

Important architecture:

```text
Role
≠ Department
```

Example:

```text
Role:
ADMIN_PROMAX
STAFF
```

Department:

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

A user's role controls authority.

Department describes operational assignment.

Do NOT combine into one giant enum such as:

```text
ADMIN
PRINTING_STAFF
SEWING_ADMIN
...
```

---

## 1.11.3 USER DOES NOT OWN PASSWORD

Locked separation:

```text
USER
→ profile / business identity

AUTH
→ password hash / login / session
```

USER must not expose or store plain credential logic as profile data.

---

# 1.12 AUTH DOMAIN

## 1.12.1 AUTH OWNS

AUTH owns authentication/security credential mechanics.

Examples:

```text
password hash
login verification
session
session revocation
authentication state
credential reset mechanism
```

---

## 1.12.2 AUTH DOES NOT OWN USER BUSINESS PROFILE

AUTH should reference:

```text
userId
```

but profile name/phone/department/role/status belongs to USER.

---

## 1.12.3 PASSWORD SECURITY BOUNDARY

System must never expose:

```text
plain password
password hash
credential internals
```

to normal UI/business contracts.

---

# 1.13 SETTINGS DOMAIN

## 1.13.1 SETTINGS OWNS

SETTINGS owns configurable global operational settings that are not business data belonging to another domain.

Examples:

```text
default lead time
due-soon threshold
draft cleanup period
archive timing
system operational defaults
locale / currency preferences
feature/config values where appropriate
```

---

## 1.13.2 SETTINGS MUST NOT BECOME A GIANT BUSINESS OBJECT

Avoid:

```text
settings.prices
settings.productionStages
settings.paymentHistory
settings.inventory
settings.customerData
```

Settings is configuration, not a dumping ground.

---

## 1.13.3 P0 INTEGRITY RULES ARE NOT OPTIONAL SETTINGS

Security/integrity rules cannot be disabled through ordinary settings.

Examples:

```text
server-side validation
unique Order Number
historical audit
permission enforcement
```

These are system invariants.

---

# 1.14 TRACKING DOMAIN

## 1.14.1 TRACKING OWNS PUBLIC PROJECTION CONTEXT

TRACKING does not own Order/Production/Payment truth.

It owns the public-facing tracking projection/context.

Concept:

```text
ORDER / PRODUCTION / SHIPMENT / PAYMENT
↓
limited projection
↓
TRACKING
↓
Customer
```

---

## 1.14.2 TRACKING MUST NOT OWN PRODUCTION

Locked rule:

```text
TRACKING MUST NOT own production
```

Bad architecture:

```text
tracking.currentStage
as independent editable truth
```

Good architecture:

```text
Tracking reads Production projection
```

---

## 1.14.3 TRACKING DOES NOT RETURN RAW INTERNAL ORDER

Tracking should never simply expose the full internal Order aggregate.

It uses a limited public contract.

Internal fields remain private.

---

## 1.14.4 TRACKING REQUESTS — LATER V1 CORRECTION

The original architecture allowed the concept of public/customer requests.

Final V1 direction later became:

Allowed:

```text
GENERAL REQUEST
DELIVERY REQUEST
EXPEDITE REQUEST
```

Not allowed as direct structured Order mutation:

```text
CHANGE SIZE
CHANGE QTY
CHANGE FABRIC
CHANGE DESIGN
```

Important:

```text
Request
≠ automatic business mutation
```

Admin/authorized workflow reviews requests.

This later decision does not change TRACKING ownership: it owns the request record/projection context, not the downstream Order/Shipment mutation.

---

# 1.15 ANALYTICS DOMAIN

## 1.15.1 ANALYTICS IS READ-ONLY

ANALYTICS reads authoritative domains.

It does not own transactional truth.

Sources include:

```text
ORDER
PAYMENT
PRODUCTION
SHIPMENT
CUSTOMER
```

---

## 1.15.2 ANALYTICS MUST NOT MUTATE

Locked rule:

```text
ANALYTICS MUST NOT mutate
```

Analytics cannot:

```text
change customer group
change priority
change Order status
change price
change Production stage
change Payment
```

---

## 1.15.3 ONE METRIC = ONE DEFINITION

ANALYTICS may centralize metric definitions, but derived metrics must be consistent across:

```text
Dashboard
Customer Profile
Reports
Analytics pages
```

No per-screen formulas.

---

## 1.15.4 ANALYTICS DOES NOT OWN CUSTOMER TOTALS

Customer Profile may display:

```text
total order value
outstanding
order count
best components
```

but those are projections/read models.

CUSTOMER does not store them as authoritative profile truth.

---

# 1.16 INVENTORY DOMAIN

INVENTORY was added after the initial Phase 1 domain map and is now part of the final ownership baseline.

## 1.16.1 INVENTORY OWNS AVAILABILITY

Final ownership concept:

```text
Fabric Master
= what exists

Inventory
= availability

Pricing
= commercial adjustment

Order Snapshot
= historical confirmed choice

Production
= manufacturing usage
```

INVENTORY is Source of Truth for whether a fabric/material is currently available.

---

## 1.16.2 INVENTORY V1

V1 uses availability status:

```text
IN_STOCK
LOW_STOCK
OUT_OF_STOCK
```

This is intentionally simpler than full quantity inventory.

---

## 1.16.3 INVENTORY FUTURE EXTENSIBILITY

Future inventory can expand to:

```text
quantityOnHand
reserved
available
unit
stock movements
```

The architecture must not require rebuilding POS/Production/Fabric Master when this is added.

---

## 1.16.4 INVENTORY DOES NOT OWN FABRIC IDENTITY

Fabric identity remains PRODUCT.

INVENTORY references:

```text
fabricId
```

and owns availability data.

---

## 1.16.5 INVENTORY DOES NOT OWN PRICE

Inventory status does not define price.

PRICING owns adjustments.

Example:

```text
Fabric A
Inventory = LOW_STOCK
Pricing Adjustment = +15,000
```

These belong to separate domains.

---

# 1.17 FABRIC OWNERSHIP — FINAL CORRECTION

Admin UI may visually show:

```text
Fabric Name
Image
Price Adjustment
Stock Status
```

on one screen.

But backend ownership remains:

```text
PRODUCT
→ Fabric identity / master

PRICING
→ Fabric price adjustment

INVENTORY
→ Fabric availability
```

UI composition does NOT change domain ownership.

---

# 1.18 SHARED SEARCH

Search is a shared feature.

It can search identifiers across domains according to permissions.

Examples:

```text
Order Number
Customer Name
Phone
PS Number
Shipment Number
Tracking reference
```

Search does not own any result data.

It resolves/retrieves data from owner domains.

---

# 1.19 SHARED FILTER

Filter is shared UX/query infrastructure.

Filter does not own:

```text
Order status
Payment status
Production stage
Customer group
```

It queries those owner domains.

---

# 1.20 SHARED QR

QR is shared infrastructure.

Possible contexts:

```text
Internal Production QR
Public Tracking QR
Shipment QR
Document QR
```

QR resolver identifies context.

QR itself does NOT own Order/Production/Shipment business state.

---

# 1.21 SHARED DOCUMENT GENERATOR

Document Generator is a renderer/shared service.

It reads authoritative contracts/snapshots.

Examples:

```text
Order Bill / Invoice
Payment Receipt
Production Sheet PDF
Shipment Document
```

Document Generator MUST NOT become owner of:

```text
price
payment balance
production state
shipment state
customer truth
```

---

# 1.22 SHARED NOTIFICATION / INBOX

Notification/Inbox is delivery infrastructure.

It may notify:

```text
new request
PS version changed
production exception
shipment issue
admin attention
```

But Notification does not own the underlying business issue.

Example:

```text
Production exception
→ owned by PRODUCTION

Notification
→ only tells user
```

---

# 1.23 DEPENDENCY RULES — LOCKED

The following rules are authoritative.

```text
Pricing MUST NOT depend on POS

Production MUST NOT calculate pricing

Tracking MUST NOT own production

Analytics MUST NOT mutate

Shipment MUST NOT rewrite Production

POS MUST NOT generate Order no

User MUST NOT expose credentials

Payment MUST NOT change Order Price

Order MUST NOT rewrite Payment history

Production MUST NOT depend on Payment status
```

Each is expanded below.

---

# 1.24 PRICING MUST NOT DEPEND ON POS

Correct:

```text
POS
→ calls PRICING
```

Incorrect:

```text
PRICING
→ imports POS business workflow
```

Reason:

Pricing must remain reusable and independently testable.

---

# 1.25 PRODUCTION MUST NOT CALCULATE PRICING

Correct:

```text
Production reads confirmed commercial snapshot
```

If configuration changes affect price:

```text
Controlled Order Edit
→ Pricing
→ Order revision
```

Incorrect:

```text
Production directly adds +15,000
to customer invoice
```

---

# 1.26 TRACKING MUST NOT OWN PRODUCTION

Correct:

```text
Production
→ public projection
→ Tracking
```

Incorrect:

```text
Tracking stores an independent editable production stage
```

---

# 1.27 ANALYTICS MUST NOT MUTATE

Correct:

```text
Analytics reads
```

Incorrect:

```text
Analytics decides customer group
Analytics changes Order priority
Analytics closes Order
```

---

# 1.28 SHIPMENT MUST NOT REWRITE PRODUCTION

Correct:

```text
Production ReadyQty
→ Shipment validation
```

Incorrect:

```text
Shipment confirmed
→ automatically marks QC complete
```

---

# 1.29 POS MUST NOT GENERATE ORDER NUMBER

Correct:

```text
Confirm Order
→ ORDER/backend/database transaction
→ unique Order Number
```

Incorrect:

```text
browser/local POS calculates next number
```

---

# 1.30 USER MUST NOT EXPOSE CREDENTIALS

Correct:

```text
USER
→ public/business profile contract

AUTH
→ credential internals
```

Plain password or hash never appears in User profile API/UI.

---

# 1.31 PAYMENT MUST NOT CHANGE ORDER PRICE

Correct:

```text
Order price changes
→ Order/Pricing workflow
```

Payment responds to resulting financial position.

Incorrect:

```text
Refund edits final Order price
```

---

# 1.32 ORDER MUST NOT REWRITE PAYMENT HISTORY

Correct:

```text
Order changes
→ Payment history preserved
→ derive new balance/status
```

Incorrect:

```text
Order total decreased
→ silently reduce prior payment record
```

---

# 1.33 PRODUCTION MUST NOT DEPEND ON PAYMENT STATUS

Correct:

```text
Order confirmed
→ Production allowed according to production rules
```

Payment state is independent.

Incorrect:

```text
Payment not PAID
→ Production state machine refuses all work
```

unless a future explicit business rule is approved.

---

# 1.34 DOMAIN COMMUNICATION PRINCIPLE

Domains communicate using contracts.

Concept:

```text
Domain A
→ Contract / ID / Snapshot
→ Domain B
```

Do NOT let one domain directly manipulate another domain's internal model.

Example:

```text
Shipment asks Production:
"How much is Ready?"

Shipment does NOT directly edit PS rows.
```

---

# 1.35 OWNERSHIP VS DISPLAY

A module may display data it does not own.

Example:

Customer Profile may display:

```text
Orders
Outstanding
Production status
```

This does NOT mean CUSTOMER owns these values.

Another example:

Order Detail may display:

```text
Payment
Production
Shipment
```

ORDER UI composes the view, but underlying truth remains in owner domains.

---

# 1.36 OWNERSHIP VS ORCHESTRATION

Workflow orchestration does not imply ownership.

POS is the clearest example.

POS coordinates:

```text
Customer
Product
Pricing
Inventory
Order
```

but does not become owner of those domains.

---

# 1.37 HISTORICAL SNAPSHOT BOUNDARY

Master domains describe current truth.

Order snapshot describes confirmed historical truth.

Example:

```text
CUSTOMER current name
≠ customer name at confirmation

PRODUCT current fabric name/config
≠ confirmed Order snapshot

PRICING current version
≠ historical Order pricing snapshot
```

ORDER owns confirmed snapshots because they are part of the confirmed commercial aggregate.

---

# 1.38 DOMAIN OWNER MATRIX

| Business Data / Rule | Owner |
|---|---|
| Customer profile | CUSTOMER |
| Customer default group | CUSTOMER |
| Component identity | PRODUCT |
| Fabric identity | PRODUCT |
| Fabric availability | INVENTORY |
| Price rules | PRICING |
| Size adjustment | PRICING |
| Fabric price adjustment | PRICING |
| Promotion rule | PRICING |
| Exchange rate | PRICING |
| Pricing version | PRICING |
| POS order-creation workflow | POS |
| Order aggregate | ORDER |
| Order number | ORDER |
| Order lifecycle | ORDER |
| Confirmed commercial snapshot | ORDER |
| Due date | ORDER |
| Priority | ORDER |
| Production Sheet | PRODUCTION |
| PS allocation | PRODUCTION |
| PS version | PRODUCTION |
| Stage state machine | PRODUCTION |
| Production history | PRODUCTION |
| Production exception | PRODUCTION |
| Readiness | PRODUCTION |
| Shipment records | SHIPMENT |
| Shipped quantities | SHIPMENT |
| Pickup/dispatch truth | SHIPMENT |
| Payment record | PAYMENT |
| Refund record | PAYMENT |
| Money movement | PAYMENT |
| User profile | USER |
| Role/department/status | USER |
| Password hash | AUTH |
| Authentication/session | AUTH |
| Global operational config | SETTINGS |
| Public tracking projection | TRACKING |
| Customer tracking requests | TRACKING |
| Analytics/report projection | ANALYTICS |
| Search | Shared Infrastructure |
| Filter | Shared Infrastructure |
| QR resolver | Shared Infrastructure |
| Document rendering | Shared Infrastructure |
| Notifications | Shared Infrastructure |

---

# 1.39 ANTI-SPAGHETTI RULES

Phase 1 enforces:

```text
No duplicate pricing engine
No duplicate production state machine
No duplicate payment ledger
No duplicate shipment truth
No duplicate customer truth
No duplicate fabric master
No duplicate inventory truth
No duplicate order-number generator
No analytics mutation
No UI-owned business rule
```

---

# 1.40 EXAMPLE — CORRECT ORDER CREATION DEPENDENCY

```text
POS
↓
CUSTOMER
get customer

POS
↓
PRODUCT
get active configuration options

POS
↓
INVENTORY
get selectable availability

POS
↓
PRICING
calculate

POS
↓
ORDER
save draft / confirm
```

Correct because:

```text
POS orchestrates
but does not own the business truths
```

---

# 1.41 EXAMPLE — INCORRECT ORDER CREATION

Bad:

```text
POS contains:
customer rules
price tables
inventory flags
Order number generation
promotion engine
```

Result:

```text
Spaghetti Risk
```

because every future channel would need to duplicate POS logic.

---

# 1.42 EXAMPLE — CORRECT PRODUCTION FLOW

```text
ORDER
→ confirmed item/size/fabric snapshot

PRODUCTION
→ creates PS
→ allocates quantities
→ runs stages
→ calculates readiness

SHIPMENT
→ reads readiness
→ confirms dispatch
```

No domain rewrites another domain's truth.

---

# 1.43 EXAMPLE — CORRECT PAYMENT FLOW

```text
ORDER
Total = 10m

PAYMENT
Payment 1 = 3m
Payment 2 = 2m

Derived financial state
Net Paid = 5m
Outstanding = 5m
```

If Order later changes:

```text
ORDER
Total = 4m
```

Do NOT rewrite payment history.

Instead:

```text
PAYMENT
Net Paid = 5m

Status = OVERPAID
Financial Resolution = RESOLUTION_REQUIRED
```

---

# 1.44 EXAMPLE — FABRIC UI VS OWNERSHIP

Admin screen:

```text
Micro 180g

Image: ...
Price Adjustment: +5,000
Stock: LOW_STOCK
```

Behind the screen:

```text
PRODUCT
→ Micro 180g identity/image

PRICING
→ +5,000

INVENTORY
→ LOW_STOCK
```

This is correct.

One screen can compose multiple domains.

---

# 1.45 EXAMPLE — TRACKING

Internal truth:

```text
ORDER
PRODUCTION
SHIPMENT
PAYMENT
```

Tracking builds:

```text
limited public projection
```

Customer sees only approved public fields.

TRACKING does not store duplicate independent business state.

---

# 1.46 FINAL SOURCE-OF-TRUTH RULE

For every field/rule, future implementation must be able to answer:

```text
Who owns this?
```

If the answer is:

```text
"both POS and Order"
"both Product and Pricing"
"both Production and Shipment"
```

architecture must be reviewed.

One business truth should have one authoritative owner.

---

# 1.47 LATER CORRECTIONS INTEGRATED INTO PHASE 1 BASELINE

The following later decisions refine Phase 1 ownership and are included in the current baseline.

## Inventory added

```text
INVENTORY
→ stock availability truth
```

## Fabric ownership separated

```text
PRODUCT
→ identity

PRICING
→ commercial adjustment

INVENTORY
→ availability
```

## Exchange Rate ownership clarified

```text
PRICING
→ Exchange Rate

SETTINGS
→ locale/default currency preference
```

## Tracking request ownership clarified

TRACKING may own request records such as:

```text
GENERAL
DELIVERY
EXPEDITE
```

but these requests do not directly own downstream Order/Shipment changes.

---

# 1.48 PHASE 1 NON-GOALS

PHASE 1 intentionally does NOT finalize:

```text
Database table names
SQL schema
Foreign keys
API endpoint URLs
Frontend component structure
Deployment
Cache implementation
Index definitions
Transaction strategy
Idempotency implementation
```

Those belong to later Technical Architecture.

PHASE 1 only establishes boundaries they must respect.

---

# 1.49 FINAL PHASE 1 LOCKED RULES

```text
CUSTOMER owns customer profile truth
PRODUCT owns component/fabric master identity
PRICING owns pricing rules/calculation/version/exchange/promotion
POS owns order-creation workflow only
ORDER owns commercial Order aggregate / lifecycle / number / snapshots
PRODUCTION owns PS / stages / exception / readiness / execution
SHIPMENT owns goods-leaving records
PAYMENT owns money movement
USER owns user business profile
AUTH owns credentials/auth/session
SETTINGS owns operational configuration
TRACKING owns limited public projection/request context
ANALYTICS is read-only
INVENTORY owns stock availability

Shared Search / Filter / QR / Documents / Notifications
are not business data owners

PRICING MUST NOT depend on POS
PRODUCTION MUST NOT calculate pricing
TRACKING MUST NOT own production
ANALYTICS MUST NOT mutate
SHIPMENT MUST NOT rewrite Production
POS MUST NOT generate Order no
USER MUST NOT expose credentials
PAYMENT MUST NOT change Order Price
ORDER MUST NOT rewrite Payment history
PRODUCTION MUST NOT depend on Payment status

Stable IDs must be used across domain relationships
Confirmed historical truth must use snapshots
One business truth must have one authoritative owner
```

---

# 1.50 PHASE 1 COMPLETION STATUS

```text
PHASE 1
Domain Ownership / Responsibility Architecture

STATUS:
LOCKED BASELINE
```

All later phases must preserve these ownership boundaries unless an explicit superseding business decision is documented.

---

# END OF PHASE 1
