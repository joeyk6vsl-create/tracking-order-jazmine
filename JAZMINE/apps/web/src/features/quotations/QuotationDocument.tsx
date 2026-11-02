import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { QuotationView } from '../../../../../packages/contracts/src/quotations';
import { errorMessage } from '../../services/api';
import { QuotationContents } from './QuotationContents';
import './quotations.css';
import { StoredDocumentPanel } from '../documents/StoredDocumentPanel';
import {
  CurrentDocumentBanner,
  useCurrentDocumentStatus,
} from '../documents/CurrentDocumentStatus';
export function QuotationDocument({ document }: { document: QuotationView }) {
  const current = useCurrentDocumentStatus('QUOTATION', document.id, document.revision);
  const [qr, setQr] = useState(''),
    [error, setError] = useState('');
  const url = location.origin + '/?quotation=' + document.id;
  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(url, {
      width: 280,
      margin: 4,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then(async (src) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        if (alive) setQr(src);
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [url]);
  return (
    <>
      <StoredDocumentPanel
        key={document.id}
        kind="QUOTATION"
        sourceId={document.id}
        version={document.revision}
      />
      {error && <p role="alert">{error}</p>}
      <button
        className="primary no-print"
        disabled={!qr || current.busy}
        onClick={() => void current.print()}
      >
        ພິມ / Print quotation PDF
      </button>
      <article className="panel quotation-print" data-revision-id={document.id}>
        <CurrentDocumentBanner status={current.status} />
        {current.error && (
          <p role="alert" className="no-print">
            {current.error}
          </p>
        )}
        <header className="quotation-heading">
          <div>
            <strong>JAZMINE SPORTSWEAR</strong>
            <h2>ໃບສະເໜີລາຄາ / Quotation</h2>
          </div>
          <div>
            <strong>{document.number}</strong>
            <p>Rev {document.revision}</p>
          </div>
        </header>
        <p>
          Issued: {document.snapshot.businessDate} · Valid until: {document.snapshot.validUntil}
        </p>
        <QuotationContents snapshot={document.snapshot} />
        <div className="quotation-qr" data-ready={!!qr}>
          {qr && <img src={qr} alt="Quotation staff lookup QR" width={140} height={140} />}
          <div>
            <strong>Staff document lookup</strong>
            <p>ສະແກນເພື່ອເປີດໃບນີ້ / Open this exact revision</p>
            <p>ພະນັກງານຕ້ອງເຂົ້າລະບົບ / Staff sign-in required</p>
            <p>
              {document.number} · Rev {document.revision}
            </p>
          </div>
        </div>
      </article>
    </>
  );
}
