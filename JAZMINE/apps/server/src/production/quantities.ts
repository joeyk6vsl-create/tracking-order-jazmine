import type { SheetInput } from '../../../../packages/contracts/src/production';
import type { OrderSnapshot } from '../../../../packages/contracts/src/confirmation';
import type { Readiness } from '../../../../packages/contracts/src/production-exceptions';
import type { Sql } from '../database';
import { AppError } from '../errors';
import { fulfillmentLines, distribute } from '../../../../packages/contracts/src/fulfillment';
import { shippedAllocations, sourceShipped } from '../shared/fulfillment-ledger';
import { replacementUsage } from './issue-resolution-ledger';
export async function losses(sql: Sql, ids: string[]) {
  return ids.length
    ? sql.query<{ sheet_id: string; line_index: number; scrap: number; released: number }>(
        'SELECT sheet_id,line_index,sum(scrap_qty)::int AS scrap,sum(release_qty)::int AS released FROM production_current_losses WHERE sheet_id=ANY($1::uuid[]) GROUP BY sheet_id,line_index',
        [ids],
      )
    : [];
}
export async function checkCapacity(
  sql: Sql,
  orderId: string,
  revision: number,
  id: string,
  allocations: SheetInput['allocations'],
  quantities: number[],
) {
  const sheets = await sql.query(
    "SELECT id,order_revision,allocations FROM production_sheets WHERE order_id=$1 AND state<>'CANCELLED'",
    [orderId],
  );
  if (sheets.some((s) => s.id !== id && Number(s.order_revision) !== revision))
    throw new AppError(
      'OLD_SHEETS',
      'มีใบผลิตฉบับออเดอร์เก่า ต้องตรวจและยกเลิกก่อนจัดชุดใหม่',
      409,
    );
  const adjustments = await losses(sql, [id, ...sheets.map((s) => String(s.id))]);
  const sent = await sourceShipped(sql, id);
  for (const loss of adjustments.filter((l) => l.sheet_id === id))
    if (
      (allocations.find((a) => a.lineIndex === loss.line_index)?.quantity ?? 0) <
      loss.scrap + loss.released
    )
      throw new AppError(
        'BELOW_RECORDED_LOSS',
        'ຈຳນວນ PS ນ້ອຍກວ່າຈຳນວນເສຍ/ປ່ອຍຄືນທີ່ບັນທຶກແລ້ວ',
        409,
      );
  for (const row of sent) {
    const loss = adjustments.find((l) => l.sheet_id === id && l.line_index === row.line_index);
    if (
      (allocations.find((a) => a.lineIndex === row.line_index)?.quantity ?? 0) <
      row.quantity + (loss?.scrap ?? 0) + (loss?.released ?? 0)
    )
      throw new AppError('BELOW_SHIPPED', 'ຫຼຸດ PS ຕ່ຳກວ່າຈຳນວນສົ່ງແລ້ວ ແລະຂອງເສຍບໍ່ໄດ້', 409);
  }
  const pending = await sql.query(
    "SELECT affected FROM production_issues WHERE sheet_id=$1 AND state='OPEN'",
    [id],
  );
  const current = sheets.find((s) => s.id === id)?.allocations as
    SheetInput['allocations'] | undefined;
  for (const old of current ?? []) {
    const confirmed = adjustments
      .filter((l) => l.sheet_id === id && l.line_index === old.lineIndex)
      .reduce((n, l) => n + l.scrap + l.released, 0);
    const reported = Math.max(
      0,
      ...pending
        .flatMap((p) => p.affected as { lineIndex: number; quantity: number }[])
        .filter((a) => a.lineIndex === old.lineIndex)
        .map((a) => a.quantity),
    );
    if (
      (allocations.find((a) => a.lineIndex === old.lineIndex)?.quantity ?? 0) <
      Math.min(old.quantity, confirmed + reported)
    )
      throw new AppError(
        'OPEN_ISSUE_QUANTITY',
        'ມີຈຳນວນໃນປັນຫາຄ້າງ ໃຫ້ Admin ຢືນຢັນກ່ອນຫຼຸດຈຳນວນ PS',
        409,
      );
  }
  for (const a of allocations) {
    if (quantities[a.lineIndex] === undefined)
      throw new AppError('INVALID_LINE', 'รายการจัดจำนวนไม่มีในออเดอร์', 400);
    const used = sheets
      .filter((s) => s.id !== id)
      .reduce(
        (sum, s) =>
          sum +
          (s.allocations as SheetInput['allocations'])
            .filter((x) => x.lineIndex === a.lineIndex)
            .reduce((n, x) => n + x.quantity, 0) -
          adjustments
            .filter((l) => l.sheet_id === s.id && l.line_index === a.lineIndex)
            .reduce((n, l) => n + l.scrap + l.released, 0),
        0,
      );
    const own = adjustments
      .filter((l) => l.sheet_id === id && l.line_index === a.lineIndex)
      .reduce((n, l) => n + l.scrap + l.released, 0);
    if (used + a.quantity - own > quantities[a.lineIndex])
      throw new AppError(
        'OVER_ALLOCATION',
        `รายการ ${a.lineIndex + 1} จัดได้อีก ${quantities[a.lineIndex] - used + own} ตัวเท่านั้น`,
        409,
      );
  }
  const link = (
    await sql.query('SELECT issue_id FROM production_replacements WHERE sheet_id=$1', [id])
  )[0];
  if (link) await checkReplacement(sql, String(link.issue_id), id, allocations);
  const snapshot = (
    await sql.query('SELECT snapshot FROM order_revisions WHERE order_id=$1 AND revision=$2', [
      orderId,
      revision,
    ])
  )[0].snapshot as OrderSnapshot;
  const lines = fulfillmentLines(snapshot),
    shipped = await shippedAllocations(sql, orderId),
    activeIds = new Set(sheets.map((s) => s.id));
  activeIds.add(id);
  const totals = new Map<string, number>(),
    usedByKey = new Map<string, number>();
  for (const line of lines) totals.set(line.key, (totals.get(line.key) ?? 0) + line.quantity);
  for (const sheet of [...sheets.filter((s) => s.id !== id), { id, allocations }])
    for (const a of sheet.allocations as SheetInput['allocations']) {
      const line = lines[a.lineIndex];
      if (!line) continue;
      const loss = adjustments.find((l) => l.sheet_id === sheet.id && l.line_index === a.lineIndex);
      usedByKey.set(
        line.key,
        (usedByKey.get(line.key) ?? 0) + a.quantity - (loss?.scrap ?? 0) - (loss?.released ?? 0),
      );
    }
  for (const record of shipped.filter((s) => !activeIds.has(s.sheet_id)))
    usedByKey.set(record.goods_key, (usedByKey.get(record.goods_key) ?? 0) + record.quantity);
  if ([...usedByKey].some(([key, qty]) => totals.has(key) && qty > totals.get(key)!))
    throw new AppError(
      'ALREADY_FULFILLED',
      'ຈຳນວນລວມກັບສິນຄ້າທີ່ສົ່ງໃນສະບັບເກົ່າເກີນ Order ໃໝ່',
      409,
    );
}
export async function checkReplacement(
  sql: Sql,
  issueId: string,
  id: string,
  allocations: SheetInput['allocations'],
) {
  const allowance = await sql.query(
    'SELECT line_index,scrap_qty+release_qty AS quantity FROM production_current_losses WHERE issue_id=$1',
    [issueId],
  );
  const others = await replacementUsage(sql, issueId, id);
  for (const a of allocations) {
    const used = others.find((s) => s.lineIndex === a.lineIndex)?.quantity ?? 0;
    if (
      a.quantity + used >
      Number(allowance.find((l) => Number(l.line_index) === a.lineIndex)?.quantity ?? 0)
    )
      throw new AppError('REPLACEMENT_LIMIT', 'ຈຳນວນທົດແທນເກີນຈຳນວນທີ່ຢືນຢັນໃນປັນຫາ', 409);
  }
}
export async function productionStock(sql: Sql, orderId: string) {
  const order = (
    await sql.query(
      'SELECT o.order_number,o.latest_revision,o.business_state,o.storage_state,r.snapshot FROM orders o JOIN order_revisions r ON r.order_id=o.id AND r.revision=o.latest_revision WHERE o.id=$1',
      [orderId],
    )
  )[0];
  if (!order) throw new AppError('NOT_FOUND', 'ບໍ່ພົບ Order', 404);
  const snapshot = order.snapshot as OrderSnapshot,
    lines = fulfillmentLines(snapshot);
  const sheets = await sql.query(
    `SELECT s.id,s.allocations,s.state,s.issued_version,EXISTS(SELECT 1 FROM production_stage_work w WHERE w.sheet_id=s.id AND w.sheet_version=s.issued_version AND w.department='QC_PACKING' AND w.state='COMPLETED') AS qc,EXISTS(SELECT 1 FROM production_issues i WHERE i.sheet_id=s.id AND i.state='OPEN') AS unresolved FROM production_sheets s WHERE s.order_id=$1 AND s.order_revision=$2 AND s.state<>'CANCELLED'`,
    [orderId, order.latest_revision],
  );
  const adjustments = await losses(
    sql,
    (
      await sql.query('SELECT id FROM production_sheets WHERE order_id=$1 AND order_revision=$2', [
        orderId,
        order.latest_revision,
      ])
    ).map((s) => String(s.id)),
  );
  const shipped = await shippedAllocations(sql, orderId),
    sources: {
      sheetId: string;
      version: number;
      lineIndex: number;
      key: string;
      quantity: number;
    }[] = [],
    allocated = lines.map(() => 0);
  for (const sheet of sheets)
    for (const a of sheet.allocations as SheetInput['allocations']) {
      const line = lines[a.lineIndex];
      if (!line) continue;
      const loss = adjustments.find((l) => l.sheet_id === sheet.id && l.line_index === a.lineIndex),
        net = a.quantity - (loss?.scrap ?? 0) - (loss?.released ?? 0),
        sent = shipped
          .filter((s) => s.sheet_id === sheet.id && s.line_index === a.lineIndex)
          .reduce((n, s) => n + s.quantity, 0);
      allocated[a.lineIndex] += net;
      if (
        order.business_state !== 'CANCELLED' &&
        order.storage_state !== 'ARCHIVED' &&
        sheet.state === 'READY' &&
        sheet.qc &&
        !sheet.unresolved &&
        net > sent
      )
        sources.push({
          sheetId: String(sheet.id),
          version: Number(sheet.issued_version),
          lineIndex: a.lineIndex,
          key: line.key,
          quantity: net - sent,
        });
    }
  return { order, lines, sheets, adjustments, shipped, sources, allocated };
}
export async function readiness(sql: Sql, orderId: string): Promise<Readiness> {
  return readinessFromStock(orderId, await productionStock(sql, orderId));
}
export function readinessFromStock(
  orderId: string,
  stock: Awaited<ReturnType<typeof productionStock>>,
): Readiness {
  const { order, lines, sheets, adjustments, shipped, sources, allocated } = stock,
    sentByKey = new Map<string, number>(),
    readyByKey = new Map<string, number>(),
    external = new Map<string, number>();
  for (const row of shipped) {
    sentByKey.set(row.goods_key, (sentByKey.get(row.goods_key) ?? 0) + row.quantity);
    if (!sheets.some((s) => s.id === row.sheet_id))
      external.set(row.goods_key, (external.get(row.goods_key) ?? 0) + row.quantity);
  }
  for (const source of sources)
    readyByKey.set(source.key, (readyByKey.get(source.key) ?? 0) + source.quantity);
  const sentRows = distribute(lines, sentByKey),
    readyRows = distribute(
      lines.map((l, i) => ({ ...l, quantity: Math.max(0, l.quantity - sentRows[i]) })),
      readyByKey,
    ),
    carried = distribute(
      lines.map((l, i) => ({ ...l, quantity: Math.max(0, l.quantity - allocated[i]) })),
      external,
    );
  const result = lines.map((line, i) => ({
    lineIndex: i,
    size: line.size,
    quantity: line.quantity,
    allocated: allocated[i] + carried[i],
    ready: readyRows[i],
    shipped: sentRows[i],
    scrap: adjustments.filter((l) => l.line_index === i).reduce((n, l) => n + l.scrap, 0),
    released: adjustments.filter((l) => l.line_index === i).reduce((n, l) => n + l.released, 0),
  }));
  if (result.some((l) => l.ready < 0 || l.ready > l.quantity || l.allocated > l.quantity))
    throw new AppError('QUANTITY_INVARIANT', 'ຈຳນວນຜະລິດບໍ່ສອດຄ່ອງ ກະລຸນາໃຫ້ Admin ກວດສອບ', 409);
  const total = result.reduce((n, l) => n + l.quantity, 0),
    ready = result.reduce((n, l) => n + l.ready, 0);
  const shippedQuantity = sentRows.reduce((n, x) => n + x, 0),
    remainingQuantity = total - shippedQuantity;
  return {
    orderId,
    orderNumber: String(order.order_number),
    revision: Number(order.latest_revision),
    status:
      remainingQuantity > 0 && ready === remainingQuantity
        ? 'READY_TO_SHIP'
        : ready > 0
          ? 'PARTIALLY_READY'
          : 'NOT_READY',
    quantity: total,
    readyQuantity: ready,
    shippedQuantity,
    remainingQuantity,
    lines: result,
  };
}
export function preparedQuantities(stock: Awaited<ReturnType<typeof productionStock>>) {
  const sheets = stock.sheets.filter((s) => s.state === 'READY'),
    adjustments = stock.adjustments;
  const totals = stock.lines.map((line) =>
    sheets.reduce(
      (n, s) =>
        n +
        (s.allocations as SheetInput['allocations'])
          .filter((a) => a.lineIndex === line.lineIndex)
          .reduce((sum, a) => sum + a.quantity, 0) -
        adjustments
          .filter((l) => l.sheet_id === s.id && l.line_index === line.lineIndex)
          .reduce((sum, l) => sum + l.scrap + l.released, 0),
      0,
    ),
  );
  // สินค้าที่ส่งจากใบเก่าหรือใบที่ยกเลิกแล้ว ยังครอบคลุมสินค้าชนิดเดิมในออเดอร์ล่าสุด
  const external = new Map<string, number>();
  for (const row of stock.shipped.filter((s) => !sheets.some((sheet) => sheet.id === s.sheet_id)))
    external.set(row.goods_key, (external.get(row.goods_key) ?? 0) + row.quantity);
  const carried = distribute(
    stock.lines.map((line, i) => ({ ...line, quantity: Math.max(0, line.quantity - totals[i]) })),
    external,
  );
  return totals.map((n, i) => n + carried[i]);
}
export async function updatePreparation(sql: Sql, orderId: string) {
  const stock = await productionStock(sql, orderId),
    view = readinessFromStock(orderId, stock),
    covered = preparedQuantities(stock);
  const status = view.lines.every((l, i) => covered[i] >= l.quantity)
    ? 'SHEETS_READY'
    : covered.some((n) => n > 0)
      ? 'PARTIALLY_PREPARED'
      : 'WAITING_FOR_PRODUCTION_SHEET';
  await sql.query(
    'UPDATE production_preparations SET status=$2,required_revision=$3 WHERE order_id=$1',
    [orderId, status, view.revision],
  );
}
