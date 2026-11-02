import QRCode from 'qrcode';
import { randomUUID } from 'node:crypto';
import { paymentQrCrc } from '../../../apps/server/src/payment-qr/validate-payment-image';
import type { PaymentQrCurrency } from '../../../packages/contracts/src/payment-qr';
export function fixtureBankPayload(currency: PaymentQrCurrency, extra = '', method = '11') {
  const field = (id: string, v: string) => id + String(Array.from(v).length).padStart(2, '0') + v;
  const body =
    field('00', '01') +
    field('01', method) +
    field('26', 'TEST-ONLY-NOT-A-BANK-ACCOUNT') +
    field('52', '0000') +
    field('53', currency === 'LAK' ? '418' : '764') +
    extra +
    field('58', currency === 'LAK' ? 'LA' : 'TH') +
    field('59', 'TEST ONLY DO NOT PAY') +
    field('60', 'TEST CITY') +
    '6304';
  return body + paymentQrCrc(body);
}
export async function fixtureBankInput(currency: PaymentQrCurrency = 'LAK') {
  const payload = fixtureBankPayload(currency),
    bytes = await QRCode.toBuffer(payload, { width: 480, margin: 4, errorCorrectionLevel: 'M' });
  return {
    payload,
    bytes,
    input: {
      requestId: randomUUID(),
      version: 0,
      bankName: 'TEST BANK - NOT FOR PAYMENT',
      receiverName: 'TEST ONLY DO NOT PAY',
      accountReference: 'TEST-MERCHANT-NOT-REAL',
      filename: 'test-only-' + currency + '.png',
      imageBase64: bytes.toString('base64'),
      enabled: true,
      verifiedInBankApp: true,
      reason: 'ตรวจด้วยข้อมูลจำลองเท่านั้น',
    },
  };
}
export function fixtureLaoPersonalPayload(overrides: Record<string, string> = {}) {
  const field = (id: string, value: string) => id + String(value.length).padStart(2, '0') + value;
  const account =
    field('00', 'A005266284662577') +
    field('01', '00000000') +
    field('02', '000') +
    field('03', 'TESTONLYNOTFORPAYMENT001');
  const fields = new Map(
    Object.entries({
      '00': '01',
      '01': '11',
      '38': account,
      '53': '418',
      '58': 'LA',
      ...overrides,
    }),
  );
  const body =
    [
      '00',
      '01',
      '38',
      '53',
      '58',
      ...[...fields.keys()].filter((id) => !['00', '01', '38', '53', '58'].includes(id)),
    ]
      .map((id) => field(id, fields.get(id)!))
      .join('') + '6304';
  return body + paymentQrCrc(body);
}
export async function fixtureLaoPersonalInput() {
  const sample = await fixtureBankInput('LAK');
  const payload = fixtureLaoPersonalPayload();
  const bytes = await QRCode.toBuffer(payload, { width: 480, margin: 4 });
  return {
    payload,
    bytes,
    input: {
      ...sample.input,
      filename: 'test-personal-lao.png',
      imageBase64: bytes.toString('base64'),
    },
  };
}
