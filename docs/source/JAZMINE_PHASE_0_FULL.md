# JAZMINE — PHASE 0 FULL SPECIFICATION

**Document Type:** Business Architecture / Core Operating Rules  
**System:** JAZMINE Sportswear / Jersey Organization Management System  
**Phase:** PHASE 0  
**Status:** LOCKED BASELINE  
**Language:** Lao + English Technical Terms  
**Purpose:** ເອກະສານນີ້ເປັນສະບັບເຕັມຂອງ PHASE 0 ທີ່ກຳນົດ Business Architecture, Core Rules, Production Flow, Order Lifecycle, Readiness, Shipment Completion, Exception Handling, Versioning ແລະ Anti-Spaghetti Principles ຂອງລະບົບ JAZMINE.

> ຫຼັກສຳຄັນ: ຖ້າມີ Rule ເກົ່າໃດຂັດກັບ Rule ທີ່ລະບຸວ່າ **SUPERSEDED / FINAL / LOCKED** ໃນເອກະສານນີ້ ໃຫ້ໃຊ້ Rule ທີ່ລະບຸວ່າ FINAL/LOCKED ເປັນຫຼັກ.

---

# 0.1 CORE SYSTEM PRINCIPLES

PHASE 0 ວາງຫຼັກສຳຄັນເພື່ອປ້ອງກັນ Spaghetti Logic ແລະ Business Rule ຊ້ຳກັນ.

```text
1 Business Rule = 1 Owner
1 Metric = 1 Definition
1 State Change = Server-side Validation
Shared Feature ≠ Business Data Owner
Historical Data MUST NOT be silently rewritten
Stable IDs, not mutable names
Snapshots preserve historical truth
Central Permission Matrix
Central Metric Definitions
No duplicate pricing/status/analytics logic
```

## 0.1.1 One Business Rule = One Owner

Business Rule ແຕ່ລະຢ່າງຕ້ອງມີ Owner ຊັດເຈນ.

ຕົວຢ່າງ:

```text
Pricing Rule
→ Pricing owns it

Production Stage Rule
→ Production owns it

Payment Rule
→ Payment owns it

Shipment Rule
→ Shipment owns it
```

ຫ້າມໃຫ້ UI, POS, Document Generator ຫຼື Analytics ຄິດ Business Rule ຊ້ຳຂຶ້ນມາເອງ.

---

## 0.1.2 One Metric = One Definition

Metric ດຽວກັນຕ້ອງມີ Definition ດຽວ.

ຕົວຢ່າງ:

```text
ReadyQty
Sales
Outstanding
Best Selling
Most Produced
```

ຫ້າມ Dashboard, Customer Profile, Analytics, Report ຄຳນວນຄົນລະສູດ.

---

## 0.1.3 One State Change = Server-side Validation

ທຸກ State Change ທີ່ສຳຄັນຕ້ອງກວດດ້ວຍ Server.

Frontend validation ເປັນ UX ເທົ່ານັ້ນ.

```text
Frontend says "allowed"
≠ authoritative truth

Server validates
= authoritative truth
```

---

## 0.1.4 Historical Data MUST NOT Be Silently Rewritten

ຫຼັງຈາກ Order Confirm ແລ້ວ Historical Data ທີ່ຖືກ Snapshot ໄວ້ຕ້ອງຄົງຢູ່.

ຕົວຢ່າງ:

```text
Customer Name changes later
Fabric Master changes later
Pricing changes later
Exchange Rate changes later
Promotion changes later
```

ຫ້າມເຮັດໃຫ້ Confirmed Historical Order ປ່ຽນຕາມ Master Data ໃໝ່ໂດຍອັດຕະໂນມັດ.

---

# 0.2 ORDER / PRODUCTION CORE ARCHITECTURE

Final architecture:

```text
1 Order
→ 1..N Production Sheets
```

Order 1 ໃບສາມາດມີ Production Sheet ຫຼາຍກວ່າ 1 ໃບ.

ເຫດຜົນ:

