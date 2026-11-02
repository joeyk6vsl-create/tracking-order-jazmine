import type { Sql } from '../database';
import type { ResolutionHistory } from '../../../../packages/contracts/src/issue-corrections';
import type { SheetInput } from '../../../../packages/contracts/src/production';
export async function resolutionHistory(sql: Sql, issueId: string): Promise<ResolutionHistory[]> {
  const rows = await sql.query(
    'SELECT issue_version,kind,rows,actor_name,reason,recorded_at,replacement_changes FROM production_issue_resolutions WHERE issue_id=$1 ORDER BY issue_version',
    [issueId],
  );
  return rows.map((r) => ({
    issueVersion: Number(r.issue_version),
    kind: r.kind as ResolutionHistory['kind'],
    rows: r.rows as ResolutionHistory['rows'],
    actorName: String(r.actor_name),
    reason: String(r.reason),
    at: new Date(r.recorded_at as string).toISOString(),
    replacementChanges: r.replacement_changes as ResolutionHistory['replacementChanges'],
  }));
}
export async function replacementUsage(sql: Sql, issueId: string, excludeId?: string) {
  const children = await sql.query(
      'SELECT s.id,s.state,s.allocations FROM production_replacements r JOIN production_sheets s ON s.id=r.sheet_id WHERE r.issue_id=$1 AND ($2::uuid IS NULL OR s.id<>$2) ORDER BY s.id',
      [issueId, excludeId ?? null],
    ),
    ids = children.map((c) => String(c.id));
  if (!ids.length) return [];
  const sent = await sql.query(
    "SELECT a.sheet_id,a.line_index,sum(a.quantity)::int AS quantity FROM shipment_allocations a JOIN shipments s ON s.id=a.shipment_id WHERE a.sheet_id=ANY($1::uuid[]) AND s.state='CONFIRMED' GROUP BY a.sheet_id,a.line_index",
    [ids],
  );
  const carries = await sql.query(
    'SELECT source_sheet_id,mappings FROM production_revision_carries WHERE source_sheet_id=ANY($1::uuid[]) AND active',
    [ids],
  );
  const totals = new Map<number, number>();
  for (const child of children) {
    const committed = new Map<number, number>();
    for (const s of sent.filter((s) => s.sheet_id === child.id))
      committed.set(Number(s.line_index), Number(s.quantity));
    const mapping = carries.find((c) => c.source_sheet_id === child.id)?.mappings as
      { rows: { sourceLineIndex: number; quantity: number }[] } | undefined;
    for (const r of mapping?.rows ?? [])
      committed.set(r.sourceLineIndex, (committed.get(r.sourceLineIndex) ?? 0) + r.quantity);
    for (const a of child.allocations as SheetInput['allocations'])
      totals.set(
        a.lineIndex,
        (totals.get(a.lineIndex) ?? 0) +
          (child.state === 'CANCELLED'
            ? (committed.get(a.lineIndex) ?? 0)
            : Math.max(a.quantity, committed.get(a.lineIndex) ?? 0)),
      );
  }
  return [...totals].map(([lineIndex, quantity]) => ({ lineIndex, quantity }));
}
