# JAZMINE — PHASE 2 FULL SPECIFICATION

**Document Type:** Contract Architecture / Cross-Domain Data Contracts / Snapshot Contracts / Commercial Document Contracts  
**System:** JAZMINE Sportswear / Jersey Organization Management System  
**Phase:** PHASE 2  
**Revision:** Updated after QUOTATION / INVOICE / RECEIPT + CUSTOMER PRODUCTION BRANDING decision  
**Status:** LOCKED BASELINE WITH PATCHES INTEGRATED  
**Language:** Lao + English Technical Terms  

> PHASE 2 ບໍ່ແມ່ນ Database Schema ແລະບໍ່ແມ່ນ API Endpoint Design. Contract ໃນ Phase 2 ແມ່ນຂອບເຂດຂໍ້ມູນ ແລະຄວາມໝາຍທີ່ Domain ຕ່າງໆໃນ JAZMINE ໃຊ້ສື່ສານກັນ. Implementation detail ສາມາດປ່ຽນໃນ Phase 6 ແຕ່ຕ້ອງຮັກສາ Contract semantics ເຫຼົ່ານີ້.

---

# 2.0 PHASE 2 OBJECTIVE

PHASE 1 ຕອບ:

```text
Who owns this data/rule?
```

PHASE 2 ຕອບ:

```text
How do domains exchange that data safely?
What fields are allowed to cross the boundary?
What is snapshot data?
What is current/live data?
What is public data?
What IDs must remain stable?
How are commercial documents represented?
How can Orders be filtered by commercial stage without corrupting Order status?
```

Core concept:

```text
Domain A
→ Contract
→ Domain B
```

not:

```text
Domain A
→ directly edits Domain B internals
```

---

# 2.1 CORE CONTRACT PRINCIPLES

```text
Stable IDs
Explicit Ownership
Explicit Snapshot Semantics
Explicit Status Semantics
No Hidden Mutation
No Raw Cross-Domain Object Sharing
Public Contract ≠ Internal Contract
Versioned Historical Truth
Contract fields have defined meaning
Document Type ≠ free-text header
Commercial Stage ≠ Payment Status
Receipt ≠ Commercial Stage
```

---

# 2.2 STABLE IDS ARE REQUIRED

Any object referenced across domains MUST use stable identity.

Examples:

```text
customerId
orderId
orderItemId
productId
componentId
fabricId
productionSheetId
shipmentId
paymentId
userId
departmentId
pricingVersionId
quotationId
invoiceId
receiptId
trackingTokenId/context
```

Display names MUST NOT be relational identity.

Bad:

```text
fabric = "Micro 180g"
```

as the only relation.

Correct:

```text
fabricId = FABRIC_001
name = "Micro 180g"
```

Name can change.

Stable ID remains.

---

# 2.3 CONTRACT ≠ DATABASE TABLE

A Contract may later be implemented as:

```text
API DTO
Command
Query Result
Read Model
Snapshot Object
Event Payload
Internal Service DTO
```

Phase 2 does not require one database table per Contract.

---

# 2.4 CONTRACT ≠ BUSINESS OWNER

A Contract transports or projects data.

It does not become the owner.

Example:

```text
PublicTrackingContract
```

may contain production progress.

But:

```text
PRODUCTION
```

remains the owner of production truth.

---

# 2.5 INTERNAL CONTRACT VS PUBLIC CONTRACT

```text
Internal Order Contract
≠
Public Tracking Contract
```

Public Tracking MUST NOT serialize the internal Order aggregate directly.

---

# 2.6 SNAPSHOT CONTRACT PRINCIPLE

Current master data and historical confirmed data are different.

Example:

```text
CUSTOMER current profile
≠
Order customer snapshot at confirmation
```

Snapshot fields represent historical truth and MUST NOT silently follow current master data.

---

# 2.7 EFFECTIVE CONTRACT FAMILY LIST

The effective Phase 2 baseline now contains **28 contract families**.

```text
01 CUSTOMER
02 PRODUCT
03 PRICING REQUEST
04 PRICING RESULT
05 ORDER CREATE
06 ORDER RESULT
07 ORDER PRIORITY
08 PRODUCTION SHEET CREATE
09 PRODUCTION
10 PRODUCTION STAGE
11 PRODUCTION SHEET VERSION
12 SHIPMENT
13 USER
14 USER-DEPARTMENT
15 AUTH
16 SETTINGS
17 PUBLIC TRACKING
18 EXPEDITE
19 ANALYTICS
20 PAYMENT CREATE
21 PAYMENT RESULT
22 PAYMENT SUMMARY
23 BILL / INVOICE REVISION
24 DOCUMENT TYPE
25 QUOTATION
26 INVOICE
27 PAYMENT RECEIPT
28 COMMERCIAL STAGE
```

The new document contracts are added without changing the existing domain ownership rules.

---

# 2.8 CUSTOMER CONTRACT

## 2.8.1 Purpose

CUSTOMER Contract carries current customer profile truth.

Final minimum fields:

```text
customerId
name
phone
phoneNormalized
defaultCustomerGroup
status
customerSince
productionBranding
```

`productionBranding` is a nested Customer-owned production configuration and is NOT the same thing as Customer Group.

---

## 2.8.2 customerId

```text
Stable customer identity
```

Name and phone are not relational IDs.

---

## 2.8.3 name

Current customer display/business name.

Historical Orders must not silently update when this changes.

---

## 2.8.4 phone

Original/display phone representation.

---

## 2.8.5 phoneNormalized

Normalized representation for:

```text
search
duplicate warning
comparison
tracking verification support
```

Exact normalization algorithm belongs to technical implementation.

---

## 2.8.6 defaultCustomerGroup

Current customer default commercial group.

It is NOT historical Order group truth.

---

## 2.8.7 status

Current customer lifecycle/status.

---

## 2.8.8 customerSince

Customer relationship start/history marker.

---

## 2.8.9 productionBranding

Each Customer / Agent record has one effective Production Branding context.

Conceptual structure:

```text
productionBranding

brandingType
neckLabelAssetRef
neckTapeAssetRef
```

Supported branding types:

```text
JAZMINE_STANDARD
CUSTOM_AGENT
```

Meaning:

```text
JAZMINE_STANDARD
→ use JAZMINE system Neck Label / Neck Tape assets

CUSTOM_AGENT
→ use this Customer / Agent record's own Neck Label / Neck Tape assets
```

