import { randomUUID } from 'node:crypto';
import type { productionFixture } from './production-fixture';
import { AssetService } from '../../../apps/server/src/assets/asset-service';
import { draftSchema, type DraftInput } from '../../../packages/contracts/src/orders';
import { businessDate } from '../../../packages/contracts/src/customers';
export const fixturePng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
export async function reviseOrder(
  f: Awaited<ReturnType<typeof productionFixture>>,
  changes: Partial<DraftInput> = {},
  png = fixturePng,
) {
  const row = (
    await f.db.query('SELECT row_version,input_json FROM order_drafts WHERE id=$1', [f.draftId])
  )[0];
  await f.drafts.save(
    f.owner,
    f.draftId,
    draftSchema.parse({
      ...(row.input_json as DraftInput),
      ...changes,
      rowVersion: Number(row.row_version),
      reason: 'แก้ออเดอร์ระหว่างผลิต',
    }),
  );
  const assets = new AssetService(f.db);
  for (const kind of ['NECK_LABEL', 'NECK_TAPE', 'MOCKUP'] as const) {
    const id = randomUUID();
    await assets.upload(f.actors.GRAPHIC, id, {
      draftId: f.draftId,
      kind,
      filename: kind + '.png',
      base64: png,
    });
    await assets.review(f.actors.GRAPHIC, id, 'APPROVED', 'ตรวจไฟล์ฉบับใหม่');
  }
  const input = {
    draftId: f.draftId,
    rowVersion: Number(row.row_version) + 1,
    dueDate: businessDate(),
  };
  const check = await f.orders.check(f.owner, input);
  return (await f.orders.confirm(f.owner, input, check.checkToken, 'ยืนยันฉบับใหม่')).order;
}
