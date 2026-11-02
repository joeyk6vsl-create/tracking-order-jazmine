import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { SheetHistory, SheetSnapshot } from '../../../../../packages/contracts/src/production';
import { api, errorMessage } from '../../services/api';
import { preparePrintMedia, type PrintMedia } from './print-media';
import { ProductionDocument } from './ProductionDocument';
import './production-print.css';
import { StoredDocumentPanel } from '../documents/StoredDocumentPanel';
import { documentStatusText, useCurrentDocumentStatus } from '../documents/CurrentDocumentStatus';

export function ProductionPrintPage() {
  const [data, setData] = useState<{
    snapshot: SheetSnapshot;
    media: PrintMedia;
    qr: string;
    warning: string;
  } | null>(null);
  const [error, setError] = useState(''),
    [ready, setReady] = useState(false),
    [attempt, setAttempt] = useState(0);
  const documentRef = useRef<HTMLDivElement>(null);
  const query = new URLSearchParams(location.search),
    id = query.get('productionSheet') ?? '',
    version = Number(query.get('version'));
  const current = useCurrentDocumentStatus('PRODUCTION', id, version);
  useEffect(() => {
    const abort = new AbortController(),
      urls: string[] = [];
    let alive = true;
    async function load() {
      try {
        if (!/^[\da-f-]{36}$/i.test(id) || !Number.isSafeInteger(version) || version < 1)
          throw new Error('ลิงก์ใบผลิตไม่ถูกต้อง');
        const history = await api<SheetHistory>(`/production/sheets/${id}/history`);
        const saved = history.versions.find((v) => v.version === version);
        if (!saved) throw new Error('ไม่พบใบผลิตฉบับนี้ ต้องออกใบผลิตให้พร้อมก่อน');
        const snapshot = { ...saved.snapshot, version: saved.version, issuedAt: saved.issuedAt };
        const media = await preparePrintMedia(snapshot, abort.signal, urls);
        const qr = await QRCode.toDataURL(
          `JAZMINE | ${snapshot.sheetNumber} | Version ${version} | ${snapshot.context.orderNumber}`,
          { width: 240, margin: 4, errorCorrectionLevel: 'M' },
        );
        const warnings = [];
        if (history.state === 'CANCELLED') warnings.push('ยกเลิกแล้ว - ห้ามใช้ผลิต');
        if (history.stale) warnings.push('ออเดอร์มีฉบับใหม่ - ใบนี้อ้างอิงออเดอร์เก่า');
        if (version !== history.currentVersion)
          warnings.push('สำเนาประวัติ - มีใบผลิตฉบับใหม่กว่า');
        if (history.state === 'DRAFT') warnings.push('กำลังแก้ใบผลิต - ฉบับนี้เก็บไว้เป็นประวัติ');
        if (alive) setData({ snapshot, media, qr, warning: warnings.join(' · ') });
      } catch (e) {
        if (alive) setError(errorMessage(e));
      }
    }
    void load();
    return () => {
      alive = false;
      abort.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [id, version, attempt]);
  useEffect(() => {
    if (!data || !documentRef.current) return;
    let alive = true;
    const images = [...documentRef.current.querySelectorAll('img')];
    void Promise.all([document.fonts.ready, ...images.map((i) => i.decode())])
      .then(() => {
        if (alive) setReady(true);
      })
      .catch(() => {
        if (alive) setError('มีรูปหรือฟอนต์ที่เตรียมไม่สำเร็จ กรุณาลองเปิดใบผลิตใหม่');
      });
    return () => {
      alive = false;
    };
  }, [data]);
  function retry() {
    setError('');
    setReady(false);
    setData(null);
    setAttempt((n) => n + 1);
  }
  return (
    <main className="ps-print-root" data-ready={ready && !error ? 'true' : 'false'}>
      <div className="ps-toolbar">
        <StoredDocumentPanel
          key={id + ':' + version + ':' + attempt}
          kind="PRODUCTION"
          sourceId={id}
          version={version}
        />
        <div>
          <h1>ใบผลิต A4</h1>
          <p>
            เลือก A4 แนวตั้ง · ขนาด 100% · ปิดหัวและท้ายกระดาษของเบราว์เซอร์ · เลือก “บันทึกเป็น
            PDF” ได้ในหน้าพิมพ์
          </p>
          <p>QR ใช้ระบุเลขใบผลิตและฉบับ ไม่ใช่ลิงก์ติดตามสำหรับลูกค้า</p>
        </div>
        <button
          className="primary"
          disabled={!ready || !!error || current.busy}
          onClick={() => void current.print()}
        >
          พิมพ์ / บันทึก PDF
        </button>
        <button onClick={retry}>โหลดข้อมูลล่าสุดอีกครั้ง</button>
        {current.error && <p role="alert">{current.error}</p>}
        <a href={location.pathname}>กลับหน้าระบบ</a>
        {error && (
          <p role="alert" className="alert error">
            {error}
          </p>
        )}
        {!data && !error && <p role="status">กำลังเตรียมใบผลิต รูปชิ้นงาน และฟอนต์…</p>}
      </div>
      {data && (
        <div ref={documentRef}>
          <ProductionDocument
            {...data}
            warning={current.status ? documentStatusText(current.status) : data.warning}
          />
        </div>
      )}
      {!ready && (
        <div className="ps-print-blocked">
          ยังไม่พร้อมพิมพ์ กรุณารอให้รูปและข้อมูลครบ แล้วใช้ปุ่มพิมพ์บนหน้าจอ
        </div>
      )}
    </main>
  );
}