This is production identity/configuration.

It is NOT pricing identity.

---

## 2.8.10 Customer Group ≠ Production Branding

These concepts MUST remain separate:

```text
defaultCustomerGroup
→ Pricing / commercial context

productionBranding
→ Production Neck Label / Neck Tape context
```

Example:

```text
Customer Group = AGENT_LEVEL_2
Production Branding = CUSTOM_AGENT
```

The Agent pricing level does not own or calculate branding.

---

## 2.8.11 One Customer / Agent Record = One Brand Context

Phase 2 contract structure assumes:

```text
1 Customer / Agent Record
=
1 Production Brand
```

Therefore Customer Contract does NOT need:

```text
brands[]
brandingProfiles[]
multiBrandSelector[]
```

If the same real-world person operates multiple brands:

```text
Brand A
→ Customer / Agent Record A

Brand B
→ Customer / Agent Record B
```

The records may share the same phone number because phone is not a unique Customer identity.

---

## 2.8.12 Branding Asset References

`neckLabelAssetRef` and `neckTapeAssetRef` are stable references to production image assets.

The Contract carries references, not arbitrary duplicated image bytes.

Conceptually:

```text
neckLabelAssetRef
neckTapeAssetRef
```

Asset storage itself is shared infrastructure.

CUSTOMER owns the relationship:

```text
Which current Neck Label / Neck Tape belongs to this Customer / Agent?
```

---

## 2.8.13 Branding Asset Immutability / Version Compatibility

A historical Order must remain able to reference the exact assets used at confirmation.

Therefore an existing asset reference used by a confirmed Order MUST NOT be silently mutated to different image content.

Changing Customer branding later should conceptually create/use a new asset reference/version and update the Customer's current branding pointer.

Old Order snapshots keep the old references.

---

# 2.9 NEW CUSTOMER DEFAULT GROUP

```text
New Customer
→ defaultCustomerGroup = RETAIL
```

unless later authorized business action changes it.

---

# 2.10 CUSTOMER SNAPSHOT AT ORDER CONFIRM

Final historical customer/commercial snapshot:

```text
customerId
nameAtConfirmation
phoneAtConfirmation
customerGroupAtConfirmation
```

Confirmed Order additionally preserves a Production Branding Snapshot:

```text
productionBrandingSnapshot

brandingTypeAtConfirmation
neckLabelAssetRefAtConfirmation
neckTapeAssetRefAtConfirmation
```

These snapshots belong to the confirmed Order.

Current Customer profile changes MUST NOT silently rewrite them.

---

# 2.11 CUSTOMER SNAPSHOT SEMANTICS

Example:

```text
At Confirm:

customerId = C001
nameAtConfirmation = "ABC Sport"
phoneAtConfirmation = "020..."
customerGroupAtConfirmation = "AGENT_LEVEL_2"
```

Later Customer profile:

```text
name = "ABC Football Club"
defaultCustomerGroup = "AGENT_LEVEL_3"
```

Historical Order remains unchanged unless a controlled Order revision explicitly changes commercial truth.

---

## 2.11.1 Production Branding Snapshot Semantics

Example:

```text
At Confirm:

customerId = C001
brandingTypeAtConfirmation = CUSTOM_AGENT
neckLabelAssetRefAtConfirmation = ASSET_LABEL_V1
neckTapeAssetRefAtConfirmation = ASSET_TAPE_V1
```

Later Customer profile changes to:

```text
neckLabelAssetRef = ASSET_LABEL_V2
neckTapeAssetRef = ASSET_TAPE_V2
```

The old confirmed Order remains:

```text
ASSET_LABEL_V1
ASSET_TAPE_V1
```

Production Sheet for that Order reads the Order snapshot, not the Customer's current branding.

---

# 2.12 CUSTOMER GROUP OVERRIDE METADATA

Per-order group override requires semantic support for:

```text
overrideReason
overrideBy
overrideAt
```

---

# 2.13 PRODUCT CONTRACT

PRODUCT Contract exposes master/reference data such as:

```text
componentId
fabricId
collarId
name
image/reference
active status
sort/display context
```

Stable IDs are mandatory.

---

# 2.14 PRODUCT DOES NOT OWN PRICE OR STOCK

```text
PRODUCT
→ identity

PRICING
→ commercial adjustment

INVENTORY
→ availability
```

Product Contract must not become a duplicate Pricing/Inventory Contract.

---

# 2.15 PRODUCT SNAPSHOT CONSEQUENCE

Confirmed Order may preserve Product/Component display/configuration snapshot.

Current Product changes later MUST NOT rewrite old Orders.

---

# 2.16 PRICING REQUEST CONTRACT

## 2.16.1 Purpose

Carries minimum input required by PRICING.

Direction:

```text
POS / Order Edit / authorized workflow
→ PRICING REQUEST
→ PRICING
```

---

## 2.16.2 Conceptual Inputs

```text
customer/customer-group context
component selections
fabric selections
part-fabric selections where price-affecting
size context
quantity context where applicable
promotion context
currency/exchange context
pricing version context where applicable
```

---

## 2.16.3 Final Price Is Not Trusted Client Input

Bad:

```text
frontend sends finalPrice
server trusts it
```

Correct:

```text
configuration
→ PRICING
→ authoritative PricingResult
```

---

# 2.17 PRICING RESULT CONTRACT

Conceptually returns:

```text
calculated price
adjustments
promotion result
final price
pricing version context
exchange-rate context/snapshot
```

At Order Confirm:

```text
PricingResult
→ Order pricing snapshot
```

---

# 2.18 PRICING VERSION REFERENCE

Historical Order must be able to preserve which pricing context/version generated its confirmed result.

Concept:

```text
pricingVersionId
```

or equivalent immutable reference.

---

# 2.19 ORDER CREATE CONTRACT

## 2.19.1 Purpose

Represents authorized request to create/update Order Draft or perform allowed commercial creation actions.

Direction:

```text
POS
→ ORDER CREATE
→ ORDER
```

---

## 2.19.2 No Client-Generated Permanent Order Number

```text
Draft
→ no permanent Order Number

Confirm
→ backend/database generates permanent unique Order Number
```

---

## 2.19.3 Conceptual Order Create Data

```text
customer reference
customer-group context
effective production-branding context resolved from Customer
item/configuration
part fabrics
size/qty
pricing result context
promotion context
approved mockup context where applicable
due/priority input where authorized
```

