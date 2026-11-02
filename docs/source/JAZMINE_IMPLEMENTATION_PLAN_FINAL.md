# JAZMINE — IMPLEMENTATION PLAN — FINAL

**System:** JAZMINE Sportswear / Jersey Organization Management System  
**Document Type:** Post-Phase-6 Implementation Blueprint  
**Status:** FINAL LOCKED  
**Important:** This is NOT Phase 7. Official roadmap ends at Phase 6.

---

# 0. IMPLEMENTATION PRINCIPLE

Implementation must follow the locked specifications.

Do NOT:

```text
change Business Rules for coding convenience
move Domain ownership
duplicate Pricing logic
duplicate Production truth
duplicate Analytics formulas
trust Frontend state for critical mutation
silently overwrite historical snapshots
```

If implementation uncovers a true business conflict:

```text
STOP
surface conflict
obtain explicit decision
then continue
```

---

# I0 — REPOSITORY + FOUNDATION

Repository:

```text
1 Git repository
```

Structure:

```text
jazmine/
├─ apps/
│  ├─ web/
│  ├─ server/
│  └─ worker/
├─ packages/
│  ├─ contracts/
│  ├─ ui/
│  └─ config/
├─ database/
│  ├─ migrations/
│  └─ seeds/
├─ tests/
│  ├─ integration/
│  └─ e2e/
└─ docs/
```

Backend modules:

```text
customer
product
inventory
pricing
order
production
payment
shipment
user
auth
tracking
analytics
```

Each module:

```text
domain/
application/
infrastructure/
http/
```

Dependency:

```text
HTTP
→ Application
→ Domain

Infrastructure
→ implements ports
```

Foundation:

```text
TypeScript strict
ESLint
Prettier
environment validation
central error model
structured logging
correlation/request ID
health endpoint
Docker
CI
```

CI gate:

```text
Type Check
→ Lint
→ Unit Tests
→ Integration Tests
→ Build
```

Fail:

```text
NO DEPLOY
```

I0 acceptance:

```text
Web boots
Server boots
Worker boots
PostgreSQL connection works
Environment validation works
Health endpoint works
Logging/correlation ID works
CI works
Domain boundary structure exists
No business logic duplicated in foundation
```

---

# I1 — DATABASE + MIGRATIONS

Database:

```text
PostgreSQL
```

Use one primary DB in V1.

Domain boundaries are enforced in application/module architecture.

Migration:

```text
versioned
reviewed
repeatable across environments
```

NEVER:

```text
production auto schema sync
drop/recreate production DB
unsafe blind ORM push
```

Schema evolution:

```text
Expand
→ Backfill
→ Deploy compatible app
→ Verify
→ Contract old structure later
```

IDs:

```text
UUIDv7 internal
visible business number separate
```

Visible numbering:

```text
<TYPE>-YYYYMMDD-NNNNN
```

Examples:

```text
JAZ-20261013-00001
PS-20261013-00001
SHP-20261013-00001
QT-20261013-00001
INV-20261013-00001
RC-20261013-00001
```

Rules:

```text
separate sequence per family/day
server Business Date
central organization timezone
atomic allocation
UNIQUE
never reuse
gaps allowed
reprint does not renumber
revision keeps document number
```

Money:

```text
NUMERIC / Decimal
LAK 0 decimals
THB 2 decimals
USD 2 decimals
FX high precision
```

Concurrency:

```text
row_version BIGINT
```

Historical delete:

```text
RESTRICT / archive / inactive
not cascade-delete business history
```

Seeds:

```text
Departments
Roles
Permission Codes
Fixed reference values
Initial safe configuration
```

Migration tests:

```text
Empty DB → latest
Previous production-like schema → latest
Both must result in expected schema
```

---

# I2 — AUTH + USER + PERMISSION

Ownership:

```text
USER
→ profile / role / department / status

AUTH
→ username / password hash / sessions / reset
```

Rules:

```text
1 User = 1 Role
1 User = 1 Department
Role != Department
```

Roles:

```text
ADMIN_PROMAX
STAFF
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

Status:

```text
PENDING
ACTIVE
DISABLED
```

Login:

```text
username + password
→ verify hash
→ ACTIVE?
→ create opaque session
→ HttpOnly cookie
```

Permission:

```text
Session
→ User
→ Role
→ Central Permission Matrix
→ Department Scope
→ Domain Rule
```

Revoke all sessions:

```text
DISABLED
Role changed
Department changed
Password reset
```

Admin reset:

```text
temporary password
must change next login
```

Protect at least one ACTIVE ADMIN_PROMAX transactionally.

No arbitrary per-user permission override V1.

---

# I3 — PRODUCT + CUSTOMER + ASSETS

PRODUCT:

```text
Component identity
Sizes
Images/refs
Active/default master state
```

Components:

```text
COLLAR
FABRIC
SLEEVE
SHOULDER
CUFF
WAIST
SHIRT_BOTTOM
```

Defaultable:

```text
SLEEVE
WAIST
SHIRT_BOTTOM
```

Historical master data:

```text
disable
do not hard delete
```

CUSTOMER:

```text
Name
Phone
Normalized Phone
Default Group
Customer Since
Status
Notes
Production Branding
```

Duplicate phone:

```text
warning only
not unique
```

Branding:

```text
JAZMINE_STANDARD
CUSTOM_AGENT
```

Assets:

```text
Object Storage
DB metadata/ref
immutable historical content
changed content = new Asset ID
```

Upload validates:

```text
permission
intended usage
actual file type
size
checksum
metadata
```

---

# I4 — PRICING + INVENTORY

Pricing request contains:

```text
configuration
customer group
sizes/qty
part fabrics
promotion
currency context
```

Pricing result contains:

```text
pricing version
breakdown
promotion result
FX context
final total
```

Pipeline:

```text
Base
+ Size
+ Fabric
+ Sleeve
+ Shoulder
+ Cuff
+ Waist
+ Bottom
+ Part Fabrics
→ Subtotal
→ Promotion
→ Final
→ Snapshot
```

Pricing Version:

```text
DRAFT
IN_REVIEW
ACTIVE
SUPERSEDED
```

Only one ACTIVE.

ACTIVE is immutable.

Promotion:

```text
BUY_X_GET_Y
PERCENTAGE
FIXED_AMOUNT
```

FX:

```text
LAK base
high-precision rate
immutable snapshot
```

Inventory V1:

```text
IN_STOCK
LOW_STOCK
OUT_OF_STOCK
```

Confirm rechecks Fabric status.

OUT_OF_STOCK:

```text
BLOCK Confirm
```

---

# I5 — ORDER + POS + DOCUMENTS

Draft:

```text
UUID exists
Order Number NULL
OrderStatus DRAFT
```

POS:

```text
Customer
→ Branding
→ Jersey
→ Part Fabrics
→ Size/Qty
→ Promotion
→ Mockup
→ Pricing
→ Review
→ Confirm
```

Confirm is one critical transaction:

```text
validate idempotency
validate row_version
re-read Customer
validate required Customer data
resolve Group
resolve Branding
validate Label/Tape
validate Components
re-read Inventory
run PRICING
allocate Order Number atomically
create snapshots
create Order Revision
set CONFIRMED
set CommercialStage=INVOICE
establish dueDate
create Invoice identity/revision truth
write audit/outbox
COMMIT
```

Any failure:

```text
ROLLBACK ALL
```

Quotation:

```text
Draft + Pricing
does not Confirm
does not count as Sales
does not authorize Production
```

Confirmed edit:

```text
Permission
Reason
Audit
Reprice
New Order Revision
New Invoice Revision
PS Version if affected
```

Customer change after Confirm:

```text
select new Customer
→ resolve Group
→ resolve Branding
→ Reprice
→ Order Revision
→ Invoice Revision
→ PS Version if production affected
```

Never direct-update Customer identity without controlled revision flow.

Documents render asynchronously after truth commit where practical.

---

# I6 — PRODUCTION

```text
1 Order → 1..N PS
```

Persistence direction:

```text
production_sheets
production_sheet_versions
allocations
parts
part_assets
stage_states
stage_events
exceptions
exception_lines
replacement_links
```

Stage command:

```text
Auth
→ Permission/Department
→ CURRENT PS?
→ not STOPPED?
→ row_version
→ predecessor rule
→ idempotency
→ transaction
→ state + event + audit + outbox
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

