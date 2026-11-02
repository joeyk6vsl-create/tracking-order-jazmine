import { useRef, useState } from 'react';
import type { DraftInput, DraftView } from '../../../../../packages/contracts/src/orders';
import type { ArtworkFile } from '../assets/read-artwork-file';
import { api, ApiError, errorMessage } from '../../services/api';

// Keep the exact draft and upload requests across a lost response. Retrying an
// upload must not save another draft revision and invalidate its own artwork.
export function useSaveDraftWithArtwork(id: string, onSaved: (draft: DraftView) => void) {
  type Pending = { input: DraftInput; file: ArtworkFile | null; saved?: DraftView };
  const pending = useRef<Pending | null>(null);
  const running = useRef(false);
  const [busy, setBusy] = useState(false),
    [locked, setLocked] = useState(false);
  const [error, setError] = useState(''),
    [savedDraft, setSavedDraft] = useState<DraftView | null>(null);
  async function send(request: Pending) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setLocked(true);
    setError('');
    pending.current = request;
    try {
      if (!request.saved) {
        request.saved = (
          await api<{ draft: DraftView }>(`/order-drafts/${id}`, 'PUT', request.input)
        ).draft;
        setSavedDraft(request.saved);
      }
      if (request.file)
        await api(`/graphic-assets/${request.file.id}`, 'PUT', {
          draftId: id,
          kind: 'MOCKUP',
          filename: request.file.filename,
          base64: request.file.base64,
        });
      pending.current = null;
      setLocked(false);
      onSaved(request.saved);
    } catch (e) {
      setError(errorMessage(e));
      if (!request.saved && e instanceof ApiError && e.status >= 400 && e.status < 500) {
        pending.current = null;
        setLocked(false);
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return {
    busy,
    locked,
    error,
    savedDraft,
    save: (input: DraftInput, file: ArtworkFile | null) => send({ input, file }),
    retry: () => pending.current && void send(pending.current),
    openSaved: () => savedDraft && onSaved(savedDraft),
  };
}