Selecting a Customer allows the Order Draft to receive/display the Customer's effective Production Branding.

The client MUST NOT fabricate arbitrary Neck Label / Neck Tape references as trusted confirmed truth.

---

## 2.19.4 Order Draft Production Branding Context

Order Draft may expose the effective branding resolved from the selected Customer:

```text
productionBranding

brandingType
neckLabelAssetRef
neckTapeAssetRef
```

This supports preview before Confirm.

If the selected Customer changes:

```text
Order Draft
→ resolve branding from the newly selected Customer
```

Exact UX behavior is Phase 5.

At Confirm:

```text
current effective branding
→ Production Branding Snapshot
```

---

# 2.20 ORDER RESULT CONTRACT

ORDER RESULT is authoritative Order response.

After Confirm, it can expose:

```text
orderId
orderNumber
confirmed snapshots
productionBrandingSnapshot
orderStatus
commercialStage
priority
due context
commercial totals
payment summary projection
readiness projection
delivery projection
```

The underlying owners remain separate.

---

# 2.21 MULTI-DIMENSION STATUS IN ORDER RESULT

Do not collapse these:

```text
orderStatus
commercialStage
paymentStatus
financialResolution
readiness
deliveryStatus
storageStatus
```

Each has a different meaning.

---

# 2.22 ORDER PRIORITY CONTRACT

Priority values:

```text
NORMAL
URGENT
```

Priority change is explicit.

It must not silently change because a customer submitted an expedite request.

---

# 2.23 EXPEDITE CONTRACT

```text
EXPEDITE REQUEST
≠
Order Priority
```

Customer request can be:

```text
PENDING
```

while:

```text
Order.priority = NORMAL
```

Admin/authorized review decides whether priority changes.

---

# 2.24 PRODUCTION SHEET CREATE CONTRACT

Relationship:

```text
1 Order
→ 1..N Production Sheets
```

PS Create references Order and allocation/configuration.

PS allocation cannot exceed Order fulfillment truth.

For Neck Label / Neck Tape, PS Create consumes:

```text
Confirmed Order
→ productionBrandingSnapshot
```

PS Create MUST NOT resolve these assets from the Customer's current profile at print/production time.

---

# 2.25 PRODUCTION CONTRACT

Must support:

```text
Production Sheet identity
allocation context
production-branding snapshot references
per-stage states
latestReachedStage
version references
exception/readiness context
history context
```

---

## 2.25.1 Production Branding Consumption

Production does not own Customer branding.

Production receives the confirmed production branding context from ORDER:

```text
ORDER
productionBrandingSnapshot
        ↓
PRODUCTION SHEET
        ↓
Neck Label / Neck Tape shown on PS
```

Production MUST NOT:

```text
read current Customer branding and overwrite historical PS
choose branding from Agent pricing level
silently substitute JAZMINE branding for a confirmed custom asset
```

The actual business validation for missing assets is defined in Phase 3.

---

# 2.26 PRODUCTION PER-STAGE MODEL

Final:

```text
Per-stage states
+
latestReachedStage
```

not a single `currentStage`.

---

# 2.27 ACTIVE STAGES

Multiple stages may be:

```text
IN_PROGRESS
```

at the same time.

---

# 2.28 latestReachedStage

```text
latestReachedStage
=
furthest stage that has started
```

It does not prove all items reached that stage.

---

# 2.29 PRODUCTION STAGE CONTRACT

Physical stage keys:

```text
PRINTING
HEAT_TRANSFER
LASER
SIZE_SORTING
SEWING
QC
```

State values:

```text
NOT_STARTED
IN_PROGRESS
COMPLETED
```

Contract architecture must allow audit history such as start/complete actor/time.

---

# 2.30 PRODUCTION SHEET VERSION CONTRACT

Conceptually supports:

```text
productionSheetId
version
CURRENT / SUPERSEDED
reason
createdBy
createdAt
```

Old versions remain.

---

# 2.31 PS VERSION ≠ AUTOSAVE

```text
Draft autosave
≠
new PS version
```

Example:

```text
Draft
→ autosave
→ autosave
→ finalize
→ v1
```

Later meaningful finalized change:

```text
→ v2
```

---

# 2.32 SHIPMENT CONTRACT

Conceptually supports:

```text
shipmentId
orderId
shipment items
item/size quantities
method
recipient snapshot
address/contact snapshot
status/history
```

Confirmed Shipment/Pickup means:

```text
goods physically left the shop
```

---

# 2.33 USER CONTRACT

Conceptually:

```text
userId
profile/name
phone
role
status
```

Credentials are NOT included.

---

# 2.34 USER-DEPARTMENT CONTRACT

Preserves:

```text
Role
≠
Department
```

Department assignment is operational placement, not authorization role.

---

# 2.35 AUTH CONTRACT

AUTH handles:

```text
login
authentication result
session/auth context
credential reset context
session revocation
```

Normal contracts never expose password hash.

---

# 2.36 SETTINGS CONTRACT

Exposes operational configuration such as:

```text
default lead time
due-soon threshold
archive timing
draft cleanup
locale/currency preference
```

Settings must not become a giant object containing other domains' truth.

---

# 2.37 PUBLIC TRACKING CONTRACT

Public Tracking is a limited projection derived from:

```text
ORDER
PRODUCTION
SHIPMENT
PAYMENT
```

It does not expose raw internal objects.

---

# 2.38 PUBLIC TRACKING TOKEN / QR

Public tracking uses:

```text
random tracking token / QR context
```

Predictable Order Number alone is not sufficient.

---

# 2.39 PHONE VERIFICATION

Public tracking verifies phone against:

```text
phoneAtConfirmation
```

from Order snapshot.

---

# 2.40 TRACKING REQUEST CONTRACT

V1 allows:

```text
GENERAL REQUEST
DELIVERY REQUEST
EXPEDITE REQUEST
```

Request:

```text
≠ automatic Order mutation
≠ automatic Shipment mutation
≠ automatic Priority mutation
```

---

# 2.41 ANALYTICS CONTRACT

Read-only results from authoritative domains.

Metric semantics must be centralized.

Analytics does not write back.

---

# 2.42 PAYMENT CREATE CONTRACT

Represents request to record money movement.

Conceptually includes:

```text
orderId
payment type
amount
method
reference/context
```

Exact concrete schema is technical work.

Payment input cannot be used to override Order price.

---

# 2.43 PAYMENT RESULT CONTRACT