- ແບ່ງ Batch ການຜະລິດ
- ແບ່ງຂະໜາດ
- ແບ່ງການສົ່ງ
- Partial readiness
- Partial shipment
- Production version / rework
- ຫຼຸດການບັງຄັບຕິດຕາມ quantity ທຸກ stage

Production Sheet ແມ່ນ Production execution unit.

Order ແມ່ນ Commercial/Fulfillment aggregate.

---

# 0.3 DESIGN WORK BEFORE PRODUCTION

Design/Graphic work ກ່ອນ Customer approve ບໍ່ແມ່ນ Production Stage.

Final concept:

```text
Admin / Customer / Graphic
handle design work outside production tracking
↓
Customer approves
↓
Admin creates / prices / confirms Order
↓
Production workflow starts
```

ດັ່ງນັ້ນ Pre-confirm design iteration ບໍ່ຄວນຖືກນັບເປັນ Production workload stage.

---

# 0.4 CONFIRM → PRODUCTION PREPARATION FLOW

Final production preparation flow:

```text
Admin/customer/Graphic handle design outside production tracking
→ customer approves
→ Admin creates/prices/confirms Order
→ WAITING_FOR_PRODUCTION_SHEET
→ Production Sheet Preparation
→ PS READY
→ PRINTING
→ HEAT_TRANSFER
→ LASER
→ SIZE_SORTING
→ SEWING
→ QC
→ READY_TO_SHIP
```

Important correction:

```text
WAITING_FOR_GRAPHIC
```

ເປັນ Rule ເກົ່າ ແລະຖືກ SUPERSEDED.

Final term:

```text
WAITING_FOR_PRODUCTION_SHEET
```

ເພາະ Design approval ຄວນຈົບກ່ອນ Confirm.

---

# 0.5 PRODUCTION SHEET PREPARATION IS A GATE

Production Sheet Preparation ເປັນ Gate ກ່ອນ Physical Production.

ມັນບໍ່ແມ່ນ Physical Stage ແບບ Printing/Sewing.

Rule:

```text
Printing MUST NOT start
until Production Sheet is READY
```

Production Sheet Preparation ຈຶ່ງມີຫນ້າທີ່:

- ຈັດຂໍ້ມູນ Production
- ຮູບ Production Part
- Fabric / Material
- Size / Qty
- Notes
- Approved Mockup reference
- Production instructions
- Version

---

# 0.6 PHYSICAL PRODUCTION STAGES

Final physical stages:

```text
PRINTING
HEAT_TRANSFER
LASER
SIZE_SORTING
SEWING
QC
```

Production Preparation ບໍ່ຢູ່ໃນກຸ່ມນີ້.

READY_TO_SHIP ເປັນ Readiness result, ບໍ່ແມ່ນ Physical workstation stage.

---

# 0.7 PER-STAGE STATE MODEL

ທຸກ Physical Stage ມີ State ຂອງຕົນເອງ:

```text
NOT_STARTED
IN_PROGRESS
COMPLETED
```

Basic actions:

```text
Start
Complete
```

ບໍ່ໃຊ້ CurrentStage ຕົວດຽວເພື່ອອະທິບາຍ Production ທັງໝົດ.

---

# 0.8 OVERLAP / HANDOFF RULES

Production ຂອງ JAZMINE ຮອງຮັບ Stage overlap.

ຕົວຢ່າງ:

```text
HEAT_TRANSFER = IN_PROGRESS
LASER = IN_PROGRESS
```

ສາມາດເກີດພ້ອມກັນ.

## 0.8.1 START Rule

Next Physical Stage ສາມາດ START ໄດ້ ເມື່ອ immediate previous stage:

```text
IN_PROGRESS
or
COMPLETED
```

ຕົວຢ່າງ:

```text
HEAT_TRANSFER = IN_PROGRESS
→ LASER may START
```

---

## 0.8.2 COMPLETE Rule

Next Physical Stage ຫ້າມ COMPLETE ຈົນກວ່າ immediate previous stage:

```text
COMPLETED
```

ຕົວຢ່າງ:

