import { useState } from 'react';
import { api, ApiError, errorMessage } from '../services/api';
export function useRecordedCommand<T = unknown>(
  onChanged: () => void,
  onFreeze: (frozen: boolean) => void,
) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [pending, setPending] = useState<{
      path: string;
      body: unknown;
      headers: Record<string, string>;
      onSuccess?: (result: T) => void;
    } | null>(null);
  async function send(
    path: string,
    body: unknown,
    onSuccess?: (result: T) => void,
    headers: Record<string, string> = {},
  ) {
    setBusy(true);
    setError('');
    onFreeze(true);
    try {
      const result = await api<T>(path, 'POST', body, headers);
      setPending(null);
      onFreeze(false);
      onSuccess?.(result);
      onChanged();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      if (!(e instanceof ApiError) || !e.status || e.status >= 500)
        setPending({ path, body, onSuccess, headers });
      else {
        setPending(null);
        onFreeze(false);
        onChanged();
      }
      return false;
    } finally {
      setBusy(false);
    }
  }
  return {
    busy,
    error,
    pending,
    send,
    retry: () =>
      pending && void send(pending.path, pending.body, pending.onSuccess, pending.headers),
  };
}
