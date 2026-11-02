import type { TrackingView } from '../../../../packages/contracts/src/tracking';
import { WORK_STAGES } from '../../../../packages/contracts/src/production-work';
import { Database } from '../database';
import { AppError } from '../errors';
import { productionStock, readinessFromStock, preparedQuantities } from '../production/quantities';
import { moneySummary } from '../settlements/ledger';
import { ShipmentService } from '../settlements/shipment-service';
import { TrackingLinkService } from './link-service';
import { requestView } from './commands';
export class PublicTrackingService {
  private links: TrackingLinkService;
  private ships: ShipmentService;
  constructor(private db: Database) {
    this.links = new TrackingLinkService(db);
    this.ships = new ShipmentService(db);
  }
  view(session: string | undefined, token: string | undefined): Promise<TrackingView> {
    return this.db.transaction(async (sql) => {
      const order = await this.links.authorized(sql, session, token),
        stock = await productionStock(sql, order.id),
        ready = readinessFromStock(order.id, stock),
        delivery = await this.ships.summary(sql, order, stock),
        money = await moneySummary(sql, order);
      const work = await sql.query(
        "SELECT w.* FROM production_stage_work w JOIN production_sheets s ON s.id=w.sheet_id WHERE s.order_id=$1 AND s.order_revision=$2 AND s.state='READY' AND w.sheet_version=s.issued_version",
        [order.id, order.latest_revision],
      );
      const currentSheets = stock.sheets.filter((s) => s.state === 'READY');
      const planned = preparedQuantities(stock),
        covered = ready.lines.every((l, i) => planned[i] >= l.quantity);
      const production = WORK_STAGES.map((stage) => {
        const jobs = work.filter((w) => w.department === stage),
          allDone =
            covered &&
            jobs.length === currentSheets.length &&
            jobs.every((w) => w.state === 'COMPLETED');
        const done = delivery.status === 'COMPLETED' || (currentSheets.length > 0 && allDone);
        return {
          stage,
          state: done
            ? ('COMPLETED' as const)
            : delivery.shippedQuantity > 0 || jobs.some((w) => w.state !== 'NOT_STARTED')
              ? ('IN_PROGRESS' as const)
              : ('NOT_STARTED' as const),
        };
      });
      const requests = await sql.query(
        'SELECT * FROM customer_requests WHERE order_id=$1 ORDER BY submitted_at DESC,id DESC LIMIT 50',
        [order.id],
      );
      const shipments = await sql.query(
        "SELECT s.method,s.carrier,s.tracking,s.confirmed_early,(SELECT sum(quantity)::int FROM shipment_items i WHERE i.shipment_id=s.id) AS quantity FROM shipments s WHERE s.order_id=$1 AND s.state='CONFIRMED' ORDER BY s.confirmed_at DESC,s.id DESC LIMIT 50",
        [order.id],
      );
      const mockup = order.snapshot.assets.find(
        (a) =>
          a.kind === 'MOCKUP' &&
          a.status === 'APPROVED' &&
          ['image/png', 'image/jpeg', 'image/webp'].includes(a.mime),
      );
      // สร้างคำตอบใหม่แบบระบุช่อง ห้ามคืน snapshot หรือแถวฐานข้อมูลดิบให้ลูกค้า
      return {
        orderState: order.business_state,
        orderNumber: order.order_number,
        customerName: order.snapshot.input.customerName,
        dueDate: order.snapshot.dueDate,
        items: delivery.lines.map((l) => ({ name: l.name, size: l.size, quantity: l.quantity })),
        quantity: ready.quantity,
        readyQuantity: ready.readyQuantity,
        confirmedQuantity: delivery.shippedQuantity,
        payment:
          order.business_state === 'CANCELLED'
            ? 'REVIEW_REQUIRED'
            : money.status === 'OVERPAID'
              ? 'PAID'
              : money.status,
        production,
        hasMockup: !!mockup,
        deliveries: shipments.map((s) => ({
          method: s.method as 'CUSTOMER_PICKUP' | 'SHOP_DELIVERY',
          carrier: String(s.carrier),
          tracking: String(s.tracking),
          confirmedInAdvance: s.confirmed_early === true,
          quantity: Number(s.quantity),
        })),
        requests: requests.map((row) => {
          const { rowVersion: _version, ...view } = requestView(row);
          void _version;
          return view;
        }),
      };
    });
  }
  mockup(session: string | undefined, token: string | undefined) {
    return this.db.transaction(async (sql) => {
      const order = await this.links.authorized(sql, session, token),
        asset = order.snapshot.assets.find(
          (a) =>
            a.kind === 'MOCKUP' &&
            a.status === 'APPROVED' &&
            ['image/png', 'image/jpeg', 'image/webp'].includes(a.mime),
        );
      if (!asset) throw new AppError('NOT_FOUND', 'ບໍ່ມີຮູບ / No image', 404);
      const file = (
        await sql.query("SELECT mime,file_data FROM graphic_assets WHERE id=$1 AND kind='MOCKUP'", [
          asset.id,
        ])
      )[0];
      if (!file) throw new AppError('NOT_FOUND', 'ບໍ່ມີຮູບ / No image', 404);
      return { mime: String(file.mime), bytes: Buffer.from(file.file_data as Uint8Array) };
    });
  }
}
