import { useState } from 'react';
import { Settings, X } from 'lucide-react';
import { Configuration } from './Configuration';
import { NowPlaying } from './NowPlaying';
import { Soundtracks } from './Soundtracks';
import { useTracks } from './useTracks';
import { useDiscord } from './useDiscord';
import type { Track } from './useTracks';
import logo from '../../assets/logo_white.png';

export function App() {
  const discord = useDiscord();
  const library = useTracks(discord.output?.ready ? discord.output.channelId : null);
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const tracks = library.slots.filter((track): track is Track => track !== null && Boolean(library.playing[track.id]))
    .sort((a, b) => library.playing[b.id].focusedAt - library.playing[a.id].focusedAt);
  return (
    <main>
      <header>
        <div>
          <h1 aria-label="CONTINUO"><img className="brand-logo" src={logo} alt="" />{'CONTINUO'.split('').map((letter, index) => <span key={index} aria-hidden="true">{letter}</span>)}</h1>
          <p>Real-time Adaptive Music Looper</p>
        </div>
        <div className="credits">
          <button className="icon-button settings-button" title="Configuration" aria-label="Configuration" onClick={() => setConfigurationOpen(true)}><Settings size={18} /></button>
          <p>v1.0.0</p>
          <p>by BorgXQ</p>
        </div>
      </header>
      <NowPlaying tracks={tracks} playing={library.playing} stop={library.stop} focus={library.focus} volume={(id, value) => library.update(id, { volume: value })} />
      <Soundtracks library={library} />
      {configurationOpen && <Configuration settings={library.settings} discord={discord} close={() => setConfigurationOpen(false)} />}
      {library.error && <div role="alert" className="toast"><span>{library.error}</span><button className="icon-button" title="Dismiss" aria-label="Dismiss error" onClick={() => library.setError('')}><X size={18} /></button></div>}
    </main>
  );
}