Returns authoritative Payment operation result.

May include:

```text
paymentId
accepted amount
payment state/result
updated Payment Summary context
```

---

# 2.44 PAYMENT SUMMARY CONTRACT

Conceptually:

```text
Order Total
Net Paid
Remaining / Outstanding
Payment Status
Financial Resolution
```

Derived from:

```text
ORDER commercial truth
+
PAYMENT ledger/history
```

not a manually maintained second ledger.

---

# 2.45 OVERPAID CONTRACT CONSEQUENCE

If Order total falls below already-paid amount:

```text
Payment history remains
Payment Status = OVERPAID
Financial Resolution = RESOLUTION_REQUIRED
```

No silent rewrite.

---

# 2.46 BILL / INVOICE REVISION CONTRACT

Existing Bill Revision Contract is retained and clarified as:

```text
BILL / INVOICE REVISION
```

Commercial Order revision may produce:

```text
Invoice v1 = SUPERSEDED
Invoice v2 = CURRENT
```

Old revision remains.

---

# 2.47 DOCUMENT TYPE CONTRACT — NEW

## 2.47.1 Purpose

Document Type is a controlled semantic enum.

Final supported commercial/payment document types:

```text
QUOTATION
INVOICE
RECEIPT
```

The system MUST NOT treat the document title as arbitrary free text.

---

## 2.47.2 Why Document Type Is Controlled

Bad:

```text
User types:
"Receipt"

but underlying data is an Invoice
```

or:

```text
User types:
"Quotation"

but underlying data is a confirmed Payment receipt
```

This creates incorrect business meaning.

Correct:

```text
documentType
determines
document semantics + allowed data source + header
```

---

# 2.48 DOCUMENT TYPE ≠ FREE-TEXT HEADER

UI may let user select:

```text
Quotation
Invoice
Receipt
```

but should not allow an arbitrary text field to redefine business meaning.

The rendered title/header comes from the selected/authorized Document Type.

---

# 2.49 QUOTATION CONTRACT — NEW

## 2.49.1 Purpose

Quotation represents a commercial offer generated from an Order Draft before Confirm.

Flow:

```text
Order Draft
↓
authoritative Pricing calculation
↓
Generate QUOTATION
```

---

## 2.49.2 Source of Truth

Quotation is based on:

```text
Order Draft configuration
+
PricingResult
+
Customer context
```

Quotation is NOT proof that:

```text
Order is confirmed
Payment has occurred
Production may start
```

---

## 2.49.3 Conceptual Quotation Fields

The contract must be able to carry:

```text
quotationId
quotationNumber/reference
documentType = QUOTATION
orderId / draft-order reference
customer reference/snapshot context
item/configuration summary
size/qty
pricing summary
promotion result where applicable
quotation total
issuedAt
issuedBy
current/superseded context if revisions are introduced
```

Exact numbering format and revision policy are Phase 3/technical decisions.

---

## 2.49.4 Quotation Does Not Create Permanent Order Number

Generating Quotation does NOT mean the Order is Confirmed.

Therefore:

```text
Draft Order
can have Quotation
while still having no permanent Order Number
```

Quotation itself may have its own quotation identifier/number.

---

## 2.49.5 Quotation and Draft Changes

If the underlying Draft is changed after a Quotation has been issued, the system must not silently pretend the previous Quotation contains the new values.

The exact reissue/revision policy is a Phase 3 rule, but Phase 2 requires document/history semantics to remain distinguishable.

---

# 2.50 INVOICE CONTRACT — NEW

## 2.50.1 Purpose

Invoice represents confirmed commercial Order truth.

Flow:

```text
Order Draft
↓
Confirm Order
↓
Confirmed Order
↓
INVOICE
```

Invoice is based on confirmed snapshots, not mutable current master data.

---

## 2.50.2 Invoice Source

Invoice reads:

```text
Confirmed Order
Confirmed Customer Snapshot
Confirmed Item/Component/Fabric Snapshot
Confirmed Pricing Snapshot
Confirmed Promotion Snapshot
Confirmed Exchange Snapshot where applicable
```

---

## 2.50.3 Conceptual Invoice Fields

The contract must support:

```text
invoiceId
invoiceNumber/reference
documentType = INVOICE
orderId
orderNumber
customer snapshot
item/configuration summary
size/qty
unit/commercial price
adjustments
promotion
Order total
invoice revision/version
issuedAt
current/superseded state
```

Exact formatting is later work.

---

## 2.50.4 Invoice Is Not Payment Receipt

Invoice states:

```text
what the commercial Order is worth / what is being charged
```

It does NOT prove a particular payment occurred.

---

# 2.51 PAYMENT RECEIPT CONTRACT — NEW

## 2.51.1 Purpose

Receipt represents a specific confirmed Payment/money movement.

Flow:

```text
Confirmed Payment
↓
RECEIPT
```

Receipt belongs to Payment/document projection, not Order commercial stage.

---

## 2.51.2 Receipt Source

Receipt reads:

```text
PAYMENT
+
Order reference
+
Customer/Order snapshot context where needed for display
```

The money truth comes from PAYMENT.

---

## 2.51.3 Conceptual Receipt Fields

The contract must support:

```text
receiptId
receiptNumber/reference
documentType = RECEIPT
paymentId
orderId
orderNumber
customer display/snapshot context
payment amount
payment method
paidAt
payment reference
issuedAt
```

---

## 2.51.4 Multiple Receipts Per Order

One Order may have multiple Payments:

```text
Deposit
Additional Payment
Final Payment
```

Therefore one Order may have multiple Receipts.

Example:

```text
Order #1001

Receipt #1
Deposit

Receipt #2
Additional Payment

Receipt #3
Final Payment
```

This is why RECEIPT must NOT become an Order Commercial Stage.

---

# 2.52 COMMERCIAL STAGE CONTRACT — NEW

## 2.52.1 Purpose

Commercial Stage enables Orders to be filtered by where they currently are in the sales/commercial document flow.

It is tracked **per Order**, not globally per Customer.

---

## 2.52.2 Final Commercial Stage Values

Core values:

```text
NONE
QUOTATION
INVOICE
```

`NONE` represents an Order/Draft that has not yet reached an issued Quotation or Invoice commercial stage.

---

## 2.52.3 QUOTATION Stage Meaning

Final semantic:

```text
OrderStatus = DRAFT
+
at least one current/valid Quotation has been issued
+
Order has not been Confirmed
→ CommercialStage = QUOTATION
```

---

## 2.52.4 INVOICE Stage Meaning

Final semantic:

```text
Order has been Confirmed
+
Invoice/current commercial document exists/available
→ CommercialStage = INVOICE
```

Payment does not change Commercial Stage into RECEIPT.

---

## 2.52.5 Receipt Is Not Commercial Stage

Final invariant:

```text
RECEIPT
≠ CommercialStage
```

Receipt is a Payment Document.

Commercial Stage remains separate from:

```text
Payment Status
Order Status
Delivery Status
Readiness
```

---

# 2.53 COMMERCIAL STAGE IS PER ORDER, NOT PER CUSTOMER

A Customer can have multiple Orders in different stages.

Example:

```text
Customer: ABC FC

Order A
→ QUOTATION

Order B
→ INVOICE

Order C
→ COMPLETED / historical
```

Therefore this is invalid:

```text
Customer.commercialStage = QUOTATION
```

as a single authoritative customer field.

Correct:

```text
Order.commercialStage
```

Customer Profile may show derived counts.

---

# 2.54 CUSTOMER COMMERCIAL SUMMARY IS DERIVED

Customer Profile may display derived values such as:

```text
Active Quotations: 1
Active Invoices: 1
Outstanding: ...
```

These are projections from Orders/Payments.

They are NOT authoritative Customer profile fields.

---

# 2.55 FILTERABLE COMMERCIAL STAGE

Order list/search contracts must be able to filter/query by:

```text
commercialStage
```

Examples:

```text
Commercial Stage = QUOTATION
```

→ Orders still in quotation flow.

```text
Commercial Stage = INVOICE
```

→ confirmed commercial Orders in invoice stage.

This filter should be implemented server-side in later phases.

---

# 2.56 COMMERCIAL STAGE + PAYMENT FILTER

Because Commercial Stage and Payment Status are separate, filters can combine them.

Example:

```text
CommercialStage = INVOICE
PaymentStatus = PARTIALLY_PAID
```

Meaning:

```text
confirmed invoiced Orders
that are not fully paid
```

Another:

```text
CommercialStage = INVOICE
PaymentStatus = UNPAID
```

Meaning:

```text
issued/confirmed commercial Orders
with no payment
```

---

# 2.57 COMMERCIAL STAGE + ORDER STATUS FILTER

Filters may combine:

```text
commercialStage
orderStatus
```

Example:

```text
commercialStage = INVOICE
orderStatus = CONFIRMED
```

→ active confirmed Orders.

```text
commercialStage = INVOICE
orderStatus = COMPLETED
```

→ fulfilled Orders that still retain Invoice as their commercial document context.

This prevents Commercial Stage from being overloaded with fulfillment meaning.

---

# 2.58 QUOTATION → INVOICE TRANSITION

Final high-level transition:

```text
Order Draft
↓
Quotation issued
↓
CommercialStage = QUOTATION
↓
Customer agrees / staff confirms Order
↓
Order Confirmed
↓
Invoice created/available
↓
CommercialStage = INVOICE
```

The old Quotation remains historical.

It does not remain the current Commercial Stage.

---

# 2.59 INVOICE → PAYMENT → RECEIPT

Flow:

```text
CommercialStage = INVOICE
↓
Payment recorded
↓
Payment Status changes
↓
Receipt generated/available for that Payment
```

Commercial Stage remains:

```text
INVOICE
```

Receipt existence does not replace it.

---

# 2.60 DOCUMENT TYPE + BUSINESS SOURCE MATRIX

| Document Type | Business Source | Typical Trigger | Order Commercial Stage |
|---|---|---|---|
| QUOTATION | Order Draft + Pricing | Generate Quotation before Confirm | QUOTATION |
| INVOICE | Confirmed Order Snapshot | Confirm Order / current Invoice | INVOICE |
| RECEIPT | Confirmed Payment | Record/confirm Payment | No stage change |

---

# 2.61 DOCUMENT NUMBERING CONTRACT PRINCIPLE

Quotation, Invoice and Receipt should have their own stable document identity/reference.

Concept:

```text
quotationId / quotationNumber
invoiceId / invoiceNumber
receiptId / receiptNumber
```

Exact visible numbering formats such as:

```text
QT-xxxx
INV-xxxx
RCPT-xxxx
```

are NOT locked in Phase 2 unless separately approved.

The invariant is:

```text
Document identities are stable
and are not based solely on editable titles.
```

---

# 2.62 DOCUMENT HISTORY PRINCIPLE

Issued historical documents MUST NOT silently change when underlying current master data changes.

Examples:

```text
Customer current name changes
Fabric master changes
Pricing changes
```

Historical Quotation/Invoice/Receipt rendering must use appropriate historical/source context.

---

# 2.63 INVOICE REVISION

Confirmed commercial Order edit can create:

```text
Invoice v2
```

with:

```text
Invoice v1 = SUPERSEDED
Invoice v2 = CURRENT
```

Old Invoice revision remains.

---

# 2.64 PAYMENT DOES NOT REWRITE INVOICE

New Payment:

```text
does NOT rewrite Invoice
just to change paid/remaining amount
```

Payment Summary owns current financial balance projection.

Receipt documents each Payment.

---

# 2.65 QUOTATION IS NOT SALES REVENUE

Quotation represents offer/proposal.

It is not:

```text
Confirmed Sale
Cash Received
Production authorization
Shipment authorization
```

Analytics treatment is finalized in later business rules.

---

# 2.66 PUBLIC TRACKING DOES NOT EXPOSE COMMERCIAL DOCUMENTS BY DEFAULT

Existing locked rule remains:

```text
Customer Tracking
does NOT expose Bill / Invoice
```

Quotation/Invoice/Receipt document access is an internal/authorized document workflow unless a later explicit rule changes that.

---

# 2.67 DOCUMENT GENERATOR BOUNDARY

Document Generator may render:

```text
QUOTATION
INVOICE
RECEIPT
Production Sheet
Shipment Document
```

but it does not own:

```text
Order price
Payment truth
Customer truth
Production truth
Shipment truth
```

---

# 2.68 DOCUMENT TYPE CONTRACT DOES NOT REPLACE OWNER DOMAIN

Examples:

```text
INVOICE
reads ORDER

RECEIPT
reads PAYMENT

QUOTATION
reads Order Draft + PRICING
```