```text
HEAT_TRANSFER = IN_PROGRESS
LASER = IN_PROGRESS

LASER cannot COMPLETE yet
```

ເມື່ອ:

```text
HEAT_TRANSFER = COMPLETED
```

LASER ຈຶ່ງສາມາດ COMPLETE ໄດ້.

---

## 0.8.3 No Skip Rule

ບໍ່ສາມາດ Skip Stage.

ຕົວຢ່າງ:

```text
PRINTING = NOT_STARTED
```

ບໍ່ສາມາດໄປ START LASER ໄດ້.

ສຳລັບ Stage ທີ່ຈະ START:

```text
Immediate Previous Stage
MUST be IN_PROGRESS or COMPLETED
```

---

# 0.9 MULTIPLE ACTIVE STAGES

Production Sheet 1 ໃບສາມາດມີຫຼາຍ Stage:

```text
IN_PROGRESS
```

ພ້ອມກັນ.

ຕົວຢ່າງ:

```text
HEAT_TRANSFER  IN_PROGRESS
LASER          IN_PROGRESS
SIZE_SORTING   IN_PROGRESS
```

ໄດ້ ຖ້າ Handoff rules ຖືກຕ້ອງ.

---

# 0.10 latestReachedStage

System ສາມາດມີ:

```text
latestReachedStage
```

Definition:

```text
latestReachedStage
= furthest stage that has started
```

Important:

```text
latestReachedStage
≠ proof all pieces are physically at that stage
```

ຕົວຢ່າງ:

```text
SEWING = IN_PROGRESS
QC = IN_PROGRESS
```

latestReachedStage:

```text
QC
```

ແຕ່ບໍ່ໝາຍຄວາມວ່າທຸກໂຕຢູ່ QC.

---

# 0.11 SEWING / QC OVERLAP

Sewing ບໍ່ຖືກປິດອັດຕະໂນມັດເມື່ອ QC ເລີ່ມ.

Example:

```text
SEWING = IN_PROGRESS
QC = IN_PROGRESS
```

This is valid.

SEWING remains active until explicitly:

```text
SEWING = COMPLETED
```

---

# 0.12 NORMAL QUANTITY TRACKING POLICY

Final rule:

```text
NO normal per-stage
receivedQty
completedQty
remainingQty
```

ສຳລັບທຸກ Production Stage.

ເຫດຜົນ:

- complexity ສູງ
- data entry ຫຼາຍ
- worker ຈະຕ້ອງນັບທຸກ handoff
- quantity ອາດບໍ່ຖືກ
- ເຮັດ system ກາຍເປັນ micro-tracking ທີ່ໜັກ

Final design:

```text
Production Sheet allocation
+
Stage status
```

ເປັນ normal operational model.

---

# 0.13 HOW TO REPRESENT INDEPENDENT BATCH READINESS

ຖ້າສິນຄ້າບາງ Batch ຕ້ອງ Ready ແຍກຈາກກັນ ບໍ່ຄວນໃຊ້ per-stage quantity tracking.

ໃຊ້:

```text
Multiple Production Sheets
```

Example:

```text
Order 100 pcs

PS-001 = 40 pcs
PS-002 = 60 pcs
```

PS-001 ສາມາດ Ready ກ່ອນ PS-002.

---

# 0.14 READY QUANTITY — NORMAL CASE

Normal case:

```text
QC = IN_PROGRESS
→ ReadyQty contribution = 0
```

ຖ້າ:

```text
QC = COMPLETED
```

Production Sheet allocation ທີ່ usable ຈຶ່ງ contribute ເຂົ້າ ReadyQty.

Concept:

```text
ReadyQty
=
sum of usable allocation from eligible QC-completed Production Sheets
subject to exception rules
```

---

# 0.15 PARTIAL READY

Partial readiness ບໍ່ຕ້ອງອາໄສ per-stage quantity tracking.

Example:

```text
Order = 100

PS-001 = 40
QC COMPLETED

PS-002 = 60
PRINTING IN_PROGRESS
```

Result:

```text
ReadyQty = 40
Readiness = PARTIALLY_READY
```

