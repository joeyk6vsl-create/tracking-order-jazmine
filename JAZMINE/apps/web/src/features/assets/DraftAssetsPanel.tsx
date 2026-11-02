import { useEffect, useState } from 'react';
import {
  ASSET_KINDS,
  ASSET_LABELS,
  type AssetChecklist,
  type UploadAsset,
} from '../../../../../packages/contracts/src/assets';
import { api, errorMessage } from '../../services/api';
import { useSession } from '../auth/SessionProvider';
function UploadFile({
  draftId,
  kind,
  onUploaded,
}: {
  draftId: string;
  kind: UploadAsset['kind'];
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<{ id: string; filename: string; base64: string } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [uncertain, setUncertain] = useState(false);
  async function pick(value?: File) {
    setFile(null);
    setError('');
    setUncertain(false);
    if (!value) return;
    if (value.size > 2 * 1024 * 1024) {
      setError('ไฟล์ต้องไม่เกิน 2 MB');
      return;
    }
    setBusy(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'));
        reader.readAsDataURL(value);
      });
      setFile({ id: crypto.randomUUID(), filename: value.name, base64 });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function upload() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await api(`/graphic-assets/${file.id}`, 'PUT', {
        draftId,
        kind,
        filename: file.filename,
        base64: file.base64,
      });
      setFile(null);
      setUncertain(false);
      onUploaded();
    } catch (e) {
      setError(errorMessage(e));
      setUncertain(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <label>
        แนบ{ASSET_LABELS[kind]}
        <input
          aria-label={'แนบ' + ASSET_LABELS[kind]}
          disabled={busy || uncertain}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>
      {file && <p>เตรียมส่ง: {file.filename}</p>}
      {file && (
        <button disabled={busy} onClick={() => void upload()}>
          {uncertain ? 'ตรวจคำขอเดิมอีกครั้ง' : 'ส่ง' + ASSET_LABELS[kind] + 'รอตรวจ'}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {uncertain && (
        <button
          disabled={busy}
          onClick={() => {
            setUncertain(false);
            setFile(null);
          }}
        >
          เลือกไฟล์ใหม่ (ตรวจประวัติก่อน)
        </button>
      )}
    </div>
  );
}
export function DraftAssetsPanel({ draftId }: { draftId: string }) {
  const { session } = useSession(),
    canReview = session!.permissions.includes('graphic.approve');
  const [data, setData] = useState<AssetChecklist | null>(null),
    [reload, setReload] = useState(0),
    [error, setError] = useState(''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    void api<AssetChecklist>(`/graphic-assets/draft/${draftId}`)
      .then((r) => {
        if (alive) {
          setData(r);
          setError('');
        }
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [draftId, reload]);
  async function review(id: string, decision: 'APPROVED' | 'REJECTED') {
    setBusy(true);
    setError('');
    try {
      await api(`/graphic-assets/${id}/review`, 'PUT', { decision, reason });
      setReload((n) => n + 1);
      setReason('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel pricing-panel">
      <h2>ไฟล์และการตรวจกราฟิก</h2>
      <button disabled={busy} onClick={() => setReload((n) => n + 1)}>
        โหลดไฟล์ล่าสุด
      </button>
      <p>
        PNG / JPEG / WebP / PDF ไม่เกิน 2 MB ต่อไฟล์ ·
        ไฟล์ใหม่ยังไม่ถือว่าผ่านจนกราฟิกหรือเจ้าของตรวจ
      </p>
      <p>
        ป้ายคอ/เทปคอ JAZMINE ใช้คลังกลาง แบรนด์ลูกค้าประจำใช้คลังของลูกค้านั้น ขาจรใช้ไฟล์เฉพาะร่าง
        แบบตัวอย่างเป็นไฟล์เฉพาะร่างเสมอ
      </p>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <p role="status">กำลังโหลดไฟล์…</p>
      ) : (
        <>
          <div role="status">
            {data.ready ? (
              <p>
                ไฟล์ล่าสุดผ่านตรวจครบสำหรับร่างฉบับ {data.draftVersion} · ยังไม่ใช่การยืนยันออเดอร์
              </p>
            ) : (
              <ul>
                {data.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </div>
          {canReview && (
            <label>
              เหตุผลการตรวจไฟล์
              <input
                aria-label="เหตุผลการตรวจไฟล์"
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          {ASSET_KINDS.map((kind) => {
            const files = data.assets.filter((a) => a.kind === kind);
            return (
              <section className="asset-kind" key={kind}>
                <h3>{ASSET_LABELS[kind]}</h3>
                <UploadFile
                  key={draftId + kind}
                  draftId={draftId}
                  kind={kind}
                  onUploaded={() => setReload((n) => n + 1)}
                />
                {files.map((file, index) => (
                  <article className="asset-version" key={file.id}>
                    <strong>
                      ฉบับ {file.revision} · {file.filename}
                    </strong>
                    <p>
                      {index === 0 ? 'ฉบับล่าสุด' : 'ประวัติฉบับก่อน'} ·{' '}
                      {file.stale
                        ? 'ร่างเปลี่ยนแล้ว ต้องส่งฉบับใหม่'
                        : file.status === 'APPROVED'
                          ? 'ผ่านตรวจแล้ว'
                          : file.status === 'REJECTED'
                            ? 'ส่งกลับแก้ไข'
                            : 'รอตรวจ'}
                    </p>
                    {file.reviewReason && <p>เหตุผล: {file.reviewReason}</p>}
                    {file.mime.startsWith('image/') && index === 0 && (
                      <img
                        className="asset-preview"
                        src={`/api/v1/graphic-assets/${file.id}/content`}
                        alt={ASSET_LABELS[kind] + 'ฉบับ ' + file.revision}
                      />
                    )}
                    <a
                      href={`/api/v1/graphic-assets/${file.id}/content`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      เปิดไฟล์ฉบับ {file.revision}
                    </a>
                    {canReview && index === 0 && file.status === 'PENDING' && !file.stale && (
                      <div>
                        <button
                          disabled={busy || !reason.trim()}
                          onClick={() => void review(file.id, 'APPROVED')}
                        >
                          อนุมัติ{ASSET_LABELS[kind]}
                        </button>
                        <button
                          disabled={busy || !reason.trim()}
                          onClick={() => void review(file.id, 'REJECTED')}
                        >
                          ส่ง{ASSET_LABELS[kind]}กลับแก้
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </section>
            );
          })}
        </>
      )}
    </section>
  );
}
