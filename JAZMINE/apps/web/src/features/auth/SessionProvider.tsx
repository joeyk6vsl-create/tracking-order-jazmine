import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { SessionView } from '../../../../../packages/contracts/src/identity';
import { api, errorMessage, getSession } from '../../services/api';

interface SessionContextValue {
  session: SessionView | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}
const SessionContext = createContext<SessionContextValue | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setError('');
    try {
      setSession(await getSession());
    } catch (e) {
      setSession(null);
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  const logout = useCallback(async () => {
    await api('/auth/logout', 'POST');
    await refresh();
  }, [refresh]);
  useEffect(() => {
    void refresh();
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => {
      void refresh();
    }, 60_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [refresh]);
  return (
    <SessionContext.Provider value={{ session, loading, error, refresh, logout }}>
      {children}
    </SessionContext.Provider>
  );
}
export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('SessionProvider missing');
  return context;
}
