import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import type { useSettings } from './useSettings';
import type { useDiscord } from './useDiscord';

function SettingValue({ label, value, disabled, change, unit = 'ms' }: { label: string; value: number; disabled: boolean; change: (value: number) => void; unit?: 'ms' | '%' }) {
  const [draft, setDraft] = useState<string | null>(null);
  const percentage = unit === '%';
  return <label className="duration-field"><span>{label}</span>
    <span className="volume-value duration-value"><input aria-label={`${label} (${percentage ? 'percent' : 'milliseconds'})`} type="number" min="0" max={percentage ? 100 : undefined} step={percentage ? 1 : 'any'} disabled={disabled} value={draft ?? (percentage ? value : Number((value * 1000).toPrecision(15)))}
      onFocus={event => event.currentTarget.select()}
      onChange={event => {
        setDraft(event.currentTarget.value);
        const amount = event.currentTarget.valueAsNumber;
        if (Number.isFinite(amount) && amount >= 0 && (!percentage || (Number.isInteger(amount) && amount <= 100))) change(percentage ? amount : amount / 1000);
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><span>{unit}</span></span>
  </label>;
}

export function Configuration({ settings, discord, close }: { settings: ReturnType<typeof useSettings>; discord: ReturnType<typeof useDiscord>; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const resetButton = useRef<HTMLButtonElement>(null);
  const outsidePress = useRef(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const { token, setToken } = discord;
  const connection = discord.status;
  const pending = connection === 'connecting' || connection === 'reconnecting';
  const servers = [...new Map(discord.channels.map(channel => [channel.serverId, channel.serverName])).entries()];
  useEffect(() => { dialog.current?.showModal(); }, []);
  const dismissConfirmation = () => {
    setConfirmReset(false);
    requestAnimationFrame(() => resetButton.current?.focus());
  };
  const outside = (x: number, y: number) => {
    const bounds = dialog.current!.getBoundingClientRect();
    return x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom;
  };
  return <dialog ref={dialog} onCancel={event => {
    event.preventDefault();
    if (confirmReset) dismissConfirmation(); else close();
  }} onPointerDown={event => { outsidePress.current = event.target === event.currentTarget && outside(event.clientX, event.clientY); }}
    onClick={event => { if (outsidePress.current && event.target === event.currentTarget && outside(event.clientX, event.clientY)) close(); outsidePress.current = false; }} aria-labelledby="configuration-title">
    <div className="dialog-heading"><h2 id="configuration-title">Configuration</h2><button className="icon-button" title="Close configuration" aria-label="Close configuration" onClick={close}><X size={18} /></button></div>
    {confirmReset ? <>
      <p>Reset audio settings to their defaults?</p>
      <p>Transition crossfade: 150 ms<br />Global fade-in: 0 ms<br />Global fade-out: 0 ms<br />Jump probability: 5%</p>
      <div className="dialog-actions">
        <button autoFocus onClick={dismissConfirmation}>Cancel</button>
        <button className="primary" onClick={() => { settings.reset(); dismissConfirmation(); }}>Reset to default</button>
      </div>
    </> : <><div className="configuration-fields">
      <div className="configuration-fields">
        <label className="duration-field"><span>Bot token</span>
          <input className="bot-token" type="password" autoComplete="off" spellCheck={false} value={token}
            disabled={discord.loading || connection !== 'disconnected'} aria-label="Bot token" placeholder="Token"
            onCopy={event => event.preventDefault()} onCut={event => event.preventDefault()} onDragStart={event => event.preventDefault()}
            onChange={event => setToken(event.currentTarget.value)} />
        </label>
        <div className="duration-field"><span>Status</span>
          <span className="connection-status" role="status" title={discord.botName ?? undefined}>
            {pending && <span className="analysis-spinner"><LoaderCircle size={14} /></span>}
            {connection === 'connected' ? 'Connected' : connection === 'connecting' ? 'Connecting' : connection === 'reconnecting' ? 'Reconnecting' : 'Disconnected'}
          </span>
        </div>
        <div className="dialog-actions connection-actions">
          <button className={connection !== 'disconnected' ? 'danger' : 'primary'} disabled={discord.loading || !discord.available || (connection === 'disconnected' && !token.trim())}
            onClick={() => {
              if (connection !== 'disconnected') { void discord.disconnect(); return; }
              void discord.connect(token);
            }}>
            {pending ? 'Cancel' : connection === 'connected' ? 'Disconnect' : 'Connect'}
          </button>
        </div>
        {discord.error && <p className="error" role="alert">{discord.error}</p>}
      </div>
      <label className="duration-field configuration-divider"><span>Output</span>
        <select className="output-select" value={discord.output?.channelId ?? 'device'} onChange={event => void discord.selectOutput(event.target.value === 'device' ? null : event.target.value)}><option value="device">Device output</option>
          {servers.map(([id, name]) => <optgroup key={id} label={name}>
            {discord.channels.filter(channel => channel.serverId === id).map(channel =>
              <option key={channel.id} value={channel.id}>{channel.name}{discord.output?.channelId === channel.id && !discord.output.ready ? ' (connecting)' : ''}</option>)}
          </optgroup>)}
        </select>
      </label>
      <div className="configuration-fields configuration-divider">
        <SettingValue label="Transition crossfade" value={settings.values.crossfade} disabled={settings.loading} change={value => settings.update('crossfade', value)} />
        <SettingValue label="Global fade-in" value={settings.values.fadeIn} disabled={settings.loading} change={value => settings.update('fadeIn', value)} />
        <SettingValue label="Global fade-out" value={settings.values.fadeOut} disabled={settings.loading} change={value => settings.update('fadeOut', value)} />
        <SettingValue label="Jump probability" value={settings.values.jumpProbability} unit="%" disabled={settings.loading} change={value => settings.update('jumpProbability', value)} />
      </div>
    </div>
    <div className="dialog-actions"><button ref={resetButton} disabled={settings.loading} onClick={() => setConfirmReset(true)}>Reset to default</button></div></>}
    {settings.error && <p className="error" role="alert">{settings.error}</p>}
  </dialog>;
}