Document Type does not move business ownership into the Documents module.

---

# 2.69 SEARCH / FILTER CONTRACT CONSEQUENCE

Search/list read models must be capable of exposing:

```text
orderId
customerId
customer display
orderStatus
commercialStage
paymentStatus
order total
relevant document references
```

subject to permission.

This supports server-side filtering later.

---

# 2.70 CUSTOMER PROFILE CONTRACT CONSEQUENCE

Customer Profile can aggregate:

```text
Active Quotation Count
Active Invoice Count
```

by querying Order commercial stages.

Do NOT store:

```text
customer.currentCommercialStage
```

as one global truth.

---

# 2.71 ANALYTICS CONTRACT CONSEQUENCE

Analytics may later report:

```text
Quotation count
Quotation-to-Confirmed conversion
Active Invoice count
Unpaid Invoice count
```

but these are read-only metrics.

They do not mutate Order stage or Customer group.

Exact KPI definitions belong to later phase decisions.

---

# 2.72 CONTRACT VALIDATION PRINCIPLE

All state-changing contracts are server-validated.

Examples:

```text
Confirm Order
Issue Quotation
Record Payment
Confirm Shipment
Production Start/Complete
Priority Change
```

Frontend validation is not authoritative.

---

# 2.73 CONTRACT PERMISSION PRINCIPLE

A syntactically valid Contract does not imply permission.

Examples:

```text
Generate/issue commercial document
Change priority
Refund payment
Resolve cancellation finance
Activate pricing
```

must still be authorized.

---

# 2.74 NO RAW DOMAIN OBJECT SHARING

Avoid:

```text
Document Generator directly edits Order DB object
Shipment directly edits Production object
Tracking stores duplicate Production state
```

Use contracts/commands/queries.

---

# 2.75 CONTRACT VERSIONING PRINCIPLE

Field meaning must remain stable.

Bad:

```text
status
```

used for Order, Payment and Commercial Stage interchangeably.

Correct:

```text
orderStatus
paymentStatus
commercialStage
deliveryStatus
```

---

# 2.76 NULL / OPTIONAL SEMANTICS

Missing values must have clear meaning.

For example:

```text
commercialStage = NONE
```

is clearer than ambiguous null if the system needs to distinguish:

```text
not yet quoted/invoiced
```

from:

```text
field unavailable
```

Exact serialization is Phase 6.

---

# 2.77 CUSTOMER CONTRACT EXAMPLE

```text
CustomerContract

customerId: C001
name: ABC Sport
phone: 020...
phoneNormalized: ...
defaultCustomerGroup: RETAIL
status: ACTIVE
customerSince: ...

productionBranding:
  brandingType: CUSTOM_AGENT
  neckLabelAssetRef: ASSET_LABEL_CURRENT
  neckTapeAssetRef: ASSET_TAPE_CURRENT
```

---

# 2.78 CUSTOMER SNAPSHOT EXAMPLE

```text
OrderCustomerSnapshot

customerId: C001
nameAtConfirmation: ABC Sport
phoneAtConfirmation: 020...
customerGroupAtConfirmation: AGENT_LEVEL_2

productionBrandingSnapshot:
  brandingTypeAtConfirmation: CUSTOM_AGENT
  neckLabelAssetRefAtConfirmation: ASSET_LABEL_V1
  neckTapeAssetRefAtConfirmation: ASSET_TAPE_V1

overrideReason: Approved agent pricing
overrideBy: USER_001
overrideAt: ...
```

---

# 2.78.1 CUSTOMER BRANDING → ORDER → PRODUCTION EXAMPLE

Customer current profile:

```text
Customer C001
Branding = CUSTOM_AGENT
Neck Label = ASSET_LABEL_V1
Neck Tape  = ASSET_TAPE_V1
```

Order Draft selects C001:

```text
Draft preview
→ Label V1
→ Tape V1
```

Order Confirm:

```text
Production Branding Snapshot
→ ASSET_LABEL_V1
→ ASSET_TAPE_V1
```

Later Customer is updated:

```text
Label = ASSET_LABEL_V2
Tape  = ASSET_TAPE_V2
```

New Orders use V2.

Old confirmed Order / PS continues using V1.

---

# 2.79 PRICING FLOW EXAMPLE

```text
POS
↓
PricingRequest
↓
PRICING
↓
PricingResult
↓
Order Draft
```

If customer needs a proposal:

```text
Order Draft
↓
QuotationContract
```

If customer agrees:

```text
Confirm Order
↓
InvoiceContract
```

---

# 2.80 QUOTATION FLOW EXAMPLE

```text
Draft Order
Customer = ABC FC
Total Proposal = 4,500,000

Generate QUOTATION
↓
quotationId created
↓
CommercialStage = QUOTATION
```

Order remains:

```text
OrderStatus = DRAFT
```

---

# 2.81 CONFIRM / INVOICE FLOW EXAMPLE

```text
CommercialStage = QUOTATION
OrderStatus = DRAFT
↓
Confirm
↓
Permanent Order Number generated
Snapshots created
↓
OrderStatus = CONFIRMED
CommercialStage = INVOICE
↓
Invoice available/current
```

---

# 2.82 PAYMENT / RECEIPT FLOW EXAMPLE

```text
Order #1001
CommercialStage = INVOICE

Payment 1 = Deposit 3,000,000
↓
PaymentResult
↓
Receipt #1

Payment 2 = Additional 2,000,000
↓
Receipt #2
```

Commercial Stage remains:

```text
INVOICE
```

Payment status changes independently.

---

# 2.83 FILTER EXAMPLE

Query:

```text
commercialStage = QUOTATION
```

Result:

```text
Orders waiting in quotation flow
```

Query:

```text
commercialStage = INVOICE
paymentStatus = PARTIALLY_PAID
```

Result:

```text
Confirmed invoiced Orders with remaining balance
```

Query:

```text
commercialStage = INVOICE
paymentStatus = UNPAID
orderStatus = CONFIRMED
```

Result:

```text
Active confirmed Orders with no payment yet
```

---

# 2.84 CUSTOMER MULTI-ORDER EXAMPLE

Customer:

```text
ABC FC
```

Orders:

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

Customer Profile may show:

```text
Active Quotations: 1
Active Invoices: 1
Completed Orders: 1
```

without giving the Customer itself a single commercial stage.

---

# 2.85 CONTRACT OWNERSHIP MATRIX

