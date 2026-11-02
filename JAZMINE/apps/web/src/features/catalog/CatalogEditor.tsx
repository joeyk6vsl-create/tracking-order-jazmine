import { useState } from 'react';
import type { CatalogInput, CatalogItem } from '../../../../../packages/contracts/src/catalog';
import { api, ApiError, errorMessage } from '../../services/api';
import { CatalogImage } from './CatalogImage';
import { prepareCatalogImage } from './prepare-catalog-image';

export function CatalogEditor({
  item,
  onSaved,
  onDone,
  canEdit,
}: {
  item: CatalogItem | null;
  onSaved: (item: CatalogItem) => void;
  onDone: () => void;
  canEdit: boolean;
}) {
  const [id] = useState(() => item?.id ?? crypto.randomUUID());
  const [name, setName] = useState(item?.name ?? ''),
    [kind, setKind] = useState(item?.kind ?? 'PRODUCT'),
    [notes, setNotes] = useState(item?.notes ?? ''),
    [active, setActive] = useState(item?.active ?? true),
    [image, setImage] = useState<string | null | undefined>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [pending, setPending] = useState<(CatalogInput & { rowVersion?: number }) | null>(null);
  async function save() {
    const input = pending ?? {
      name,
      kind,
      notes,
      active,
      ...(image !== undefined ? { image } : {}),
      ...(item ? { rowVersion: item.rowVersion } : {}),
    };
    setBusy(true);
    setError('');
    try {
      const result = await api<{ item: CatalogItem }>(
        `/catalog/${id}`,
        item ? 'PUT' : 'POST',
        input,
      );
      onSaved(result.item);
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && (e.status === 0 || e.status >= 500)) setPending(input);
    } finally {
      setBusy(false);
    }
  }
  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      setImage(await prepareCatalogImage(file));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel catalog-editor">
      <h2>{item ? 'ຂໍ້ມູນລາຍການ / Item details' : 'ເພີ່ມລາຍການ / Add item'}</h2>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={!canEdit || busy || !!pending}>
          <label>
            ປະເພດ / Type
            <select
              aria-label="Catalog type"
              value={kind}
              disabled={!!item}
              onChange={(e) => setKind(e.target.value as CatalogItem['kind'])}
            >
              <option value="PRODUCT">ສິນຄ້າ / Product</option>
              <option value="FABRIC">ເນື້ອຜ້າ / Fabric</option>
              <option value="COMPONENT">ສ່ວນປະກອບ / Component</option>
            </select>
          </label>
          <label>
            ຊື່ / Name
            <input
              aria-label="Catalog name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            ລາຍລະອຽດ / Notes
            <textarea maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <label>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />{' '}
            ເປີດໃຊ້ / Active
          </label>
          <label>
            ຮູບລາຍການ / Item image (optional)
            <input
              aria-label="Catalog image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <p className="muted">
            PNG / JPEG / WebP · 10 MB · ລະບົບຫຍໍ້ຮູບໃຫ້ / Image resized automatically.
            ບໍ່ມີຮູບສະແດງພຽງຊື່ / Without an image, show the name only.
          </p>
          <div className="catalog-image-preview">
            {image ? (
              <img src={image} alt="Selected item preview" />
            ) : image === undefined && item ? (
              <CatalogImage item={item} />
            ) : null}
          </div>
          {(image || (image === undefined && item?.hasImage)) && (
            <button type="button" onClick={() => setImage(null)}>
              ເອົາຮູບອອກ / Remove image
            </button>
          )}
        </fieldset>
        {canEdit && (
          <button className="primary" disabled={busy}>
            {pending ? 'Retry same item request' : 'ບັນທຶກ / Save item'}
          </button>
        )}
      </form>
      {busy && <p role="status">ກຳລັງດຳເນີນການ / Preparing…</p>}
      {item && item.kind === 'PRODUCT' && (
        <p>
          ຕໍ່ໄປ: ເລືອກຜ້າ ແລະ Size ດ້ານລຸ່ມ / Next: choose fabrics and sizes below, then assign a
          price group on the pricing page.
        </p>
      )}
      <button disabled={busy} onClick={onDone}>
        ກັບລາຍການ / Back to catalog
      </button>
    </section>
  );
}
