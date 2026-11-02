import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { productionFixture } from './helpers/production-fixture';
import { volumeFixture } from './helpers/volume-fixture';
import { PaymentService } from '../../apps/server/src/settlements/payment-service';
import { receiptSchema } from '../../packages/contracts/src/settlement';
import { createApplication } from '../../apps/server/src/app';
import { SettlementService } from '../../apps/server/src/settlements/settlement-service';
import { businessDate } from '../../packages/contracts/src/customers';
type TestBody = {
  code?: string;
  entryId: string;
  shipmentId: string;
  sales: string;
  outstanding: string;
  netCash: string;
  rows: { netPaid: string }[];
  draft: { input: { customerName: string } };
};

test(
  '12 independent HTTP sessions preserve money, shipping, production, drafts and report consistency under competing requests',
  { timeout: 60000 },
  async (t) => {
    const f = await productionFixture();
    const origin = 'http://localhost:5191',
      app = await createApplication(
        { production: false, origin, port: 0, dataDir: ':memory:' },
        f.db,
        false,
      );
    try {
      await app.listen(0, '127.0.0.1');
      const address = app.getHttpServer().address() as { port: number },
        base = `http://127.0.0.1:${address.port}/api/v1`;
      const clients = await Promise.all(
        Array.from({ length: 12 }, async (_, i) => {
          const admin = i % 2 === 1;
          const logged = await f.auth.login(
            admin ? 'fixture.admin' : 'fixture.owner',
            'Fixture-production-password-123' + (admin ? 'new' : ''),
            '127.0.0.1',
          );
          const session = await fetch(base + '/auth/session', {
            headers: { cookie: `jazmine_session=${logged.token}` },
          });
          const csrf = ((await session.json()) as { csrfToken: string }).csrfToken;
          return async (method: string, path: string, body?: unknown) => {
            const response = await fetch(base + path, {
              method,
              headers: {
                origin,
                'content-type': 'application/json',
                'x-csrf-token': csrf,
                cookie: `jazmine_session=${logged.token}; jazmine_csrf=${csrf}`,
              },
              ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
            return { status: response.status, body: (await response.json()) as TestBody };
          };
        }),
      );
      const settlements = new SettlementService(f.db),
        view = () => settlements.detail(f.owner, f.order.id),
        orderPath = '/settlements/orders/' + f.order.id;
      async function command() {
        const v = await view();
        return {
          requestId: randomUUID(),
          expectedVersion: v.version,
          orderRevision: v.revision,
          reason: 'ตรวจหลายหน้าจอพร้อมกัน',
        };
      }
      async function receipt(amount: string) {
        return {
          ...(await command()),
          purpose: 'DEPOSIT',
          currency: 'LAK',
          amount,
          method: 'CASH',
          reference: '',
          occurredAt: new Date().toISOString(),
          rateRevision: (await view()).rates.revision,
        };
      }
      function oneWinner(results: { status: number; body: { code?: string } }[]) {
        assert.equal(
          results.filter((r) => r.status === 201 || r.status === 200).length,
          1,
          JSON.stringify(results),
        );
        for (const r of results.filter((r) => r.status !== 201 && r.status !== 200)) {
          assert.equal(r.status, 409);
          assert.equal(r.body.code, 'STALE_STATE');
        }
        return results.find((r) => r.status === 201 || r.status === 200)!;
      }
      let receiptId = '',
        shipmentId = '';
      await t.test(
        'identical receipt retry returns one receipt, version increment and audit record',
        async () => {
          const input = await receipt('100000');
          const results = await Promise.all(
            Array.from({ length: 12 }, () => clients[0]('POST', orderPath + '/receipts', input)),
          );
          assert(results.every((r) => r.status === 201));
          receiptId = results[0].body.entryId;
          assert(results.every((r) => r.body.entryId === receiptId));
          const v = await view();
          assert.equal(v.version, 1);
          assert.equal(v.payments.length, 1);
          assert.equal(v.money.netPaid, '100000');
          assert.equal(
            (
              await f.db.query(
                "SELECT id FROM audit_events WHERE action='PAYMENT_RECEIVED' AND entity_id=$1",
                [f.order.id],
              )
            ).length,
            1,
          );
        },
      );
      await t.test(
        'different receipt commands from stale screens cannot silently double-book money',
        async () => {
          const input = await receipt('5000');
          oneWinner(
            await Promise.all(
              clients.map((client) =>
                client('POST', orderPath + '/receipts', { ...input, requestId: randomUUID() }),
              ),
            ),
          );
          assert.equal((await view()).money.netPaid, '105000');
        },
      );
      await t.test(
        'concurrent owner refunds cannot exceed the original receipt; ADMIN remains forbidden',
        async () => {
          const input = {
            ...(await command()),
            receiptId,
            amount: '70000',
            method: 'CASH',
            reference: '',
            occurredAt: new Date().toISOString(),
          };
          const denied = await clients[1]('POST', orderPath + '/refunds', input);
          assert.equal(denied.status, 403);
          const results = await Promise.all([
            clients[0]('POST', orderPath + '/refunds', input),
            clients[2]('POST', orderPath + '/refunds', { ...input, requestId: randomUUID() }),
          ]);
          oneWinner(results);
          const over = await clients[0]('POST', orderPath + '/refunds', {
            ...input,
            ...(await command()),
          });
          assert.equal(over.status, 409);
          assert.equal(over.body.code, 'REFUND_LIMIT');
          assert.equal((await view()).money.netPaid, '35000');
        },
      );
      await t.test(
        'parallel production starts record one transition; old screens cannot start twice',
        async () => {
          const job = (await f.work.detail(f.owner, f.id)).job;
          const input = {
            version: job.version,
            sheetRowVersion: job.sheetRowVersion,
            stageRowVersion: 0,
            action: 'start',
            reason: 'ตรวจเริ่มพร้อมกัน',
          };
          oneWinner(
            await Promise.all(
              Array.from({ length: 12 }, () =>
                clients[0]('POST', `/production-work/jobs/${f.id}/stages/PRINTING`, {
                  ...input,
                  requestId: randomUUID(),
                }),
              ),
            ),
          );
          assert.equal(
            (await f.db.query('SELECT id FROM production_stage_events WHERE sheet_id=$1', [f.id]))
              .length,
            1,
          );
          await f.finish(f.id);
        },
      );
      await t.test(
        'competing shipping reservations and repeated confirmation consume QC goods only once',
        async () => {
          const input = {
            ...(await command()),
            method: 'CUSTOMER_PICKUP',
            recipient: 'ลูกค้าทดสอบ',
            phone: '02055551234',
            address: '',
            carrier: '',
            tracking: '',
            notes: '',
            items: [{ lineIndex: 0, quantity: 7 }],
          };
          const results = await Promise.all(
            clients.map((client) =>
              client('POST', orderPath + '/shipments', { ...input, requestId: randomUUID() }),
            ),
          );
          oneWinner(results);
          shipmentId = results.find((r) => r.status === 201)!.body.shipmentId;
          const over = await clients[0]('POST', orderPath + '/shipments', {
            ...input,
            ...(await command()),
          });
          assert.equal(over.status, 409);
          assert.equal(over.body.code, 'SHIPMENT_QUANTITY');
          const confirm = { ...(await command()), confirmedEarly: true };
          const confirmed = await Promise.all(
            Array.from({ length: 12 }, () =>
              clients[0]('POST', orderPath + `/shipments/${shipmentId}/confirm`, confirm),
            ),
          );
          assert(confirmed.every((r) => r.status === 201 && r.body.shipmentId === shipmentId));
          const v = await view();
          assert.equal(v.delivery.shippedQuantity, 7);
          assert.equal(v.delivery.readyQuantity, 4);
          assert.equal(v.shipments.length, 1);
        },
      );
      await t.test(
        'report reads during receipt writes keep all totals from the same committed state',
        async () => {
          const input = await receipt('1000'),
            today = businessDate();
          const results = await Promise.all(
            clients.map((client, i) =>
              i % 2 === 0
                ? client('GET', `/reports/summary?from=${today}&to=${today}&page=1`)
                : client('POST', orderPath + '/receipts', { ...input, requestId: randomUUID() }),
            ),
          );
          for (const r of results.filter((_, i) => i % 2 === 0)) {
            assert.equal(r.status, 200);
            assert.equal(r.body.outstanding, String(BigInt(r.body.sales) - BigInt(r.body.netCash)));
            assert.equal(r.body.rows[0].netPaid, r.body.netCash);
            assert(['35000', '36000'].includes(r.body.netCash));
          }
          oneWinner(results.filter((_, i) => i % 2 === 1));
          assert.equal((await view()).money.netPaid, '36000');
        },
      );
      await t.test(
        'concurrent draft edits preserve one complete version and reject all other old screens',
        async () => {
          const results = await Promise.all(
            clients.map((client, i) =>
              client('PUT', '/order-drafts/' + f.draftId, {
                ...f.input,
                rowVersion: 1,
                customerName: 'แก้พร้อมกัน ' + i,
                reason: 'ตรวจแก้พร้อมกัน ' + i,
              }),
            ),
          );
          oneWinner(results);
          const row = (
            await f.db.query('SELECT row_version,input_json FROM order_drafts WHERE id=$1', [
              f.draftId,
            ])
          )[0];
          assert.equal(Number(row.row_version), 2);
          assert.equal(
            (row.input_json as { customerName: string }).customerName,
            results.find((r) => r.status === 200)!.body.draft.input.customerName,
          );
        },
      );
    } finally {
      await app.close();
      await f.db.close();
    }
  },
);

test('receipts for 12 different orders all commit with distinct document numbers', async () => {
  const f = await volumeFixture(100);
  try {
    const orders = await f.db.query(
        "SELECT id FROM orders WHERE order_number LIKE 'LOAD-JAZ-%' ORDER BY id LIMIT 12",
      ),
      payments = new PaymentService(f.db),
      views = new SettlementService(f.db);
    const commands = orders.map((o) =>
      payments.receipt(
        f.actors.ADMIN,
        String(o.id),
        receiptSchema.parse({
          requestId: randomUUID(),
          expectedVersion: 0,
          orderRevision: 2,
          reason: 'หลายออเดอร์พร้อมกัน',
          purpose: 'DEPOSIT',
          currency: 'LAK',
          amount: '1000',
          method: 'CASH',
          reference: '',
          occurredAt: new Date().toISOString(),
          rateRevision: 2,
        }),
      ),
    );
    const results = (await Promise.all(commands)) as { number: string }[];
    assert.equal(new Set(results.map((r) => r.number)).size, 12);
    for (const order of orders) {
      const v = await views.detail(f.owner, String(order.id));
      assert.equal(v.version, 1);
      assert.equal(v.money.netPaid, '151000');
    }
  } finally {
    await f.db.close();
  }
});
