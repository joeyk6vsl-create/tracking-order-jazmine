import { AppError } from '../errors';
export function minor(amount: string): bigint {
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(amount))
    throw new AppError('INVALID_AMOUNT', 'ຈຳນວນເງິນບໍ່ຖືກຕ້ອງ', 400);
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function decimal(value: bigint) {
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}
export function toLak(amount: bigint, rate: string) {
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,10})?$/.test(rate))
    throw new AppError('INVALID_RATE', 'ອັດຕາບໍ່ຖືກຕ້ອງ', 400);
  const [whole, fraction = ''] = rate.split('.'),
    scaled = BigInt(whole) * 10000000000n + BigInt(fraction.padEnd(10, '0'));
  if (scaled <= 0n) throw new AppError('INVALID_RATE', 'ອັດຕາຕ້ອງຫຼາຍກວ່າ 0', 400);
  return (amount * scaled + 500000000000n) / 1000000000000n;
}
export function refundLak(
  originalLak: bigint,
  originalMinor: bigint,
  refundedMinor: bigint,
  previousLak: bigint,
) {
  const cumulative = (originalLak * refundedMinor + originalMinor / 2n) / originalMinor;
  // ยกเลิกรายการคืนเก่าได้โดยไม่แก้จำนวนในรายการคืนอื่น: เศษปัดอาจถูกรับรู้ไปแล้ว
  // รอบถัดไปต้องไม่ติดลบ และเมื่อคืนครบต้องตรงยอด LAK ของใบรับเงินเดิมพอดี
  return cumulative > previousLak ? cumulative - previousLak : 0n;
}
