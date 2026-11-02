# JAZMINE Documentation Center

งานล่าสุด: [สำเนาเอกสารพร้อมสถานะปัจจุบัน และตั้งค่าเก็บออเดอร์เก่าอัตโนมัติ](../JAZMINE/docs/DOCUMENT_STATUS_AND_AUTO_ARCHIVE_TH.md)

งานล่าสุด: [ยกเลิกแผนใช้ต่องานผลิตทั้งชุด พร้อมเงื่อนไขและคู่มือภาษาไทย](../JAZMINE/docs/REVERSE_PRODUCTION_REUSE_PLAN_TH.md)

งานล่าสุด: [QR รับเงินกีบ/บาท เจ้าของตั้งค่า แอดมินแนบใบแจ้งหนี้ และคู่มือภาษาไทย](../JAZMINE/docs/PAYMENT_QR_TH.md)

งานล่าสุด: [เก็บ PDF อัตโนมัติทั้งสี่ชนิด ดาวน์โหลดไฟล์เดิม และคู่มือภาษาไทย](../JAZMINE/docs/STORED_PDFS_TH.md)

งานล่าสุด: [ใบเสนอราคา เลขและฉบับ พิมพ์ A4/PDF และคู่มือภาษาไทย](../JAZMINE/docs/QUOTATIONS_TH.md)

งานล่าสุด: [QR ติดตามในใบแจ้งหนี้ พร้อมคู่มือและคำอธิบายไฟล์ภาษาไทย](../JAZMINE/docs/INVOICE_TRACKING_QR_TH.md)

งานล่าสุด: [รองรับรายการที่เป็นของแถมล้วน พร้อมคู่มือภาษาไทย](../JAZMINE/docs/GIFT_ONLY_LINES_TH.md)

งานล่าสุด: [ยกเลิกออเดอร์ ตกลงยอด และเก็บข้อมูลเก่า พร้อมคู่มือภาษาไทย](../JAZMINE/docs/CANCEL_AND_ARCHIVE_ORDERS_TH.md)

งานล่าสุด: [แก้จำนวนปัญหาการผลิตที่ปิดแล้ว พร้อมคู่มือและคำอธิบายไฟล์ภาษาไทย](../JAZMINE/docs/CORRECT_PRODUCTION_ISSUE_QUANTITIES_TH.md)

เอกสารในโฟลเดอร์นี้คือศูนย์กลางกฎและแผนงานของระบบ JAZMINE

พื้นที่พัฒนาใหม่อยู่ที่ [JAZMINE/README.md](../JAZMINE/README.md) และมี [คู่มือชื่อไฟล์ภาษาไทย](../JAZMINE/FILE_GUIDE_TH.md) เอกสารกฎหลักยังอยู่ในโฟลเดอร์นี้

## เริ่มอ่านจากที่นี่

1. `JAZMINE_MASTER_RULES.md` — กฎล่าสุดที่เจ้าของยืนยันแล้ว
2. `JAZMINE_PERMISSION_MATRIX.md` — ใครทำอะไรได้บ้าง
3. `JAZMINE_DECISION_LOG.md` — ประวัติการตัดสินใจและเรื่องที่ยังรอคำตอบ
4. `JAZMINE_WORK_PLAN.md` — ลำดับงานและเงื่อนไขก่อนเริ่มช่วงถัดไป
5. `JAZMINE_BUSINESS_EXAMPLES.md` — ตัวอย่างสถานการณ์สำหรับตรวจความเข้าใจ
6. [JAZMINE_SCREEN_MAP.md](JAZMINE_SCREEN_MAP.md) — ผังหน้าจอ ใครใช้ และทำอะไรได้
7. [JAZMINE_USER_FLOWS.md](JAZMINE_USER_FLOWS.md) — เส้นทางการทำงานจากเริ่มจนจบ
8. [JAZMINE_WIREFRAMES_ROUND_1.md](JAZMINE_WIREFRAMES_ROUND_1.md) — ขอบเขตแบบร่างชุดแรกและจุดแจ้งก่อนเริ่มโค้ด

