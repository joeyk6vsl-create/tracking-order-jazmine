import { productionFixture } from './production-fixture';

// สร้างฐานในหน่วยความจำเองเท่านั้น ไม่รับตำแหน่งหรือการเชื่อมต่อจากผู้เรียก
// ข้อมูลจำนวนมากใช้ตรวจการอ่าน ส่วนการบันทึกพร้อมกันต้องผ่านบริการจริง
export async function volumeFixture(count = 10000) {
  if (!Number.isInteger(count) || count < 100 || count > 20000)
    throw new Error('Invalid test size');
  const f = await productionFixture();
  try {
    await f.db.transaction(async (sql) => {
      await sql.query('CREATE TEMP TABLE load_uuid_scope(n int)');
      // รหัสจำลองต้องมี version/variant ถูกต้องเหมือนข้อมูลจริง มิฉะนั้น cursor จะถูกปฏิเสธ
      await sql.query(
        "CREATE FUNCTION pg_temp.load_uuid(seed text) RETURNS uuid LANGUAGE SQL IMMUTABLE AS $$ SELECT (substr(md5(seed),1,12)||'4'||substr(md5(seed),14,3)||'8'||substr(md5(seed),18,15))::uuid $$",
      );
      await sql.query(
        `CREATE TEMP TABLE load_orders AS SELECT g AS n,pg_temp.load_uuid('load-draft-'||g) AS draft_id,pg_temp.load_uuid('load-order-'||g) AS order_id,pg_temp.load_uuid('load-sheet-'||g) AS sheet_id,((now() AT TIME ZONE 'Asia/Vientiane')::date-(g%180))::timestamp AT TIME ZONE 'Asia/Vientiane' AS at FROM generate_series(1,$1::int) g`,
        [count],
      );
      await sql.query(
        `INSERT INTO customers(id,name,phone,normalized_phone,customer_group,branding_type,customer_since,created_by,updated_by) SELECT pg_temp.load_uuid('load-customer-'||g),'Load customer '||lpad(g::text,6,'0'),'020'||lpad(g::text,8,'0'),'020'||lpad(g::text,8,'0'),'RETAIL','JAZMINE_STANDARD',current_date,$2,$2 FROM generate_series(1,$1::int) g`,
        [count * 2, f.owner.id],
      );
      await sql.query(
        `INSERT INTO order_drafts(id,row_version,input_json,quote_json,selection_json,request_hash,created_by,updated_by,updated_at) SELECT m.draft_id,2,jsonb_set(d.input_json,'{customerName}',to_jsonb('Load customer '||lpad(m.n::text,6,'0'))),d.quote_json,d.selection_json,md5(m.n::text),d.created_by,d.updated_by,m.at FROM load_orders m CROSS JOIN order_drafts d WHERE d.id=$1`,
        [f.draftId],
      );
      await sql.query(
        `INSERT INTO orders(id,draft_id,order_number,invoice_number,latest_revision,created_at) SELECT order_id,draft_id,'LOAD-JAZ-'||lpad(n::text,6,'0'),'LOAD-INV-'||lpad(n::text,6,'0'),2,at FROM load_orders`,
      );
      await sql.query(
        `INSERT INTO order_revisions(id,order_id,revision,draft_version,pricing_revision,snapshot,confirmed_by,reason,confirmed_at) SELECT pg_temp.load_uuid('load-revision-'||m.n||'-'||v),m.order_id,v,v,r.pricing_revision,jsonb_set(r.snapshot,'{input,customerName}',to_jsonb('Load customer '||lpad(m.n::text,6,'0'))),r.confirmed_by,'ข้อมูลสมมติตรวจจำนวนมาก',m.at+(v-1)*interval '1 second' FROM load_orders m CROSS JOIN generate_series(1,2) v CROSS JOIN order_revisions r WHERE r.order_id=$1 AND r.revision=1`,
        [f.order.id],
      );
      await sql.query(
        `INSERT INTO payment_entries(id,order_id,order_revision,number,kind,purpose,receipt_id,currency,amount_minor,lak_amount,exchange_rate,rate_revision,method,reference,occurred_at,recorded_at,actor_id,actor_name,reason,snapshot) SELECT pg_temp.load_uuid('load-payment-'||m.n||'-'||v),m.order_id,2,'LOAD-PAY-'||m.n||'-'||v,CASE WHEN v=3 THEN 'REFUND' ELSE 'RECEIPT' END,CASE WHEN v=3 THEN 'REFUND' ELSE 'DEPOSIT' END,CASE WHEN v=3 THEN pg_temp.load_uuid('load-payment-'||m.n||'-1') ELSE NULL END,'LAK',(CASE v WHEN 1 THEN 120000 WHEN 2 THEN 50000 ELSE 20000 END)::bigint*100,CASE v WHEN 1 THEN 120000 WHEN 2 THEN 50000 ELSE 20000 END,'1',2,'CASH','',m.at+v*interval '1 minute',m.at+v*interval '1 minute',$1,'Load owner','ข้อมูลสมมติ','{}'::jsonb FROM load_orders m CROSS JOIN generate_series(1,3) v ORDER BY v,m.n`,
        [f.owner.id],
      );
      await sql.query(
        `INSERT INTO production_sheets(id,order_id,order_revision,sheet_number,state,row_version,issued_version,allocations,notes,request_hash,created_by,updated_by) SELECT m.sheet_id,m.order_id,2,'LOAD-PS-'||lpad(m.n::text,6,'0'),'READY',s.row_version,1,s.allocations,'ทดสอบคิว',md5(m.n::text),s.created_by,s.updated_by FROM load_orders m CROSS JOIN production_sheets s WHERE s.id=$1 AND m.n<=$2`,
        [f.id, Math.floor(count / 5)],
      );
      await sql.query(
        `INSERT INTO production_sheet_versions(id,sheet_id,version,snapshot,issued_by,issued_at) SELECT pg_temp.load_uuid('load-sheet-version-'||m.n),m.sheet_id,1,jsonb_set(jsonb_set(jsonb_set(v.snapshot,'{context,orderId}',to_jsonb(m.order_id::text)),'{context,orderNumber}',to_jsonb('LOAD-JAZ-'||lpad(m.n::text,6,'0'))),'{context,customerName}',to_jsonb('Load customer '||lpad(m.n::text,6,'0'))),v.issued_by,m.at FROM load_orders m CROSS JOIN production_sheet_versions v WHERE v.sheet_id=$1 AND v.version=1 AND m.n<=$2`,
        [f.id, Math.floor(count / 5)],
      );
      await sql.query(
        `INSERT INTO production_stage_work(sheet_id,sheet_version,department) SELECT m.sheet_id,1,d FROM load_orders m CROSS JOIN unnest(ARRAY['PRINTING','HEAT_TRANSFER','LASER','SIZE_SORTING','SEWING','QC_PACKING']) d WHERE m.n<=$1`,
        [Math.floor(count / 5)],
      );
      await sql.query(
        `INSERT INTO audit_events(id,actor_id,action,entity_id,reason,detail) SELECT pg_temp.load_uuid('load-audit-'||g),$2,'LOAD_ONLY',pg_temp.load_uuid('load-order-'||(1+(g%$1::int))),'ประวัติสมมติ','{}'::jsonb FROM generate_series(1,$1::int*10) g`,
        [count, f.owner.id],
      );
      await sql.query('DROP TABLE load_orders');
      await sql.query('DROP TABLE load_uuid_scope');
      await sql.query('DROP FUNCTION pg_temp.load_uuid(text)');
    });
    await f.db.query('ANALYZE');
    return {
      ...f,
      volume: {
        customers: count * 2,
        orders: count + 1,
        revisions: count * 2 + 1,
        payments: count * 3,
        sheets: Math.floor(count / 5) + 1,
        addedAuditEvents: count * 10,
      },
      expected: {
        sales: String(BigInt(f.order.snapshot.pricing.total!) * BigInt(count + 1)),
        outstanding: String(
          BigInt(f.order.snapshot.pricing.total!) * BigInt(count + 1) - BigInt(count) * 150000n,
        ),
        netPaid: String(BigInt(count) * 150000n),
      },
    };
  } catch (e) {
    await f.db.close();
    throw e;
  }
}
