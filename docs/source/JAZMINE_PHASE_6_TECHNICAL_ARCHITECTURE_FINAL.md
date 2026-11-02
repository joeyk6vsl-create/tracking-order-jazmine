# JAZMINE — PHASE 6 TECHNICAL ARCHITECTURE — FINAL CONSOLIDATED

**System:** JAZMINE Sportswear / Jersey Organization Management System  
**Phase:** PHASE 6 — Technical Architecture  
**Status:** FINAL LOCKED  
**Language:** Lao + English Technical Terms

---

# 6.0 CORE TECHNICAL PRINCIPLES

```text
1 Business Rule = 1 Owner
1 Business Truth = 1 Source
1 Metric = 1 Definition
State Change = Server-side Validation
Historical Data MUST NOT be silently rewritten
Stable IDs
Snapshots preserve historical truth
Central Permission Matrix
No duplicate Pricing / Production / Analytics logic
```

Architecture must preserve all Phase 0–5 locked behavior.

---

# 6A — SYSTEM ARCHITECTURE

Architecture style:

```text
MODULAR MONOLITH
```

One deployable application with strict internal module boundaries.

Primary components:

```text
Web Frontend
Backend API
Worker
PostgreSQL
Object Storage
```

Redis:

```text
optional later
NOT required for V1 correctness
```

Application direction:

```text
API
→ Application
→ Domain

Infrastructure
→ implements ports
```

Rules:

```text
Backend authoritative
DB constraints where appropriate
No cross-domain direct table writes
Thin HTTP endpoints
Critical Commands transactional
Search server-side/indexed/paginated
Analytics centralized/read-only
Documents render authoritative snapshots
Side effects happen after truth commit
```

---

# 6A.1 DOMAIN MODULE BOUNDARIES

Core domains:

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

Shared infrastructure/features:

```text
Search
Filter
QR
Document Renderer
Notification
Asset Storage
Audit
Outbox / Worker
```

Shared Feature ≠ Business Data Owner.

Supreme rule:

```text
Owner writes its truth.
Other modules use Contract.
No foreign Repository writes.
```

---

# 6A.2 LOCKED DEPENDENCY PROHIBITIONS

```text
PRICING MUST NOT depend on POS
PRODUCTION MUST NOT calculate pricing
TRACKING MUST NOT own Production truth
ANALYTICS MUST NOT mutate
SHIPMENT MUST NOT rewrite Production
POS MUST NOT generate Order number
USER MUST NOT expose credentials
PAYMENT MUST NOT change Order price
ORDER MUST NOT rewrite Payment history
PRODUCTION MUST NOT depend on Payment status
```

---

# 6B — BACKEND MODULE ARCHITECTURE

Each business module owns:

```text
Commands
Queries
Domain Rules
Repository
Events
```

Module structure:

```text
domain/
application/
infrastructure/
http/
```

POS:

```text
orchestrator / workflow surface
NOT business-data owner
```

Permission pipeline:

```text
Session
→ User
→ Role
→ Permissions
→ Department Scope
→ Domain Rule
```

---

# 6C — DATABASE / ERD ARCHITECTURE

Primary DB:

```text
PostgreSQL
```

Rules:

```text
1 primary relational database
Logical ownership by Domain
Files → Object Storage
DB stores Asset Ref + Metadata
Current Data ≠ Historical Snapshot
Transaction ≠ Overwrite
Archive ≠ Delete
Visible Business Number ≠ Internal ID
Critical operations → DB transaction
Concurrency → stale-state protection
Integrity → backend + DB constraints
```

---

# 6C.1 IDS / NAMING / TIME

Internal primary ID:

```text
UUIDv7
```

Visible business number is separate.

Common mutable fields:

```text
id
created_at
updated_at
row_version
created_by / updated_by
```

Concurrency:

```text
row_version BIGINT
```

Time:

```text
TIMESTAMPTZ → instant
DATE        → calendar date
```

Phone:

```text
normalized + indexed
not globally unique
```

Historical/business delete default:

```text
ON DELETE RESTRICT
```

---

# 6C.2 MONEY / FX — FINAL

Storage:

```text
Amount  → NUMERIC(20,4)
FX Rate → NUMERIC(24,10)
```

Authoritative arithmetic:

```text
Decimal only
NEVER binary FLOAT
```

Currency rounding policy:

```text
LAK → 0 decimal places
THB → 2 decimal places
USD → 2 decimal places
```

No automatic rounding to 1,000 KIP.

FX:

```text
keep full precision during calculation
round only at defined monetary boundary
```

Base financial truth:

```text
LAK
```

Historical FX snapshot is immutable.

---

# 6C.3 VISIBLE BUSINESS NUMBERING — FINAL

Format:

```text
<TYPE>-YYYYMMDD-NNNNN
```

Examples:

```text
Order             JAZ-20261013-00001
Production Sheet  PS-20261013-00001
Shipment          SHP-20261013-00001
Quotation         QT-20261013-00001
Invoice           INV-20261013-00001
Receipt           RC-20261013-00001
```

Rules:

```text
1. Separate sequence per entity/document family
2. Sequence resets each Business Date
3. Business Date determined server-side
4. Organization Business Timezone is authoritative
5. Allocate inside DB transaction
6. Database UNIQUE constraint
7. Number is never reused
8. Gaps are allowed
9. Reprint never changes number
10. Revision keeps original document number
11. Revision has separate revision number + issuedAt
12. Internal UUID remains primary identity
```

Draft Order:

```text
UUID exists
permanent Order number = NULL
```

Permanent Order number only at successful Confirm.

Midnight safety:

```text
Business Date is captured once by server in command/transaction context
```

Revision example:

```text
INV-20261013-00020
Revision v1 issued 2026-10-13
Revision v2 issued 2026-10-15

Document Number stays:
INV-20261013-00020
```

---

# 6C.4 CUSTOMER DATA MODEL

Customer master:

```text
id
name
phone
normalized_phone
default_customer_group
status
customer_since
notes
row_version
```

Before Order Confirm:

```text
Name REQUIRED
Phone REQUIRED
Customer Group REQUIRED
Valid Production Branding REQUIRED
```

Groups:

```text
RETAIL
AGENT_LEVEL_1
AGENT_LEVEL_2
AGENT_LEVEL_3
AGENT_LEVEL_4
AGENT_LEVEL_5
```

Default:

```text
RETAIL
```

Phone is not unique.

Confirmed Customer snapshot keeps historical display truth for the Order revision.

---

# 6C.5 CUSTOMER PRODUCTION BRANDING

Current branding belongs to CUSTOMER context.

```text
1 Customer / Agent Record = 1 Brand
```

Types:

```text
JAZMINE_STANDARD
CUSTOM_AGENT
```

Current config:

```text
branding_type
neck_label_asset_ref
neck_tape_asset_ref
```

At Confirm:

```text
brandingTypeAtConfirmation
neckLabelAssetRefAtConfirmation
neckTapeAssetRefAtConfirmation
```

Confirmed snapshot becomes production truth.

Changing current Customer branding never rewrites confirmed history.

---

# 6C.6 PRODUCT / COMPONENT MODEL

Generic component master:

```text
product_components
```

Types:

```text
COLLAR
FABRIC
SLEEVE
SHOULDER
CUFF
WAIST
SHIRT_BOTTOM
```

Fields direction:

```text
type
name
code
image_asset_ref
status
is_default
sort_order
notes
row_version
```

Defaults allowed only for:

```text
SLEEVE
WAIST
SHIRT_BOTTOM
```

Maximum one active default/type.

Used historical components:

```text
disable/inactive
NEVER hard delete
```

Sizes are normalized master data.

No giant pre-generated SKU matrix required for V1.

---

# 6C.7 INVENTORY

V1 tracks Fabric availability status:

```text
IN_STOCK
LOW_STOCK
OUT_OF_STOCK
```

No stock quantity in V1.

Ownership:

```text
PRODUCT   → Fabric identity
INVENTORY → availability
PRICING   → price adjustment
```

Draft Confirm rechecks availability.

OUT_OF_STOCK before Confirm:

```text
BLOCK
```

Confirmed Order later becoming OOS:

```text
WARNING
No silent substitution
```

---

# 6C.8 PRICING

Pricing Version lifecycle:

```text
DRAFT
IN_REVIEW
ACTIVE
SUPERSEDED
```

Only one ACTIVE.

ACTIVE version is immutable.

Change flow:

```text
Clone
→ edit new DRAFT
→ review
→ activate
→ previous ACTIVE → SUPERSEDED
```

Pricing pipeline:

```text
Base
+ Size
+ Fabric
+ Sleeve
+ Shoulder
+ Cuff
+ Waist
+ Bottom
+ Part Fabric
+ Future
→ Calculated
→ Promotion
→ Final
→ Snapshot
```

Missing pricing row:

```text
NOT equal to zero
```

Explicit zero surcharge is valid.

Price-affecting Part Fabric must be selected before Confirm.

Multiple enabled Part surcharges calculate separately then sum.

---

# 6C.9 PROMOTIONS

Types:

```text
BUY_X_GET_Y
PERCENTAGE
FIXED_AMOUNT
```

Maximum one each type/order.

Cross-type stacking:

```text
configurable
```

BUY_X_GET_Y:

```text
free units assigned to exact item + size
free units are real fulfillment
free units do not recursively create free units
```

Final price:

```text
>= 0
```

Promotion snapshot retained.

---

# 6C.10 ORDER / REVISION MODEL

```text
1 Order = 1 Jersey configuration
Home/Away = separate Orders
```

Statuses:

```text
DRAFT
CONFIRMED
COMPLETED
CANCELLED
VOIDED
```

Commercial Stage:

```text
NONE
QUOTATION
INVOICE
```

Storage state:

```text
ACTIVE
ARCHIVED
```

Priority:

```text
NORMAL
URGENT
```

Order identity/lifecycle is separate from authoritative content revisions.

`order_revisions` contains commercial/configuration truth.

Draft working revision is mutable under Draft rules.

Confirm freezes revision v1.

Later authorized confirmed edit:

```text
new Order Revision
```

All confirmed commercial edits:

```text
new Invoice Revision
```

Production-affecting edit:

```text
new PS Version when required
```

Order completion only when all fulfillment physically leaves shop.

---

# 6C.11 QUANTITY MODEL

```text
purchasedQty
promotionalFreeQty
fulfillmentQty
```

Formula:

```text
fulfillmentQty
=
purchasedQty + promotionalFreeQty
```

Normal Production does not maintain per-stage quantity counters.

Independent batches use multiple PS.

---

# 6C.12 PRODUCTION MODEL

```text
1 Order
→ 1..N Production Sheets
```

PS purpose:

```text
NORMAL
REPLACEMENT
```

PS versions:

```text
DRAFT
CURRENT
SUPERSEDED
```

Historical content is immutable.

PS allocation by size lines.

Stages:

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

Maintain:

```text
current operational stage state rows
+
immutable stage event history
```

Do not store one authoritative `current_stage`.

`latestReachedStage` is derived as furthest started.

Next stage START requires previous `IN_PROGRESS` or `COMPLETED`.

Next stage COMPLETE requires previous `COMPLETED`.

No skipping.

Multiple stages may be `IN_PROGRESS`.

---

# 6C.13 PRODUCTION EXCEPTION / READINESS

Exception actions:

```text
REPORT
STOP
FLAG
```

Lifecycle:

```text
OPEN
RESOLVED
```

Exact exception quantities:

```text
Allocated
Usable
Scrap
Unstarted
Release
Replacement
```

STOP freezes affected PS progression until authorized resolution.

Replacement production:

```text
separate REPLACEMENT PS
linked to exception
```

Ready truth:

```text
QC IN_PROGRESS → 0 contribution
QC COMPLETED   → eligible usable allocation contributes
```

Do not maintain an authoritative manually edited `ready_qty`.

---

# 6C.14 PAYMENT MODEL

Payments only after Confirm in V1.

Payment types:

```text
DEPOSIT
ADDITIONAL
FINAL
```

Payment preserves:

```text
original_amount
original_currency
fx_snapshot
applied_amount_lak
paid_at
method
reference
```

Status:

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

Wrong payment:

```text
VOID/CANCEL with history
new correcting Payment
```

Refund:

```text
separate movement
does not rewrite original Payment
```

Order total below paid amount:

```text
OVERPAID + RESOLUTION_REQUIRED
```

No automatic refund.

---

# 6C.15 SHIPMENT MODEL

```text
1 Order
→ 0..N Shipments
```

Statuses:

```text
DRAFT
CONFIRMED
VOID
```

Available:

```text
AvailableToShip
=
ReadyQty - ConfirmedShippedQty
```

Draft:

```text
does not reserve
does not count as shipped
```

Confirm re-reads Ready/Shipped inside transaction.

CONFIRMED:

```text
goods physically left shop
```

Pickup confirms only when goods actually taken.

VOID only if record was wrong and physical dispatch did not happen.

Outstanding Payment:

```text
warning
not automatic block
```

Preserve:

```text
outstandingBalanceAtShipment
```

---

# 6C.16 USER / AUTH / PERMISSION MODEL

