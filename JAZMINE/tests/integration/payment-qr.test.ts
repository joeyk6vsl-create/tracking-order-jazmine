import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { PDFDocument } from 'pdf-lib';
import { productionFixture } from './helpers/production-fixture';
import { reviseOrder } from './helpers/revise-order';
import {
  fixtureBankInput,
  fixtureBankPayload,
  fixtureLaoPersonalPayload,
  fixtureLaoPersonalInput,
} from './helpers/payment-qr-fixture';
import { syntheticPdf } from './helpers/document-pdf';
import { PaymentQrService } from '../../apps/server/src/payment-qr/payment-qr-service';
import {
  validatePaymentImage,
  validatePaymentPayload,
  paymentQrCrc,
} from '../../apps/server/src/payment-qr/validate-payment-image';
import { DocumentService } from '../../apps/server/src/documents/document-service';
import { DocumentProcessor } from '../../apps/server/src/documents/document-processor';
import { backfillDocuments } from '../../apps/server/src/documents/queue-document';
import {
  paymentQrCurrency,
  paymentQrSaveSchema,
  paymentQrCheckSchema,
} from '../../packages/contracts/src/payment-qr';
import { AppError } from '../../apps/server/src/errors';
const code = (c: string) => (e: unknown) => e instanceof AppError && e.code === c;
const changed = (
  input: Awaited<ReturnType<typeof fixtureBankInput>>['input'],
  version: number,
  enabled = true,
) => ({
  ...input,
  requestId: randomUUID(),
  version,
  enabled,
  imageBase64: undefined,
  reason: 'เปลี่ยนข้อมูลทดสอบ',
});
test('Lao personal QR accepts the observed profile, preserves the payload, and rejects malformed or unsafe variants', async () => {
  const sample = await fixtureLaoPersonalInput();
  validatePaymentPayload(sample.payload, 'LAK');
  const checked = await validatePaymentImage(sample.input.imageBase64, 'LAK');
  const raster = await sharp(checked.printBytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(
    jsQR(new Uint8ClampedArray(raster.data), raster.info.width, raster.info.height)?.data,
    sample.payload,
  );
  assert.throws(() => validatePaymentPayload(sample.payload, 'THB'), code('INVALID_PAYMENT_QR'));
  const variants: Record<string, string>[] = [
    { '01': '12' },
    { '54': '0' },
    { '55': '01' },
    { '58': 'TH' },
    { '53': '764' },
    { '38': '0016A0052662846625770108000000000203000' },
    { '38': '0016A00526628466257701080000000001080000000002030000324TESTONLYNOTFORPAYMENT001' },
    { '38': '0016A00526628466257701080000000002030000399SHORT' },
    { '38': '0016A00526628466257801080000000002030000324TESTONLYNOTFORPAYMENT001' },
    { '62': '0503ABC' },
  ];
  for (const overrides of variants)
    assert.throws(
      () => validatePaymentPayload(fixtureLaoPersonalPayload(overrides), 'LAK'),
      code('INVALID_PAYMENT_QR'),
    );
  assert.throws(
    () => validatePaymentPayload(sample.payload.slice(0, -4) + 'FFFF', 'LAK'),
    code('INVALID_PAYMENT_QR'),
  );
});
test('bank QR input accepts only LAK/THB, requires owner verification before enabling and refuses arbitrary business/QR payload fields', async () => {
  const { input } = await fixtureBankInput();
  assert(paymentQrSaveSchema.safeParse(input).success);
  assert(!paymentQrCurrency.safeParse('USD').success);
  for (const p of [
    { ...input, verifiedInBankApp: false },
    { ...input, reason: ' ' },
    { ...input, amount: 1 },
    { ...input, payload: 'anything' },
    { ...input, version: -1 },
  ])
    assert(!paymentQrSaveSchema.safeParse(p).success);
  assert(
    paymentQrSaveSchema.safeParse({ ...input, enabled: false, verifiedInBankApp: false }).success,
  );
  assert(
    !paymentQrCheckSchema.safeParse({
      versions: [
        { currency: 'LAK', version: 1 },
        { currency: 'LAK', version: 1 },
      ],
    }).success,
  );
});
test('payment payload validation rejects wrong currency, fixed amount, dynamic QR, fees, duplicate fields, bad CRC and ordinary links', () => {
  assert.equal(paymentQrCrc('123456789'), '29B1');
  validatePaymentPayload(fixtureBankPayload('LAK'), 'LAK');
  validatePaymentPayload(fixtureBankPayload('THB'), 'THB');
  for (const payload of [
    fixtureBankPayload('THB'),
    fixtureBankPayload('LAK', '54041000'),
    fixtureBankPayload('LAK', '', '12'),
    fixtureBankPayload('LAK', '550201'),
    fixtureBankPayload('LAK', '5303418'),
    fixtureBankPayload('LAK').slice(0, -4) + '0000',
    'https://shop.example/#track=' + 'a'.repeat(43),
  ])
    assert.throws(() => validatePaymentPayload(payload, 'LAK'), code('INVALID_PAYMENT_QR'));
});
test('raster QR validation preserves the exact decoded bank payload in the print image and rejects non-QR, PDF and ambiguous images', async () => {
  const { input, payload, bytes } = await fixtureBankInput(),
    checked = await validatePaymentImage(input.imageBase64, 'LAK'),
    image = await sharp(checked.printBytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  assert.equal(
    jsQR(new Uint8ClampedArray(image.data), image.info.width, image.info.height)?.data,
    payload,
  );
  assert.equal(checked.payloadSha256, createHash('sha256').update(payload).digest('hex'));
  const blank = await sharp({
    create: { width: 400, height: 400, channels: 4, background: '#ffffff' },
  })
    .png()
    .toBuffer();
  await assert.rejects(
    validatePaymentImage(blank.toString('base64'), 'LAK'),
    code('INVALID_PAYMENT_QR'),
  );
  await assert.rejects(
    validatePaymentImage(Buffer.from('%PDF-1.4 not a QR image').toString('base64'), 'LAK'),
    code('INVALID_PAYMENT_QR'),
  );
  const two = await sharp({
    create: { width: 1000, height: 500, channels: 4, background: '#ffffff' },
  })
    .composite([
      { input: bytes, left: 0, top: 0 },
      { input: bytes, left: 500, top: 0 },
    ])
    .png()
    .toBuffer();
  await assert.rejects(
    validatePaymentImage(two.toString('base64'), 'LAK'),
    code('INVALID_PAYMENT_QR'),
  );
  const link = await QRCode.toBuffer('https://example.com');
  await assert.rejects(
    validatePaymentImage(link.toString('base64'), 'LAK'),
    code('INVALID_PAYMENT_QR'),
  );
});
test('unsupported bank QR diagnostics identify the stage without exposing the decoded account', () => {
  const failureMessage = (payload: string) => {
    try {
      validatePaymentPayload(payload, 'LAK');
    } catch (e) {
      assert(e instanceof AppError);
      assert.equal(e.code, 'INVALID_PAYMENT_QR');
      return e.message;
    }
    assert.fail('Expected rejection');
  };
  const privateMarker = 'PRIVATE-ACCOUNT-DO-NOT-EXPOSE';
  const linkMessage = failureMessage('bankapp://receive/' + privateMarker);
  assert.match(linkMessage, /QR-FORMAT/);
  assert(!linkMessage.includes(privateMarker));
  assert.match(failureMessage('000201' + '2699broken'), /QR-STRUCTURE/);
  // Well-formed payload with currency and CRC, but missing merchant profile fields.
  const body = '00020101021126' + String(privateMarker.length) + privateMarker + '53034186304';
  const profileMessage = failureMessage(body + paymentQrCrc(body));
  assert.match(profileMessage, /QR-BANK-PROFILE/);
  assert(!profileMessage.includes(privateMarker));
  assert.match(failureMessage(fixtureBankPayload('THB')), /currency/);
  assert.match(failureMessage(fixtureBankPayload('LAK', '54041000')), /fixed amount/);
});
test('empty settings never invent an account; only owner can configure and activate; ADMIN can read/check active images without business mutations', async () => {
  const f = await productionFixture();
  try {
    const service = new PaymentQrService(f.db),
      sample = await fixtureBankInput();
    assert((await service.list(f.actors.ADMIN)).settings.every((s) => !s.enabled && !s.reference));
    for (const actor of [f.actors.ADMIN, f.actors.GRAPHIC, f.actors.PRINTING])
      await assert.rejects(service.save(actor, 'LAK', sample.input), code('PERMISSION_DENIED'));
    await service.save(f.owner, 'LAK', sample.input);
    const before = await f.db.query('SELECT * FROM audit_events ORDER BY id'),
      numbers = await f.db.query('SELECT * FROM business_counters ORDER BY family'),
      orders = await f.db.query('SELECT * FROM orders'),
      payments = await f.db.query('SELECT * FROM payment_entries');
    const read = await service.check(f.actors.ADMIN, {
      versions: [{ currency: 'LAK', version: 1 }],
    });
    assert.equal(read.attachments[0].receiverName, sample.input.receiverName);
    assert((await service.image(f.actors.ADMIN, 'LAK', 1)).length > 0);
    await service.inspect(f.owner, 'LAK', sample.input.imageBase64);
    for (const actor of [f.actors.GRAPHIC, f.actors.PRINTING])
      await assert.rejects(
        service.check(actor, { versions: [{ currency: 'LAK', version: 1 }] }),
        code('PERMISSION_DENIED'),
      );
    assert.deepEqual(await f.db.query('SELECT * FROM audit_events ORDER BY id'), before);
    assert.deepEqual(await f.db.query('SELECT * FROM business_counters ORDER BY family'), numbers);
    assert.deepEqual(await f.db.query('SELECT * FROM orders'), orders);
    assert.deepEqual(await f.db.query('SELECT * FROM payment_entries'), payments);
  } finally {
    await f.db.close();
  }
});
test('concurrent owner retry stores one version; stale edits and changed requests fail, and disabling LAK preserves history and independent THB settings', async () => {
  const f = await productionFixture();
  try {
    const service = new PaymentQrService(f.db),
      lak = await fixtureBankInput(),
      thb = await fixtureBankInput('THB');
    const results = await Promise.all(
      Array.from({ length: 8 }, () => service.save(f.owner, 'LAK', lak.input)),
    );
    assert(results.every((r) => r.version === 1));
    assert.equal((await service.history(f.owner, 'LAK', 1)).versions.length, 1);
    await assert.rejects(
      service.save(f.owner, 'LAK', { ...lak.input, reason: 'เปลี่ยนคำขอ' }),
      code('REQUEST_CONFLICT'),
    );
    await assert.rejects(
      service.save(f.owner, 'LAK', { ...lak.input, requestId: randomUUID() }),
      code('STALE_STATE'),
    );
    await service.save(f.owner, 'THB', thb.input);
    await service.save(f.owner, 'LAK', {
      ...changed(lak.input, 1, false),
      verifiedInBankApp: false,
    });
    await assert.rejects(
      service.check(f.actors.ADMIN, { versions: [{ currency: 'LAK', version: 1 }] }),
      code('PAYMENT_QR_CHANGED'),
    );
    await assert.rejects(service.image(f.actors.ADMIN, 'LAK', 1), code('PAYMENT_QR_CHANGED'));
    assert((await service.image(f.owner, 'LAK', 1)).length > 0);
    assert.equal(
      (await service.check(f.actors.ADMIN, { versions: [{ currency: 'THB', version: 1 }] }))
        .attachments.length,
      1,
    );
    const latest = (await service.history(f.owner, 'LAK', 1)).versions;
    assert.equal(latest[0].version, 2);
    assert.equal(latest[1].version, 1);
    assert(latest[1].enabled);
    await f.db.query('UPDATE users SET row_version=row_version+1 WHERE id=$1', [f.owner.id]);
    await assert.rejects(
      service.save(f.owner, 'THB', changed(thb.input, 1)),
      code('AUTHENTICATION_REQUIRED'),
    );
  } finally {
    await f.db.close();
  }
});
test('new invoice jobs freeze both enabled currency QRs; later changes never rewrite existing snapshots or stored PDF, while legacy backfill stays unmodified', async () => {
  const f = await productionFixture();
  try {
    const service = new PaymentQrService(f.db),
      lak = await fixtureBankInput(),
      thb = await fixtureBankInput('THB');
    await service.save(f.owner, 'LAK', lak.input);
    await service.save(f.owner, 'THB', thb.input);
    await f.db.query("DELETE FROM document_jobs WHERE kind='INVOICE'");
    await f.db.transaction((sql) => backfillDocuments(sql));
    const original = (await f.db.query("SELECT payload FROM document_jobs WHERE kind='INVOICE'"))[0]
      .payload as { paymentQrs?: unknown[] };
    assert(!original.paymentQrs?.length);
    await reviseOrder(f, { quote: { ...f.input.quote, quantity: 12 } });
    const job = (
      await f.db.query(
        "SELECT payload FROM document_jobs WHERE kind='INVOICE' AND source_version=2",
      )
    )[0].payload as { paymentQrs: { currency: string; version: number }[] };
    assert.deepEqual(
      job.paymentQrs.map((r) => [r.currency, r.version]),
      [
        ['LAK', 1],
        ['THB', 1],
      ],
    );
    const processor = new DocumentProcessor(f.db, 'https://shop.example', syntheticPdf);
    while (await processor.processOne()) {
      /* ตรวจจนทำไฟล์ที่รอครบ */
    }
    const docs = new DocumentService(f.db),
      file = await docs.file(f.owner, 'INVOICE', f.order.id, 2);
    await service.save(f.owner, 'LAK', {
      ...changed(lak.input, 1),
      bankName: 'Changed bank label',
    });
    assert.deepEqual(
      (
        await f.db.query(
          "SELECT payload FROM document_jobs WHERE kind='INVOICE' AND source_version=2",
        )
      )[0].payload,
      job,
    );
    assert.deepEqual((await docs.file(f.owner, 'INVOICE', f.order.id, 2)).bytes, file.bytes);
    assert(
      (await docs.currentStatus(f.owner, 'INVOICE', f.order.id, 2)).flags.includes(
        'PAYMENT_DETAILS_CHANGED',
      ),
    );
    const statusCopy = await docs.currentCopy(f.owner, 'INVOICE', f.order.id, 2);
    assert(
      (await PDFDocument.load(statusCopy.bytes)).getTitle()?.includes('PAYMENT DETAILS CHANGED'),
    );
    assert(
      (await docs.status(f.owner, 'INVOICE', f.order.id, 2)).notice.includes(
        'Payment details changed',
      ),
    );
    await assert.rejects(
      service.check(f.actors.ADMIN, {
        versions: [
          { currency: 'LAK', version: 1 },
          { currency: 'THB', version: 1 },
        ],
      }),
      code('PAYMENT_QR_CHANGED'),
    );
  } finally {
    await f.db.close();
  }
});
test('corrupted bank images fail validation and cannot be silently embedded in an issued PDF', async () => {
  const f = await productionFixture();
  try {
    const service = new PaymentQrService(f.db),
      sample = await fixtureBankInput();
    await service.save(f.owner, 'LAK', sample.input);
    await reviseOrder(f, { quote: { ...f.input.quote, quantity: 12 } });
    await f.db.query("UPDATE payment_qr_versions SET print_data=$1 WHERE currency='LAK'", [
      Buffer.from('corrupt'),
    ]);
    await assert.rejects(
      service.check(f.owner, { versions: [{ currency: 'LAK', version: 1 }] }),
      code('PAYMENT_QR_INTEGRITY'),
    );
    const worker = new DocumentProcessor(f.db, 'https://shop.example', syntheticPdf);
    for (let i = 0; i < 3; i++) await worker.processOne();
    const status = await new DocumentService(f.db).status(f.owner, 'INVOICE', f.order.id, 2);
    assert.equal(status.state, 'FAILED');
    await assert.rejects(
      new DocumentService(f.db).file(f.owner, 'INVOICE', f.order.id, 2),
      code('DOCUMENT_NOT_READY'),
    );
  } finally {
    await f.db.close();
  }
});
