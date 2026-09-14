import { useState } from 'react';
import { Settings, X } from 'lucide-react';
import { Configuration } from './Configuration';
import { NowPlaying } from './NowPlaying';
import { Soundtracks } from './Soundtracks';
import { useTracks } from './useTracks';
import type { Track } from './useTracks';

export function App() {
  const library = useTracks();
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const tracks = library.slots.filter((track): track is Track => track !== null && Boolean(library.playing[track.id]));
  return (
    <main>
      <header>
        <div>
          <h1 aria-label="CONTINUO">{'CONTINUO'.split('').map((letter, index) => <span key={index} aria-hidden="true">{letter}</span>)}</h1>
          <p>Real-time Adaptive Music Looper</p>
        </div>
        <div className="credits">
          <button className="icon-button settings-button" title="Configuration" aria-label="Configuration" onClick={() => setConfigurationOpen(true)}><Settings size={18} /></button>
          <p>v1.0.0</p>
          <p>by BorgXQ</p>
        </div>
      </header>
      <NowPlaying tracks={tracks} playing={library.playing} stop={library.stop} volume={(id, value) => library.update(id, { volume: value })} />
      <Soundtracks library={library} />
      {configurationOpen && <Configuration settings={library.settings} close={() => setConfigurationOpen(false)} />}
      {library.error && <div role="alert" className="toast"><span>{library.error}</span><button className="icon-button" title="Dismiss" aria-label="Dismiss error" onClick={() => library.setError('')}><X size={18} /></button></div>}
    </main>
  );
}
