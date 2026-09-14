import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { useSettings } from './useSettings';

function Duration({ label, value, disabled, change }: { label: string; value: number; disabled: boolean; change: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <label className="dialog-field">{label} (seconds)
    <input type="number" min="0" step="any" disabled={disabled} value={draft ?? value}
      onChange={event => {
        setDraft(event.currentTarget.value);
        const seconds = event.currentTarget.valueAsNumber;
        if (Number.isFinite(seconds) && seconds >= 0) change(seconds);
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
  </label>;
}

export function Configuration({ settings, close }: { settings: ReturnType<typeof useSettings>; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} onCancel={close} aria-labelledby="configuration-title">
    <div className="dialog-heading"><h2 id="configuration-title">Configuration</h2><button className="icon-button" title="Close configuration" aria-label="Close configuration" onClick={close}><X size={18} /></button></div>
    <div className="configuration-fields">
      <Duration label="Global fade-in" value={settings.values.fadeIn} disabled={settings.loading} change={value => settings.update('fadeIn', value)} />
      <Duration label="Global fade-out" value={settings.values.fadeOut} disabled={settings.loading} change={value => settings.update('fadeOut', value)} />
    </div>
    {settings.error && <p className="error" role="alert">{settings.error}</p>}
  </dialog>;
}
