import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type {
  DocumentCurrentStatus,
  DocumentKind,
} from '../../../../../packages/contracts/src/documents';
import { api, errorMessage } from '../../services/api';
import './stored-documents.css';
const primaryLabels = {
  CURRENT: 'ສະບັບປັດຈຸບັນ / Current revision',
  CANCELLED: 'ຍົກເລີກແລ້ວ / CANCELLED',
  VOIDED: 'ບັນທຶກບໍ່ຖືກຕ້ອງ / VOIDED',
  SUPERSEDED: 'ສະບັບເກົ່າ / SUPERSEDED',
  UNDER_REVIEW: 'ກຳລັງແກ້ໄຂໃບ / UNDER REVIEW',
};
const flagLabels = {
  ORDER_CANCELLED: 'Order ຍົກເລີກແລ້ວ / Order cancelled',
  ARCHIVED: 'ເກັບໃນປະຫວັດ / Archived',
  ORDER_REVISION_CHANGED: 'Order ມີສະບັບໃໝ່ / Older order revision',
  EXPIRED: 'ໝົດອາຍຸແລ້ວ / Expired',
  PAYMENT_DETAILS_CHANGED:
    'QR ຮັບເງິນປ່ຽນແລ້ວ ກວດກັບຮ້ານກ່ອນຈ່າຍ / Payment details changed; verify with the shop before paying',
};
export function documentStatusText(status: DocumentCurrentStatus) {
  if (status.primary === 'CURRENT' && !status.flags.length) return '';
  return [primaryLabels[status.primary], ...status.flags.map((f) => flagLabels[f]), status.reason]
    .filter(Boolean)
    .join(' · ');
}
export function CurrentDocumentBanner({ status }: { status: DocumentCurrentStatus | null }) {
  if (!status) return null;
  const warning = documentStatusText(status);
  return (
    <aside
      className={'document-current-status' + (!warning ? ' no-print' : '')}
      aria-label="Current document status"
    >
      <strong>{warning || primaryLabels.CURRENT}</strong>
      <p>
        ກວດເມື່ອ / Checked:{' '}
        {new Date(status.checkedAt).toLocaleString('en-GB', { timeZone: 'Asia/Vientiane' })} · Lao
        time
      </p>
    </aside>
  );
}
export function useCurrentDocumentStatus(
  kind: DocumentKind,
  id: string,
  version: number,
  refreshKey = 0,
) {
  const [loaded, setLoaded] = useState<{ path: string; status: DocumentCurrentStatus } | null>(
      null,
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const sequence = useRef({ value: 0 });
  const path = `/documents/${kind}/${id}/${version}/current-status`;
  useEffect(() => {
    const state = sequence.current;
    const ticket = ++state.value;
    void api<DocumentCurrentStatus>(path)
      .then((next) => {
        if (ticket === state.value) {
          setLoaded({ path, status: next });
          setError('');
          setBusy(false);
        }
      })
      .catch((e) => {
        if (ticket === state.value) {
          setError(errorMessage(e));
          setBusy(false);
        }
      });
    return () => {
      state.value++;
    };
  }, [path, refreshKey]);
  async function check() {
    const state = sequence.current;
    const ticket = ++state.value;
    setBusy(true);
    try {
      const next = await api<DocumentCurrentStatus>(path);
      if (ticket !== state.value) throw new Error('Document changed; select and print it again');
      flushSync(() => {
        setLoaded({ path, status: next });
        setError('');
      });
      await document.fonts.ready;
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (ticket !== state.value) throw new Error('Document changed; select and print it again');
      return next;
    } catch (e) {
      if (ticket === state.value) setError(errorMessage(e));
      throw e;
    } finally {
      if (ticket === state.value) setBusy(false);
    }
  }
  async function print() {
    try {
      await check();
      window.print();
    } catch {
      /* Error is shown beside the print controls. */
    }
  }
  return { status: loaded?.path === path ? loaded.status : null, error, busy, check, print };
}
