import { randomUUID } from 'node:crypto';
import type { productionFixture } from './production-fixture';
import {
  issueReportSchema,
  issueResolveSchema,
} from '../../../packages/contracts/src/production-exceptions';
export async function resolvedIssue(
  f: Awaited<ReturnType<typeof productionFixture>>,
  quantity = 3,
  replacementQty = 0,
) {
  await f.finish(f.id);
  const job = (await f.work.detail(f.owner, f.id)).job,
    issueId = randomUUID();
  await f.exceptions.report(
    f.actors.PRINTING,
    f.id,
    issueReportSchema.parse({
      requestId: issueId,
      version: job.version,
      sheetRowVersion: job.sheetRowVersion,
      department: 'PRINTING',
      category: 'DAMAGE',
      mode: 'CONTINUE',
      description: 'บันทึกจำนวนเพื่อทดสอบแก้ไข',
      affected: [{ lineIndex: 0, quantity }],
    }),
  );
  const detail = await f.exceptions.detail(f.owner, f.id),
    issue = detail.issues.find((i) => i.id === issueId)!;
  const result = (await f.exceptions.resolve(
    f.actors.ADMIN,
    issueId,
    issueResolveSchema.parse({
      requestId: randomUUID(),
      rowVersion: issue.rowVersion,
      sheetRowVersion: (await f.production.detail(f.owner, f.id)).sheet.rowVersion,
      reason: 'ยืนยันครั้งแรก',
      rows: [
        {
          lineIndex: 0,
          usableQty: 0,
          scrapQty: quantity,
          releaseQty: 0,
          ignoredQty: 0,
          replacementQty,
        },
      ],
    }),
  )) as { replacementId: string | null };
  return { issueId, ...result };
}
