import { createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import type { UserView } from '../../../../packages/contracts/src/identity';
import type {
  QuotationCheckInput,
  QuotationIssueInput,
  QuotationHistory,
  QuotationSummary,
  QuotationView,
} from '../../../../packages/contracts/src/quotations';
import { Database } from '../database';
import { ActorAuthorization } from '../identity/application/actor-authorization';
import { PricingService } from '../pricing/pricing-service';
import { AppError } from '../errors';
import { recordAudit } from '../shared/audit';
import { nextDocumentNumber } from '../shared/document-number';
import { quotationSource } from './quotation-source';
import { queueDocument } from '../documents/queue-document';
const projection = `r.id,q.id AS "quotationId",q.draft_id AS "draftId",q.number,r.revision,q.latest_revision AS "latestRevision",r.draft_version AS "draftVersion",r.issued_at AS "issuedAt",r.actor_name AS "actorName",r.reason,r.snapshot->'input'->>'customerName' AS "customerName",r.snapshot->'pricing'->>'total' AS total,r.snapshot->>'validUntil' AS "validUntil"`;
export class QuotationService {
  private auth = new ActorAuthorization();
  private pricing: PricingService;
  constructor(private db: Database) {
    this.pricing = new PricingService(db);
  }
  async check(actor: UserView, id: string, input: QuotationCheckInput) {
    return this.db.transaction(async (sql) => {
      await sql.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await this.auth.require(sql, actor, 'orders.manage');
      return quotationSource(sql, this.pricing, actor, id, input);
    });
  }
  async issue(actor: UserView, draftId: string, input: QuotationIssueInput) {
    return this.db.transaction(async (sql) => {
      const fresh = await this.auth.require(sql, actor, 'orders.manage', true);
      await sql.query('LOCK TABLE order_drafts IN SHARE ROW EXCLUSIVE MODE');
      await sql.query(
        'LOCK TABLE pricing_versions,catalog_items,catalog_item_sizes,catalog_item_fabrics,customers IN SHARE MODE',
      );
      const hash = createHash('sha256')
          .update(JSON.stringify({ actor: fresh.id, draftId, input }))
          .digest('hex'),
        old = (
          await sql.query('SELECT request_hash,result FROM quotation_commands WHERE id=$1', [
            input.requestId,
          ])
        )[0];
      if (old) {
        if (old.request_hash !== hash)
          throw new AppError('REQUEST_CONFLICT', 'ຄຳຂໍເກົ່າຕ່າງກັນ / Request changed', 409);
        return old.result as { revisionId: string };
      }
      const checked = await quotationSource(sql, this.pricing, fresh, draftId, {
        draftVersion: input.draftVersion,
        validUntil: input.validUntil,
        notes: input.notes,
      });
      if (!checked.ready || !checked.snapshot)
        throw new AppError('QUOTATION_NOT_READY', checked.missing.join(' · '), 409);
      if (checked.checkToken !== input.checkToken)
        throw new AppError(
          'QUOTATION_CHANGED',
          'ຮ່າງ ລາຄາ ຫຼືຂໍ້ມູນປ່ຽນ ກວດໃໝ່ / Draft, prices or terms changed; check again',
          409,
        );
      let parent = (
        await sql.query('SELECT * FROM quotations WHERE draft_id=$1 FOR UPDATE', [draftId])
      )[0];
      const revision = parent ? Number(parent.latest_revision) + 1 : 1;
      if (!parent) {
        parent = {
          id: uuidv7(),
          number: await nextDocumentNumber(sql, 'QT', checked.snapshot.businessDate),
        };
        await sql.query(
          'INSERT INTO quotations(id,draft_id,number,latest_revision) VALUES($1,$2,$3,1)',
          [parent.id, draftId, parent.number],
        );
      } else
        await sql.query('UPDATE quotations SET latest_revision=$2 WHERE id=$1', [
          parent.id,
          revision,
        ]);
      const revisionId = uuidv7();
      await sql.query(
        'INSERT INTO quotation_revisions(id,quotation_id,revision,draft_version,pricing_revision,snapshot,actor_id,actor_name,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          revisionId,
          parent.id,
          revision,
          input.draftVersion,
          checked.snapshot.pricing.revision,
          JSON.stringify(checked.snapshot),
          fresh.id,
          fresh.displayName,
          input.reason,
        ],
      );
      await recordAudit(sql, fresh.id, 'QUOTATION_ISSUED', String(parent.id), input.reason, {
        revisionId,
        revision,
        draftId,
        draftVersion: input.draftVersion,
        number: parent.number,
        pricingRevision: checked.snapshot.pricing.revision,
      });
      const result = { revisionId };
      await queueDocument(sql, 'QUOTATION', revisionId, revision);
      await sql.query(
        'INSERT INTO quotation_commands(id,actor_id,request_hash,result) VALUES($1,$2,$3,$4)',
        [input.requestId, fresh.id, hash, JSON.stringify(result)],
      );
      return result;
    });
  }
  async detail(actor: UserView, id: string): Promise<QuotationView> {
    await this.auth.require(this.db, actor, 'orders.manage');
    const row = (
      await this.db.query(
        `SELECT ${projection},r.snapshot,d.row_version AS "currentDraftVersion",o.id AS "linkedOrderId" FROM quotation_revisions r JOIN quotations q ON q.id=r.quotation_id JOIN order_drafts d ON d.id=q.draft_id LEFT JOIN orders o ON o.draft_id=d.id WHERE r.id=$1`,
        [id],
      )
    )[0];
    if (!row) throw new AppError('NOT_FOUND', 'ບໍ່ພົບໃບສະເໜີລາຄາ / Quotation not found', 404);
    return row as unknown as QuotationView;
  }
  async history(actor: UserView, draftId: string, page = 1): Promise<QuotationHistory> {
    await this.auth.require(this.db, actor, 'orders.manage');
    const draft = (
      await this.db.query(
        'SELECT d.row_version,o.id AS order_id FROM order_drafts d LEFT JOIN orders o ON o.draft_id=d.id WHERE d.id=$1',
        [draftId],
      )
    )[0];
    if (!draft) throw new AppError('NOT_FOUND', 'Draft not found', 404);
    const rows = await this.db.query(
      `SELECT ${projection} FROM quotations q JOIN quotation_revisions r ON r.quotation_id=q.id WHERE q.draft_id=$1 ORDER BY r.revision DESC LIMIT 26 OFFSET $2`,
      [draftId, (page - 1) * 25],
    );
    return {
      revisions: rows.slice(0, 25) as unknown as QuotationSummary[],
      hasMore: rows.length > 25,
      linkedOrderId: draft.order_id ? String(draft.order_id) : null,
      currentDraftVersion: Number(draft.row_version),
    };
  }
  async list(actor: UserView, search: string, page = 1) {
    await this.auth.require(this.db, actor, 'orders.manage');
    const rows = await this.db.query(
      `SELECT ${projection} FROM quotations q JOIN quotation_revisions r ON r.quotation_id=q.id AND r.revision=q.latest_revision WHERE $1='' OR strpos(lower(q.number||' '||(r.snapshot->'input'->>'customerName')||' '||(r.snapshot->'input'->>'phone')),lower($1))>0 ORDER BY q.created_at DESC,q.id DESC LIMIT 26 OFFSET $2`,
      [search, (page - 1) * 25],
    );
    return {
      quotations: rows.slice(0, 25) as unknown as QuotationSummary[],
      hasMore: rows.length > 25,
    };
  }
}
