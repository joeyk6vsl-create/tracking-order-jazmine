ALTER TABLE production_sheets ADD COLUMN print_details jsonb NOT NULL DEFAULT '{"priority":"UNSPECIFIED","names":[]}';
-- ไม่สร้างวันที่ย้อนหลังให้ใบเก่าที่ไม่มีหลักฐานวันสร้าง
ALTER TABLE production_sheets ADD COLUMN created_at timestamptz;
ALTER TABLE production_sheets ALTER COLUMN created_at SET DEFAULT now();
