import { uuidv7 } from 'uuidv7';
import type { UserView } from '../../../../packages/contracts/src/identity';
import type {
  SettlementAction,
  ShipmentInput,
  ShipmentConfirm,
  ShipmentMetadata,
  ShipmentView,
  SettlementView,
} from '../../../../packages/contracts/src/settlement';
import { fulfillmentLines, distribute } from '../../../../packages/contracts/src/fulfillment';
import { Database, type Sql } from '../database';
import { AppError } from '../errors';
import { recordAudit } from '../shared/audit';
import { productionStock, updatePreparation } from '../production/quantities';
import { SettlementLedger, nextNumber, moneySummary, type OrderRow } from './ledger';
import { assertOrderOperational } from '../orders/order-lifecycle-guard';
export class ShipmentService {
  private ledger: SettlementLedger;
  constructor(db: Database) {
    this.ledger = new SettlementLedger(db);
  }
  async list(sql: Sql, orderId: string): Promise<ShipmentView[]> {
    const rows = await sql.query(
      'SELECT * FROM shipments WHERE order_id=$1 ORDER BY prepared_at,id',
      [orderId],
    );
    const updates = await sql.query(
      "SELECT detail,reason,created_at FROM audit_events WHERE entity_id=$1 AND action='SHIPMENT_DETAILS_UPDATED' ORDER BY created_at,id",
      [orderId],
    );
    return rows.map(
      (r) =>
        ({
          id: String(r.id),
          number: String(r.number),
          orderRevision: Number(r.order_revision),
          state: r.state,
          method: r.method,
          recipient: r.recipient,
          phone: r.phone,
          address: r.address,
          carrier: r.carrier,
          tracking: r.tracking,
          notes: r.notes,
          preparedName: r.prepared_name,
          preparedAt: new Date(r.prepared_at as string).toISOString(),
          confirmedName: r.confirmed_name,
          confirmedAt: r.confirmed_at ? new Date(r.confirmed_at as string).toISOString() : null,
          confirmedEarly: r.confirmed_early,
          cancelReason: r.cancel_reason,
          updates: updates
            .filter((e) => (e.detail as { shipmentId: string }).shipmentId === r.id)
            .map((e) => {
              const d = e.detail as {
                actorName: string;
                before: ShipmentView['updates'][number]['before'];
                after: ShipmentView['updates'][number]['after'];
              };
              return {
                at: new Date(e.created_at as string).toISOString(),
                actorName: d.actorName,
                reason: String(e.reason),
                before: d.before,
                after: d.after,
              };
            }),
          items: (r.snapshot as { items: ShipmentView['items'] }).items,
        }) as ShipmentView,
    );
  }
  async summary(
    sql: Sql,
    order: OrderRow,
    preparedStock?: Awaited<ReturnType<typeof productionStock>>,
  ): Promise<SettlementView['delivery']> {
    const lines = fulfillmentLines(order.snapshot),
      items = await sql.query(
        "SELECT i.goods_key,sum(i.quantity)::int AS quantity,s.state FROM shipment_items i JOIN shipments s ON s.id=i.shipment_id WHERE s.order_id=$1 AND s.state<>'CANCELLED' GROUP BY i.goods_key,s.state",
        [order.id],
      );
    const sent = new Map<string, number>(),
      prepared = new Map<string, number>(),
      targets = new Map<string, number>();
    for (const line of lines) targets.set(line.key, (targets.get(line.key) ?? 0) + line.quantity);
    for (const row of items)
      (row.state === 'CONFIRMED' ? sent : prepared).set(
        String(row.goods_key),
        Number(row.quantity),
      );
    const sentRows = distribute(lines, sent),
      preparedRows = distribute(
        lines.map((l, i) => ({ ...l, quantity: Math.max(0, l.quantity - sentRows[i]) })),
        prepared,
      );
    const stock = preparedStock ?? (await productionStock(sql, order.id)),
      availableByKey = new Map<string, number>();
    for (const source of stock.sources)
      availableByKey.set(source.key, (availableByKey.get(source.key) ?? 0) + source.quantity);
    const available = distribute(
      lines.map((l, i) => ({ ...l, quantity: Math.max(0, l.quantity - sentRows[i]) })),
      availableByKey,
    );
    const unmatchedQuantity = [...sent]
        .filter(([key]) => !targets.has(key))
        .reduce((n, [, qty]) => n + qty, 0),
      excessQuantity = [...sent].reduce(
        (n, [key, qty]) => n + (targets.has(key) ? Math.max(0, qty - targets.get(key)!) : 0),
        0,
      ),
      oldPrepared = items.some((i) => i.state === 'PREPARED' && !targets.has(String(i.goods_key)));
    const quantities = lines.map((line, i) => ({
      lineIndex: i,
      key: line.key,
      name:
        (order.snapshot.selections.find((s) => s.id === line.productId)?.name ?? 'Product') +
        ' · ' +
        (order.snapshot.selections.find((s) => s.id === line.fabricId)?.name ?? 'Fabric'),
      size: line.size,
      quantity: line.quantity,
      shipped: sentRows[i],
      prepared: preparedRows[i],
      ready: available[i],
      available: available[i],
      prepareAvailable: Math.max(0, line.quantity - sentRows[i] - preparedRows[i]),
    }));
    const reviewRequired =
      unmatchedQuantity > 0 ||
      excessQuantity > 0 ||
      oldPrepared ||
      items.some(
        (i) =>
          i.state === 'PREPARED' &&
          Number(i.quantity) >
            (targets.get(String(i.goods_key)) ?? 0) - (sent.get(String(i.goods_key)) ?? 0),
      );
    const total = lines.reduce((n, l) => n + l.quantity, 0),
      shipped = sentRows.reduce((n, x) => n + x, 0),
      status =
        shipped === total && !reviewRequired
          ? 'COMPLETED'
          : shipped + unmatchedQuantity + excessQuantity > 0
            ? 'PARTIALLY_SHIPPED'
            : 'NOT_SHIPPED';
    return {
      status,
      orderStatus:
        order.business_state === 'CANCELLED'
          ? 'CANCELLED'
          : status === 'COMPLETED'
            ? 'COMPLETED'
            : 'CONFIRMED',
      reviewRequired,
      unmatchedQuantity,
      excessQuantity,
      readyQuantity: available.reduce((n, x) => n + x, 0),
      shippedQuantity: shipped,
      lines: quantities,
    };
  }
  prepare(actor: UserView, orderId: string, input: ShipmentInput) {
    return this.ledger.command(
      actor,
      orderId,
      'shipments.manage',
      'prepare',
      input,
      async (sql, fresh, order) => {
        await assertOrderOperational(sql, orderId);
        const view = await this.summary(sql, order),
          lines = fulfillmentLines(order.snapshot),
          requested = new Map<string, number>(),
          capacity = new Map<string, number>();
        for (const line of view.lines)
          capacity.set(line.key, (capacity.get(line.key) ?? 0) + line.prepareAvailable);
        for (const item of input.items) {
          const line = lines[item.lineIndex];
          if (!line) throw new AppError('INVALID_LINE', 'ບໍ່ພົບລາຍການໃນ Order', 400);
          requested.set(line.key, (requested.get(line.key) ?? 0) + item.quantity);
          if (item.quantity > line.quantity)
            throw new AppError('SHIPMENT_QUANTITY', 'ຈຳນວນກຽມສົ່ງເກີນ Order', 409);
        }
        if ([...requested].some(([key, quantity]) => quantity > (capacity.get(key) ?? 0)))
          throw new AppError(
            'SHIPMENT_QUANTITY',
            'ຈຳນວນກຽມສົ່ງເກີນທີ່ເຫຼືອ ຫຼືມີລາຍການ Prepared ຈອງແລ້ວ',
            409,
          );
        if (input.method === 'SHOP_DELIVERY' && !input.address.trim())
          throw new AppError('ADDRESS_REQUIRED', 'ກະລຸນາໃສ່ທີ່ຢູ່ຈັດສົ່ງ', 400);
        const id = uuidv7(),
          number = await nextNumber(sql, 'SHP'),
          snapshot = {
            orderNumber: order.order_number,
            customerName: order.snapshot.input.customerName,
            items: input.items.map((a) => ({
              ...a,
              name: view.lines[a.lineIndex].name,
              size: lines[a.lineIndex].size,
              key: lines[a.lineIndex].key,
            })),
          };
        await sql.query(
          'INSERT INTO shipments(id,order_id,order_revision,number,method,recipient,phone,address,carrier,tracking,notes,snapshot,prepared_by,prepared_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
          [
            id,
            orderId,
            order.latest_revision,
            number,
            input.method,
            input.recipient,
            input.phone,
            input.address,
            input.carrier,
            input.tracking,
            input.notes,
            JSON.stringify(snapshot),
            fresh.id,
            fresh.displayName,
          ],
        );
        for (const item of input.items)
          await sql.query(
            'INSERT INTO shipment_items(shipment_id,line_index,goods_key,quantity) VALUES($1,$2,$3,$4)',
            [id, item.lineIndex, lines[item.lineIndex].key, item.quantity],
          );
        await recordAudit(sql, fresh.id, 'SHIPMENT_PREPARED', orderId, input.reason, {
          shipmentId: id,
          number,
          orderRevision: order.latest_revision,
          items: input.items,
          method: input.method,
        });
        return { ok: true, shipmentId: id, number };
      },
    );
  }
  confirm(actor: UserView, orderId: string, id: string, input: ShipmentConfirm) {
    return this.ledger.command(
      actor,
      orderId,
      'shipments.manage',
      'confirm:' + id,
      input,
      async (sql, fresh, order) => {
        await assertOrderOperational(sql, orderId);
        const shipment = (
          await sql.query('SELECT * FROM shipments WHERE id=$1 AND order_id=$2', [id, orderId])
        )[0];
        if (!shipment || shipment.state !== 'PREPARED')
          throw new AppError('NOT_PREPARED', 'ລາຍການນີ້ບໍ່ແມ່ນ Prepared', 409);
        if (Number(shipment.order_revision) !== Number(order.latest_revision))
          throw new AppError(
            'SHIPMENT_REVISION',
            'Order ມີສະບັບໃໝ່ ໃຫ້ຍົກເລີກ Prepared ເກົ່າ ແລ້ວກຽມໃໝ່',
            409,
          );
        const items = await sql.query(
            'SELECT * FROM shipment_items WHERE shipment_id=$1 ORDER BY line_index',
            [id],
          ),
          stock = await productionStock(sql, orderId),
          summary = await this.summary(sql, order, stock),
          remaining = new Map<string, number>();
        for (const line of summary.lines)
          remaining.set(line.key, (remaining.get(line.key) ?? 0) + line.quantity - line.shipped);
        const requests = new Map<string, number>();
        for (const item of items)
          requests.set(
            String(item.goods_key),
            (requests.get(String(item.goods_key)) ?? 0) + Number(item.quantity),
          );
        const sources = stock.sources.map((s) => ({ ...s }));
        for (const [key, quantity] of requests) {
          if (quantity > (remaining.get(key) ?? 0))
            throw new AppError('SHIPMENT_QUANTITY', 'ຈຳນວນສົ່ງເກີນ Order ທີ່ຍັງເຫຼືອ', 409);
          let need = quantity;
          for (const source of sources.filter((s) => s.key === key)) {
            const take = Math.min(need, source.quantity);
            if (take) {
              await sql.query(
                'INSERT INTO shipment_allocations(shipment_id,sheet_id,sheet_version,line_index,goods_key,quantity) VALUES($1,$2,$3,$4,$5,$6)',
                [id, source.sheetId, source.version, source.lineIndex, key, take],
              );
              need -= take;
              source.quantity -= take;
            }
            if (!need) break;
          }
          if (need)
            throw new AppError(
              'NOT_READY_TO_SHIP',
              'ຈຳນວນພ້ອມສົ່ງຍັງບໍ່ພໍ ຕ້ອງ QC Complete ແລະປິດປັນຫາກ່ອນ',
              409,
            );
        }
        const money = await moneySummary(sql, order);
        await sql.query(
          "UPDATE shipments SET state='CONFIRMED',confirmed_by=$2,confirmed_name=$3,confirmed_at=now(),confirmed_early=$4,due_at_confirmation=$5 WHERE id=$1",
          [id, fresh.id, fresh.displayName, input.confirmedEarly, money.due],
        );
        await recordAudit(sql, fresh.id, 'SHIPMENT_CONFIRMED', orderId, input.reason, {
          shipmentId: id,
          number: shipment.number,
          confirmedEarly: input.confirmedEarly,
          dueAtConfirmation: money.due,
          orderRevision: order.latest_revision,
        });
        return { ok: true, shipmentId: id };
      },
    );
  }
  cancel(actor: UserView, orderId: string, id: string, input: SettlementAction) {
    return this.ledger.command(
      actor,
      orderId,
      'shipments.manage',
      'cancel:' + id,
      input,
      async (sql, fresh) => {
        const row = (
          await sql.query('SELECT * FROM shipments WHERE id=$1 AND order_id=$2', [id, orderId])
        )[0];
        if (!row || row.state === 'CANCELLED')
          throw new AppError('ALREADY_CANCELLED', 'ລາຍການນີ້ຍົກເລີກແລ້ວ ຫຼືບໍ່ພົບ', 409);
        await sql.query(
          "UPDATE shipments SET state='CANCELLED',cancelled_by=$2,cancelled_at=now(),cancel_reason=$3 WHERE id=$1",
          [id, fresh.id, input.reason],
        );
        await recordAudit(sql, fresh.id, 'SHIPMENT_CANCELLED', orderId, input.reason, {
          shipmentId: id,
          number: row.number,
          previousState: row.state,
        });
        await updatePreparation(sql, orderId);
        return { ok: true, shipmentId: id };
      },
    );
  }
  metadata(actor: UserView, orderId: string, id: string, input: ShipmentMetadata) {
    return this.ledger.command(
      actor,
      orderId,
      'shipments.manage',
      'metadata:' + id,
      input,
      async (sql, fresh) => {
        const row = (
          await sql.query('SELECT * FROM shipments WHERE id=$1 AND order_id=$2', [id, orderId])
        )[0];
        if (!row || row.state === 'CANCELLED')
          throw new AppError('NOT_FOUND', 'ບໍ່ພົບລາຍການສົ່ງທີ່ຍັງໃຊ້ຢູ່', 404);
        const before = { carrier: row.carrier, tracking: row.tracking, notes: row.notes },
          after = { carrier: input.carrier, tracking: input.tracking, notes: input.notes };
        await sql.query('UPDATE shipments SET carrier=$2,tracking=$3,notes=$4 WHERE id=$1', [
          id,
          input.carrier,
          input.tracking,
          input.notes,
        ]);
        await recordAudit(sql, fresh.id, 'SHIPMENT_DETAILS_UPDATED', orderId, input.reason, {
          shipmentId: id,
          actorName: fresh.displayName,
          before,
          after,
        });
        return { ok: true, shipmentId: id };
      },
    );
  }
}
