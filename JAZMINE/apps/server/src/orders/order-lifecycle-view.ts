import { createHash } from 'node:crypto';
import type { Sql } from '../database';
import type { LifecycleView } from '../../../../packages/contracts/src/order-lifecycle';
import { readOrder, moneySummary } from '../settlements/ledger';
import { ShipmentService } from '../settlements/shipment-service';
import { lifecycleState } from './order-lifecycle-guard';
export async function inspectLifecycle(
  sql: Sql,
  id: string,
  ships: ShipmentService,
): Promise<Omit<LifecycleView, 'canManageArchive' | 'canResolveFinance'>> {
  const order = await readOrder(sql, id),
    money = await moneySummary(sql, order),
    state = lifecycleState(order as unknown as Record<string, unknown>);
  const sheets = await sql.query(
    'SELECT id,sheet_number,state,row_version,issued_version,allocations FROM production_sheets WHERE order_id=$1 ORDER BY id',
    [id],
  );
  const stages = await sql.query(
    'SELECT w.* FROM production_stage_work w JOIN production_sheets s ON s.id=w.sheet_id WHERE s.order_id=$1 ORDER BY w.sheet_id,w.sheet_version,w.department',
    [id],
  );
  const issues = await sql.query(
    "SELECT i.id,i.row_version FROM production_issues i JOIN production_sheets s ON s.id=i.sheet_id WHERE s.order_id=$1 AND i.state='OPEN' ORDER BY i.id",
    [id],
  );
  const requests = await sql.query(
    "SELECT id,row_version FROM customer_requests WHERE order_id=$1 AND state<>'RESOLVED' ORDER BY id",
    [id],
  );
  const shipments = await sql.query(
    'SELECT id,state,confirmed_at FROM shipments WHERE order_id=$1 ORDER BY id',
    [id],
  );
  const delivery = await ships.summary(sql, order);
  const paid = BigInt(money.netPaid),
    agreed = state.agreedTotal == null ? null : BigInt(state.agreedTotal);
  const refundDue = agreed == null ? null : String(paid > agreed ? paid - agreed : 0n),
    additionalDue = agreed == null ? null : String(agreed > paid ? agreed - paid : 0n);
  const finance: LifecycleView['finance'] =
    state.business !== 'CANCELLED'
      ? 'NOT_REQUIRED'
      : agreed == null
        ? 'DECISION_REQUIRED'
        : agreed === paid
          ? 'CLEAR'
          : 'ACTION_REQUIRED';
  const reasons: string[] = [];
  const draftActivity = (
    await sql.query(
      'SELECT d.id,d.row_version,r.draft_version FROM orders o JOIN order_drafts d ON d.id=o.draft_id JOIN order_revisions r ON r.order_id=o.id AND r.revision=o.latest_revision WHERE o.id=$1',
      [id],
    )
  )[0];
  if (
    state.business === 'ACTIVE' &&
    Number(draftActivity.row_version) !== Number(draftActivity.draft_version)
  )
    reasons.push('ມີຮ່າງ Order ປ່ຽນທີ່ຍັງບໍ່ຢືນຢັນ / Review unconfirmed order changes first');
  if (issues.length) reasons.push('ມີປັນຫາຜະລິດຄ້າງ / Resolve production issues first');
  if (requests.length) reasons.push('ມີຄຳຂໍລູກຄ້າຄ້າງ / Review customer requests first');
  if (shipments.some((s) => s.state === 'PREPARED'))
    reasons.push('ມີລາຍການກຽມສົ່ງ / Review prepared deliveries first');
  const unfinished = sheets.filter(
    (s) =>
      s.state !== 'CANCELLED' &&
      (s.state !== 'READY' ||
        !stages.some(
          (w) =>
            w.sheet_id === s.id &&
            Number(w.sheet_version) === Number(s.issued_version) &&
            w.department === 'QC_PACKING' &&
            w.state === 'COMPLETED',
        )),
  );
  let eligibleAfter: string | null = null;
  let baseEligible: boolean;
  if (state.business === 'CANCELLED') {
    if (finance !== 'CLEAR')
      reasons.push('ໃຫ້ເຈົ້າຂອງຕົກລົງຍອດ ແລະຈັດການເງິນກ່ອນ / Clear cancellation finances first');
    if (unfinished.length)
      reasons.push(
        'ປິດໃບຜະລິດທີ່ຍັງບໍ່ສຳເລັດກ່ອນ / Close unfinished production sheets after reviewing physical work',
      );
    baseEligible = reasons.length === 0;
  } else {
    if (delivery.orderStatus !== 'COMPLETED')
      reasons.push('ຍັງສົ່ງບໍ່ຄົບ / Delivery is not complete');
    if (money.status !== 'PAID') reasons.push('ຍອດເງິນຍັງບໍ່ຊັດເຈນ / Clear payment balance first');
    if (unfinished.length)
      reasons.push('ມີໃບຜະລິດຍັງບໍ່ສຳເລັດ / Review unfinished production sheets');
    baseEligible = reasons.length === 0;
    if (delivery.orderStatus === 'COMPLETED') {
      const dates = (
        await sql.query(
          "SELECT greatest(r.confirmed_at, max(s.confirmed_at)) + interval '15 days' AS after, greatest(r.confirmed_at, max(s.confirmed_at)) + interval '15 days'<=now() AS ready FROM orders o JOIN order_revisions r ON r.order_id=o.id AND r.revision=o.latest_revision JOIN shipments s ON s.order_id=o.id AND s.state='CONFIRMED' WHERE o.id=$1 GROUP BY r.confirmed_at",
          [id],
        )
      )[0];
      eligibleAfter = dates?.after ? new Date(dates.after as string).toISOString() : null;
      if (!dates?.ready)
        reasons.push('ລໍຖ້າຄົບ 15 ວັນຫຼັງສົ່ງຄົບ / Archive after 15 days from completion');
    }
  }
  const history = (
    await sql.query(
      'SELECT * FROM order_lifecycle_events WHERE order_id=$1 ORDER BY recorded_at,id',
      [id],
    )
  ).map((r) => ({
    kind: String(r.kind),
    actorName: String(r.actor_name),
    reason: String(r.reason),
    at: new Date(r.recorded_at as string).toISOString(),
    detail: r.detail as Record<string, unknown>,
  }));
  const effects = {
    sheets: sheets.length,
    inProgress: stages.filter(
      (w) =>
        w.state === 'IN_PROGRESS' &&
        sheets.some(
          (s) =>
            s.id === w.sheet_id &&
            s.state !== 'CANCELLED' &&
            Number(s.issued_version) === Number(w.sheet_version),
        ),
    ).length,
    completedStages: stages.filter((w) => w.state === 'COMPLETED').length,
    openIssues: issues.length,
    openRequests: requests.length,
    preparedShipments: shipments.filter((s) => s.state === 'PREPARED').length,
    confirmedShipments: shipments.filter((s) => s.state === 'CONFIRMED').length,
    shippedQuantity: delivery.shippedQuantity,
  };
  const requestActivity = await sql.query(
    'SELECT id,row_version FROM customer_requests WHERE order_id=$1 ORDER BY id',
    [id],
  );
  const issueActivity = await sql.query(
    'SELECT i.id,i.row_version FROM production_issues i JOIN production_sheets s ON s.id=i.sheet_id WHERE s.order_id=$1 ORDER BY i.id',
    [id],
  );
  const activityToken = createHash('sha256')
    .update(
      JSON.stringify({
        order,
        state,
        money,
        sheets,
        stages,
        requestActivity,
        issueActivity,
        shipments,
        draftActivity,
      }),
    )
    .digest('hex');
  return {
    state,
    originalTotal: String(order.snapshot.pricing.total),
    netPaid: money.netPaid,
    refundDue,
    additionalDue,
    finance,
    effects,
    productionSheets: sheets.map((s) => ({
      id: String(s.id),
      number: String(s.sheet_number ?? 'Draft PS'),
      state: String(s.state),
      unfinished: unfinished.some((u) => u.id === s.id),
    })),
    archive: {
      eligible: reasons.length === 0,
      reasons,
      eligibleAfter,
      baseEligible,
      activityToken,
    },
    history,
    checkToken: createHash('sha256')
      .update(
        JSON.stringify({
          order,
          state,
          money,
          sheets,
          stages,
          issues,
          requests,
          shipments,
          archiveReasons: reasons,
        }),
      )
      .digest('hex'),
  };
}
