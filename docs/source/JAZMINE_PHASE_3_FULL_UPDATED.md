# JAZMINE — PHASE 3 FULL SPECIFICATION

**Document Type:** Business Rules / Pricing / Order / Payment / Shipment / Users / Analytics / Settings  
**System:** JAZMINE Sportswear / Jersey Organization Management System  
**Phase:** PHASE 3  
**Revision:** Updated after QUOTATION / INVOICE / RECEIPT / COMMERCIAL STAGE decision  
**Status:** UPDATED + LOCKED BASELINE  
**Language:** Lao + English Technical Terms  

---

# 3.0 PURPOSE

PHASE 3 ແມ່ນຂັ້ນທີ່ກຳນົດ **Business Rules** ຢ່າງລະອຽດຫຼັງຈາກ PHASE 0–2 ກຳນົດ Architecture, Domain Ownership ແລະ Contracts ແລ້ວ.

PHASE 3 ຕອບຄຳຖາມຫຼັກເຊັ່ນ:

```text
ສິນຄ້າ/Component ແມ່ນຫຍັງ?
Price ຄິດແນວໃດ?
Customer Group ໃຊ້ແນວໃດ?
Promotion ຄິດແນວໃດ?
Payment ຈັດການແນວໃດ?
Order lifecycle ແນວໃດ?
Shipment ແນວໃດ?
User/Role/Department ແບ່ງແນວໃດ?
Analytics metric ຄິດແນວໃດ?
Settings/Archive/Purge ແນວໃດ?
```

Core principles inherited from previous phases:

```text
1 Business Rule = 1 Owner
1 Metric = 1 Definition
Historical data MUST NOT be silently rewritten
Server-side validation is authoritative
Stable IDs, not mutable names
Snapshots preserve historical truth
```

---

# 3.1 PRODUCT / COMPONENT BUSINESS RULES

## 3.1.1 Component Master Types

Core Component Master includes:

```text
COLLAR
FABRIC
SLEEVE
SHOULDER
CUFF
WAIST
SHIRT_BOTTOM
```

These are master-data categories.

Product/Component identity belongs to PRODUCT domain.

Price adjustment belongs to PRICING.

Availability belongs to INVENTORY.

---

## 3.1.2 Required Manual Selections

The following components MUST be explicitly selected by the user when creating an Order:

```text
COLLAR
FABRIC
SHOULDER
CUFF
```

These MUST NOT be silently assumed if no valid default is defined.

---

## 3.1.3 Defaultable Components

The following may use defaults:

```text
SLEEVE
WAIST
SHIRT_BOTTOM
```

Rule:

```text
Maximum one ACTIVE default per component type
```

Example:

```text
SLEEVE
- Short Sleeve  [DEFAULT]
- Long Sleeve
```

There MUST NOT be two simultaneous active defaults for the same component type.

---

## 3.1.4 Used Historical Components Cannot Be Hard Deleted

If a Component/Fabric has already been referenced by a historical Order:

```text
MUST NOT hard delete
```

Instead:

```text
disable / inactive
```

Reason:

Historical Orders need to preserve their old commercial configuration.

---

# 3.2 CUSTOMER GROUPS

Final customer groups:

```text
RETAIL
AGENT_LEVEL_1
AGENT_LEVEL_2
AGENT_LEVEL_3
AGENT_LEVEL_4
AGENT_LEVEL_5
```

New Customer default:

```text
RETAIL
```

Persistent customer-group changes require appropriate authorization.

Per-order override is allowed under controlled permission and audit rules.

---

# 3.3 COLLAR PRICING GROUPS

Collars are grouped into Pricing Group A/B/C/D.

## Group A

```text
คอมมน
คอวี
คอวีไข้ว
คอคางหมูไข้ว
คอมมนต่อ
คอคางหมูปลายแหลม
คอวีซ้อน
คอคางหมู
```

## Group B

```text
คอ 5 เหลี่ยม
คอ 5 เหลี่ยมมีลิ้น
คอคางหมูสาบ
คอวาย
```

## Group C

```text
คอวีปก
คอคางหมูปก
```

## Group D

```text
คอโปโล
คอจีน
```

These groups are used by the base jersey pricing table.

---

# 3.4 BASE PRICE TABLE — KIP

Amounts below are in KIP.

| Customer Group | Group A | Group B | Group C | Group D |
|---|---:|---:|---:|---:|
| AGENT_LEVEL_1 | 70,000 | 85,000 | 85,000 | 85,000 |
| AGENT_LEVEL_2 | 75,000 | 90,000 | 90,000 | 95,000 |
| AGENT_LEVEL_3 | 85,000 | 100,000 | 100,000 | 105,000 |
| AGENT_LEVEL_4 | 80,000 | 95,000 | 95,000 | 100,000 |
| AGENT_LEVEL_5 | 90,000 | 105,000 | 105,000 | 110,000 |
| RETAIL | 110,000 | 120,000 | 130,000 | 140,000 |

Important locked note:

```text
AGENT_LEVEL_4 prices are intentionally lower than AGENT_LEVEL_3
```

This is not treated as an automatic data error.

The system MUST NOT silently reorder or “correct” these prices based on level numbering.

---

# 3.5 SIZE ADD-ONS

## 3.5.1 Agent Size Add-ons

For AGENT_LEVEL_1 through AGENT_LEVEL_5:

```text
JS–J2XL     +0
XS–XL       +0
2XL–3XL     +5,000
4XL–5XL     +10,000
6XL–7XL     +15,000
8XL–10XL    +20,000
```

---

## 3.5.2 Retail Size Add-ons

For RETAIL:

```text
JS–J2XL     +0
XS–XL       +0
2XL–3XL     +10,000
4XL–5XL     +15,000
6XL–7XL     +20,000
8XL–10XL    +25,000
```

---

## 3.5.3 Size Add-ons Must Be Configurable

These values are initial locked business values but should be configurable through controlled Admin/Pricing management.

Historical confirmed Orders MUST preserve their confirmed pricing snapshot.

---

# 3.6 PRICING FORMULA

Core pricing pipeline:

```text
Base Price
+
Size Adjustment
+
Fabric Adjustment
+
Sleeve Adjustment
+
Shoulder Adjustment
+
Cuff Adjustment
+
Waist Adjustment
+
Shirt Bottom Adjustment
+
Future Adjustments
↓
Calculated Price
↓
Promotion
↓
Final Price
↓
Snapshot
```

Pricing engine owns the calculation.

POS MUST NOT duplicate pricing formulas.

Production MUST NOT calculate selling price.

---

# 3.7 CURRENCY / EXCHANGE RATE

Base business currency:

```text
KIP
```

System supports configurable conversion context for:

```text
USD
THB
```

Historical Order must preserve:

```text
Exchange Rate Snapshot
```