ເມື່ອທັງໝົດ Ready:

```text
Readiness = READY_TO_SHIP
```

---

# 0.16 STOP & RESOLVE — PRODUCTION EXCEPTION MODEL

Normal Production ບໍ່ເກັບ Qty ລະອຽດທຸກ Stage.

ແຕ່ເມື່ອເກີດ Exception ຈິງ ລະບົບສາມາດເຂົ້າ:

```text
STOP & RESOLVE
```

Exception case ສາມາດຕິດຕາມ exact quantities ເຊັ່ນ:

```text
Allocated
Usable
Scrap / Unusable
Unstarted
Release
Replacement
```

---

# 0.17 WORKER VS RESOLVER RESPONSIBILITY

Worker / Department staff:

```text
REPORT
STOP
FLAG
```

ພະນັກງານ Production ບໍ່ຄວນປ່ຽນ Business quantities ຂັ້ນສຸດທ້າຍເອງ.

Resolver:

```text
ADMIN_PROMAX
or
permission RESOLVE_PRODUCTION_EXCEPTION
```

ເປັນຜູ້ resolve.

---

# 0.18 USABLE ≠ AUTOMATICALLY READY

Important rule:

```text
Usable
≠ Ready
```

ສິນຄ້າ usable ຍັງຕ້ອງຜ່ານ Readiness/QC rule.

ດັ່ງນັ້ນ Exception Resolution ບໍ່ສາມາດ bypass QC ໂດຍອັດຕະໂນມັດ.

---

# 0.19 ORDER BUSINESS STATUS

Final Order business statuses:

```text
DRAFT
CONFIRMED
COMPLETED
CANCELLED
VOIDED
```

Important:

```text
WAITING_FOR_PRODUCTION_SHEET
```

ບໍ່ແມ່ນ Order business status.

ມັນເປັນ Production Preparation / Operational status.

---

# 0.20 STORAGE STATUS

Storage dimension ແຍກຈາກ Order business status:

```text
ACTIVE
ARCHIVED
```

ຕົວຢ່າງ:

```text
Order Status = COMPLETED
Storage Status = ACTIVE
```

ແລ້ວພາຍຫຼັງ:

```text
Storage Status = ARCHIVED
```

---

# 0.21 READINESS STATUS

Readiness dimension:

```text
NOT_READY
PARTIALLY_READY
READY_TO_SHIP
```

Readiness ບໍ່ແມ່ນ Order Status.

---

# 0.22 DELIVERY STATUS

Delivery dimension:

```text
NOT_SHIPPED
PARTIALLY_SHIPPED
COMPLETED
```

Delivery ບໍ່ແມ່ນ Readiness ແລະບໍ່ແມ່ນ Payment.

---

# 0.23 PAYMENT STATUS

Payment dimension:

```text
UNPAID
PARTIALLY_PAID
PAID
OVERPAID
```

Payment Status ແຍກຈາກ Order lifecycle.

---

# 0.24 FINANCIAL RESOLUTION STATUS

Financial resolution dimension:

```text
CLEAR
RESOLUTION_REQUIRED
```

ຕົວຢ່າງ:

```text
Payment = OVERPAID
Financial Resolution = RESOLUTION_REQUIRED
```

---

# 0.25 MULTI-DIMENSION STATUS MODEL

Final concept:

```text
Order Status
Payment Status
Financial Resolution
Readiness
Delivery Status
Storage Status
Production Status
```

ສາມາດຢູ່ພ້ອມກັນ.

Example:

```text
Order              CONFIRMED
Payment            PARTIALLY_PAID
Financial          CLEAR
Readiness          PARTIALLY_READY
Delivery           PARTIALLY_SHIPPED
Storage            ACTIVE
```

Valid.

ຫ້າມສ້າງ giant single `status` field ໃຫ້ຄອບຄຸມທຸກຢ່າງ.

---

# 0.26 ORDER COMPLETION DEFINITION

Final definition:

```text
Order COMPLETED
ONLY when all fulfillment quantity
has physically left the shop
through valid Shipment / Pickup
```

