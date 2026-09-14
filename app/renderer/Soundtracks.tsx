import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { DragEvent, KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, FileWarning, FolderSearch, Keyboard, LoaderCircle, Pencil, Plus, Repeat, Slash, Sparkles, Trash2, X } from 'lucide-react';
import { MODE_LABELS, PAGE_SIZE } from './useTracks';
import type { Track, useTracks } from './useTracks';

type Library = ReturnType<typeof useTracks>;
type Edit = { kind: 'rename' | 'shortcut' | 'delete'; track: Track };

function TrackDialog({ edit, close, library }: { edit: Edit; close: () => void; library: Library }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(edit.kind === 'rename' ? edit.track.name : edit.track.shortcut ?? '');
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  const titles = { rename: 'Rename track', shortcut: 'Assign shortcut', delete: 'Delete track' };
  function capture(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Tab' || event.key === 'Escape') return;
    event.preventDefault();
    if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || ['Control', 'Alt', 'Meta', 'Shift'].includes(event.key)) {
      setError('Choose a single key without modifiers.');
      return;
    }
    const key = event.code;
    if (library.slots.some(track => track && track.id !== edit.track.id && track.shortcut === key)) {
      setError('That shortcut belongs to another track.');
      return;
    }
    setError('');
    setValue(key);
  }
  return (
    <dialog ref={dialog} onCancel={close} aria-labelledby="dialog-title">
      <form onSubmit={event => {
        event.preventDefault();
        if (edit.kind === 'delete') library.remove(edit.track);
        else if (edit.kind === 'rename') {
          if (!value.trim()) { setError('Enter a track name.'); return; }
          library.update(edit.track.id, { name: value.trim() });
        } else library.update(edit.track.id, { shortcut: value || null });
        close();
      }}>
        <div className="dialog-heading"><h2 id="dialog-title">{titles[edit.kind]}</h2><button type="button" className="icon-button" aria-label="Close dialog" title="Close" onClick={close}><X size={18} /></button></div>
        {edit.kind === 'delete' ? <p>Remove {edit.track.name} from the soundboard? The original file will remain on your device.</p> : (
          <label className="dialog-field">{edit.kind === 'rename' ? 'Track name' : 'Shortcut key'}
            <input autoFocus value={value} readOnly={edit.kind === 'shortcut'} maxLength={160} placeholder={edit.kind === 'shortcut' ? 'Press a key' : undefined} onKeyDown={edit.kind === 'shortcut' ? capture : undefined} onChange={event => setValue(event.target.value)} />
          </label>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="dialog-actions">
          {edit.kind === 'shortcut' && <button type="button" onClick={() => { setValue(''); setError(''); }}>Reset</button>}
          <button type="button" onClick={close}>Cancel</button>
          <button className={edit.kind === 'delete' ? 'danger' : 'primary'} type="submit">{edit.kind === 'delete' ? 'Delete' : 'Save'}</button>
        </div>
      </form>
    </dialog>
  );
}

export function Soundtracks({ library }: { library: Library }) {
  const [page, setPage] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ track: Track; x: number; y: number } | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const locatePicker = useRef<HTMLInputElement>(null);
  const locateTrack = useRef<Track | null>(null);
  const pickSlot = useRef(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const pageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageDirection = useRef(0);
  const lastScroll = useRef(0);
  const pages = library.slots.length / PAGE_SIZE;
  const menuTrack = menu ? library.slots.find(track => track?.id === menu.track.id) : null;

  function clearPageTimer() {
    if (pageTimer.current) clearTimeout(pageTimer.current);
    pageTimer.current = null;
    pageDirection.current = 0;
  }

  useEffect(() => () => clearPageTimer(), []);
  useEffect(() => {
    function keydown(event: globalThis.KeyboardEvent) {
      if (edit || menu || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return;
      const track = library.slots.find(item => item?.shortcut === event.code);
      if (track) { event.preventDefault(); void library.toggle(track); }
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [library, edit, menu]);

  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function dismiss(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    }
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setMenu(null); };
    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('pointerdown', dismiss); window.removeEventListener('keydown', escape); };
  }, [menu]);

  function dragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (dragging !== null) event.dataTransfer.dropEffect = 'move';
    const bounds = event.currentTarget.getBoundingClientRect();
    const direction = event.clientX < bounds.left + 36 ? -1 : event.clientX > bounds.right - 36 ? 1 : 0;
    if (direction === pageDirection.current) return;
    clearPageTimer();
    if (direction) {
      pageDirection.current = direction;
      pageTimer.current = setTimeout(() => {
        setPage(current => Math.max(0, Math.min(pages - 1, current + direction)));
        clearPageTimer();
      }, 650);
    }
  }

  function drop(event: DragEvent, index: number) {
    event.preventDefault();
    event.stopPropagation();
    clearPageTimer();
    if (dragging !== null) {
      flushSync(() => {
        library.swap(dragging, index);
        setDragging(null);
        setDropTarget(null);
      });
    } else {
      library.add(Array.from(event.dataTransfer.files), index);
      setDropTarget(null);
    }
  }

  return (
    <section className="panel soundtracks" aria-labelledby="soundtracks-title"
      onWheel={event => {
        if (edit || menu || Math.abs(event.deltaY) < 8) return;
        const now = performance.now();
        if (now - lastScroll.current < 350) return;
        lastScroll.current = now;
        setPage(current => Math.max(0, Math.min(pages - 1, current + Math.sign(event.deltaY))));
      }}
      onDragEnter={dragOver}
      onDragOver={dragOver}
      onDragLeave={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
          clearPageTimer();
          setDropTarget(null);
        }
      }}
      onDrop={event => { event.preventDefault(); clearPageTimer(); setDragging(null); setDropTarget(null); }}>
      <h2 className="panel-title" id="soundtracks-title">SOUNDTRACKS</h2>
      <input ref={locatePicker} type="file" accept=".mp3,audio/mpeg" hidden aria-label="Locate missing MP3" onChange={event => {
        const file = event.target.files?.[0];
        if (file && locateTrack.current) library.locate(locateTrack.current, file);
        event.target.value = '';
      }} />
      <input ref={picker} type="file" accept=".mp3,audio/mpeg" multiple hidden aria-label="Select MP3 files" onChange={event => {
        library.add(Array.from(event.target.files ?? []), pickSlot.current);
        event.target.value = '';
      }} />
      <div className="track-grid">
        {library.slots.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((track, offset) => {
          const index = page * PAGE_SIZE + offset;
          const active = track ? Boolean(library.playing[track.id]) : false;
          return (
            <div key={index} data-slot={index} aria-busy={Boolean(track?.job)} className={`track-tile ${track ? 'filled' : 'empty'} ${active ? 'playing' : ''} ${track?.job ? 'analyzing' : ''} ${dragging === index ? 'dragging' : ''} ${dropTarget === index ? 'drop-target' : ''}`}
              draggable={Boolean(track)} onDragStart={event => { setDragging(index); event.dataTransfer.setData('text/plain', String(index)); event.dataTransfer.effectAllowed = 'move'; }}
              onDragEnd={() => { setDragging(null); setDropTarget(null); clearPageTimer(); }}
              onDragEnter={() => setDropTarget(index)} onDrop={event => drop(event, index)}
              onContextMenu={event => {
                event.preventDefault();
                if (track) setMenu({ track, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 240)), y: Math.max(8, Math.min(event.clientY, window.innerHeight - 248)) });
              }}>
              {track ? <>
                {track.missing && <span className="missing-file" title="MP3 missing or changed; locate the file from the track menu" role="img" aria-label="MP3 missing or changed"><FileWarning size={16} /></span>}
                <button className="tile-play" disabled={Boolean(track.job) || track.missing} aria-label={`${active ? 'Stop' : 'Play'} ${track.name}`} aria-pressed={active} title={track.missing ? `${track.name}: MP3 missing or changed` : track.name} onClick={() => void library.toggle(track)}>
                  <span className="tile-name">{track.name}</span>
                </button>
                {track.job ? <>
                  <span className="loop-button analysis-spinner" role="status" aria-label={`${track.job.state === 'queued' ? 'Queued' : 'Analyzing'} ${track.name}`} title={track.job.stage}><LoaderCircle size={20} /></span>
                  <button className="cancel-analysis icon-button" title="Cancel analysis" aria-label={`Cancel analysis for ${track.name}`} onClick={() => void library.cancelAnalysis(track)}><X size={16} /></button>
                </> : <button className="loop-button" disabled={track.missing} aria-label={`Loop mode for ${track.name}: ${MODE_LABELS[track.mode]}`} title={`${MODE_LABELS[track.mode]}; click to change`} onClick={() => library.cycleMode(track)}>
                  {track.mode === 'procedural' ? <span className="procedural-icon"><Repeat size={19} /><Sparkles size={11} /></span> : track.mode === 'loop' ? <Repeat size={19} /> : <span className="loop-off"><Repeat size={19} /><Slash size={19} /></span>}
                </button>}
              </> : <button className="add-track" disabled={library.loading} onClick={() => { pickSlot.current = index; picker.current?.click(); }}><Plus size={21} /> Add Track</button>}
            </div>
          );
        })}
      </div>
      <nav className="pagination" aria-label="Soundtrack pages">
        <button className="icon-button" aria-label="Previous page" title="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}><ArrowLeft size={16} /></button>
        <div className="page-numbers">{Array.from({ length: pages }, (_, index) => <button key={index} aria-label={`Page ${index + 1}`} aria-current={page === index ? 'page' : undefined} onClick={() => setPage(index)}>{index + 1}</button>)}</div>
        <button className="icon-button" aria-label="Next page" title="Next page" disabled={page === pages - 1} onClick={() => setPage(page + 1)}><ArrowRight size={16} /></button>
      </nav>
      {menu && <div ref={menuRef} className="context-menu" role="menu" aria-label={`Actions for ${menu.track.name}`} style={{ left: menu.x, top: menu.y }} onKeyDown={event => {
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        }
      }}>
        <button role="menuitem" onClick={() => { setEdit({ kind: 'rename', track: menu.track }); setMenu(null); }}><Pencil size={16} /> Rename</button>
        <button role="menuitem" disabled={menuTrack?.missing} onClick={() => {
          if (menuTrack) void (menuTrack.job ? library.cancelAnalysis(menuTrack) : library.analyze(menuTrack));
          setMenu(null);
        }}>{menuTrack?.job ? <X size={16} /> : <Sparkles size={16} />}{menuTrack?.job ? 'Cancel analysis' : menuTrack?.analysis ? 'Reanalyze' : 'Analyze'}</button>
        <button role="menuitem" onClick={() => { locateTrack.current = menuTrack ?? null; locatePicker.current?.click(); setMenu(null); }}><FolderSearch size={16} /> Locate file</button>
        <button role="menuitem" onClick={() => { setEdit({ kind: 'shortcut', track: menu.track }); setMenu(null); }}><Keyboard size={16} /> Assign shortcut</button>
        <button role="menuitem" className="danger" onClick={() => { setEdit({ kind: 'delete', track: menu.track }); setMenu(null); }}><Trash2 size={16} /> Delete</button>
      </div>}
      {edit && <TrackDialog edit={edit} library={library} close={() => setEdit(null)} />}
    </section>
  );
}