Pricing owns exchange rate business truth.

System Settings may own locale/default currency preference but not duplicate exchange-rate truth.

---

# 3.8 CUSTOMER GROUP BUSINESS RULES

## 3.8.1 New Customer

Default:

```text
RETAIL
```

---

## 3.8.2 Persistent Group Change

Persistent defaultCustomerGroup changes are restricted.

Final baseline:

```text
ADMIN_PROMAX
```

can persistently change the Customer default group.

A later permission model may express this via explicit permission, but the core rule is that it is not a normal staff action.

---

## 3.8.3 Per-Order Group Override

Authorized users with permission:

```text
OVERRIDE_ORDER_CUSTOMER_GROUP
```

may override customer group for one Order.

Required metadata:

```text
overrideReason
overrideBy
overrideAt
```

At Confirm:

```text
customerGroupAtConfirmation
```

is snapshotted.

---

## 3.8.4 Analytics Must Never Auto-Change Customer Group

Analytics is read-only.

It MUST NOT do:

```text
"This customer buys a lot"
→ automatically promote to AGENT_LEVEL_3
```

Customer group change is a controlled business action.

---

# 3.9 CUSTOMER CONFIRM REQUIREMENTS

Before Order Confirm, customer data requirements include:

```text
Name
Phone
Customer Group
```

Phone must support normalized representation:

```text
phoneNormalized
```

This is used for comparison/search/verification.

Historical customer snapshot is created at Confirm.

---

# 3.10 CUSTOMER SNAPSHOT AT CONFIRM

Required historical snapshot:

```text
customerId
nameAtConfirmation
phoneAtConfirmation
customerGroupAtConfirmation
```

Later changes to current Customer profile MUST NOT silently rewrite this snapshot.

---

# 3.11 PROMOTION TYPES

Supported promotion types:

```text
BUY_X_GET_Y
PERCENTAGE
FIXED_AMOUNT
```

---

# 3.12 PROMOTION STACKING RULES

Maximum one promotion of each type per Order:

```text
max 1 BUY_X_GET_Y
max 1 PERCENTAGE
max 1 FIXED_AMOUNT
```

Cross-type combination:

```text
configurable
```

Meaning the business can control whether different promotion types may coexist.

---

# 3.13 BUY_X_GET_Y / FREE UNITS

Promotional free units MUST be assigned to:

```text
Order Item
+
Size
```

They are real fulfillment units.

They MUST be:

```text
produced
allocated
shipped/picked up
counted toward Order completion
```

But:

```text
free units do NOT recursively create more free units
```

Example:

```text
Buy 10 Get 1
```

The free unit does not itself create another free entitlement.

---

# 3.14 PROMOTION FINAL PRICE FLOOR

Final price:

```text
MUST NOT be below 0
```

Formula principle:

```text
Final Price >= 0
```

---

# 3.15 PROMOTION SNAPSHOT

Applied promotion must be snapshotted at Order Confirm.

Later changes to Promotion master MUST NOT rewrite historical Orders.

---

# 3.16 PURCHASED QTY / FULFILLMENT QTY

Later naming correction integrated into Phase 3:

Old ambiguous term:

```text
Paid Qty
```

Final technical/business term:

```text
purchasedQty
```

Formula:

```text
fulfillmentQty
=
purchasedQty
+
promotionalFreeQty
```

This is important because “Paid Qty” can be confused with Payment status.

---

# 3.17 PAYMENT TYPES

Payment records support payment intent/types such as:

```text
DEPOSIT
ADDITIONAL
FINAL
```

Payment domain owns money movement.

Order domain does not own payment records.

---

# 3.18 NO MINIMUM DEPOSIT RULE

There is no forced minimum deposit by default.

System MUST NOT require:

```text
50%
30%
or another hardcoded minimum
```

unless later explicitly configured as a new business rule.

---

# 3.19 PAYMENT AMOUNT VALIDATION

Normal Payment:

```text
Payment Amount
<= Remaining Amount
```

If the user attempts to record more than normal remaining amount, the system must not silently accept it as an ordinary payment.

Special overpaid situations arise from later Order changes, not normal blind overpayment entry.

---

# 3.20 WRONG PAYMENT HANDLING

Wrong Payment MUST NOT be silently deleted.

Use controlled:

```text
Void / Cancel
```

with history/audit.

Money movement history must remain traceable.

---

# 3.21 REFUND RULE

Refund:

```text
Refund Amount
<= eligible Net Paid
```

Refund must be controlled and audited.

Payment history remains immutable/auditable.

---

# 3.22 ORDER EDIT BELOW PAID AMOUNT

Scenario:

```text
Order Total = 10,000,000
Paid = 9,000,000
```

Authorized Order Edit lowers total to:

```text
8,000,000
```

System MUST NOT:

```text
rewrite old Payment to 8,000,000
```

Instead:

```text
Payment Status = OVERPAID
Financial Resolution = RESOLUTION_REQUIRED
```

Save is allowed with warning/controlled state.

No automatic refund.

---

# 3.23 OVERPAID

Internal Payment status supports:

```text
OVERPAID
```

and:

```text
Financial Resolution = RESOLUTION_REQUIRED
```

Resolution must be explicit.

The system MUST NOT guess whether to refund, retain, or otherwise resolve money automatically.

---

# 3.24 PAYMENT IS NOT A PRODUCTION GATE

Locked rule:

```text
Payment Status
MUST NOT gate Production
```

Example:

```text
PARTIALLY_PAID
```

does not automatically block:

```text
Printing
Sewing
QC
```

Production follows Production rules.

---

# 3.25 SHIPMENT PAYMENT WARNING

Shipment may warn when money is still outstanding.

But Payment warning is:

```text
warning
not automatic hard block
```

Authorized shipment can proceed.

At shipment confirmation, system records:

```text
outstandingBalanceAtShipment
```

for historical context.

---

# 3.26 ORDER DRAFT RULES

Draft:

```text
no permanent Order Number
editable
deletable under Draft policy
not counted as confirmed sale
no normal Production execution
```

Draft may be autosaved in later UX rules.

---

# 3.27 DRAFT CLEANUP

Inactive Drafts:

```text
15 days
```

Default cleanup rule:

```text
inactive Draft after 15 days
→ auto-delete
```

Later implementation clarification:

```text
inactivity
must use lastMeaningfulUserEditAt
not background autosave time
```

---

# 3.28 ORDER CONFIRM

At Confirm:

```text
Permanent Order Number generated
Snapshots created
Due date established
OrderStatus = CONFIRMED
Production preparation begins
```

Operational production-preparation state:

```text
WAITING_FOR_PRODUCTION_SHEET
```

This is NOT the Order business status.

---

# 3.29 ORDER NUMBER

Permanent Order Number:

```text
generated at Confirm
backend/database transaction-safe
UNIQUE
never reused
```

