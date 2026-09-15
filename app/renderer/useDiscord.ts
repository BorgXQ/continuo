import { useEffect, useState } from 'react';
import { INITIAL_DISCORD_STATE } from '../shared/discord';

export function useDiscord() {
  const [state, setState] = useState(INITIAL_DISCORD_STATE);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const bridge = window.discord;
    if (!bridge) { setLoading(false); return; }
    let disposed = false;
    const receive = (next: typeof state) => {
      if (!disposed) {
        setState(previous => next.revision >= previous.revision ? next : previous);
        setError(null);
        setLoading(false);
      }
    };
    const unsubscribe = bridge.onUpdate(receive);
    void bridge.getState().then(receive).catch(() => {
      if (!disposed) { setError('Cannot read Discord connection status.'); setLoading(false); }
    });
    return () => { disposed = true; unsubscribe(); };
  }, []);

  async function connect(token: string) {
    setError(null);
    try { await window.discord!.connect(token); }
    catch { setError('Cannot connect to Discord. Check the token and try again.'); }
  }
  async function disconnect() {
    setError(null);
    try { await window.discord!.disconnect(); }
    catch { setError('Cannot disconnect from Discord. Please retry.'); }
  }
  return { ...state, error: error ?? state.error, loading, available: Boolean(window.discord), connect, disconnect };
}
