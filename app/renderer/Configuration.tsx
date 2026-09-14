import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { useSettings } from './useSettings';

function Duration({ label, value, disabled, change }: { label: string; value: number; disabled: boolean; change: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <label className="duration-field"><span>{label}</span>
    <span className="volume-value duration-value"><input aria-label={`${label} (milliseconds)`} type="number" min="0" step="any" disabled={disabled} value={draft ?? Number((value * 1000).toPrecision(15))}
      onFocus={event => event.currentTarget.select()}
      onChange={event => {
        setDraft(event.currentTarget.value);
        const milliseconds = event.currentTarget.valueAsNumber;
        if (Number.isFinite(milliseconds) && milliseconds >= 0) change(milliseconds / 1000);
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><span>ms</span></span>
  </label>;
}

export function Configuration({ settings, close }: { settings: ReturnType<typeof useSettings>; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} onCancel={close} aria-labelledby="configuration-title">
    <div className="dialog-heading"><h2 id="configuration-title">Configuration</h2><button className="icon-button" title="Close configuration" aria-label="Close configuration" onClick={close}><X size={18} /></button></div>
    <div className="configuration-fields">
      <Duration label="Transition crossfade" value={settings.values.crossfade} disabled={settings.loading} change={value => settings.update('crossfade', value)} />
      <Duration label="Global fade-in" value={settings.values.fadeIn} disabled={settings.loading} change={value => settings.update('fadeIn', value)} />
      <Duration label="Global fade-out" value={settings.values.fadeOut} disabled={settings.loading} change={value => settings.update('fadeOut', value)} />
      <label className="duration-field"><span>Output</span>
        <select className="output-select" defaultValue="device"><option value="device">Device output</option></select>
      </label>
    </div>
    {settings.error && <p className="error" role="alert">{settings.error}</p>}
  </dialog>;
}
