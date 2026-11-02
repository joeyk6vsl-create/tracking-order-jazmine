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
