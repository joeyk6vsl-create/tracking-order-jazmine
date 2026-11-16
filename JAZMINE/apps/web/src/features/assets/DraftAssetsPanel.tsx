import { useEffect, useState } from 'react';
import {
  ASSET_KINDS,
  ASSET_LABELS,
  type AssetChecklist,
} from '../../../../../packages/contracts/src/assets';
import { api, errorMessage } from '../../services/api';
import { useSession } from '../auth/SessionProvider';
import { AssetUpload } from './AssetUpload';
import { ActionButton } from '../../components/ActionButton';
export function DraftAssetsPanel({ draftId }: { draftId: string }) {
  const { session } = useSession(),
    canReview =
      session!.user!.role === 'ADMIN_PROMAX' ||
      ['ADMIN', 'GRAPHIC'].includes(session!.user!.department),
    readyImmediately = canReview;
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
  const hasPendingReview =
    data &&
    ASSET_KINDS.some((kind) => {
      const latest = data.assets.find((asset) => asset.kind === kind);
      return latest?.status === 'PENDING' && !latest.stale;
    });
  return (
    <section className="panel pricing-panel">
      <h2>ໄຟລ໌ອໍເດີ / Order files</h2>
      <ActionButton action="refresh" disabled={busy} onClick={() => setReload((n) => n + 1)}>
        โหลดไฟล์ล่าสุด
      </ActionButton>
      <p>ໃສ່ແບບຕົວຢ່າງຂອງອໍເດີ / Add this order's mockup.</p>
      <details>
        <summary>ຂໍ້ມູນໄຟລ໌ / File details</summary>
        <p>
          PNG / JPEG / WebP / PDF · 2 MB per file. ເຈົ້າຂອງ, Admin ແລະ Graphic ອັບໂຫຼດແລ້ວໃຊ້ໄດ້ /
          Authorized uploads are ready immediately.
        </p>
        <p>
          ປ້າຍຄໍ/ເທບຄໍໃຊ້ຈາກຄັງຂອງ JAZMINE ຫຼືລູກຄ້າປະຈຳ / Label and tape come from the saved brand
          library.
        </p>
      </details>
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
          {canReview && hasPendingReview && (
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
            const uploadHere = kind === 'MOCKUP' || data.labelSource === 'DRAFT';
            return (
              <section className="asset-kind" key={kind}>
                <h3>{ASSET_LABELS[kind]}</h3>
                {uploadHere ? (
                  <AssetUpload
                    key={draftId + kind}
                    path="/graphic-assets"
                    draftId={draftId}
                    kind={kind}
                    readyImmediately={readyImmediately}
                    onUploaded={() => setReload((n) => n + 1)}
                  />
                ) : (
                  <p>
                    {data.labelSource === 'CUSTOMER'
                      ? 'ໄຟລ໌ລູກຄ້າປະຈຳ / Set once in the customer brand library under Graphic assets.'
                      : data.labelSource === 'JAZMINE'
                        ? 'ໄຟລ໌ JAZMINE / Set this once in the JAZMINE library under Graphic assets.'
                        : 'ເລືອກແບຣນກ່ອນ / Choose the brand first.'}
                  </p>
                )}
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
                        <ActionButton
                          action="approve"
                          disabled={busy || !reason.trim()}
                          onClick={() => void review(file.id, 'APPROVED')}
                        >
                          อนุมัติ{ASSET_LABELS[kind]}
                        </ActionButton>
                        <ActionButton
                          action="reject"
                          disabled={busy || !reason.trim()}
                          onClick={() => void review(file.id, 'REJECTED')}
                        >
                          ส่ง{ASSET_LABELS[kind]}กลับแก้
                        </ActionButton>
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