ດັ່ງນັ້ນ:

```text
READY_TO_SHIP
≠ COMPLETED
```

ແລະ:

```text
PAID
≠ COMPLETED
```

Order completion ແມ່ນ fulfillment completion.

---

# 0.27 PICKUP COUNTS AS FULFILLMENT

Customer Pickup ຖືກນັບເປັນ goods physically leaving shop.

ດັ່ງນັ້ນ Pickup ທີ່ Confirmed ມີຜົນເທົ່າກັບ valid Shipment ໃນ Order completion calculation.

---

# 0.28 FULFILLMENT QUANTITY

Final naming after later correction:

```text
purchasedQty
```

ແທນຄຳວ່າ:

```text
Paid Qty
```

ເພາະ `Paid Qty` ສັບສົນກັບ Payment.

Formula:

```text
fulfillmentQty
=
purchasedQty
+
promotionalFreeQty
```

Production allocation ແລະ Shipment completion ຕ້ອງອີງ fulfillmentQty.

---

# 0.29 PRODUCTION SHEET ALLOCATION RULE

For each:

```text
OrderItem + Size
```

sum of active Production Sheet allocations:

```text
MUST NOT exceed fulfillmentQty
```

Formula:

```text
ActivePSAllocation(OrderItem, Size)
<=
FulfillmentQty(OrderItem, Size)
```

Example:

```text
Size M fulfillmentQty = 30

PS1 = 20
PS2 = 10
```

Valid.

```text
PS1 = 20
PS2 = 15
```

Invalid.

---

# 0.30 LATE ORDER RULE

Default:

```text
Late
=
today > dueDate
AND
Order is not fully READY_TO_SHIP
```

Important:

Order ອາດຍັງບໍ່ Shipped ແຕ່ຖ້າ fully Ready ແລ້ວ ບໍ່ຄວນນັບວ່າ Production late.

---

# 0.31 DEFAULT DUE DATE

Default lead time:

```text
10 calendar days
```

Configurable.

Due Date ຖືກກຳນົດຈາກ Order Confirm process ຕາມ Business settings.

---

# 0.32 DUE SOON

Default:

```text
Due Soon = within 2 days
```

Configurable.

Due Soon ເປັນ operational warning.

---

# 0.33 PRIORITY

Priority:

```text
NORMAL
URGENT
```

Admin ສາມາດ set URGENT ແບບ manual.

Customer expedite request:

```text
MUST NOT automatically set URGENT
```

Customer request ຕ້ອງ Admin review.

---

# 0.34 PRODUCTION QUEUE ORDER

Final default queue:

```text
1. URGENT
2. Nearest Due Date
3. Oldest
```

Meaning:

- URGENT ຂຶ້ນກ່ອນ
- ໃນ priority ດຽວກັນ ເອົາ due date ໃກ້ສຸດກ່ອນ
- ຖ້າ due date ເທົ່າກັນ ເອົາ oldest ກ່ອນ

---

# 0.35 PRODUCTION SHEET VERSIONING

Production Sheet supports:

```text
v1
v2
v3
...
```

Old versions MUST be retained.

A version can be:

```text
CURRENT
SUPERSEDED
```

Versioning records:

```text
version number
reason
createdBy
createdAt
```

---

# 0.36 WHEN NEW PS VERSION IS REQUIRED

If finalized Production Sheet changes after meaningful production work begins:

```text
Create New Version
```

Do NOT overwrite previous Production Sheet silently.

---

# 0.37 PRODUCTION-STARTED CHANGE RULE

If new PS version is created after production already started:

```text
Affected departments MUST be notified
```

ຈຸດປະສົງແມ່ນປ້ອງກັນ Department ເຮັດຕາມ v1 ໃນຂະນະທີ່ v2 ຖືກປ່ຽນແລ້ວ.

---

# 0.38 DO NOT ERASE WORK HISTORY

New PS Version:

```text
MUST NOT erase:
- work history
- stage history
- exception history
- scrap history
- audit history
```