| Contract Family | Primary Owner / Source |
|---|---|
| CUSTOMER | CUSTOMER |
| PRODUCT | PRODUCT |
| PRICING REQUEST | Consumer → PRICING input |
| PRICING RESULT | PRICING |
| ORDER CREATE | Consumer → ORDER input |
| ORDER RESULT | ORDER |
| ORDER PRIORITY | ORDER |
| PRODUCTION SHEET CREATE | Consumer → PRODUCTION input |
| PRODUCTION | PRODUCTION |
| PRODUCTION STAGE | PRODUCTION |
| PRODUCTION SHEET VERSION | PRODUCTION |
| SHIPMENT | SHIPMENT |
| USER | USER |
| USER-DEPARTMENT | USER / organization assignment |
| AUTH | AUTH |
| SETTINGS | SETTINGS |
| PUBLIC TRACKING | TRACKING projection |
| EXPEDITE | TRACKING/request context + authorized review |
| ANALYTICS | ANALYTICS read model |
| PAYMENT CREATE | Consumer → PAYMENT input |
| PAYMENT RESULT | PAYMENT |
| PAYMENT SUMMARY | PAYMENT + ORDER-derived financial projection |
| BILL / INVOICE REVISION | Confirmed Order commercial revision context |
| DOCUMENT TYPE | Controlled document semantics |
| QUOTATION | Order Draft + PRICING-derived document |
| INVOICE | Confirmed ORDER snapshot-derived document |
| PAYMENT RECEIPT | PAYMENT-derived document |
| COMMERCIAL STAGE | ORDER-level commercial workflow projection/state |

---

# 2.86 DEPENDENCY RULES

Phase 2 preserves:

```text
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
```

New document rules add:

```text
QUOTATION MUST NOT confirm Order by itself
INVOICE MUST NOT prove Payment
RECEIPT MUST NOT become Commercial Stage
DOCUMENT title MUST NOT redefine business meaning
```

---

# 2.87 PATCH — CUSTOMER FIELDS

Final:

```text
customerId
name
phone
phoneNormalized
defaultCustomerGroup
status
customerSince
```

---

# 2.88 PATCH — NEW CUSTOMER DEFAULT RETAIL

```text
New Customer
→ RETAIL
```

---

# 2.89 PATCH — CUSTOMER CONFIRM SNAPSHOT

```text
customerId
nameAtConfirmation
phoneAtConfirmation
customerGroupAtConfirmation
```

---

# 2.90 PATCH — GROUP OVERRIDE METADATA

```text
overrideReason
overrideBy
overrideAt
```

---

# 2.91 PATCH — PRODUCTION PER-STAGE MODEL

Final:

```text
Per-stage states
+
latestReachedStage
```

---

# 2.92 PATCH — PUBLIC TRACKING SECURITY

```text
Random Tracking Token / QR
+
Phone Verification
against Order snapshot
```

---

# 2.93 PATCH — BILL / INVOICE REVISION

```text
Old revision retained
Current revision explicitly identified
No silent overwrite
```

---

# 2.94 PATCH — DOCUMENT TYPES

Final controlled types:

```text
QUOTATION
INVOICE
RECEIPT
```

No free-text business type.

---

# 2.95 PATCH — COMMERCIAL STAGE

Final core values:

```text
NONE
QUOTATION
INVOICE
```

Tracked per Order.

---

# 2.96 PATCH — RECEIPT SEPARATION

Final:

```text
RECEIPT
= Payment Document

RECEIPT
≠ Commercial Stage
```

---

# 2.97 PATCH — FILTERABILITY

Order read/search contracts must support server-side filtering by:

```text
Commercial Stage
Payment Status
Order Status
Date
Customer
```

The exact query/API implementation belongs to later phases.

---

# 2.97.1 PATCH — CUSTOMER PRODUCTION BRANDING

Final contract rule:

```text
1 Customer / Agent Record
=
1 Production Brand
```

Production branding types:

```text
JAZMINE_STANDARD
CUSTOM_AGENT
```

Branding context contains:

```text
Neck Label Asset Reference
Neck Tape Asset Reference
```

Selecting Customer:

```text
Customer Contract
→ effective Production Branding
→ Order Draft preview
```

At Confirm:

```text
effective Production Branding
→ Order Production Branding Snapshot
```

Production Sheet reads:

```text
Order Production Branding Snapshot
```

not current Customer branding.

If one real person has multiple brands:

```text
create separate Customer / Agent records
```

Phone may be the same because phone is not unique identity.

---

# 2.97.2 PATCH — PRODUCTION BRANDING IS NOT CUSTOMER GROUP

Final separation:

```text
Customer Group
→ PRICING context

Production Branding
→ Neck Label / Neck Tape production context
```

Never infer the actual brand assets solely from:

```text
RETAIL
AGENT_LEVEL_1
AGENT_LEVEL_2
...
```

---

# 2.97.3 PATCH — BRANDING SNAPSHOT IMMUTABILITY

After Order Confirm:

```text
neckLabelAssetRefAtConfirmation
neckTapeAssetRefAtConfirmation
```

are historical references.

Changing the Customer's current label/tape later:

```text
MUST NOT rewrite
old confirmed Order
old PS
old production document
```

---

# 2.98 LATER COMPATIBILITY — INVENTORY

```text
PRODUCT
→ Fabric identity

INVENTORY
→ availability

PRICING
→ price adjustment
```

Contract architecture remains compatible with an explicit Inventory Contract in technical implementation.

---

# 2.99 LATER COMPATIBILITY — PRICE-AFFECTING PART FABRIC

```text
Part Fabric IDs
→ PricingRequest
→ PricingResult
→ Order snapshot
```

Production inherits confirmed fabric choices.

---

# 2.100 LATER COMPATIBILITY — CANCELLATION FINANCIAL RESOLUTION

```text
ORDER
→ cancellation lifecycle

PAYMENT
→ money movement

Financial Resolution
→ controlled settlement state
```

Cancellation does not rewrite Payment history.

---

# 2.101 LATER COMPATIBILITY — AGGREGATED PUBLIC PRODUCTION

Multiple PS may be aggregated into Order-level public progress.

This is a projection and does not change internal Production contracts.

---

# 2.102 CONTRACT SECURITY BOUNDARY

Contracts must never leak:

```text
password hash
session secrets
internal authorization secrets
raw database internals
unnecessary personal/internal data
```

---

# 2.103 CONTRACT AUDITABILITY

