import { useEffect, useState } from 'react';
import {
  ASSET_LABELS,
  BRAND_ASSET_KINDS,
  type BrandAssetLibraryView,
} from '../../../../../packages/contracts/src/assets';
import { api, errorMessage } from '../../services/api';
import { AssetUpload } from './AssetUpload';

export function BrandAssetLibrary({ customerId, name }: { customerId?: string; name: string }) {
  const path = customerId
    ? `/graphic-assets/library/customer/${customerId}`
    : '/graphic-assets/library/jazmine';
  const [data, setData] = useState<BrandAssetLibraryView | null>(null);
  const [reload, setReload] = useState(0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void api<BrandAssetLibraryView>(path)
      .then((result) => {
        if (alive) {
          setData(result);
          setError('');
        }
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [path, reload]);
  async function approve(id: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/graphic-assets/${id}/review`, 'PUT', {
        decision: 'APPROVED',
        reason,
      });
      setReason('');
      setReload((v) => v + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel brand-asset-library">
      <h2>ປ້າຍຄໍ ແລະເທບຄໍ / Label and tape · {name}</h2>
      <p>
        ບັນທຶກເທື່ອດຽວ ໃຊ້ກັບອໍເດີຕໍ່ໄປ / Save once and reuse for this brand. PNG / JPEG / WebP /
        PDF · 2 MB per file.
      </p>
      <button type="button" disabled={busy} onClick={() => setReload((v) => v + 1)}>
        ໂຫຼດໄຟລ໌ຫຼ້າສຸດ / Reload files
      </button>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <p role="status">Loading brand files…</p>
      ) : (
        <>
          <p role="status">
            {data.ready
              ? 'ປ້າຍຄໍ ແລະເທບຄໍພ້ອມ / Label and tape are ready.'
              : data.missing.join(' · ')}
          </p>
          {BRAND_ASSET_KINDS.map((kind) => {
            const files = data.assets.filter((asset) => asset.kind === kind);
            const latest = files[0];
            return (
              <section className="asset-kind" key={kind}>
                <h3>{ASSET_LABELS[kind]}</h3>
                <AssetUpload
                  path={path}
                  kind={kind}
                  readyImmediately
                  onUploaded={() => setReload((v) => v + 1)}
                />
                {latest?.status === 'PENDING' && (
                  <div>
                    <p>ໄຟລ໌ເກົ່າລໍຖ້າກວດ / An older upload is waiting for approval.</p>
                    <label>
                      ເຫດຜົນ / Approval reason
                      <input
                        value={reason}
                        maxLength={500}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy || !reason.trim()}
                      onClick={() => void approve(latest.id)}
                    >
                      ອະນຸມັດໄຟລ໌ເກົ່າ / Approve existing file
                    </button>
                  </div>
                )}
                {files.map((file, index) => (
                  <article className="asset-version" key={file.id}>
                    <p>
                      {index === 0 ? 'Current' : 'Previous'} · v{file.revision} · {file.filename} ·{' '}
                      {file.status}
                    </p>
                    {file.mime.startsWith('image/') && index === 0 && (
                      <img
                        className="asset-preview"
                        src={`/api/v1/graphic-assets/${file.id}/content`}
                        alt={`${ASSET_LABELS[kind]} ${name}`}
                      />
                    )}
                    <a
                      href={`/api/v1/graphic-assets/${file.id}/content`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      ເປີດໄຟລ໌ / Open file
                    </a>
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
