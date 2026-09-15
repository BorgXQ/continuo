import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import type { useSettings } from './useSettings';
import type { useDiscord } from './useDiscord';

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

export function Configuration({ settings, discord, close }: { settings: ReturnType<typeof useSettings>; discord: ReturnType<typeof useDiscord>; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { token, setToken } = discord;
  const connection = discord.status;
  const pending = connection === 'connecting' || connection === 'reconnecting';
  const servers = [...new Map(discord.channels.map(channel => [channel.serverId, channel.serverName])).entries()];
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} onCancel={close} aria-labelledby="configuration-title">
    <div className="dialog-heading"><h2 id="configuration-title">Configuration</h2><button className="icon-button" title="Close configuration" aria-label="Close configuration" onClick={close}><X size={18} /></button></div>
    <div className="configuration-fields">
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
        <Duration label="Transition crossfade" value={settings.values.crossfade} disabled={settings.loading} change={value => settings.update('crossfade', value)} />
        <Duration label="Global fade-in" value={settings.values.fadeIn} disabled={settings.loading} change={value => settings.update('fadeIn', value)} />
        <Duration label="Global fade-out" value={settings.values.fadeOut} disabled={settings.loading} change={value => settings.update('fadeOut', value)} />
      </div>
    </div>
    {settings.error && <p className="error" role="alert">{settings.error}</p>}
  </dialog>;
}
