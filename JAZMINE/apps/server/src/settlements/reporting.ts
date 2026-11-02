// สูตรอ่านจำนวนเงินเป็นของส่วนรับเงิน รายงานใช้ร่วมกับกฎ netPaid / due / overpaid เดิม
export const balancesCte = `WITH ledger AS (
 SELECT order_id,COALESCE(sum(lak_amount) FILTER(WHERE kind='RECEIPT'),0) AS received,COALESCE(sum(lak_amount) FILTER(WHERE kind='REFUND'),0) AS refunded FROM payment_entries WHERE state='ACTIVE' GROUP BY order_id
), commercial AS (
 SELECT o.id,o.order_number,o.business_state,o.cancel_agreed_lak,(o.business_state='CANCELLED' AND o.cancel_agreed_lak IS NULL) AS decision_required,r.snapshot->'input'->>'customerName' AS customer_name,(first.confirmed_at AT TIME ZONE 'Asia/Vientiane')::date AS order_date,(r.snapshot->'pricing'->>'total')::numeric AS total,
 CASE WHEN o.business_state='CANCELLED' THEN 0 ELSE (r.snapshot->'pricing'->>'total')::numeric END AS sales_total,
 CASE WHEN o.business_state='CANCELLED' THEN COALESCE(o.cancel_agreed_lak,0) ELSE (r.snapshot->'pricing'->>'total')::numeric END AS obligation_total,
 COALESCE(l.received,0) AS received,COALESCE(l.refunded,0) AS refunded,COALESCE(l.received,0)-COALESCE(l.refunded,0) AS net_paid,
 (CASE WHEN jsonb_array_length(r.snapshot->'input'->'lines')>0 THEN (SELECT sum((v->>'quantity')::int+(v->>'freeQuantity')::int) FROM jsonb_array_elements(r.snapshot->'input'->'lines') v) ELSE (r.snapshot->'input'->'quote'->>'quantity')::int+(r.snapshot->'pricing'->>'freeQuantity')::int END) AS quantity
 FROM orders o JOIN order_revisions r ON r.order_id=o.id AND r.revision=o.latest_revision JOIN order_revisions first ON first.order_id=o.id AND first.revision=1 LEFT JOIN ledger l ON l.order_id=o.id
), balances AS (SELECT *,CASE WHEN decision_required THEN 0 ELSE greatest(obligation_total-net_paid,0) END AS due,CASE WHEN decision_required THEN 0 ELSE greatest(net_paid-obligation_total,0) END AS overpaid FROM commercial)`;

// คำนวณยอดปัจจุบันครั้งเดียว แล้วใช้ร่วมกันทั้งตัวเลขรวม กราฟ และหน้าออเดอร์
// เก็บจำนวนเงินเป็นข้อความเสมอ ไม่แปลงผ่านเลขทศนิยมของ JavaScript
export const currentReportSql = `${balancesCte}, report_balances AS MATERIALIZED (SELECT * FROM balances),
 period AS (SELECT * FROM report_balances WHERE order_date BETWEEN $1::date AND $2::date)
 SELECT
 (SELECT jsonb_build_object('orders',count(*) FILTER(WHERE business_state='ACTIVE')::int,'sales',COALESCE(sum(sales_total),0)::text,'quantity',COALESCE(sum(quantity) FILTER(WHERE business_state='ACTIVE'),0)::text,'due',COALESCE(sum(due),0)::text) FROM period) AS totals,
 (SELECT jsonb_build_object('due',COALESCE(sum(due),0)::text,'overpaid',COALESCE(sum(overpaid),0)::text,'pending',count(*) FILTER(WHERE decision_required)::int) FROM report_balances) AS all_totals,
 COALESCE((SELECT jsonb_agg(d ORDER BY d.date) FROM (SELECT order_date::text AS date,sum(sales_total)::text AS sales FROM period GROUP BY order_date) d),'[]'::jsonb) AS sales,
 COALESCE((SELECT jsonb_agg(p ORDER BY p.date DESC,p.id DESC) FROM (SELECT id,order_number,customer_name,order_date::text AS date,total::text,received::text,refunded::text,net_paid::text,due::text,overpaid::text,quantity,business_state,decision_required,cancel_agreed_lak::text FROM period ORDER BY order_date DESC,id DESC LIMIT 26 OFFSET $3) p),'[]'::jsonb) AS rows`;

// ย้อนตามข้อมูลที่ระบบรับรู้ ณ สิ้นวันนั้น: รายการแก้/ยกเลิกภายหลังไม่เขียนทับอดีต
export const historicalOutstandingSql = `WITH cutoff AS (SELECT (($1::date+1)::timestamp AT TIME ZONE 'Asia/Vientiane') AS at),
 revisions AS (SELECT DISTINCT ON(r.order_id) r.order_id,r.snapshot FROM order_revisions r,cutoff c WHERE r.confirmed_at<c.at ORDER BY r.order_id,r.confirmed_at DESC,r.revision DESC),
 historical_money AS (SELECT p.order_id,COALESCE(sum(CASE WHEN p.kind='RECEIPT' THEN p.lak_amount ELSE -p.lak_amount END),0) AS paid FROM payment_entries p,cutoff c WHERE p.recorded_at<c.at AND p.occurred_at<c.at AND (p.voided_at IS NULL OR p.voided_at>=c.at) GROUP BY p.order_id)
 , lifecycle AS (SELECT o.id,o.cancelled_at,a.detail->>'agreedTotal' AS agreed_total FROM orders o LEFT JOIN LATERAL (SELECT e.detail FROM order_lifecycle_events e,cutoff c WHERE e.order_id=o.id AND e.kind='AGREEMENT' AND e.recorded_at<c.at ORDER BY e.recorded_at DESC,e.id DESC LIMIT 1) a ON true),
 obligations AS (SELECT r.order_id,CASE WHEN l.cancelled_at<c.at THEN l.agreed_total::numeric ELSE (r.snapshot->'pricing'->>'total')::numeric END AS total FROM revisions r JOIN lifecycle l ON l.id=r.order_id,cutoff c)
 SELECT COALESCE(sum(greatest(o.total-COALESCE(m.paid,0),0)) FILTER(WHERE o.total IS NOT NULL),0)::text AS due,count(*) FILTER(WHERE o.total IS NULL)::int AS pending FROM obligations o LEFT JOIN historical_money m ON m.order_id=o.order_id`;