จากนั้นจึงอ่านเอกสารรายละเอียดใน `source/` ตามลำดับ Phase 0 ถึง Phase 6

## โครงสร้างโฟลเดอร์

```text
docs/
├─ README.md
├─ JAZMINE_MASTER_RULES.md
├─ JAZMINE_PERMISSION_MATRIX.md
├─ JAZMINE_DECISION_LOG.md
├─ JAZMINE_WORK_PLAN.md
├─ JAZMINE_BUSINESS_EXAMPLES.md
├─ JAZMINE_SCREEN_MAP.md
├─ JAZMINE_USER_FLOWS.md
├─ JAZMINE_WIREFRAMES_ROUND_1.md
├─ source/       เอกสาร Phase ที่ใช้งานจริง
├─ reference/    คู่มือประกอบ เช่น คู่มือออกแบบหน้าจอ
└─ archive/      เอกสารเก่า ห้ามใช้เป็นกฎปัจจุบัน
```

## เอกสารที่ใช้งานจริง

อ่านตามลำดับต่อไปนี้:

1. `source/JAZMINE_PHASE_0_FULL.md`
2. `source/JAZMINE_PHASE_1_FULL.md`
3. `source/JAZMINE_PHASE_2_FULL_UPDATED_V2.md`
4. `source/JAZMINE_PHASE_3_FULL_UPDATED.md`
5. `source/JAZMINE_PHASE_4_FULL_UPDATED.md`
6. `source/JAZMINE_PHASE_5_FINAL.md`
7. `source/JAZMINE_PHASE_6_TECHNICAL_ARCHITECTURE_FINAL.md`
8. `source/JAZMINE_IMPLEMENTATION_PLAN_FINAL.md`

## เอกสารอ้างอิง

- `reference/JAZMINE_UI_DESIGN_SYSTEM_V1.md` เป็นคู่มือหน้าตาหลักของ JAZMINE
- `reference/apple-layout-guide.md` ใช้เป็นแนวทางเรื่องหน้าตา ความอ่านง่าย ภาษา Lao หน้าจอมือถือ และการใช้งานด้วยคีย์บอร์ด
- คู่มือออกแบบไม่มีสิทธิ์เปลี่ยนกฎราคา สิทธิ์ผู้ใช้ การรับเงิน การผลิต หรือการส่งสินค้า
- ข้อความใน UI Design System ที่กล่าวว่า Phase 5B ยังเหลืองานเป็นสถานะเก่า ให้ใช้ `source/JAZMINE_PHASE_5_FINAL.md` เป็นสถานะปัจจุบัน

## เอกสารเก่า

- `archive/JAZMINE_PHASE_5_LOCKED_ONLY.md` ถูกแทนที่ด้วย `source/JAZMINE_PHASE_5_FINAL.md`
- `archive/JAZMINE_POST_PHASE_4_INDEX.md` เป็นสารบัญเดิม เก็บไว้เพื่อดูประวัติเท่านั้น

## สถานะไฟล์อ้างอิง

ได้รับไฟล์อ้างอิงที่เอกสารเดิมระบุไว้ครบแล้ว

## กฎสำหรับคนและ AI

- อ่าน `JAZMINE_MASTER_RULES.md` ก่อนเริ่มงานทุกครั้ง
- ห้ามใช้ไฟล์ใน `archive/` สร้างระบบใหม่
- ถ้าพบกฎขัดกัน ห้ามเลือกเอง ให้บันทึกใน `JAZMINE_DECISION_LOG.md` และรอเจ้าของตัดสินใจ
- ห้ามแก้กฎทางธุรกิจเพื่อให้เขียนระบบง่ายขึ้น
- ทำงานทีละส่วน ทดสอบให้ผ่าน แล้วจึงเริ่มส่วนถัดไป