Draft has no permanent Order Number.

---

# 3.30 CONFIRMED ORDER EDIT

Confirmed Order can be edited only through an authorized controlled flow.

Rules include:

```text
permission required
audit required
historical change trace required
pricing version context preserved
```

The system MUST NOT treat Confirmed Order as a freely editable Draft.

---

# 3.31 CONFIRMED ORDER EDIT + PRICING

Confirmed Order edits use the valid locked pricing context/rules as agreed.

Commercial impact must be recalculated by PRICING.

If price changes:

```text
Order revision
+
Bill revision
```

may be required.

Later document rule makes Bill revision automatic after confirmed commercial Order edit.

---

# 3.32 PRODUCTION-AFFECTING EDIT AFTER PRODUCTION START

If a Confirmed Order change affects Production after Production has already started:

```text
Production Sheet version/resolution required
+
affected department notification
+
audit
```

System MUST NOT silently overwrite current Production instructions.

---

# 3.33 CANCELLED ORDER

CANCELLED represents a real Order that is no longer proceeding normally.

Rules:

```text
excluded from Sales metric
excluded from current demand
historical audit remains
actual production throughput remains
actual payment/refund activity remains
```

No new Shipment should be created for a Cancelled Order.

---

# 3.34 CANCELLED ORDER WITH PAYMENT

A paid/partially paid Order may still become CANCELLED.

Payment history remains.

Financial resolution is handled separately.

The system MUST NOT assume cancellation means:

```text
all payment refunded
or
all money retained
```

unless explicitly resolved.

---

# 3.35 LATER LOCKED CANCELLATION FINANCIAL SETTLEMENT

Later full-audit decision integrated into Phase 3:

```text
Cancel Order
→ FINANCIAL RESOLUTION REQUIRED
```

Authorized financial resolver/ADMIN_PROMAX determines:

```text
Shop Keeps
Refund Due
Additional Amount Due
Reason
```

System MUST NOT guess.

Example:

```text
Original Order   10,000,000
Paid              8,000,000

Shop Keeps        3,000,000
Refund Due        5,000,000
Additional Due            0
```

or:

```text
Shop Keeps        8,000,000
Refund Due                0
Additional Due            0
```

Original Order value remains for audit.

After cancellation, ordinary `OrderTotal - Paid` must NOT be blindly shown as customer debt.

Cancellation settlement becomes the relevant financial resolution truth.

---

# 3.36 VOIDED ORDER

VOIDED is intended for:

```text
error
duplicate
invalid Order
```

where meaningful business activity should not be treated as a normal business Order.

Rule:

```text
Order Number is never reused
```

VOIDED Orders are excluded from normal business KPI.

Void must remain auditable.

---

# 3.37 ORDER COMPLETION

Order becomes:

```text
COMPLETED
```

only when all fulfillment quantity has physically left the shop through valid:

```text
Shipment
or
Pickup
```

Payment does not determine Order completion.

READY does not determine Order completion.

---

# 3.38 SHIPMENT RELATIONSHIP

Final:

```text
1 Order
→ 0..N Shipments
```

Partial shipment is supported.

Shipment is item+size aware.

---

# 3.39 AVAILABLE TO SHIP

Formula:

```text
AvailableToShip
=
ReadyQty
-
AlreadyConfirmedShippedQty
```

Shipment MUST NOT ship more than currently available.

Server must revalidate at Confirm.

---

# 3.40 SHIPMENT STATES

Core shipment states:

```text
DRAFT
CONFIRMED
VOID
```

---

# 3.41 DRAFT SHIPMENT

Draft:

```text
does not count as physically shipped
does not normally reserve quantity
```

Before confirmation:

```text
must revalidate availability
```

This prevents stale drafts from claiming stock/readiness.

---

# 3.42 CONFIRMED SHIPMENT

Confirmed means:

```text
goods physically left the shop
```

Only confirmed Shipment/Pickup contributes to delivery completion.

---

# 3.43 VOID SHIPMENT

VOID is only valid for an invalid record where physical dispatch did NOT happen.

If goods physically left the shop:

```text
MUST NOT void away history
```

This prevents fake reversal of real-world fulfillment.

---

# 3.44 CANCELLED / VOIDED ORDER SHIPMENT RULE

No new Shipment should be created for:

```text
CANCELLED Order
VOIDED Order
```

unless a future explicit special recovery workflow is approved.

---

# 3.45 PAYMENT WARNING ON SHIPMENT

If money is outstanding:

```text
show warning
```

but authorized Shipment may still proceed.

At Confirm:

```text
outstandingBalanceAtShipment
```

is retained.

---

# 3.46 SHIPMENT QR

QR may open Shipment workflow/context.

But:

```text
QR scan
MUST NOT auto-confirm shipment
```

Explicit confirmation is required.

---

# 3.47 USER ROLES

Core roles:

```text
ADMIN_PROMAX
STAFF
```

Role controls authorization level.

---

# 3.48 ROLE ≠ DEPARTMENT

Final rule:

```text
Role
≠ Department
```

Departments:

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

Do not merge role and department into one uncontrolled enum.

---

# 3.49 USER SIGNUP / ACTIVATION

New user signup/creation baseline:

```text
PENDING
```

Admin must:

```text
activate
assign role
assign department
```

before normal operational access.

---

# 3.50 USER STATUS

Core user statuses:

```text
PENDING
ACTIVE
DISABLED
```

---

# 3.51 DISABLED USER

When user is disabled:

```text
sessions MUST be revoked
```

Disabled user must not continue operating with old active sessions.

---

# 3.52 PASSWORD / CREDENTIAL RULE

No user/admin should be able to view another user's current password.

System stores authentication safely via AUTH.

No plain password exposure.

---

# 3.53 FORGOT PASSWORD V1

V1:

```text
No self-service forgot-password flow required
```

Admin reset is used.

Reset must not reveal existing password.

---

# 3.54 CENTRAL PERMISSION MATRIX

Permissions must be centralized.

Examples later include:

```text
OVERRIDE_ORDER_CUSTOMER_GROUP
RESOLVE_PRODUCTION_EXCEPTION
REFUND_PAYMENT
ACTIVATE_PRICING
RESOLVE_CANCELLATION_FINANCE
```

Exact matrix expands later.

Business rule:

```text
Backend permission enforcement required
```

Hiding a UI button alone is insufficient.

---

# 3.55 AT LEAST ONE ADMIN_PROMAX

System MUST preserve:

```text
at least one ACTIVE ADMIN_PROMAX
```

Do not allow a state where all super-admin authority is removed/disabled.

---

# 3.56 ANALYTICS — GENERAL RULE

ANALYTICS is read-only.

It MUST NOT mutate operational data.

All metrics must have one consistent definition.

---

# 3.57 SALES PERIOD