Historical execution remains tied to the relevant version/context.

---

# 0.39 ORDER NUMBER GENERATION

Permanent Order Number is generated:

```text
at Confirm
```

not at Draft creation.

Draft:

```text
NO permanent Order Number
```

Confirmed Order:

```text
Backend / Database generates permanent Order Number
```

---

# 0.40 ORDER NUMBER REQUIREMENTS

Order number generation MUST be:

```text
Transaction-safe
Unique
Concurrency-safe
```

Database-level uniqueness required.

Two admins confirming at nearly the same time MUST NOT receive the same Order Number.

---

# 0.41 ORDER NUMBER NEVER REUSED

Once a permanent Order Number has existed:

```text
NEVER reuse it
```

This remains true even if Order becomes:

```text
CANCELLED
VOIDED
ARCHIVED
PURGED
```

Historical number identity remains protected.

---

# 0.42 DRAFT VS CONFIRMED

DRAFT:

- no permanent Order Number
- editable
- deletable under Draft rules
- not counted as confirmed sale
- Production Sheet should not start normal Production execution
- not final commercial truth

CONFIRMED:

- permanent Order Number generated
- confirmed snapshots created
- Order becomes business-active
- Production preparation may begin
- historical commercial truth must be preserved

---

# 0.43 WAITING_FOR_PRODUCTION_SHEET — FINAL POSITION

After Order Confirm:

```text
OrderStatus = CONFIRMED
```

Operational / production preparation state:

```text
WAITING_FOR_PRODUCTION_SHEET
```

This distinction is FINAL.

Do NOT create:

```text
OrderStatus = WAITING_FOR_PRODUCTION_SHEET
```

---

# 0.44 READY_TO_SHIP — FINAL POSITION

`READY_TO_SHIP` is a readiness outcome.

It is not:

- Order business status
- Production physical stage
- Shipment completion

Example:

```text
OrderStatus = CONFIRMED
Readiness = READY_TO_SHIP
Delivery = NOT_SHIPPED
```

Valid.

---

# 0.45 BUSINESS FLOW EXAMPLE — ONE PRODUCTION SHEET

```text
Order confirmed
↓
WAITING_FOR_PRODUCTION_SHEET
↓
PS v1 prepared
↓
PS READY
↓
PRINTING START
↓
PRINTING COMPLETE
↓
HEAT_TRANSFER START
↓
LASER may START while HEAT_TRANSFER is IN_PROGRESS
↓
HEAT_TRANSFER COMPLETE
↓
LASER COMPLETE
↓
SIZE_SORTING
↓
SEWING
↓
QC
↓
QC COMPLETE
↓
ReadyQty = full usable PS allocation
↓
Shipment / Pickup Confirmed
↓
All fulfillment leaves shop
↓
Order COMPLETED
```

---

# 0.46 BUSINESS FLOW EXAMPLE — MULTIPLE PRODUCTION SHEETS

Order:

```text
100 pcs
```

Production Sheets:

```text
PS-001 = 40
PS-002 = 60
```

PS-001:

```text
QC COMPLETED
```

PS-002:

```text
PRINTING IN_PROGRESS
```

Result:

```text
ReadyQty = 40
Readiness = PARTIALLY_READY
OrderStatus = CONFIRMED
```

Shipment 1:

```text
40 pcs leave shop
```

Result:

```text
Delivery = PARTIALLY_SHIPPED
OrderStatus = CONFIRMED
```

Later PS-002 completes QC:

```text
ReadyQty remaining = 60
```

Shipment 2:

```text
60 pcs leave shop
```

Total shipped:

```text
100 / 100
```

Result:

```text
Delivery = COMPLETED
OrderStatus = COMPLETED
```

---

# 0.47 BUSINESS FLOW EXAMPLE — OVERLAPPING STAGES

```text
PRINTING = COMPLETED
HEAT_TRANSFER = IN_PROGRESS
LASER = IN_PROGRESS
SIZE_SORTING = IN_PROGRESS
```

This can be valid.

But:

```text
LASER cannot COMPLETE
until HEAT_TRANSFER = COMPLETED
```