```text
1 User = 1 Role
1 User = 1 Department
Role ≠ Department
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

At least one ACTIVE ADMIN_PROMAX must always remain.

No arbitrary per-user permission overrides V1.

Authorization:

```text
Role
+ Central Permission Matrix
+ Department Scope
+ Domain Rule
```

Default cross-department production mutation:

```text
DENY
```

unless explicit Permission.

---

# 6C.17 AUTH IDENTITY / SESSIONS

Username:

```text
unique
stable login identity
```

Phone:

```text
mutable contact/profile
not auth identity
```

Password hashing:

```text
Argon2id
unique salt
never plaintext
```

Session:

```text
random opaque token in HttpOnly cookie
DB stores token hash
Secure in production
SameSite=Lax baseline
```

Multiple sessions per user allowed.

Revoke all sessions on:

```text
User DISABLED
Role change
Department change
Admin password reset
Credential compromise response
```

Password reset V1:

```text
Admin creates temporary password
old sessions revoked
must change password next login
old password never recoverable
```

No self-service Forgot Password required V1.

---

# 6C.18 DOCUMENT MODEL

Commercial document identities:

```text
Quotation
Invoice
Receipt
```

Quote and Invoice support revisions/history.

Receipt is tied to a specific confirmed Payment.

Issued artifact metadata direction:

```text
document_revision_id
rendered_asset_id
template_version
render_language
rendered_at
rendered_by
checksum
page_count
```

Exact issued PDF is immutable.

Historical issued artifact is never rebuilt from current master data.

Lao/English is presentation only.

Production Sheet remains separate PS Version model.

---

# 6C.19 TRACKING MODEL

Invoice tracking QR:

```text
opaque high-entropy token
+
phone verification
```

DB stores token hash.

Phone verification uses:

```text
phoneAtConfirmation
```

from confirmed Order snapshot.

Public Tracking:

```text
aggregated Order-level production projection
```

Never expose internal PS/operator/exception/manufacturing detail.

Requests:

```text
GENERAL
DELIVERY
EXPEDITE
```

Lifecycle:

```text
SUBMITTED
UNDER_REVIEW
RESOLVED
```

Outcome:

```text
APPROVED
REJECTED
NO_ACTION
```

Approved request still requires a separate authorized business command.

---

# 6C.20 ASSET MODEL

Files live in Object Storage.

DB stores:

```text
id
storage_key
original_filename
mime
file_size
checksum
width
height
status
created_at
created_by
metadata
```

Status:

```text
ACTIVE
INACTIVE
RETIRED
```

Changed content:

```text
NEW Asset ID / version
```

Referenced historical asset normally cannot be hard deleted.

Private by default.

Public/customer access only through controlled projection/signed/scoped access.

V1 accepted image types:

```text
PNG
JPEG
WEBP
```

Arbitrary unsafe SVG disabled by default.

---

# 6C.21 SETTINGS / ARCHIVE / PURGE

Default Lead Time:

```text
10 calendar days
```

Due Soon:

```text
2 days
```

Late:

```text
today > dueDate
AND
not fully READY_TO_SHIP
```

Queue:

```text
URGENT
→ nearest due
→ oldest
```

Draft cleanup:

```text
15 inactive days
```

Archive:

```text
Archive ≠ Delete
```

Completed Order archive eligibility:

```text
COMPLETED
PAID
CLEAR
archive delay passed
```

Financial issue on archived Order:

```text
auto-reactivate
```

Purge:

```text
minimum 365 archived days
manual
ADMIN_PROMAX
preview
reason
explicit confirmation
audit
```

Business-number tombstone remains.

---

# 6D — TRANSACTION / CONCURRENCY / IDEMPOTENCY

Optimistic concurrency:

```text
row_version
```

Stale write:

```text
STALE_STATE
```

Never:

```text
last-write-wins on critical truth
silent overwrite
automatic merge of conflicting business truth
```

Critical mutation supports Idempotency Key.

Same key + same request:

```text
return same committed result
```

Same key + different payload:

```text
conflict
```

Critical commands include:

```text
Confirm Order
Record Payment
Confirm Shipment
Production Start
Production Complete
Issue Quotation
Create Invoice Revision
Generate Receipt
Refund
Critical Void/Cancel
```

Critical business command:

```text
one DB transaction
all-or-nothing
```

Do not hold transaction open while:

```text
uploading remote files
rendering PDF
sending notifications
```

Use targeted row locks/constraints where needed.

Number gaps are acceptable.

---

# 6E — SECURITY

Request authorization:

```text
Request
→ Session
→ User ACTIVE
→ Role
→ Permission Matrix
→ Department Scope
→ Domain Rule
→ allow/deny
```

Frontend hiding is UX only.

Security baseline:

```text
HTTPS
CSRF protection
Server-side validation
Parameterized SQL
Output escaping
Restrictive CORS
Security headers
Secret management
Rate limiting
Generic auth error messages
```

Security events audited:

```text
login success/failure
logout
password reset/change
session revoke
user disabled
role change
department change
```

Never log secrets/password/session tokens.

---

# 6F — FILE / IMAGE / OBJECT STORAGE

Upload:

```text
Permission
→ validate usage
→ validate actual type/size
→ create Asset ID
→ upload
→ checksum
→ metadata
→ DB record
```

Stable object key:

```text
assets/{uuid}/original
```

Do not use mutable business names as storage truth.

Asset service owns storage/resolve only.

Business domain owns asset meaning.

Signed/private access preserves authorization.

Do not cache signed URL beyond its expiry.

---

# 6G — API / COMMAND / QUERY ARCHITECTURE

```text
HTTP/API
→ Command / Query
→ Application Service
→ Domain
→ Repository / Infrastructure
```

Command mutates truth.

Query never mutates.

Critical command pipeline:

```text
Authenticate
→ Authorize
→ Validate Input
→ Validate row_version
→ Validate Business Rule
→ Validate Idempotency
→ Transaction
→ Commit
→ Return Authoritative Result
```

Error model:

```text
INVALID_INPUT
AUTHENTICATION_REQUIRED
PERMISSION_DENIED
NOT_FOUND
BUSINESS_RULE_CONFLICT
STALE_STATE
DUPLICATE_REQUEST
RATE_LIMITED
INTERNAL_ERROR
```

Never expose SQL/stack internals.

API version:

```text
/api/v1/...
```

Large lists:

```text
server-side
indexed
paginated
```

Cursor pagination preferred for large operational streams.

---

# 6H — EVENTS / JOBS / NOTIFICATIONS

Pattern:

```text
Business Transaction
→ commit Source of Truth + Outbox
→ Worker
→ Side Effect
```

Events:

```text
OrderConfirmed
OrderRevisionCreated
PSVersionCreated
ProductionExceptionReported
PaymentConfirmed
PaymentVoided
RefundConfirmed
ShipmentConfirmed
UserDisabled
CustomerBrandingChanged
```

Delivery:

```text
at-least-once
consumers MUST be idempotent
```

Outbox metadata:

```text
event_id
type
aggregate_type
aggregate_id
occurred_at
attempt
processed_at
last_error
```

Retry:

```text
exponential backoff + jitter
bounded retry
dead-letter / failed job visibility
```

In-app notifications are primary V1 channel.

External adapters later:

```text
Email
WhatsApp
SMS
```

Scheduled jobs:

```text
Draft cleanup
Archive eligibility
Orphan asset cleanup
Notification dispatch
Document render/retry
Projection refresh if used
```

Purge is NOT an automatic routine job.

---

# 6I — DOCUMENT / PDF / QR RENDERING

Architecture:

```text
Authoritative Business Snapshot
↓
Document Revision
↓
Render Payload
↓
PDF Renderer
↓
Immutable PDF Asset
↓
Object Storage
```

`ISSUED` means immutable rendered artifact persisted successfully.

Before success:

```text
RENDER_PENDING
PREPARING
FAILED
```

Retry same revision/number.

Do not create duplicate document number on retry.

Rendering should be async via Outbox/Worker where practical.

Server-side Noto Sans Lao support.

Never shrink below 10pt.

Overflow:

```text
reflow/add page
not crop/omit/shrink below minimum
```

Renderer security:

```text
trusted asset resolver only
no arbitrary URL fetch
sanitize/escape text
no arbitrary unsafe SVG
cleanup temp files
```

QR behavior follows Phase 5.

---

# 6J — SEARCH / READ MODELS / ANALYTICS

Architecture:

```text
Owner Domains
↓
Authoritative Queries / Events
↓
Read Model / SQL View / Projection
↓
Dashboard / Search / Analytics / Reports
```

Rule:

```text
Read Model broken
→ rebuild from owner truth