Sales period attribution:

```text
confirmedAt
```

If an Order is confirmed in January, it belongs to January Sales cohort.

---

# 3.58 ORDER EDIT AND SALES PERIOD

If a confirmed Order is edited later:

```text
metric value may update
```

but it remains attributed to the original:

```text
confirmedAt period
```

Example:

```text
Confirmed 20 Jan
Value = 10m

Edited 5 Feb
Value = 12m
```

Sales cohort remains January.

Value follows the final valid confirmed commercial truth according to the locked metric rule.

---

# 3.59 SALES / ORDER VALUE DEFINITION

Later locked decision:

```text
Sales / Order Value
=
Confirmed Order Value
```

It is NOT the same as Cash Received.

Example:

```text
Confirmed Order Value = 10m
Paid = 3m
```

Analytics:

```text
Sales = 10m
Cash Received = 3m
Outstanding = 7m
```

---

# 3.60 PAYMENT ANALYTICS PERIOD

Payment activity is attributed by:

```text
paidAt
```

Refund activity is attributed by:

```text
refundedAt
```

Thus Sales and Cash movement use different date semantics.

---

# 3.61 BEST SELLING DEFINITION

Final naming:

```text
Best Selling
=
purchasedQty
```

Old phrase `Paid Qty` is superseded to avoid confusion with Payment status.

---

# 3.62 MOST PRODUCED DEFINITION

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

# 3.63 CANCELLED ORDER ANALYTICS

CANCELLED Order:

```text
excluded from Sales
excluded from current demand
```

but system retains:

```text
cancellation metrics
actual Payment/Refund activity
actual Production throughput
```

A real production loss/work should not disappear simply because the Order was cancelled.

---

# 3.64 VOIDED ORDER ANALYTICS

VOIDED Orders are excluded from normal business KPI.

They remain auditable.

---

# 3.65 ARCHIVED ORDER ANALYTICS

Valid archived Orders remain included in historical Analytics.

Archive:

```text
≠ exclusion from historical business metrics
```

---

# 3.66 PURGE + ANALYTICS

If detailed historical data is later purged under the controlled policy:

```text
required aggregate/history needed for locked metrics must survive
```

Order number tombstone must survive.

Exact retention architecture is deferred to technical phase.

---

# 3.67 DEPARTMENT WORKLOAD — ACTIVE JOBS

A Production Sheet can be active in multiple departments due to production overlap.

Therefore one PS may count as an active job in multiple department workload views.

Example:

```text
SEWING = IN_PROGRESS
QC = IN_PROGRESS
```

That PS can count in both department views.

---

# 3.68 UNITS IN ACTIVE JOBS

Department workload metric:

```text
Units in Active Jobs
=
sum of full PS quantity
for PS whose relevant stage is IN_PROGRESS
```

This is a workload approximation.

It is NOT exact physical pieces currently in that department.

---

# 3.69 DO NOT SUM DEPARTMENT UNITS GLOBALLY

Because one PS may be active in multiple departments:

```text
Department Units
must NOT be summed
to calculate overall units
```

That would double count.

---

# 3.70 OVERALL UNIQUE ACTIVE PS

Overall organization workload should deduplicate by Production Sheet.

Concept:

```text
Overall Active Jobs
=
unique active PS
```

not:

```text
sum of department job counts
```

---

# 3.71 HISTORICAL OUTSTANDING

Later locked analytics rule:

System must support both:

```text
Current Outstanding
```

and:

```text
Outstanding as-of historical date
```

Example:

```text
31 Dec
Outstanding = 5m
```

Payment on 5 Jan may make Current Outstanding 0, but report for 31 Dec must still show 5m.

The technical event/history model belongs to Phase 6.

---

# 3.72 DEFAULT LEAD TIME

Default:

```text
10 calendar days
```

Configurable.

---

# 3.73 DUE SOON THRESHOLD

Default:

```text
2 days
```

Configurable.

---

# 3.74 LATE RULE

Final:

```text
Late
=
today > dueDate
AND
Order is not fully READY_TO_SHIP
```

If production is fully ready but customer/transport has not yet collected it:

```text
do not classify Production as late
```

---

# 3.75 PRIORITY

```text
NORMAL
URGENT
```

Admin can manually set URGENT.

Customer expedite request MUST NOT automatically set URGENT.

---

# 3.76 PRODUCTION QUEUE

Default queue:

```text
URGENT
→ nearest due date
→ oldest
```

---

# 3.77 AUTO ARCHIVE — COMPLETED ORDERS

Original archive rule was refined by later Phase 5 audit.

Final locked rule:

```text
Order = COMPLETED
+
Payment = PAID
+
Financial Resolution = CLEAR
+
15 days
→ AUTO ARCHIVE
```

If an Order is fully shipped but still unpaid/partially paid:

```text
DO NOT auto archive
```

---

# 3.78 AUTO ARCHIVE — CANCELLED ORDERS

Cancelled Order may become archive-eligible when:

```text
operational issues resolved
+
cancellation financial resolution CLEAR
```

Cancelled Orders do not require ordinary `PAID` in the same way as completed fulfillment Orders because their final obligation is governed by cancellation settlement.

---

# 3.79 AUTO REACTIVATE ARCHIVED ORDER

Later locked rule:

If an Archived Order later develops new financial work that breaks archive eligibility:

```text
ARCHIVED
→ AUTO REACTIVATE
→ ACTIVE
```

Example:

```text
Refund
Financial Resolution Required
```

When resolved again and eligibility conditions are met:

```text
archive timing/rule applies again
```

---

# 3.80 DRAFT CLEANUP SETTING

Default:

```text
15 inactive days
```

Draft cleanup is automatic.

---

# 3.81 ARCHIVE TIMING

Default:

```text
15 days
```

after the Order meets the relevant archive eligibility condition.

Archive is operational storage state.

Archive is not deletion.

---

# 3.82 PURGE RULE

Purge baseline:

```text
minimum 365 archived days
```

Purge is:

```text
MANUAL
CONTROLLED
```

not automatic routine deletion.

---

# 3.83 PURGE AUTHORITY

Purge is restricted to:

```text
ADMIN_PROMAX
```

and requires controlled process.

---

# 3.84 PURGE SAFETY

Purge should require:

```text
preview
reason
explicit confirmation
audit
```

Historical Order Number tombstone remains.

Order Number MUST NOT be reused.

---

# 3.85 ARCHIVE ≠ MONTH ROLLOVER

Archive is based on business lifecycle/eligibility.

Do NOT archive simply because:

```text
month changed
year changed
reporting period ended
```

---

# 3.86 P0 INTEGRITY RULES ARE NOT CONFIGURABLE OFF

Critical integrity/security rules MUST NOT have ordinary admin toggles.

Examples:

```text
server-side validation
unique Order Number
audit/history
permission enforcement
historical snapshots
```

Configurable business settings must not be able to disable foundational integrity.

---

# 3.87 LATER LOCKED CORRECTION — FABRIC PER PART PRICING

Later full Phase 5 audit added a business rule affecting Phase 3 Pricing.

If a Fabric choice for a specific Part can affect customer price:

```text
it MUST be selected before Order Confirm
```

Examples:

```text
Body Fabric
Sleeve Fabric
Cuff Fabric
Collar Fabric
Other Part Fabric
```

Price-affecting Part Fabric selection belongs in Order/POS configuration before Confirm.

Production Sheet inherits the confirmed choices.

---

# 3.88 PART FABRIC SURCHARGE CONFIGURATION

Later locked rule:

```text
ADMIN_PROMAX
can enable/disable fabric surcharge
per Part
through Pricing Version
```

Conceptual configuration:

```text
Body Fabric surcharge       ON/OFF
Sleeve Fabric surcharge     ON/OFF
Cuff Fabric surcharge       ON/OFF
Collar Fabric surcharge     ON/OFF
Other Part surcharge        ON/OFF
```

This belongs to PRICING.

Production does not own the surcharge toggle.

---

# 3.89 MULTIPLE PART SURCHARGES

Later locked rule:

If several Parts have enabled surcharge:

```text
calculate each Part separately
then sum them
```

Example:

```text
Cuff Fabric surcharge    +15,000
Collar Fabric surcharge   +5,000
--------------------------------
Total                     +20,000
```

Do NOT collapse into “charge only once” by default.

---

# 3.90 PART FABRIC CHANGE AFTER CONFIRM

If a price-affecting Part Fabric is changed after Confirm:

```text
Controlled Order Edit
→ Reprice through PRICING
→ Order revision
→ Bill revision
→ PS new version if production context requires
```

Production Sheet MUST NOT silently change customer selling price.

---

# 3.91 INVENTORY / OUT_OF_STOCK AT CONFIRM

Later locked rule affecting Order Confirm:

If a Draft selected Fabric becomes:

```text
OUT_OF_STOCK
```

before Confirm:

```text
BLOCK Confirm
```

User must choose another available Fabric or authorized Admin must correct Inventory status if the status is wrong.

---

# 3.92 ALREADY-CONFIRMED FABRIC BECOMES OUT_OF_STOCK

If Fabric was valid when Order was Confirmed and later Inventory changes to:

```text
OUT_OF_STOCK
```

Production gets:

```text
WARNING
```

The system MUST NOT silently substitute another Fabric.

Production Sheet may continue according to controlled production/business resolution rules.

This keeps historical Order truth intact.

---

# 3.93 PAYMENT RECEIPT VS ORDER BILL

Later document rule affecting Phase 3 finance semantics:

```text
ORDER BILL / INVOICE
≠
PAYMENT RECEIPT
```

Bill/Invoice represents commercial Order value.

Payment Receipt represents individual money movement.

New Payment MUST NOT rewrite Invoice simply to show a new paid amount.

Current balance belongs in Payment Summary.

---

# 3.94 PUBLIC PAYMENT STATUS PROJECTION

Internal:

```text
UNPAID
PARTIALLY_PAID
PAID
OVERPAID
```

Customer/public tracking intentionally simplifies payment visibility.

Internal `OVERPAID + RESOLUTION_REQUIRED` does not need to expose the internal finance issue publicly.

Public may show:

```text
PAID
```

for an internally OVERPAID case.

This is a projection rule, not a change to internal Payment truth.

---

# 3.95 CUSTOMER TRACKING REQUESTS

Later V1 rule:

Customer Tracking can submit:

```text
GENERAL REQUEST
DELIVERY REQUEST
EXPEDITE REQUEST
```

But these requests:

```text
MUST NOT directly mutate
Order
Shipment
Priority
Production
```

Admin review is required.

Structured direct change requests such as:

```text
Change Size
Change Qty
Change Fabric
Change Design
```

are not allowed through public Tracking V1.

---

# 3.96 MULTI-PS CUSTOMER TRACKING

Later locked rule:

If one Order has multiple Production Sheets:

```text
Public Tracking
shows aggregated Order-level production progress
```

It does not need to expose internal PS numbers/batches.

Example:

```text
Order 100 pcs

PS1 40 pcs → QC complete
PS2 60 pcs → Printing
```

Public can show:

```text
Printing        IN PROGRESS
...
QC              PARTIAL
Ready           40 / 100
```

This is a public projection rule.

---


# 3.97 COMMERCIAL DOCUMENT ARCHITECTURE — NEW LOCKED RULE

JAZMINE now separates three document meanings:

```text
QUOTATION
INVOICE
RECEIPT
```

These are controlled Document Types.

They MUST NOT be treated as arbitrary editable document headings.

Business meaning:

```text
QUOTATION
= pre-confirm commercial offer

INVOICE
= confirmed commercial Order document

RECEIPT
= confirmed Payment document
```

---

# 3.98 DOCUMENT TYPE IS NOT FREE-TEXT

User may select an allowed Document Type:

```text
Quotation
Invoice
Receipt
```

but MUST NOT be able to type any arbitrary heading that changes the business meaning of the underlying document.

Invalid examples:

```text
Payment Receipt data
+
user changes title to "Quotation"
```

or:

```text
Quotation data
+
user changes title to "Receipt"
```

The selected Document Type determines:

```text
business meaning
allowed data source
document header
document behavior
```

---

# 3.99 COMMERCIAL STAGE

Commercial Stage is introduced as a separate Order-level business dimension.

Final core values:

```text
NONE
QUOTATION
INVOICE
```

Important:

```text
Commercial Stage
≠ Order Status

Commercial Stage
≠ Payment Status

Commercial Stage
≠ Delivery Status

Commercial Stage
≠ Readiness
```

---

# 3.100 COMMERCIAL STAGE IS TRACKED PER ORDER

Commercial Stage belongs to each Order/Draft.

It MUST NOT be stored as one global Customer status.

Example:

```text
Customer: ABC FC

Order A
CommercialStage = QUOTATION

Order B
CommercialStage = INVOICE

Order C
OrderStatus = COMPLETED
CommercialStage = INVOICE
```

Therefore this is NOT allowed as authoritative truth:

```text
Customer.commercialStage = QUOTATION
```

Customer Profile may only show derived counts/summaries.

---

# 3.101 COMMERCIAL STAGE = NONE

A Draft that has not yet issued a Quotation has:

```text
OrderStatus = DRAFT
CommercialStage = NONE
```

This is the normal working state before any commercial document is issued.

---

# 3.102 QUOTATION BUSINESS RULE

Quotation can be generated from an Order Draft.

Flow:

```text
Order Draft
↓
Server-side validation
↓
Authoritative Pricing calculation
↓
Generate QUOTATION
```

