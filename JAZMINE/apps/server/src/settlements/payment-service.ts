import { uuidv7 } from 'uuidv7';
import type { UserView } from '../../../../packages/contracts/src/identity';
import type {
  PaymentEntry,
  ReceiptInput,
  RefundInput,
  SettlementAction,
} from '../../../../packages/contracts/src/settlement';
import type { PricingConfig } from '../../../../packages/contracts/src/pricing';
import { Database, type Sql } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { AppError } from '../errors';
import { recordAudit } from '../shared/audit';
import { SettlementLedger, nextNumber, type OrderRow } from './ledger';
import { minor, decimal, toLak, refundLak } from './money';
import { queueDocument } from '../documents/queue-document';
type Row = Record<string, unknown>;
export class PaymentService {
  private auth = new ActorAuthorization();
  private ledger: SettlementLedger;
  constructor(private db: Database) {
    this.ledger = new SettlementLedger(db);
  }
  async rates(sql: Sql = this.db) {
    const row = (
      await sql.query('SELECT revision,config FROM pricing_versions ORDER BY revision DESC LIMIT 1')
    )[0];
    if (!row) throw new AppError('RATE_NOT_READY', 'ຍັງບໍ່ມີອັດຕາ', 409);
    const config = row.config as PricingConfig;
    return { revision: Number(row.revision), THB: config.fx.THB, USD: config.fx.USD };
  }
  async list(sql: Sql, id: string): Promise<PaymentEntry[]> {
    const rows = await sql.query(
      'SELECT * FROM payment_entries WHERE order_id=$1 ORDER BY recorded_at,id',
      [id],
    );
    return rows.map((r) => {
      const refunded = rows
        .filter((f) => f.receipt_id === r.id && f.state === 'ACTIVE')
        .reduce((n, f) => n + BigInt(String(f.amount_minor)), 0n);
      return {
        id: String(r.id),
        number: String(r.number),
        kind: r.kind,
        purpose: r.purpose,
        state: r.state,
        receiptId: r.receipt_id,
        correctsId: r.corrects_id,
        currency: r.currency,
        amount: decimal(BigInt(String(r.amount_minor))),
        lakAmount: String(r.lak_amount),
        exchangeRate: String(r.exchange_rate),
        method: r.method,
        reference: String(r.reference),
        occurredAt: new Date(r.occurred_at as string).toISOString(),
        recordedAt: new Date(r.recorded_at as string).toISOString(),
        actorName: String(r.actor_name),
        reason: String(r.reason),
        voidReason: r.void_reason,
        refundable:
          r.kind === 'RECEIPT' && r.state === 'ACTIVE'
            ? decimal(BigInt(String(r.amount_minor)) - refunded)
            : '0.00',
        snapshot: r.snapshot,
      } as PaymentEntry;
    });
  }
  private async noRefunds(sql: Sql, id: string) {
    if (
      (
        await sql.query(
          "SELECT id FROM payment_entries WHERE receipt_id=$1 AND state='ACTIVE' LIMIT 1",
          [id],
        )
      ).length
    )
      throw new AppError(
        'REFUND_LINKED',
        'ມີລາຍການຄືນເງິນແລ້ວ ໃຫ້ເຈົ້າຂອງກວດລາຍການຄືນເງິນກ່ອນ',
        409,
      );
  }
  private async voidRow(sql: Sql, actor: UserView, row: Row, reason: string) {
    if (row.state !== 'ACTIVE') throw new AppError('ALREADY_VOIDED', 'ລາຍການນີ້ຍົກເລີກແລ້ວ', 409);
    if (row.kind === 'RECEIPT') await this.noRefunds(sql, String(row.id));
    await sql.query(
      "UPDATE payment_entries SET state='VOIDED',voided_by=$2,voided_at=now(),void_reason=$3 WHERE id=$1",
      [row.id, actor.id, reason],
    );
    await recordAudit(sql, actor.id, 'PAYMENT_ENTRY_VOIDED', String(row.order_id), reason, {
      entryId: row.id,
      kind: row.kind,
      number: row.number,
      amount: String(row.amount_minor),
      currency: row.currency,
      lakAmount: String(row.lak_amount),
    });
  }
  receipt(actor: UserView, id: string, input: ReceiptInput) {
    return this.ledger.command(
      actor,
      id,
      'payments.record',
      'receipt',
      input,
      async (sql, fresh, order) => {
        if (
          order.business_state === 'CANCELLED' &&
          order.cancel_agreed_lak == null &&
          !input.replaceReceiptId
        )
          throw new AppError(
            'CANCELLATION_FINANCE_REQUIRED',
            'ໃຫ້ເຈົ້າຂອງຕົກລົງຍອດຫຼັງຍົກເລີກກ່ອນຮັບເພີ່ມ / Owner must record the cancellation agreement before collecting more money',
            409,
          );
        const rates = await this.rates(sql);
        if (rates.revision !== input.rateRevision)
          throw new AppError('RATE_CHANGED', 'ອັດຕາມີສະບັບໃໝ່ ກະລຸນາ Reload', 409);
        const rate = input.currency === 'LAK' ? '1' : rates[input.currency];
        if (!rate)
          throw new AppError('RATE_NOT_READY', 'ເຈົ້າຂອງຍັງບໍ່ກຳນົດອັດຕາ ' + input.currency, 409);
        const source = minor(input.amount),
          lak = toLak(source, rate);
        if (
          source <= 0n ||
          lak <= 0n ||
          lak > 9000000000000000n ||
          (input.currency === 'LAK' && source % 100n !== 0n)
        )
          throw new AppError('INVALID_AMOUNT', 'ຈຳນວນຕ້ອງຫຼາຍກວ່າ 0 ແລະ LAK ເປັນກີບເຕັມ', 400);
        if (input.replaceReceiptId) {
          const old = (
            await sql.query(
              "SELECT * FROM payment_entries WHERE id=$1 AND order_id=$2 AND kind='RECEIPT'",
              [input.replaceReceiptId, id],
            )
          )[0];
          if (!old) throw new AppError('NOT_FOUND', 'ບໍ່ພົບລາຍການເກົ່າ', 404);
          await this.voidRow(sql, fresh, old, input.reason);
        }
        const entryId = uuidv7(),
          number = await nextNumber(sql, 'RCPT');
        const snapshot = this.party(order);
        await sql.query(
          "INSERT INTO payment_entries(id,order_id,order_revision,number,kind,purpose,corrects_id,currency,amount_minor,lak_amount,exchange_rate,rate_revision,method,reference,occurred_at,actor_id,actor_name,reason,snapshot) VALUES($1,$2,$3,$4,'RECEIPT',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)",
          [
            entryId,
            id,
            order.latest_revision,
            number,
            input.purpose,
            input.replaceReceiptId ?? null,
            input.currency,
            String(source),
            String(lak),
            rate,
            rates.revision,
            input.method,
            input.reference,
            input.occurredAt,
            fresh.id,
            fresh.displayName,
            input.reason,
            JSON.stringify(snapshot),
          ],
        );
        await recordAudit(sql, fresh.id, 'PAYMENT_RECEIVED', id, input.reason, {
          entryId,
          number,
          purpose: input.purpose,
          amount: decimal(source),
          currency: input.currency,
          rate,
          rateRevision: rates.revision,
          lakAmount: String(lak),
          correctsId: input.replaceReceiptId ?? null,
          orderRevision: order.latest_revision,
        });
        await queueDocument(sql, 'RECEIPT', entryId, 1);
        return { ok: true, entryId, number };
      },
    );
  }
  refund(actor: UserView, id: string, input: RefundInput) {
    return this.ledger.command(
      actor,
      id,
      'payments.refund',
      'refund',
      input,
      async (sql, fresh, order) => {
        const receipt = (
          await sql.query(
            "SELECT * FROM payment_entries WHERE id=$1 AND order_id=$2 AND kind='RECEIPT' AND state='ACTIVE'",
            [input.receiptId, id],
          )
        )[0];
        if (!receipt) throw new AppError('NOT_FOUND', 'ບໍ່ພົບໃບຮັບເງິນທີ່ຍັງໃຊ້ຢູ່', 404);
        const previous = await sql.query(
            "SELECT amount_minor,lak_amount FROM payment_entries WHERE receipt_id=$1 AND state='ACTIVE'",
            [receipt.id],
          ),
          oldMinor = previous.reduce((n, r) => n + BigInt(String(r.amount_minor)), 0n),
          oldLak = previous.reduce((n, r) => n + BigInt(String(r.lak_amount)), 0n),
          amount = minor(input.amount),
          original = BigInt(String(receipt.amount_minor));
        if (
          amount <= 0n ||
          oldMinor + amount > original ||
          (receipt.currency === 'LAK' && amount % 100n !== 0n)
        )
          throw new AppError(
            'REFUND_LIMIT',
            'ຄືນໄດ້ບໍ່ເກີນເງິນຄົງເຫຼືອໃນໃບຮັບເງິນ ແລະ LAK ເປັນກີບເຕັມ',
            409,
          );
        const lak = refundLak(
            BigInt(String(receipt.lak_amount)),
            original,
            oldMinor + amount,
            oldLak,
          ),
          entryId = uuidv7(),
          number = await nextNumber(sql, 'REF');
        await sql.query(
          "INSERT INTO payment_entries(id,order_id,order_revision,number,kind,purpose,receipt_id,currency,amount_minor,lak_amount,exchange_rate,rate_revision,method,reference,occurred_at,actor_id,actor_name,reason,snapshot) VALUES($1,$2,$3,$4,'REFUND','REFUND',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)",
          [
            entryId,
            id,
            order.latest_revision,
            number,
            receipt.id,
            receipt.currency,
            String(amount),
            String(lak),
            receipt.exchange_rate,
            receipt.rate_revision,
            input.method,
            input.reference,
            input.occurredAt,
            fresh.id,
            fresh.displayName,
            input.reason,
            JSON.stringify(this.party(order)),
          ],
        );
        await recordAudit(sql, fresh.id, 'PAYMENT_REFUNDED', id, input.reason, {
          entryId,
          number,
          receiptId: receipt.id,
          currency: receipt.currency,
          amount: decimal(amount),
          lakAmount: String(lak),
          exchangeRate: receipt.exchange_rate,
        });
        return { ok: true, entryId, number };
      },
    );
  }
  async void(actor: UserView, id: string, entryId: string, input: SettlementAction) {
    await this.auth.require(this.db, actor, 'payments.record');
    const entry = (
      await this.db.query('SELECT kind FROM payment_entries WHERE id=$1 AND order_id=$2', [
        entryId,
        id,
      ])
    )[0];
    if (!entry) throw new AppError('NOT_FOUND', 'ບໍ່ພົບລາຍການເງິນ', 404);
    return this.ledger.command(
      actor,
      id,
      entry.kind === 'REFUND' ? 'payments.refund' : 'payments.record',
      'void:' + entryId,
      input,
      async (sql, fresh) => {
        const row = (
          await sql.query('SELECT * FROM payment_entries WHERE id=$1 AND order_id=$2', [
            entryId,
            id,
          ])
        )[0];
        await this.voidRow(sql, fresh, row, input.reason);
        return { ok: true, entryId };
      },
    );
  }
  private party(order: OrderRow) {
    return {
      orderNumber: order.order_number,
      invoiceNumber: order.invoice_number,
      orderRevision: Number(order.latest_revision),
      customerName: order.snapshot.input.customerName,
      phone: order.snapshot.input.phone,
      totalAtReceipt: String(order.snapshot.pricing.total),
    };
  }
}
