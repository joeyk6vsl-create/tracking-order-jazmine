import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import QRCode from 'qrcode';
import type { DocumentRenderPayload } from '../../../../packages/contracts/src/documents';
import { QuotationContents } from '../features/quotations/QuotationContents';
import { ReceiptContents } from '../features/settlements/ReceiptContents';
import { ProductionDocument } from '../features/production/ProductionDocument';
import { preparePrintMedia } from '../features/production/print-media';
import { PaymentQrCards } from '../features/payment-qr/PaymentQrCards';
import '@fontsource/noto-sans-lao/400.css';
import '@fontsource/noto-sans-lao/700.css';
import '@fontsource/noto-sans-thai/400.css';
import '@fontsource/noto-sans-thai/700.css';
import '../features/production/production-print.css';
import './render.css';
const root = createRoot(document.getElementById('root')!);
async function render(payload: DocumentRenderPayload) {
  if (payload.templateVersion !== 'archive-v1') throw new Error('Template version unavailable');
  const source = payload.source;
  const qrUrl =
    source.kind === 'QUOTATION'
      ? payload.origin + '/?quotation=' + source.document.id
      : source.kind === 'RECEIPT'
        ? payload.origin +
          '/?settlementOrder=' +
          source.orderId +
          '&paymentEntry=' +
          source.document.id
        : source.kind === 'PRODUCTION'
          ? payload.origin +
            '/?productionSheet=' +
            source.sheetId +
            '&version=' +
            source.document.version
          : null;
  const qr = qrUrl
    ? await QRCode.toDataURL(qrUrl, { width: 300, margin: 4, errorCorrectionLevel: 'M' })
    : '';
  const internalQr = qr && (
    <div className="archive-qr">
      <img src={qr} width={140} height={140} alt="Internal document QR" />
      <div>
        <strong>Staff document lookup</strong>
        <p>ພະນັກງານຕ້ອງເຂົ້າລະບົບ / Staff sign-in required</p>
        <p>Open this exact document / revision</p>
      </div>
    </div>
  );
  if (source.kind === 'PRODUCTION') {
    const media = await preparePrintMedia(
      source.document,
      new AbortController().signal,
      [],
      async (id) => {
        const asset = payload.assets[id];
        if (!asset) throw new Error('Pinned asset missing');
        return Uint8Array.from(atob(asset.base64), (c) => c.charCodeAt(0)).buffer;
      },
    );
    flushSync(() =>
      root.render(
        <main className="ps-print-root" data-ready="true">
          <ProductionDocument snapshot={source.document} media={media} qr={qr} warning="" />
        </main>,
      ),
    );
  } else if (source.kind === 'RECEIPT')
    flushSync(() =>
      root.render(
        <article className="archived-document">
          <ReceiptContents entry={source.document} />
          {internalQr}
        </article>,
      ),
    );
  else {
    const doc = source.document,
      number = source.kind === 'QUOTATION' ? source.document.number : source.document.invoiceNumber;
    flushSync(() =>
      root.render(
        <article className="archived-document">
          <header>
            <strong>JAZMINE SPORTSWEAR</strong>
            <h1>
              {source.kind === 'QUOTATION' ? 'ໃບສະເໜີລາຄາ / Quotation' : 'ໃບແຈ້ງໜີ້ / Invoice'}
            </h1>
            <strong>
              {number} · Rev {doc.revision}
            </strong>
          </header>
          <p>
            Issued: {doc.snapshot.businessDate}
            {source.kind === 'QUOTATION'
              ? ' · Valid until: ' + source.document.snapshot.validUntil
              : ' · Order: ' +
                source.document.orderNumber +
                ' · Due: ' +
                source.document.snapshot.dueDate}
          </p>
          <QuotationContents snapshot={doc.snapshot} kind={source.kind} />
          {source.kind === 'INVOICE' && (
            <PaymentQrCards
              items={(source.paymentQrs ?? []).map((ref) => {
                const image = payload.assets[ref.id];
                if (!image) throw new Error('Pinned bank QR missing');
                return { ...ref, image: 'data:image/png;base64,' + image.base64 };
              })}
            />
          )}
          {internalQr}
        </article>,
      ),
    );
  }
  await document.fonts.ready;
  await Promise.all([...document.images].map((image) => image.decode()));
  if (!document.fonts.check('10pt "Noto Sans Lao"')) throw new Error('Lao font unavailable');
}
(
  globalThis as unknown as { jazmineRender: (payload: DocumentRenderPayload) => Promise<void> }
).jazmineRender = render;
