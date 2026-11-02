import { useState } from 'react';
import { errorMessage } from '../../services/api';
import { readArtworkFile, type ArtworkFile } from './read-artwork-file';

export function CustomerArtworkPicker({
  file,
  onChange,
  onBusy,
}: {
  file: ArtworkFile | null;
  onChange: (file: ArtworkFile | null) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function pick(value?: File) {
    if (!value) return;
    setBusy(true);
    onBusy(true);
    setError('');
    onChange(null);
    try {
      onChange(await readArtworkFile(value));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <section>
      <h3>ຮູບທີ່ລູກຄ້າສັ່ງ / Customer artwork</h3>
      <p>
        PNG / JPEG / WebP / PDF · 2 MB. ບັນທຶກພ້ອມຮ່າງ ແລ້ວລໍຖ້າ Graphic ກວດ / Saved with the draft
        for graphic review.
      </p>
      <input
        aria-label="Customer artwork"
        type="file"
        disabled={busy}
        accept="image/png,image/jpeg,image/webp,application/pdf"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {busy && <p role="status">Reading artwork…</p>}
      {file && (
        <>
          <p>{file.filename} · ລໍຖ້າບັນທຶກ / Ready to save</p>
          {file.preview && (
            <img
              className="customer-artwork-preview"
              src={file.preview}
              alt="Customer artwork preview"
            />
          )}
          <button type="button" onClick={() => onChange(null)}>
            ຖອນຮູບ / Remove artwork
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
