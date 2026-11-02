import { createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import type { z } from 'zod';
import type {
  PaymentQrCurrency,
  PaymentQrReference,
  PaymentQrView,
  PaymentQrAttachment,
  paymentQrSaveSchema,
  paymentQrCheckSchema,
} from '../../../../packages/contracts/src/payment-qr';
import type { UserView } from '../../../../packages/contracts/src/identity';
import { Database, type Sql } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { recordAudit } from '../shared/audit';
import { AppError } from '../errors';
import { validatePaymentImage } from './validate-payment-image';
import {
  paymentQrSaveSchema as saveSchema,
  paymentQrCheckSchema as checkSchema,
} from '../../../../packages/contracts/src/payment-qr';
const fields =
  'v.id,s.currency,s.version,s.enabled,v.bank_name,v.receiver_name,v.account_reference,v.filename,v.verified_in_bank_app,v.actor_name,v.created_at,v.reason,v.print_sha256';
export function paymentQrReference(r: Record<string, unknown>): PaymentQrReference {
  return {
    id: String(r.id),
    currency: r.currency as PaymentQrCurrency,
    version: Number(r.version),
    bankName: String(r.bank_name),
    receiverName: String(r.receiver_name),
    accountReference: String(r.account_reference),
    imageSha256: String(r.print_sha256),
  };
}
const view = (r: Record<string, unknown>): PaymentQrView => ({
  currency: r.currency as PaymentQrCurrency,
  version: Number(r.version),
  enabled: !!r.enabled,
  reference: r.id ? paymentQrReference(r) : null,
  filename: String(r.filename ?? ''),
  verifiedInBankApp: !!r.verified_in_bank_app,
  actorName: String(r.actor_name ?? ''),
  createdAt: r.created_at ? new Date(r.created_at as string).toISOString() : null,
  reason: String(r.reason ?? ''),
});
export async function currentPaymentQrs(sql: Sql, lock = false) {
  if (lock) await sql.query('SELECT currency FROM payment_qr_settings ORDER BY currency FOR SHARE');
  const rows = await sql.query(
    `SELECT ${fields} FROM payment_qr_settings s JOIN payment_qr_versions v ON v.currency=s.currency AND v.version=s.version WHERE s.enabled=true ORDER BY s.currency`,
  );
  return rows.map(paymentQrReference);
}
export class PaymentQrService {
  private auth = new ActorAuthorization();
  constructor(private db: Database) {}
  async list(actor: UserView) {
    await this.auth.require(this.db, actor, 'orders.manage');
    return {
      settings: (
        await this.db.query(
          `SELECT ${fields} FROM payment_qr_settings s LEFT JOIN payment_qr_versions v ON v.currency=s.currency AND v.version=s.version ORDER BY s.currency`,
        )
      ).map(view),
    };
  }
  async inspect(actor: UserView, currency: PaymentQrCurrency, base64: string) {
    await this.auth.require(this.db, actor, 'payment-qr.manage');
    const checked = await validatePaymentImage(base64, currency);
    return { image: 'data:image/png;base64,' + checked.printBytes.toString('base64') };
  }
  async save(
    actor: UserView,
    currency: PaymentQrCurrency,
    input: z.infer<typeof paymentQrSaveSchema>,
  ) {
    await this.auth.require(this.db, actor, 'payment-qr.manage');
    input = saveSchema.parse(input);
    const hash = createHash('sha256')
      .update(JSON.stringify({ actor: actor.id, currency, input }))
      .digest('hex');
    const replay = (
      await this.db.query('SELECT request_hash,result FROM payment_qr_commands WHERE id=$1', [
        input.requestId,
      ])
    )[0];
    if (replay) {
      if (replay.request_hash !== hash)
        throw new AppError('REQUEST_CONFLICT', 'Request changed', 409);
      return replay.result as { currency: PaymentQrCurrency; version: number };
    }
    const previous = input.imageBase64
      ? null
      : (
          await this.db.query(
            'SELECT original_data,filename FROM payment_qr_versions WHERE currency=$1 AND version=$2',
            [currency, input.version],
          )
        )[0];
    if (!input.imageBase64 && !previous)
      throw new AppError(
        'QR_IMAGE_REQUIRED',
        'ເລືອກຮູບ QR ຈາກທະນາຄານ / Choose a bank QR image first',
        400,
      );
    const image = await validatePaymentImage(
      input.imageBase64 ?? Buffer.from(previous!.original_data as Uint8Array).toString('base64'),
      currency,
    );
    return this.db.transaction(async (sql) => {
      const fresh = await this.auth.require(sql, actor, 'payment-qr.manage', true);
      await sql.query('LOCK TABLE payment_qr_commands IN SHARE ROW EXCLUSIVE MODE');
      const old = (
        await sql.query('SELECT request_hash,result FROM payment_qr_commands WHERE id=$1', [
          input.requestId,
        ])
      )[0];
      if (old) {
        if (old.request_hash !== hash)
          throw new AppError('REQUEST_CONFLICT', 'Request changed', 409);
        return old.result as { currency: PaymentQrCurrency; version: number };
      }
      const settings = (
        await sql.query('SELECT version FROM payment_qr_settings WHERE currency=$1 FOR UPDATE', [
          currency,
        ])
      )[0];
      if (Number(settings.version) !== input.version)
        throw new AppError(
          'STALE_STATE',
          'ຂໍ້ມູນ QR ປ່ຽນແລ້ວ / Reload the latest payment QR settings',
          409,
        );
      const id = uuidv7(),
        version = input.version + 1;
      await sql.query(
        'INSERT INTO payment_qr_versions(id,currency,version,enabled,bank_name,receiver_name,account_reference,filename,original_mime,original_data,print_data,print_sha256,payload_sha256,verified_in_bank_app,created_by,actor_name,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)',
        [
          id,
          currency,
          version,
          input.enabled,
          input.bankName,
          input.receiverName,
          input.accountReference,
          input.filename ?? String(previous?.filename ?? 'bank-qr.png'),
          image.mime,
          image.bytes,
          image.printBytes,
          image.imageSha256,
          image.payloadSha256,
          input.verifiedInBankApp,
          fresh.id,
          fresh.displayName,
          input.reason,
        ],
      );
      await sql.query('UPDATE payment_qr_settings SET version=$2,enabled=$3 WHERE currency=$1', [
        currency,
        version,
        input.enabled,
      ]);
      await recordAudit(sql, fresh.id, 'PAYMENT_QR_VERSION_SAVED', id, input.reason, {
        currency,
        version,
        enabled: input.enabled,
        bankName: input.bankName,
        receiverName: input.receiverName,
        verifiedInBankApp: input.verifiedInBankApp,
        imageSha256: image.imageSha256,
      });
      const result = { currency, version };
      await sql.query('INSERT INTO payment_qr_commands(id,request_hash,result) VALUES($1,$2,$3)', [
        input.requestId,
        hash,
        JSON.stringify(result),
      ]);
      return result;
    });
  }
  async check(
    actor: UserView,
    input: z.infer<typeof paymentQrCheckSchema>,
  ): Promise<{ attachments: PaymentQrAttachment[] }> {
    return this.db.transaction(async (sql) => {
      await sql.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await this.auth.require(sql, actor, 'orders.manage');
      input = checkSchema.parse(input);
      const attachments: PaymentQrAttachment[] = [];
      for (const ref of input.versions) {
        const row = (
          await sql.query(
            `SELECT ${fields},v.print_data FROM payment_qr_settings s JOIN payment_qr_versions v ON v.currency=s.currency AND v.version=s.version WHERE s.currency=$1 AND s.version=$2 AND s.enabled=true`,
            [ref.currency, ref.version],
          )
        )[0];
        if (!row)
          throw new AppError(
            'PAYMENT_QR_CHANGED',
            'QR ປ່ຽນ ຫຼືຢຸດໃຊ້ແລ້ວ ເລືອກໃໝ່ / Payment QR changed or was disabled; reload and select again',
            409,
          );
        const bytes = Buffer.from(row.print_data as Uint8Array);
        if (createHash('sha256').update(bytes).digest('hex') !== row.print_sha256)
          throw new AppError('PAYMENT_QR_INTEGRITY', 'Payment QR image needs review', 409);
        attachments.push({
          ...paymentQrReference(row),
          image: 'data:image/png;base64,' + bytes.toString('base64'),
        });
      }
      return { attachments };
    });
  }
  async image(actor: UserView, currency: PaymentQrCurrency, version: number) {
    const fresh = await this.auth.require(this.db, actor, 'orders.manage');
    const row = (
      await this.db.query(
        'SELECT v.print_data,v.print_sha256,s.version AS current_version,s.enabled FROM payment_qr_versions v JOIN payment_qr_settings s ON s.currency=v.currency WHERE v.currency=$1 AND v.version=$2',
        [currency, version],
      )
    )[0];
    if (!row) throw new AppError('NOT_FOUND', 'Payment QR not found', 404);
    if (fresh.role !== 'ADMIN_PROMAX' && (!row.enabled || Number(row.current_version) !== version))
      throw new AppError('PAYMENT_QR_CHANGED', 'Payment QR is no longer active', 409);
    const bytes = Buffer.from(row.print_data as Uint8Array);
    if (createHash('sha256').update(bytes).digest('hex') !== row.print_sha256)
      throw new AppError('PAYMENT_QR_INTEGRITY', 'Payment QR image needs review', 409);
    return bytes;
  }
  async history(actor: UserView, currency: PaymentQrCurrency, page: number) {
    await this.auth.require(this.db, actor, 'payment-qr.manage');
    const rows = await this.db.query(
      'SELECT id,currency,version,enabled,bank_name,receiver_name,account_reference,filename,verified_in_bank_app,actor_name,created_at,reason,print_sha256 FROM payment_qr_versions WHERE currency=$1 ORDER BY version DESC LIMIT 26 OFFSET $2',
      [currency, (page - 1) * 25],
    );
    return { versions: rows.slice(0, 25).map(view), hasMore: rows.length > 25 };
  }
}
