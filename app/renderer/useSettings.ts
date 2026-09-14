import { useEffect, useRef, useState } from 'react';
import { DEFAULT_AUDIO_SETTINGS, type AudioSettings } from '../shared/library';

export function useSettings(reportError: (message: string) => void) {
  const [values, setValues] = useState(DEFAULT_AUDIO_SETTINGS);
  const current = useRef(values);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const ready = useRef(false);

  function update(key: keyof AudioSettings, value: number) {
    if (!ready.current || !Number.isFinite(value) || value < 0) return;
    current.current = { ...current.current, [key]: value };
    setValues(current.current);
    setError('');
    void window.library?.saveSettings(current.current).catch(cause => {
      const message = `Cannot save configuration: ${String(cause)}`;
      setError(message);
      reportError(message);
    });
  }

  useEffect(() => {
    let disposed = false;
    void (window.library?.loadSettings() ?? Promise.resolve(DEFAULT_AUDIO_SETTINGS)).then(settings => {
      if (disposed) return;
      current.current = settings;
      setValues(settings);
      ready.current = true;
      setLoading(false);
    }).catch(cause => {
      if (!disposed) {
        const message = `Cannot load configuration: ${String(cause)}`;
        setError(message);
        reportError(message);
      }
    });
    const flush = (event: BeforeUnloadEvent) => {
      if (!ready.current || !window.library) return;
      const error = window.library.flushSettings(current.current);
      if (error) {
        event.preventDefault();
        event.returnValue = '';
        reportError(`Cannot save configuration: ${error}`);
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => { disposed = true; window.removeEventListener('beforeunload', flush); };
  }, []);

  return { values, current, loading, error, update };
}