Owner truth broken
→ read model cannot repair it
```

Search fields include:

```text
Order Number
Customer Name
Phone
PS Number
Shipment Number
Quotation Number
Invoice Number
Receipt Number
```

Filters keep dimensions separate:

```text
CommercialStage
PaymentStatus
OrderStatus
Readiness
Delivery
Priority
Date
Customer
```

Never make one compound status the authoritative truth.

Metrics:

```text
Sales Period  = confirmedAt
Sales Value   = Confirmed Order Value
Cash          = paidAt / refundedAt
Best Selling  = purchasedQty
Most Produced = fulfillmentQty
```

Historical Outstanding must be reconstructable.

---

# 6K — CACHE / PERFORMANCE

V1:

```text
PostgreSQL
+ correct indexes
+ efficient SQL
+ server-side pagination
+ bounded payloads
+ read models where justified
```

Redis:

```text
optional later
not required for correctness
```

Cache:

```text
speed only
NEVER Source of Truth
```

Critical commands MUST re-read DB inside transaction.

Never authorize mutation from stale cache for:

```text
ReadyQty
Fabric availability
Remaining payment
Permission/session ACTIVE state
Current Pricing state
```

Avoid:

```text
huge cache blobs
permission-unsafe shared query cache
unbounded page cache
N+1 access
```

Static hashed assets may use long browser/CDN caching.

Business API data should not receive blind long-lived browser caching.

---

# 6L — DEPLOYMENT / ENVIRONMENTS

Environments:

```text
LOCAL
DEVELOPMENT
STAGING
PRODUCTION
```

Production DB must not be shared with Dev/Staging.

Deployment:

```text
Git
→ CI
→ Tests
→ Build immutable container/artifact
→ Migration
→ Deploy
→ Health Check
```

Secrets:

```text
environment/secret manager
NEVER Git
```

Schema evolution:

```text
Expand
→ deploy compatible code
→ backfill/migrate
→ verify
→ Contract old structure later
```

No sudden destructive production schema change.

---

# 6M — BACKUP / DISASTER RECOVERY

PostgreSQL:

```text
automated backup
Point-in-Time Recovery where provider supports
```

Object Storage:

```text
versioning / recovery protection
```

Targets:

```text
RPO target <= 15 minutes
RTO target <= 4 hours
```

Periodic restore test required.

Recovery includes:

```text
DB
Commercial PDFs
Branding assets
Approved Mockups
Production artwork
Critical configuration
```

---

# 6N — OBSERVABILITY

Separate:

```text
Business Audit Log
≠
Application / Operational Log
```

Audit:

```text
Who?
What?
When?
Why?
Which entity?
```

Operational observability:

```text
request_id / correlation_id
API latency
error rate
DB connections
slow queries
queue depth
failed jobs
login failures
PDF failures
object-storage errors
```

Never log secrets.

---

# 6O — TESTING / QUALITY

Required layers:

```text
Domain Unit Tests
DB/Repository Integration Tests
API Contract Tests
Permission Tests
Transaction Tests
Concurrency Tests
Idempotency Tests
End-to-End Tests
Document/PDF Tests
Migration Tests
Backup Restore Tests
Basic Load/Performance Tests
```

Critical scenarios:

```text
two Admin confirm simultaneously
two users edit same Order
double-click Payment
double Confirm Shipment
stale Production stage
PS replacement / exception
Invoice revision
Refund / Void
role change revokes sessions
historical assets remain unchanged
OUT_OF_STOCK blocks Confirm
last ADMIN_PROMAX protection
```

---

# 6P — IMPLEMENTATION STACK

Language:

```text
TypeScript end-to-end
```

Frontend:

```text
React
Vite
```

Backend:

```text
NestJS
Fastify adapter
```

Database:

```text
PostgreSQL
```

DB access direction:

```text
typed SQL / ORM layer with explicit SQL capability
Drizzle-style approach acceptable
```

Validation:

```text
Zod at API boundary
Domain rules remain separate
```

Jobs:

```text
PostgreSQL-backed Outbox/Queue first
Redis optional later
```

Storage:

```text
S3-compatible Object Storage
```

PDF:

```text
HTML/CSS template
→ headless Chromium-style renderer
```

Deployment:

```text
Docker container
```

Repository direction:

```text
apps/
  web/
  server/
  worker/

packages/
  contracts/
  ui/
  config/

database/
  migrations/
  seeds/

tests/
  integration/
  e2e/

docs/
```

Backend modules follow Domain boundaries, not one giant global service layer.

---

# 6Q — FINAL TECHNICAL AUDIT

```text
Domain Ownership                PASS
Contracts                       PASS
Business Rules                  PASS
Functional Architecture         PASS
UX / UI / Documents             PASS
Modular Monolith                PASS
Database / ERD                  PASS
Transactions                    PASS
Concurrency                     PASS
Idempotency                     PASS
Authentication / Permissions    PASS
Assets / Object Storage         PASS
API Architecture                PASS
Events / Jobs                   PASS
PDF / QR                        PASS
Search / Analytics              PASS
Cache / Performance             PASS
Deployment                      PASS
Backup / Recovery               PASS
Observability                   PASS
Testing                         PASS
Implementation Stack            PASS
```

Final:

```text
Known blocking Business Conflict
= NONE

Known blocking Architecture Conflict
= NONE

P0 integrity violation
= NONE FOUND

Ready for Implementation
= YES
```

**PHASE 6 = FINAL LOCKED**