and:

```text
SIZE_SORTING cannot COMPLETE
until LASER = COMPLETED
```

Start may overlap.

Completion dependency still preserves sequence integrity.

---

# 0.48 BUSINESS FLOW EXAMPLE — EXCEPTION

PS allocation:

```text
100 pcs
```

Issue found:

```text
5 pcs unusable
```

Worker:

```text
REPORT
STOP
FLAG
```

Resolver reviews.

Possible resolution data:

```text
Allocated = 100
Usable = 95
Scrap = 5
Replacement = 5
```

Important:

```text
Usable 95
≠ automatically Ready 95
```

Readiness still follows QC rules.

---

# 0.49 PRODUCTION HISTORY MUST BE AUDITABLE

System must preserve enough history to answer:

- Who started stage?
- When?
- Who completed stage?
- Which PS version?
- Was there an exception?
- Who resolved it?
- Was a later PS version created?
- Why?

Exact Database implementation belongs to later Technical Architecture, but the Business requirement is established in PHASE 0.

---

# 0.50 SEPARATION OF BUSINESS TRUTH

PHASE 0 establishes that these concepts must not be collapsed:

```text
Order confirmed
≠ Paid

Paid
≠ Ready

Ready
≠ Shipped

Shipped
≠ Archived

Production latest stage
≠ all pieces at that stage
```

---

# 0.51 CUSTOMER EXPEDITE DOES NOT MUTATE PRIORITY DIRECTLY

Even if later Customer Tracking allows:

```text
EXPEDITE REQUEST
```

the request is not equivalent to:

```text
Priority = URGENT
```

Admin/authorized workflow must decide.

This preserves Phase 0 priority ownership.

---

# 0.52 PRODUCTION SHEET AS BATCH / EXECUTION BOUNDARY

Production Sheet should be used when:

- a subset needs independent progress
- a subset needs independent readiness
- a subset needs separate version/instruction
- a subset may ship separately
- production timing differs materially

Do NOT create per-stage quantity tracking merely to simulate separate batches.

---

# 0.53 ALLOCATION MUST FOLLOW ORDER FULFILLMENT TRUTH

Production is not allowed to invent quantity beyond confirmed fulfillment.

Example:

```text
Order Item Size L
purchasedQty = 20
promotionalFreeQty = 5
fulfillmentQty = 25
```

Active PS allocations for Size L:

```text
must be <= 25
```

Production cannot allocate 30 unless Order is legitimately revised first.

---

# 0.54 PROMOTIONAL FREE UNITS ARE REAL FULFILLMENT

Promotional free units:

```text
price = 0 for promotional unit
```

but operationally:

```text
must be produced
must be allocated
must be shipped/picked up
must count toward Order completion
```

Therefore they are included in:

```text
fulfillmentQty
```

---

# 0.55 VOIDED VS CANCELLED — CORE DISTINCTION

CANCELLED:

- represents a real Order that was valid but later cancelled
- may already have payments
- may already have production activity
- history must remain
- may require financial resolution

VOIDED:

- intended for error / duplicate / invalid record where meaningful business activity should not be treated as real business
- Order number is still never reused
- remains auditable

Exact finance rules are expanded in later phases, but this distinction is part of the core lifecycle.

---

# 0.56 ARCHIVE IS NOT DELETE

```text
ARCHIVED
≠ DELETED
```

Archived Order remains historical business data.

It may still be searchable according to later Search rules.

Archive is a storage/operational visibility dimension, not an erasure of business truth.

---

# 0.57 FINAL PHASE 0 STATE MODEL SUMMARY

A normal confirmed Order may simultaneously have:

```text
OrderStatus:
CONFIRMED

ProductionPreparation:
WAITING_FOR_PRODUCTION_SHEET

PaymentStatus:
PARTIALLY_PAID

FinancialResolution:
CLEAR

Readiness:
NOT_READY

DeliveryStatus:
NOT_SHIPPED

StorageStatus:
ACTIVE
```

Later:

```text
OrderStatus:
CONFIRMED

Production:
multiple stages IN_PROGRESS

Readiness:
PARTIALLY_READY

Delivery:
PARTIALLY_SHIPPED
```

Finally:

```text
OrderStatus:
COMPLETED

Delivery:
COMPLETED
```

Payment may still be:

```text
PARTIALLY_PAID
```

because Order completion and Payment are independent dimensions.

---

# 0.58 FINAL ANTI-SPAGHETTI CHECK

PHASE 0 requires future phases to preserve these boundaries:

```text
Order owns Order lifecycle
Production owns Production execution
Payment owns money movement
Shipment owns goods leaving shop
Pricing owns price rules
Analytics reads business truth
Documents render business truth
Tracking projects limited business truth
```

No shared service should silently become Business Data Owner.

---

# 0.59 FINAL LOCKED PHASE 0 RULES

The following are FINAL/LOCKED baseline rules:

```text
1 Order → 1..N Production Sheets

Pre-confirm design work
is outside Production stage tracking

WAITING_FOR_GRAPHIC
is superseded by
WAITING_FOR_PRODUCTION_SHEET

Production Sheet Preparation
is a gate before physical Production

Physical stages:
PRINTING
HEAT_TRANSFER
LASER
SIZE_SORTING
SEWING
QC

Each physical stage:
NOT_STARTED
IN_PROGRESS
COMPLETED

Next stage may START
when previous is IN_PROGRESS or COMPLETED

Next stage may COMPLETE
only when previous is COMPLETED

No stage skipping

Multiple stages may be IN_PROGRESS

latestReachedStage
= furthest started stage
not proof all pieces are there

Sewing remains active
until explicitly completed
even if QC has started

No normal per-stage
received/completed/remaining quantity tracking

Use multiple PS
for independently progressing batches

QC IN_PROGRESS
→ no normal Ready contribution

QC COMPLETED
→ usable allocation may contribute Ready

Production exceptions
use STOP & RESOLVE

Exception quantities may include:
Allocated
Usable
Scrap/Unusable
Unstarted
Release
Replacement

Worker reports/stops/flags
Authorized resolver resolves

Usable ≠ automatically Ready

Order statuses:
DRAFT
CONFIRMED
COMPLETED
CANCELLED
VOIDED

Storage:
ACTIVE
ARCHIVED

Readiness:
NOT_READY
PARTIALLY_READY
READY_TO_SHIP

Delivery:
NOT_SHIPPED
PARTIALLY_SHIPPED
COMPLETED

Payment:
UNPAID
PARTIALLY_PAID
PAID
OVERPAID

Financial Resolution:
CLEAR
RESOLUTION_REQUIRED

Order COMPLETED
only when all fulfillment physically leaves shop

Default lead time:
10 calendar days

Due Soon:
2 days

Late:
today > dueDate
AND not fully READY_TO_SHIP

Priority:
NORMAL
URGENT

Customer expedite
never auto-sets URGENT

Queue:
URGENT
→ nearest due
→ oldest

Active PS allocation
must not exceed fulfillmentQty

fulfillmentQty
=
purchasedQty
+
promotionalFreeQty

PS supports versioning:
v1, v2, v3...

Old PS versions are retained

Meaningful change after Production starts
requires version/audit/affected-department notification

New PS version
must not erase previous work/scrap/history

Permanent Order Number
generated at Confirm

Draft has no permanent Order Number

Order Number generation
must be backend/database transaction-safe and UNIQUE

Order Number
is never reused
```

---

# 0.60 PHASE 0 COMPLETION STATUS

```text
PHASE 0
Business Architecture / Core Operating Model

STATUS:
LOCKED BASELINE
```

PHASE 0 establishes the operational truth that later phases must build on.

Later phases may add detail such as:

- Domain contracts
- Pricing rules
- Payment workflows
- Tracking
- Analytics
- Admin configuration
- API
- Database
- Security
- UI

but they MUST NOT violate the locked Phase 0 principles unless an explicit superseding business decision is approved and documented.

---

# END OF PHASE 0
