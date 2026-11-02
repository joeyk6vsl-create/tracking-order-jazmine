import type { PaymentEntry } from '../../../../../packages/contracts/src/settlement';
import { ReceiptContents } from './ReceiptContents';
import {
  CurrentDocumentBanner,
  useCurrentDocumentStatus,
} from '../documents/CurrentDocumentStatus';
export function PaymentReceipt({ entry }: { entry: PaymentEntry }) {
  const current = useCurrentDocumentStatus('RECEIPT', entry.id, 1);
  return (
    <ReceiptContents entry={entry}>
      <CurrentDocumentBanner status={current.status} />
      {current.error && (
        <p role="alert" className="no-print">
          {current.error}
        </p>
      )}
      <button className="primary" disabled={current.busy} onClick={() => void current.print()}>
        ພິມໃບຮັບເງິນ / Print receipt
      </button>
    </ReceiptContents>
  );
}