Quotation does NOT:

```text
confirm Order
generate permanent Order Number
authorize Production
prove Payment
```

---

# 3.103 QUOTATION STAGE TRANSITION

When a valid/current Quotation is issued from a Draft:

```text
OrderStatus = DRAFT
CommercialStage = QUOTATION
```

The Draft remains editable according to Draft rules.

---

# 3.104 QUOTATION CAN EXIST WITHOUT PERMANENT ORDER NUMBER

Permanent Order Number is still generated only at Order Confirm.

Therefore:

```text
Draft Order
+
Quotation
```

may exist while:

```text
permanent Order Number = none
```

Quotation must use its own stable document identity/reference.

Exact visible numbering format is deferred.

---

# 3.105 QUOTATION DATA SOURCE

Quotation uses:

```text
Order Draft configuration
+
Customer context
+
Authoritative Pricing Result
+
Promotion result where applicable
```

Quotation MUST NOT trust a client-calculated final price.

---

# 3.106 QUOTATION IS NOT SALES

Quotation does NOT count as:

```text
Confirmed Sales
Confirmed Order Value
Cash Received
Production demand
Shipment demand
```

Quotation is a commercial proposal.

Sales analytics continues to use:

```text
confirmedAt
+
Confirmed Order Value
```

---

# 3.107 QUOTATION EDIT / REISSUE RULE

Once a Quotation has been issued, later Draft edits MUST NOT silently rewrite the already-issued Quotation.

Example:

```text
Quotation v1
Total = 4,500,000
```

Then Draft changes:

```text
Qty / Fabric / Price / Promotion changes
```

The previous issued Quotation remains historical.

To provide the updated proposal:

```text
Generate new Quotation revision / issuance
```

Concept:

```text
Quotation v1 = SUPERSEDED
Quotation v2 = CURRENT
```

The exact visible numbering style is deferred, but history MUST be preserved.

---

# 3.108 ONLY ONE CURRENT QUOTATION PER DRAFT CONTEXT

For normal workflow, one Draft should have one current Quotation revision at a time.

Older Quotation revisions remain historical:

```text
v1 SUPERSEDED
v2 CURRENT
```

---

# 3.109 QUOTATION DOES NOT AUTO-CONFIRM

Customer acceptance or staff agreement does NOT automatically mutate the Order until an authorized Confirm action occurs.

Flow:

```text
Quotation
↓
Customer agrees
↓
Authorized staff reviews
↓
Confirm Order
```

Confirm remains an explicit server-validated action.

---

# 3.110 DIRECT CONFIRM WITHOUT QUOTATION IS ALLOWED

Quotation is available but is not mandatory for every Order.

Valid:

```text
Draft
→ Confirm
→ Invoice
```

Also valid:

```text
Draft
→ Quotation
→ Confirm
→ Invoice
```

---

# 3.111 CONFIRM ORDER → INVOICE

At Order Confirm:

```text
permanent Order Number generated
confirmed snapshots created
OrderStatus = CONFIRMED
CommercialStage = INVOICE
```

The system creates/makes available the current Invoice based on confirmed commercial truth.

---

# 3.112 INVOICE DATA SOURCE

Invoice uses Confirmed Order snapshots:

```text
Customer Snapshot
Product / Component Snapshot
Part Fabric Snapshot
Pricing Snapshot
Promotion Snapshot
Exchange Rate Snapshot where applicable
Order total
```

Invoice MUST NOT rebuild old commercial truth from today's mutable master data.

---

# 3.113 INVOICE IS NOT PAYMENT PROOF

Invoice means:

```text
confirmed commercial amount / charge
```

Invoice does NOT mean:

```text
customer has paid
```

Example:

```text
CommercialStage = INVOICE
PaymentStatus = UNPAID
```

is valid.

---

# 3.114 INVOICE REMAINS COMMERCIAL STAGE AFTER PAYMENT

Recording Payment does not change Commercial Stage to RECEIPT.

Example:

```text
CommercialStage = INVOICE
PaymentStatus = PARTIALLY_PAID
```

After final Payment:

```text
CommercialStage = INVOICE
PaymentStatus = PAID
```

---

# 3.115 RECEIPT BUSINESS RULE

Receipt is generated from a confirmed Payment.

Flow:

```text
Confirmed Payment
↓
Generate / make available RECEIPT
```

Receipt is Payment evidence.

Receipt is NOT Order Commercial Stage.

---

# 3.116 ONE PAYMENT → ONE PAYMENT RECEIPT CONTEXT

Normal rule:

```text
1 confirmed Payment
→ 1 Payment Receipt context
```

An Order may therefore have multiple Receipts.

Example:

```text
Order #1001

Deposit Payment
→ Receipt #1

Additional Payment
→ Receipt #2

Final Payment
→ Receipt #3
```

---

# 3.117 RECEIPT DATA SOURCE

Receipt uses PAYMENT truth:

```text
Payment amount
Payment method
paidAt
Payment reference
Payment identity
Order reference
Customer/Order display context
```

Receipt MUST NOT calculate or rewrite Order commercial price.

---

# 3.118 PAYMENT VOID / CANCEL DOES NOT DELETE HISTORY

If a Payment is later voided/cancelled through the controlled Payment workflow:

```text
Payment history remains
```

Any issued Receipt/history related to that Payment MUST NOT simply disappear.

Exact visual marking such as VOID/CANCELLED is deferred to document layout/technical implementation, but historical traceability is required.

---

# 3.119 REFUND DOES NOT REWRITE ORIGINAL RECEIPT

Refund is a new financial event.

It MUST NOT silently alter the original Payment amount shown by the historical Receipt.

The Payment/Refund history remains auditable.

A dedicated refund-document format is not added in this decision.

---

# 3.120 INVOICE REVISION AFTER CONFIRMED ORDER EDIT

Existing rule remains and is aligned with the explicit INVOICE type.

If confirmed commercial Order truth changes:

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

Old Invoice remains.

---

# 3.121 PAYMENT DOES NOT CREATE INVOICE REVISION

A normal new Payment:

```text
does NOT create new Invoice revision
```

Payment updates:

```text
Payment Summary
Payment Receipt
```

not Invoice commercial data.

---

# 3.122 COMMERCIAL STAGE FILTERING

Orders must be filterable by:

```text
Commercial Stage
```

Core values:

```text
NONE
QUOTATION
INVOICE
```

This filtering is per Order.

---

# 3.123 COMMERCIAL STAGE + PAYMENT STATUS FILTER

Filters can combine:

```text
CommercialStage
+
PaymentStatus
```

Examples:

```text
CommercialStage = INVOICE
PaymentStatus = UNPAID
```

Meaning:

```text
confirmed invoiced Orders with no payment
```

Another:

```text
CommercialStage = INVOICE
PaymentStatus = PARTIALLY_PAID
```

Meaning:

```text
confirmed invoiced Orders still owing money
```

---

# 3.124 COMMERCIAL STAGE + ORDER STATUS FILTER

Filters can combine:

```text
CommercialStage
+
OrderStatus
```

Examples:

```text
CommercialStage = INVOICE
OrderStatus = CONFIRMED
```

→ active confirmed Orders.

```text
CommercialStage = INVOICE
OrderStatus = COMPLETED
```

→ fulfilled historical Orders that still retain Invoice as commercial document context.

---

# 3.125 SERVER-SIDE FILTERING RULE

Commercial-stage filtering MUST follow the existing Search/Filter architecture:

```text
server-side query
pagination
indexes where required
```

Do NOT:

```text
load every Order into frontend
then filter locally
```

Exact database/index implementation belongs to Phase 6.

---

# 3.126 CUSTOMER PROFILE COMMERCIAL SUMMARY

Customer Profile may show derived summaries:

```text
Active Quotations
Active Invoices
Outstanding
```

Example:

```text
Customer: ABC FC

Active Quotations: 1
Active Invoices: 2
```

These are derived from Order/Payment data.

They are NOT Customer-owned truth.

---

# 3.127 QUOTATION / INVOICE COUNTS ARE ORDER-BASED

If one Customer has:

```text
Order A = QUOTATION
Order B = INVOICE
Order C = INVOICE
```

Customer Profile may display:

```text
Active Quotations = 1
Active Invoices = 2
```

The Customer itself does not become “a Quotation customer” or “an Invoice customer.”

---

# 3.128 DOCUMENT SOURCE MATRIX

| Document | Source | Business Meaning | Commercial Stage Effect |
|---|---|---|---|
| QUOTATION | Order Draft + PRICING | Commercial offer | Sets/keeps QUOTATION |
| INVOICE | Confirmed Order Snapshot | Confirmed commercial charge | Sets/keeps INVOICE |
| RECEIPT | Confirmed PAYMENT | Evidence of received payment | No stage change |

---

# 3.129 DOCUMENT HISTORY RULE

Issued documents must preserve historical meaning.

They MUST NOT silently follow:

```text
current Customer profile changes
current Product master changes
current Pricing changes
current Exchange Rate changes
later Payment changes
```

Each document uses appropriate historical/source truth.

---

# 3.130 DOCUMENT NUMBERING BUSINESS PRINCIPLE

Each document family has its own stable identity/reference:

```text
Quotation
Invoice
Receipt
```

Exact numbering patterns are not locked here.

---

# 3.131 DOCUMENT TITLE MUST MATCH TYPE

Rendered title/header follows `DocumentType`.

```text
DocumentType = QUOTATION
→ Header = Quotation

DocumentType = INVOICE
→ Header = Invoice

DocumentType = RECEIPT
→ Header = Receipt
```

Contradictory title/data combinations are prohibited.

---

# 3.132 DOCUMENT PERMISSION

Commercial/payment document generation/issuance must respect centralized permissions.

Locked requirement:

```text
server-side authorization required
```

Exact permission names may be finalized later.

---

# 3.133 TRACKING VISIBILITY REMAINS UNCHANGED

Existing locked rule remains:

```text
Customer Tracking
does NOT expose Bill / Invoice documents
```

The new Quotation/Invoice/Receipt workflow is internal/authorized unless later explicitly changed.

---

# 3.134 ANALYTICS CONSEQUENCE

Quotation is NOT Sales.

Sales remains:

```text
Confirmed Order Value
at confirmedAt
```

Future analytics may report:

```text
Quotation count
Active Invoice count
Quotation conversion
```

only after metric definitions are explicitly locked.

---

# 3.135 COMMERCIAL PIPELINE — FINAL BUSINESS FLOW

```text
Order Draft
↓
CommercialStage = NONE
↓
optional Generate Quotation
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
Payment 1
→ Receipt 1
↓
Payment 2
→ Receipt 2
↓
...
```

Receipt never replaces INVOICE as Commercial Stage.

---

# 3.136 COMMERCIAL PIPELINE — DIRECT CONFIRM FLOW

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

# 3.137 COMMERCIAL PIPELINE — FILTER EXAMPLES

Example 1:

```text
CommercialStage = QUOTATION
```

→ Draft Orders with current Quotation.

Example 2:

```text
CommercialStage = INVOICE
PaymentStatus = UNPAID
```

→ confirmed invoiced Orders with no payment.

Example 3:

```text
CommercialStage = INVOICE
PaymentStatus = PARTIALLY_PAID
```

→ Orders still owing money.

Example 4:

```text
CommercialStage = INVOICE
OrderStatus = COMPLETED
PaymentStatus = PAID
```

→ fulfilled paid historical Orders retaining Invoice commercial context.

---

# 3.138 COMMERCIAL STAGE DOES NOT CHANGE PRODUCTION RULES

Quotation does not authorize Production.

Production still requires Confirmed Order / Production Sheet rules.

Payment status still does not automatically gate Production.

---

# 3.139 COMMERCIAL STAGE DOES NOT CHANGE SHIPMENT RULES

Shipment still follows:

```text
ReadyQty
AvailableToShip
Shipment confirmation
```

Commercial Stage does not replace shipment/readiness rules.

---

# 3.140 COMMERCIAL DOCUMENT ANTI-SPAGHETTI RULES

Forbidden:

```text
Changing only document header text to fake document type
Using Receipt as Order Commercial Stage
Storing one Commercial Stage on Customer
Treating Quotation as confirmed Sales
Treating Invoice as proof of Payment
Rewriting old issued Quotation after Draft changes
Rewriting Invoice after every Payment
Deleting Receipt history when Payment is voided
Duplicating Pricing calculation inside Quotation generator
```

Required:

```text
Quotation uses PRICING result
Invoice uses confirmed ORDER snapshot
Receipt uses PAYMENT truth
Commercial Stage is per Order
Document history is preserved
Filters are server-side
```

---

# 3.97 BUSINESS RULE OWNERSHIP SUMMARY

```text
Component identity
→ PRODUCT

Pricing formula/tables
→ PRICING

Customer default group
→ CUSTOMER

Confirmed Order snapshots
→ ORDER

Payment transactions/refunds
→ PAYMENT

Production stages/readiness
→ PRODUCTION

Shipment/pickup
→ SHIPMENT

User profile/role/department
→ USER

Authentication/session
→ AUTH

Global operational configuration
→ SETTINGS

Analytics metrics
→ ANALYTICS definitions reading owner domains
```

---

# 3.98 ANTI-SPAGHETTI BUSINESS RULES

The following are prohibited:

```text
POS hardcodes price tables
Production calculates selling price
Payment edits Order price
Order rewrites Payment history
Analytics changes Customer Group
Shipment rewrites Production stage
Tracking directly changes Order
Settings duplicates Pricing truth
```

---

# 3.99 FINAL PHASE 3 LOCKED BASELINE

The following represent the final Phase 3 baseline:

```text
Component Master:
COLLAR
FABRIC
SLEEVE
SHOULDER
CUFF
WAIST
SHIRT_BOTTOM

Required manual:
COLLAR
FABRIC
SHOULDER
CUFF

Defaultable:
SLEEVE
WAIST
SHIRT_BOTTOM
Max one active default per type

Used historical components:
disable, do not hard delete

Customer Groups:
RETAIL
AGENT_LEVEL_1..5

New Customer default:
RETAIL

Collar Groups:
A / B / C / D
with locked collar membership

Base KIP pricing:
L1  A70 B85 C85 D85
L2  A75 B90 C90 D95
L3  A85 B100 C100 D105
L4  A80 B95 C95 D100
L5  A90 B105 C105 D110
Retail A110 B120 C130 D140

Agent size add-on:
JS–J2XL 0
XS–XL 0
2XL–3XL +5k
4XL–5XL +10k
6XL–7XL +15k
8XL–10XL +20k

Retail size add-on:
JS–J2XL 0
XS–XL 0
2XL–3XL +10k
4XL–5XL +15k
6XL–7XL +20k
8XL–10XL +25k

Pricing:
Base
+ Size
+ Fabric
+ Sleeve
+ Shoulder
+ Cuff
+ Waist
+ Bottom
+ Future
→ Calculated
→ Promotion
→ Final
→ Snapshot

KIP base currency
USD/THB exchange supported
Exchange Rate Snapshot preserved

Per-order group override:
permission + reason + user + timestamp

Promotion:
BUY_X_GET_Y
PERCENTAGE
FIXED_AMOUNT

Max one each type/order
Cross-type combination configurable
Free units are assigned by item+size
Free units do not recursively create free units
Final price >= 0
Promotion snapshot preserved

Payment:
DEPOSIT
ADDITIONAL
FINAL

No minimum deposit
Normal payment <= remaining
Wrong payment void/cancel with audit
Refund <= eligible net paid
Order edit below paid
→ OVERPAID + RESOLUTION_REQUIRED
No automatic refund
Payment does not gate Production
Shipment payment warning only

Order:
DRAFT
CONFIRMED
COMPLETED
CANCELLED
VOIDED

Draft no permanent number
Draft cleanup 15 inactive days
Confirm generates unique permanent number
Confirmed edits authorized/audited
Production-affecting edits may require PS version
Cancelled excluded Sales/current demand
Voided excluded normal KPI
Completed only when all fulfillment leaves shop

Shipment:
1 Order → 0..N
Partial item+size supported
AvailableToShip = ReadyQty - ConfirmedShippedQty
DRAFT / CONFIRMED / VOID
Only CONFIRMED counts
Actual shipped goods cannot be voided away
Cancelled/Voided Orders cannot create new shipment
Payment warning is not automatic hard block
Record outstandingBalanceAtShipment

Users:
ADMIN_PROMAX
STAFF

Role != Department

Departments:
ADMIN
GRAPHIC
PRINTING
HEAT_TRANSFER
LASER
SIZE_SORTING
SEWING
QC_PACKING

User Status:
PENDING
ACTIVE
DISABLED

Disable revokes sessions
No password exposure
No self-service forgot password required in V1
Admin reset
Central permission matrix
At least one active ADMIN_PROMAX

Analytics:
Sales period = confirmedAt
Sales / Order Value = Confirmed Order Value
Cash movement = Payment/refund dates
Best Selling = purchasedQty
Most Produced = fulfillmentQty
fulfillmentQty = purchasedQty + promotionalFreeQty
Confirmed edit stays in original confirmedAt period
Cancelled excluded Sales/current demand
Voided excluded KPI
Archived valid included
Department workloads may overlap
Do not sum department units globally
Overall active jobs dedupe PS
Historical Outstanding must be supported

Settings:
Default lead = 10 calendar days
Due Soon = 2 days
Late = today > dueDate AND not fully READY_TO_SHIP
Priority NORMAL / URGENT
Customer expedite never auto-URGENT
Queue URGENT → nearest due → oldest
Draft cleanup 15 inactive days
Completed Order archive only when COMPLETED + PAID + CLEAR + 15 days
Cancelled archive only after operational + financial resolution clear
Financial issue on archived Order → auto-reactivate
Purge minimum 365 archived days
Purge manual / controlled / ADMIN_PROMAX
Preview + reason + confirmation + audit
Order number tombstone preserved
Archive != month rollover
P0 integrity rules cannot be toggled off

Later pricing correction:
Price-affecting Part Fabric
must be selected before Confirm

ADMIN_PROMAX can configure
Part Fabric surcharge ON/OFF
through Pricing Version

Multiple enabled Part surcharges
are calculated separately and summed

Price-affecting Part Fabric change after Confirm
→ Controlled Order Edit
→ Reprice
→ Bill Revision
→ PS Version when applicable

Draft Fabric OUT_OF_STOCK before Confirm
→ BLOCK Confirm

Commercial Documents:
QUOTATION
INVOICE
RECEIPT

Document Type is controlled
No free-text header may redefine document meaning

Commercial Stage:
NONE
QUOTATION
INVOICE

Commercial Stage is tracked per Order
not per Customer

Draft Order may issue QUOTATION
Quotation does not Confirm Order
Quotation does not generate permanent Order Number
Quotation is not Sales
Quotation is optional before Confirm

Issued Quotation is historical
Draft edits do not silently rewrite it
Updated proposal creates a new Quotation revision/issuance

Confirm Order
→ CommercialStage = INVOICE

INVOICE uses Confirmed Order snapshots
Invoice is not proof of Payment

Confirmed commercial Order edit
→ Invoice revision

Normal Payment
does not create Invoice revision

Confirmed Payment
→ PAYMENT RECEIPT

One Order may have multiple Receipts
because one Order may have multiple Payments

RECEIPT
≠ Commercial Stage

Receipt/Payment history
must not disappear after controlled void/cancel

Refund does not rewrite original Receipt

Orders can be filtered by:
Commercial Stage
Payment Status
Order Status
Date
Customer

Commercial Stage + Payment Status
can be combined for unpaid/partially-paid Invoice views

Customer Profile may show derived:
Active Quotation count
Active Invoice count
but Customer owns no global Commercial Stage
```

---

# 3.100 PHASE 3 COMPLETION STATUS

```text
PHASE 3
Business Rules

STATUS:
UPDATED + LOCKED BASELINE
```

All later technical architecture MUST preserve these business rules unless an explicit superseding decision is documented.

---

# END OF PHASE 3
