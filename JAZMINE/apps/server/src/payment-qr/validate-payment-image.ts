import { createHash } from 'node:crypto';
import sharp from 'sharp';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { validateAsset } from '../assets/file-validation';
import { AppError } from '../errors';
import type { PaymentQrCurrency } from '../../../../packages/contracts/src/payment-qr';
function fail(message: string): never {
  throw new AppError('INVALID_PAYMENT_QR', message, 400);
}
export function paymentQrCrc(text: string) {
  let crc = 0xffff;
  for (const b of Buffer.from(text, 'utf8')) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
export function validatePaymentPayload(text: string, currency: PaymentQrCurrency) {
  const bad =
    'ໃຊ້ QR ຮັບເງິນຮ້ານຄ້າແບບໃຊ້ຊ້ຳຈາກທະນາຄານ / Use a reusable merchant payment QR from your bank (static EMV format)';
  if (
    !text.startsWith('000201') ||
    text.length > 2048 ||
    [...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    fail(bad);
  const chars = Array.from(text),
    values = new Map<string, string>();
  let p = 0;
  while (p < chars.length) {
    const id = chars.slice(p, p + 2).join(''),
      lenText = chars.slice(p + 2, p + 4).join('');
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(lenText) || values.has(id)) fail(bad);
    const len = Number(lenText);
    if (!len || p + 4 + len > chars.length) fail(bad);
    values.set(id, chars.slice(p + 4, p + 4 + len).join(''));
    p += 4 + len;
    if (id === '63' && p !== chars.length) fail(bad);
  }
  if (
    values.get('00') !== '01' ||
    values.get('63')?.toUpperCase() !== paymentQrCrc(text.slice(0, -4)) ||
    !/^6304[0-9A-Fa-f]{4}$/.test(text.slice(-8))
  )
    fail('QR ບໍ່ຄົບ ຫຼືຮູບແບບບໍ່ຮອງຮັບ / QR checksum or format is invalid');
  if (
    (values.has('01') && values.get('01') !== '11') ||
    values.has('54') ||
    values.has('55') ||
    values.has('56') ||
    values.has('57')
  )
    fail('QR ນີ້ລັອກຍອດ ຫຼືໃຊ້ຄັ້ງດຽວ / Use a reusable QR without a fixed amount, tips or fees');
  if (values.get('53') !== (currency === 'LAK' ? '418' : '764'))
    fail('ສະກຸນເງິນ QR ບໍ່ກົງ / The QR currency does not match the selected currency');
  if (
    ![...values.keys()].some((id) => Number(id) >= 2 && Number(id) <= 51) ||
    !/^\d{4}$/.test(values.get('52') ?? '') ||
    !/^[A-Z]{2}$/.test(values.get('58') ?? '') ||
    !values.get('59') ||
    !values.get('60')
  )
    fail(bad);
}
export async function validatePaymentImage(base64: string, currency: PaymentQrCurrency) {
  if (base64.length > 1400000) fail('ໃຊ້ຮູບບໍ່ເກີນ 1 MB / Use an image up to 1 MB');
  const { bytes, mime } = validateAsset(base64);
  if (bytes.length > 1024 * 1024 || mime === 'application/pdf')
    fail('ເລືອກ PNG/JPEG/WebP ບໍ່ເກີນ 1 MB / Choose a PNG, JPEG or WebP up to 1 MB');
  try {
    const image = sharp(bytes, { limitInputPixels: 16000000, failOn: 'error' }),
      meta = await image.metadata();
    if ((meta.pages ?? 1) !== 1) fail('ໃຊ້ຮູບຄົງທີ່ / Use a single static image');
    const { data, info } = await image
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .toColourspace('srgb')
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = new Uint8ClampedArray(data),
      qr = jsQR(pixels, info.width, info.height);
    if (!qr) fail('ອ່ານ QR ບໍ່ໄດ້ / Cannot read a QR code from this image');
    const corners = [
        qr.location.topLeftCorner,
        qr.location.topRightCorner,
        qr.location.bottomLeftCorner,
        qr.location.bottomRightCorner,
      ],
      left = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))) - 2),
      right = Math.min(info.width, Math.ceil(Math.max(...corners.map((p) => p.x))) + 2),
      top = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))) - 2),
      bottom = Math.min(info.height, Math.ceil(Math.max(...corners.map((p) => p.y))) + 2);
    for (let y = top; y < bottom; y++)
      pixels.fill(255, (y * info.width + left) * 4, (y * info.width + right) * 4);
    if (jsQR(pixels, info.width, info.height))
      fail('ໃຊ້ໜຶ່ງ QR ຕໍ່ຮູບ / Upload one QR code per image');
    validatePaymentPayload(qr.data, currency);
    const printBytes = await QRCode.toBuffer(qr.data, {
      width: 480,
      margin: 4,
      errorCorrectionLevel: 'M',
    });
    return {
      bytes,
      mime,
      printBytes,
      payloadSha256: createHash('sha256').update(qr.data).digest('hex'),
      imageSha256: createHash('sha256').update(printBytes).digest('hex'),
    };
  } catch (e) {
    if (e instanceof AppError) throw e;
    return fail('ຮູບບໍ່ສົມບູນ ຫຼືອ່ານ QR ບໍ່ໄດ້ / Image or QR cannot be read');
  }
}