Rules:

```text
Next START if previous IN_PROGRESS or COMPLETED
Next COMPLETE only if previous COMPLETED
No skipping
Multiple IN_PROGRESS allowed
```

ReadyQty:

```text
derive from eligible CURRENT PS truth
QC COMPLETED
adjusted by resolved exception truth
```

Exception:

```text
REPORT
STOP
FLAG
```

Replacement:

```text
new REPLACEMENT PS
linked to exception
```

Production-affecting edit:

```text
new PS Version
possible Restart From Stage
preserve old events
notify affected departments
```

Restart:

```text
keep historical events
reset downstream current operational states
append restart/reset events
```

---

# I7 — PAYMENT

Payments only after Confirm V1.

RecordPayment:

```text
Order CONFIRMED?
→ re-read commercial total
→ derive net paid
→ derive remaining
→ validate amount
→ validate currency/FX
→ idempotency
→ transaction
```

Payment status:

```text
UNPAID
PARTIALLY_PAID
PAID
OVERPAID
```

Intent can be derived:

```text
first partial → DEPOSIT
middle        → ADDITIONAL
clears due    → FINAL
full first    → FINAL
```

Wrong payment:

```text
VOID/CANCEL
history remains
new correcting Payment
```

Refund:

```text
separate movement
<= eligible net paid
```

Overpaid:

```text
RESOLUTION_REQUIRED
No automatic refund
```

Payment does not gate Production.

Shipment gets warning, not default hard block.

Cancellation financial resolution is explicit:

```text
Shop Keeps
Refund Due
Additional Due
Reason
```

---

# I8 — SHIPMENT

```text
1 Order → 0..N Shipments
```

Draft:

```text
does not reserve ReadyQty
does not count as shipped
```

Confirm:

```text
re-read ReadyQty
re-read confirmed shipped
validate lines
validate Order not CANCELLED/VOIDED
payment warning
snapshot outstanding
CONFIRMED
outbox
commit
```

Available:

```text
ReadyQty - ConfirmedShippedQty
```

CONFIRMED means goods physically left.

Pickup confirms when goods are actually taken.

VOID only for invalid record where goods did not leave.

Order Completion derives from valid physical fulfillment truth.

Shipment does not directly rewrite Production.

---

# I9 — TRACKING

Access:

```text
opaque token
+ confirmed Order phone verification
```

DB stores token hash.

Public endpoint:

```text
rate limited
generic failure
no internal IDs
no internal manufacturing data
```

Multi-PS:

```text
aggregate Order-level progress
```

May show:

```text
Order summary
Approved Mockup where allowed
Production progress
Ready / Shipped
Simplified payment status
Requests
```

Must not show:

```text
internal PS identifiers
operators
internal exception detail
manufacturing artwork
internal document URLs
```

Requests:

```text
GENERAL
DELIVERY
EXPEDITE
```

Request:

```text
never direct mutation
```

Admin reviews, then performs separate authorized business command.

---

# I10 — ANALYTICS + SEARCH

Analytics:

```text
READ ONLY
```

Metrics:

```text
Sales = confirmedAt / Confirmed Order Value
Cash = paidAt / refundedAt
Best Selling = purchasedQty
Most Produced = fulfillmentQty
```

Confirmed edit:

```text
metric value may update
period remains original confirmedAt
```

Cancelled:

```text
excluded from Sales/current demand
actual historical payment/refund/production retained
```

Voided:

```text
excluded from normal KPI
```

Archived valid:

```text
included in historical Analytics
```

Department workload:

```text
may overlap by department
overall active jobs deduplicate PS
```

Historical Outstanding reconstructable.

Global Search:

```text
server-side
indexed
permission-aware
paginated
```

