import { useState } from 'react';
import { ASSET_LABELS, type UploadAsset } from '../../../../../packages/contracts/src/assets';
import { api, errorMessage } from '../../services/api';
import { readArtworkFile } from './read-artwork-file';

export function AssetUpload({
  path,
  draftId,
  kind,
  readyImmediately,
  onUploaded,
}: {
  path: string;
  draftId?: string;
  kind: UploadAsset['kind'];
  readyImmediately: boolean;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<{ id: string; filename: string; base64: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  async function pick(value?: File) {
    setFile(null);
    setError('');
    setUncertain(false);
    if (!value) return;
    setBusy(true);
    try {
      setFile(await readArtworkFile(value));
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
      await api(`${path}/${file.id}`, 'PUT', {
        ...(draftId ? { draftId } : {}),
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
        ແນບ{ASSET_LABELS[kind]} / Add {kind === 'MOCKUP' ? 'mockup' : 'brand file'}
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
      {file && <p>{file.filename}</p>}
      {file && (
        <button type="button" disabled={busy} onClick={() => void upload()}>
          {uncertain
            ? 'ລອງຄຳຂໍເດີມ / Retry same upload'
            : readyImmediately
              ? `ບັນທຶກ${ASSET_LABELS[kind]} / Save ${kind === 'MOCKUP' ? 'mockup' : 'brand file'}`
              : `ສົ່ງ${ASSET_LABELS[kind]}ລໍຖ້າກວດ / Send for review`}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {uncertain && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setUncertain(false);
            setFile(null);
          }}
        >
          ເລືອກໄຟລ໌ໃໝ່ / Choose another file (check history first)
        </button>
      )}
    </div>
  );
}