The architecture must support audit questions such as:

```text
Who changed priority?
Who changed customer group?
Who started/completed production stage?
Who created PS version?
Who recorded/refunded payment?
Who issued Quotation?
Who caused Invoice revision?
Who generated/issued Receipt?
Who changed a Customer / Agent's Production Branding?
Which Neck Label / Neck Tape asset refs were snapshotted at Order Confirm?
```

Exact audit storage is Phase 6.

---

# 2.104 CONTRACT ERROR SEMANTICS

Business failure should be distinguishable from technical failure.

Conceptual categories:

```text
INVALID_INPUT
PERMISSION_DENIED
BUSINESS_RULE_CONFLICT
STALE_STATE
NOT_FOUND
```

Exact error codes belong to Phase 6.

---

# 2.105 IDEMPOTENCY COMPATIBILITY

State-changing commands must be capable of duplicate-submit protection later.

Examples:

```text
Confirm Order
Record Payment
Confirm Shipment
Production Start/Complete
Issue Quotation
Create Invoice revision
Generate Payment Receipt
```

---

# 2.106 CONCURRENCY COMPATIBILITY

Contracts must allow server-side validation of current state.

Example:

```text
User A opens Draft
User B modifies Draft
User A issues Quotation from stale data
```

Later implementation must detect/reconcile stale state rather than silently overwriting.

---

# 2.107 CONTRACT NAMING PRINCIPLE

Prefer explicit semantic names:

```text
customerGroupAtConfirmation
brandingTypeAtConfirmation
neckLabelAssetRefAtConfirmation
neckTapeAssetRefAtConfirmation
latestReachedStage
commercialStage
documentType
paymentStatus
```

Avoid ambiguous fields such as generic:

```text
status
type
data
```

without context.

---

# 2.108 NO GENERIC BUSINESS DUMPING CONTRACT

Avoid uncontrolled:

```text
data: {...}
extra: {...}
metadata: {...}
```

as business dumping grounds.

Extensions must preserve ownership and semantics.

---

# 2.109 PHASE 2 NON-GOALS

Phase 2 does NOT finalize:

```text
SQL tables
database columns
foreign keys
API URLs
HTTP methods
GraphQL schema
ORM models
indexes
transaction isolation
cache keys
event-bus technology
document numbering format
PDF visual layout
quotation visual template
invoice visual template
receipt visual template
```

Those belong to later phases.

---

# 2.110 FINAL CONTRACT INVARIANTS

```text
Stable IDs across domain boundaries

Current master data
≠ historical confirmed snapshot

Pricing request input
≠ trusted final price

Pricing Result
comes from PRICING

POS
does not generate Order Number

Production
uses per-stage states

latestReachedStage
does not replace per-stage states

Public Tracking
uses limited projection

Public Tracking
uses random token/QR

Phone verification
uses Order phone snapshot

Payment
does not change Order price

Order changes
do not rewrite Payment history

Invoice revision
does not overwrite old revision

Analytics
is read-only

User contract
does not expose credentials

Document Type
is controlled

Quotation
comes from Order Draft + Pricing

Invoice
comes from Confirmed Order

Receipt
comes from Payment

Commercial Stage
is tracked per Order

Receipt
is NOT Commercial Stage

Customer
does NOT have one global Commercial Stage

Order list
can filter by Commercial Stage

Commercial Stage
can combine with Payment Status and Order Status filters

Customer Group
≠ Production Branding

1 Customer / Agent Record
= 1 Production Brand

Production Branding
supports JAZMINE_STANDARD or CUSTOM_AGENT

Selecting Customer
can resolve effective Neck Label / Neck Tape

Order Confirm
snapshots Production Branding

Confirmed Production Branding Snapshot
uses stable asset references

Customer branding changed later
MUST NOT rewrite old confirmed Order / PS

Production Sheet
reads branding from confirmed Order snapshot
not current Customer profile

Multiple real-world brands owned by one person
use separate Customer / Agent records
```

---

# 2.111 FINAL CONTRACT FAMILY LIST

```text
01 CUSTOMER
02 PRODUCT
03 PRICING REQUEST
04 PRICING RESULT
05 ORDER CREATE
06 ORDER RESULT
07 ORDER PRIORITY
08 PRODUCTION SHEET CREATE
09 PRODUCTION
10 PRODUCTION STAGE
11 PRODUCTION SHEET VERSION
12 SHIPMENT
13 USER
14 USER-DEPARTMENT
15 AUTH
16 SETTINGS
17 PUBLIC TRACKING
18 EXPEDITE
19 ANALYTICS
20 PAYMENT CREATE
21 PAYMENT RESULT
22 PAYMENT SUMMARY
23 BILL / INVOICE REVISION
24 DOCUMENT TYPE
25 QUOTATION
26 INVOICE
27 PAYMENT RECEIPT
28 COMMERCIAL STAGE
```

Production Branding is implemented as a nested/supporting contract under:

```text
CUSTOMER
ORDER confirmed snapshots
PRODUCTION consumption
```

It does NOT create a new business Domain or a new top-level Contract Family.

---

# 2.112 PHASE 2 COMPLETION STATUS

```text
PHASE 2
Contracts / Cross-Domain Data Boundaries

STATUS:
UPDATED + LOCKED BASELINE
```

New commercial-document architecture is now integrated:

```text
DRAFT ORDER
→ QUOTATION

CONFIRMED ORDER
→ INVOICE

CONFIRMED PAYMENT
→ RECEIPT
```

And:

```text
Order Commercial Stage
=
NONE / QUOTATION / INVOICE
```

with:

```text
RECEIPT
not a Commercial Stage
```

Customer Production Branding is also integrated:

```text
Customer / Agent
→ current Production Branding
→ Order Draft preview
→ Confirm
→ Production Branding Snapshot
→ Production Sheet
```

Final production-branding assumptions:

```text
1 Agent Record = 1 Brand
JAZMINE_STANDARD or CUSTOM_AGENT
Neck Label + Neck Tape are stable asset references
old confirmed Orders never follow later Customer branding changes
```

This structure supports later filtering such as:

```text
CommercialStage = QUOTATION

CommercialStage = INVOICE

CommercialStage = INVOICE
+
PaymentStatus = PARTIALLY_PAID

CommercialStage = INVOICE
+
PaymentStatus = UNPAID
```

without changing the core Order/Payment/Production architecture.

---

# END OF PHASE 2
