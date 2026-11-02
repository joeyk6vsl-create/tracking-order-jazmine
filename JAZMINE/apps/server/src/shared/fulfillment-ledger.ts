import type { Sql } from '../database';
export async function shippedAllocations(sql: Sql, orderId: string) {
  return sql.query<{ sheet_id: string; line_index: number; goods_key: string; quantity: number }>(
    "SELECT a.sheet_id,a.line_index,a.goods_key,sum(a.quantity)::int AS quantity FROM shipment_allocations a JOIN shipments s ON s.id=a.shipment_id WHERE s.order_id=$1 AND s.state='CONFIRMED' GROUP BY a.sheet_id,a.line_index,a.goods_key",
    [orderId],
  );
}
export async function sourceShipped(sql: Sql, sheetId: string) {
  return sql.query<{ line_index: number; quantity: number }>(
    "SELECT a.line_index,sum(a.quantity)::int AS quantity FROM shipment_allocations a JOIN shipments s ON s.id=a.shipment_id WHERE a.sheet_id=$1 AND s.state='CONFIRMED' GROUP BY a.line_index",
    [sheetId],
  );
}
