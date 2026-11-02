# JAZMINE — POST-PHASE-4 FINAL FILE INDEX

## Official files

1. `JAZMINE_PHASE_5_FINAL.md`
2. `JAZMINE_PHASE_6_TECHNICAL_ARCHITECTURE_FINAL.md`
3. `JAZMINE_IMPLEMENTATION_PLAN_FINAL.md`

Supporting existing design reference:
- `JAZMINE_UI_DESIGN_SYSTEM_V1.md`

## Locked numbering

```text
Order             JAZ-YYYYMMDD-NNNNN
Production Sheet  PS-YYYYMMDD-NNNNN
Shipment          SHP-YYYYMMDD-NNNNN
Quotation         QT-YYYYMMDD-NNNNN
Invoice           INV-YYYYMMDD-NNNNN
Receipt           RC-YYYYMMDD-NNNNN
```

Rules:
- separate sequence per family and Business Date
- Business Date is server-side in the organization timezone
- atomic allocation inside DB transaction
- UNIQUE constraint
- never reuse a number
- gaps allowed
- reprint does not change a number
- document revision keeps the same document number
- internal UUID remains the primary identity

## Locked currency rounding

```text
LAK → 0 decimals
THB → 2 decimals
USD → 2 decimals
FX  → high precision
```

No automatic rounding to 1,000 KIP.

## Overall status

```text
Phase 0 FINAL
Phase 1 FINAL
Phase 2 FINAL
Phase 3 FINAL
Phase 4 FINAL
Phase 5 FINAL
Phase 6 FINAL
Implementation Plan I0–I12 FINAL
```

The Implementation Plan is not Phase 7.