Entities:

```text
Order
Customer
Phone
PS
Shipment
Quotation
Invoice
Receipt
```

---

# I11 — NOTIFICATIONS + JOBS

Pattern:

```text
Truth Transaction
→ Outbox
→ Worker
→ Side Effect
```

Consumer:

```text
idempotent
```

In-app Notification fields:

```text
recipient user/department
type
title
message
related entity
created/read
```

Jobs:

```text
Draft Cleanup
Archive Eligibility
Asset Orphan Cleanup
Document Retry
Notification Dispatch
Read Model Refresh if used
```

Worker re-reads current truth before any state-affecting scheduled action.

Retry:

```text
exponential backoff
jitter
bounded attempts
dead-letter / failed visibility
```

External Email/WhatsApp/SMS can be added later through adapters.

---

# I12 — HARDENING / TESTING / DEPLOYMENT

Testing layers:

```text
Unit
Integration
API Contract
Permission
Transaction
Concurrency
Idempotency
E2E
PDF
Migration
Restore
Performance
```

Mandatory critical tests:

```text
Concurrent Order Confirm
Concurrent same-Order edit
Double Payment
Double Shipment
Shipment over-allocation race
Stage skip
Stage double action
PS revision history
Asset history
OOS Confirm block
Payment void/refund history
Last ADMIN_PROMAX protection
Session revoke on authority change
```

Security:

```text
HTTPS
HttpOnly/Secure cookies
CSRF
Rate limit
Server validation
Parameterized SQL
Security headers
Secret management
No auth token in localStorage/sessionStorage
```

Database gate:

```text
Empty DB migration PASS
Previous schema migration PASS
FKs PASS
UNIQUE PASS
Critical indexes PASS
No accidental CASCADE DELETE
Backups configured
Restore test completed
```

Performance gate:

```text
Order List
Production Queue
Customer Search
Global Search
Dashboard
Analytics
Order Detail
Production Job Detail
```

Measure:

```text
p95 latency
slow SQL
N+1
index usage
payload sizes
image sizes
PDF duration
queue backlog
```

UI gate:

```text
Mobile
Tablet
Desktop
1440
Light
Dark
System
Loading
Empty
No Results
Error
Permission Denied
Business Rule Error
Conflict
Success
```

Deployment:

```text
Feature branch
→ Pull Request
→ CI
→ Build immutable artifact
→ Staging
→ Smoke/E2E
→ DB backup/check
→ Production migration
→ Production deploy
→ Health
→ Smoke
→ Monitor
```

Never reset Production DB as a deployment strategy.

---

# DEFINITION OF DONE

A module is NOT done because the UI renders.

```text
Domain Rules
+ DB Migration
+ Repository
+ Commands
+ Queries
+ Permissions
+ Server Validation
+ Audit where needed
+ Concurrency where needed
+ Idempotency where needed
+ API
+ UI
+ Loading/Error/Empty/Conflict
+ Tests
+ No cross-domain write violation
=
DONE
```

Examples:

```text
Payment UI works but double-click duplicates Payment
→ NOT DONE

Production UI works but backend can skip stage
→ NOT DONE

Order Confirm works but concurrent Admin can create duplicate number
→ NOT DONE
```

---

# IMPLEMENTATION DEPENDENCY ORDER

```text
I0  Repository + Foundation
↓
I1  Database + Migrations
↓
I2  Auth + User + Permission
↓
I3  Product + Customer + Assets
↓
I4  Pricing + Inventory
↓
I5  Order + POS + Documents
↓
I6  Production
↓
I7  Payment
↓
I8  Shipment
↓
I9  Tracking
↓
I10 Analytics + Search
↓
I11 Notifications + Jobs
↓
I12 Hardening + Tests + Deployment
```

---

# FINAL PRE-CODING STATUS

```text
Known Blocking Business Conflict
= NONE

Known Blocking Technical Conflict
= NONE

Known Missing Core Module
= NONE

Implementation Plan
= COMPLETE

READY TO START CODING
= YES
```

**This Implementation Plan is NOT Phase 7.**
