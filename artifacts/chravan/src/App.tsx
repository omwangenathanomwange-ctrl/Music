import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AudioLines, Disc3, Play, Pause, SkipBack, SkipForward, Heart, Search,
  Plus, X, Download, Pencil, Trash2, Volume2, VolumeX, Library,
  ListMusic, MoreHorizontal, Radio, Headphones, Check,
} from 'lucide-react';
import './index.css';

type Track = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  mood: string;
  duration: string;
  src: string;
  artwork: number;
  custom?: boolean;
};
type Playlist = { id: string; name: string; trackIds: string[] };
type View = 'browse' | 'favorites' | 'playlists' | 'manage';

const initialTracks: Track[] = Array.from({ length: 8 }, (_, i) => ({
  id: `soundhelix-${i + 1}`,
  title: `SoundHelix Demo ${String(i + 1).padStart(2, '0')}`,
  artist: 'SoundHelix · Demo audio',
  genre: ['Electronic', 'Ambient', 'Downtempo', 'Electronic', 'Cinematic', 'Ambient', 'Downtempo', 'Electronic'][i],
  mood: ['After hours', 'Weightless', 'Slow burn', 'Voltage', 'Wide screen', 'Blue hour', 'Drift', 'Night drive'][i],
  duration: 'Demo',
  src: `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${i + 1}.mp3`,
  artwork: i,
}));

type ItunesSong = {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  primaryGenreName?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
};

function fromItunes(song: ItunesSong): Track {
  const seconds = Math.round((song.trackTimeMillis ?? 0) / 1000);
  return {
    id: `itunes-${song.trackId}`,
    title: song.trackName,
    artist: song.artistName,
    genre: song.primaryGenreName || 'Music',
    mood: song.collectionName || 'Search result',
    duration: seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '--:--',
    src: song.previewUrl ?? '',
    artwork: song.trackId % 8,
    custom: true,
  };
}

const palettes = [
  ['#092b36', '#18c8af', '#a5ffee'], ['#201337', '#9c54db', '#e7b4ff'],
  ['#362116', '#d47645', '#ffcb8a'], ['#10283e', '#368ed1', '#a8dbff'],
  ['#2c1635', '#d84c9b', '#ffc1dc'], ['#1a2b30', '#67b7a4', '#c2f1d9'],
  ['#282c46', '#8585e7', '#c5c2ff'], ['#342516', '#c8994f', '#ffe0a2'],
];

function Artwork({ track, className = '' }: { track: Track; className?: string }) {
  const colors = palettes[track.artwork % palettes.length];
  const idx = track.artwork % 4;
  return (
    <div className={`cover art-${idx} ${className}`} style={{ background: `radial-gradient(ellipse at 29% 22%, ${colors[2]}88, transparent 34%), linear-gradient(140deg, ${colors[0]}, ${colors[1]} 110%)` }} aria-label={`${track.title} abstract artwork`} role="img">
      <svg className="cover-visual" viewBox="0 0 300 240" aria-hidden="true">
        {idx === 0 && <><ellipse cx="150" cy="122" rx="81" ry="81" fill="none" stroke={colors[2]} strokeOpacity=".55" strokeWidth="1"/><ellipse cx="150" cy="122" rx="61" ry="61" fill="none" stroke="white" strokeOpacity=".3"/><path d="M26 173C79 68 127 235 183 101s75-39 95-80" fill="none" stroke={colors[2]} strokeWidth="4" strokeLinecap="round"/><circle cx="150" cy="122" r="15" fill={colors[2]} fillOpacity=".8"/></>}
        {idx === 1 && <><path d="M0 144 Q52 82 102 144 T204 144 T306 144" fill="none" stroke={colors[2]} strokeWidth="22" strokeOpacity=".65"/><path d="M0 167 Q52 105 102 167 T204 167 T306 167" fill="none" stroke="white" strokeWidth="1" strokeOpacity=".8"/><circle cx="192" cy="82" r="38" fill="none" stroke="white" strokeOpacity=".6"/><circle cx="192" cy="82" r="24" fill={colors[2]} fillOpacity=".35"/></>}
        {idx === 2 && <><path d="M54 197 148 42l101 155Z" fill="none" stroke={colors[2]} strokeWidth="2"/><path d="M90 197 148 102l61 95Z" fill={colors[2]} fillOpacity=".3"/><circle cx="148" cy="122" r="44" fill="none" stroke="white" strokeOpacity=".52"/><path d="M26 72h248M37 82h228" stroke="white" strokeOpacity=".24"/></>}
        {idx === 3 && <><path d="M27 156h27l12-35 18 67 21-113 21 137 18-95 17 49 15-30 18 20h79" fill="none" stroke={colors[2]} strokeWidth="3" strokeLinejoin="round"/><circle cx="150" cy="120" r="90" fill="none" stroke="white" strokeOpacity=".24" strokeDasharray="2 7"/><circle cx="150" cy="120" r="65" fill="none" stroke={colors[2]} strokeOpacity=".4"/></>}
      </svg>
      <span className="cover-glyph">C<span>·</span>{String(track.artwork + 1).padStart(2, '0')}</span>
      <span className="cover-index">CHRAVAN / {String(track.artwork + 1).padStart(2, '0')}</span>
    </div>
  );
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch { return fallback; }
}

const DB_NAME = 'chravan-offline';
const STORE = 'audio';
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function loadAllAudio(): Promise<Map<string, Blob>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const found = new Map<string, Blob>();
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) { found.set(String(cursor.key), cursor.value as Blob); cursor.continue(); }
      else resolve(found);
    };
    request.onerror = () => reject(request.error);
  });
}

async function putAudio(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteAudio(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function App() {
  const [tracks, setTracks] = useState<Track[]>(() => readStorage('chravan.catalog', initialTracks));
  const [favorites, setFavorites] = useState<string[]>(() => readStorage('chravan.favorites', []));
  const [playlists, setPlaylists] = useState<Playlist[]>(() => readStorage('chravan.playlists', []));
  const [view, setView] = useState<View>('browse');
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('All sounds');
  const [activePlaylist, setActivePlaylist] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(0.78);
  const [muted, setMuted] = useState(false);
  const [modal, setModal] = useState<'track' | 'playlist' | 'add-to-playlist' | null>(null);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistTrackId, setPlaylistTrackId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [offlineIds, setOfflineIds] = useState<string[]>([]);
  const offlineUrls = useRef(new Map<string, string>());
  const audioRef = useRef<HTMLAudioElement>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const currentTrack = tracks.find((track) => track.id === currentId) ?? results.find((track) => track.id === currentId) ?? null;

  useEffect(() => { localStorage.setItem('chravan.catalog', JSON.stringify(tracks)); }, [tracks]);
  useEffect(() => { localStorage.setItem('chravan.favorites', JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { localStorage.setItem('chravan.playlists', JSON.stringify(playlists)); }, [playlists]);
  useEffect(() => {
    loadAllAudio()
      .then((blobs) => {
        blobs.forEach((blob, id) => offlineUrls.current.set(id, URL.createObjectURL(blob)));
        setOfflineIds(Array.from(blobs.keys()));
      })
      .catch(() => { /* offline storage unavailable; streaming still works */ });
  }, []);
  useEffect(() => {
    const term = query.trim();
    if (view !== 'browse' || term.length < 2) { setResults([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=25`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { results: ItunesSong[] };
        setResults(data.results.filter((song) => song.previewUrl).map(fromItunes));
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
          showNotice('Music search is unavailable right now. Check your connection and try again.');
        }
      }
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, view]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
  }, [volume, muted]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setPosition(audio.currentTime || 0);
    const onDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onEnded = () => nextTrack();
    const onError = () => { setPlaying(false); showNotice('This demo audio could not be loaded. Check your connection and try another track.'); };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('durationchange', onDuration);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  });

  function showNotice(message: string) {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 5200);
  }
  function playTrack(track: Track) {
    const audio = audioRef.current;
    if (!audio) return;
    if (currentId !== track.id) {
      setCurrentId(track.id);
      setPosition(0);
      setDuration(0);
      audio.src = offlineUrls.current.get(track.id) ?? track.src;
      audio.load();
    }
    void audio.play().then(() => setPlaying(true)).catch(() => {
      setPlaying(false);
      showNotice('Playback could not start. The demo audio may be unavailable or blocked by your browser.');
    });
  }
  function togglePlay() {
    if (!currentTrack) {
      const first = visibleTracks[0] ?? tracks[0];
      if (first) playTrack(first);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().then(() => setPlaying(true)).catch(() => showNotice('Playback could not start. Try another demo track.'));
    } else { audio.pause(); setPlaying(false); }
  }
  function nextTrack() {
    if (!tracks.length) return;
    const index = tracks.findIndex((track) => track.id === currentId);
    playTrack(tracks[(index + 1 + tracks.length) % tracks.length]);
  }
  function previousTrack() {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) { audio.currentTime = 0; return; }
    if (!tracks.length) return;
    const index = tracks.findIndex((track) => track.id === currentId);
    playTrack(tracks[(index - 1 + tracks.length) % tracks.length]);
  }
  function toggleFavorite(trackId: string) {
    setFavorites((old) => old.includes(trackId) ? old.filter((id) => id !== trackId) : [...old, trackId]);
  }
  function saveTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') || '').trim();
    const artist = String(form.get('artist') || '').trim();
    const genreValue = String(form.get('genre') || 'Electronic');
    const src = String(form.get('src') || '').trim();
    if (!title || !artist || !src) return;
    if (editingTrack) {
      setTracks((old) => old.map((track) => track.id === editingTrack.id ? { ...track, title, artist, genre: genreValue, src } : track));
      if (currentId === editingTrack.id && audioRef.current) {
        audioRef.current.pause();
        setPlaying(false);
      }
    } else {
      const track: Track = { id: `local-${Date.now()}`, title, artist, genre: genreValue, mood: 'Your collection', duration: 'Demo', src, artwork: tracks.length % palettes.length, custom: true };
      setTracks((old) => [...old, track]);
    }
    setModal(null);
    setEditingTrack(null);
  }
  function removeTrack(track: Track) {
    if (!window.confirm(`Remove “${track.title}” from your local catalog?`)) return;
    const url = offlineUrls.current.get(track.id);
    if (url) URL.revokeObjectURL(url);
    offlineUrls.current.delete(track.id);
    setOfflineIds((old) => old.filter((id) => id !== track.id));
    void deleteAudio(track.id).catch(() => {});
    setTracks((old) => old.filter((item) => item.id !== track.id));
    setFavorites((old) => old.filter((id) => id !== track.id));
    setPlaylists((old) => old.map((playlist) => ({ ...playlist, trackIds: playlist.trackIds.filter((id) => id !== track.id) })));
    if (currentId === track.id) { audioRef.current?.pause(); setPlaying(false); setCurrentId(null); }
  }
  function createPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = playlistName.trim();
    if (!name) return;
    const playlist = { id: `playlist-${Date.now()}`, name, trackIds: playlistTrackId ? [playlistTrackId] : [] };
    setPlaylists((old) => [...old, playlist]);
    setPlaylistName('');
    setPlaylistTrackId(null);
    setActivePlaylist(playlist.id);
    setView('playlists');
    setModal(null);
  }
  function addToPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!playlistTrackId) return;
    const form = new FormData(event.currentTarget);
    const id = String(form.get('playlist') || '');
    setPlaylists((old) => old.map((list) => list.id === id && !list.trackIds.includes(playlistTrackId) ? { ...list, trackIds: [...list.trackIds, playlistTrackId] } : list));
    setModal(null);
  }

  async function toggleOffline(track: Track) {
    if (offlineIds.includes(track.id)) {
      const url = offlineUrls.current.get(track.id);
      if (url) URL.revokeObjectURL(url);
      offlineUrls.current.delete(track.id);
      setOfflineIds((old) => old.filter((id) => id !== track.id));
      try { await deleteAudio(track.id); } catch { /* already gone */ }
      showNotice(`Removed “${track.title}” from offline songs.`);
      return;
    }
    try {
      const response = await fetch(track.src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      await putAudio(track.id, blob);
      offlineUrls.current.set(track.id, URL.createObjectURL(blob));
      setOfflineIds((old) => [...old, track.id]);
      setTracks((old) => old.some((item) => item.id === track.id) ? old : [...old, track]);
      showNotice(`“${track.title}” is saved for offline listening.`);
    } catch {
      showNotice('Could not save this song. Check your connection and try again.');
    }
  }

  const genres = useMemo(() => ['All sounds', ...Array.from(new Set(tracks.map((track) => track.genre)))], [tracks]);
  const visibleTracks = useMemo(() => tracks.filter((track) => {
    const searchMatch = `${track.title} ${track.artist} ${track.genre} ${track.mood}`.toLowerCase().includes(query.toLowerCase());
    const genreMatch = genre === 'All sounds' || track.genre === genre;
    const favoriteMatch = view !== 'favorites' || favorites.includes(track.id);
    const playlistMatch = view !== 'playlists' || !activePlaylist || playlists.find((item) => item.id === activePlaylist)?.trackIds.includes(track.id);
    return searchMatch && genreMatch && favoriteMatch && playlistMatch;
  }), [tracks, query, genre, view, favorites, playlists, activePlaylist]);
  const shownTracks = view === 'browse' && query.trim().length >= 2
    ? [...visibleTracks, ...results.filter((result) => !tracks.some((track) => track.id === result.id))]
    : visibleTracks;

  const viewTitle = view === 'favorites' ? 'Your favorites' : view === 'manage' ? 'Catalog studio' : view === 'playlists' ? 'Your playlists' : 'The sound library';
  function chooseView(next: View) {
    setView(next);
    if (next !== 'playlists') setActivePlaylist(null);
  }
  function openTrackEditor(track?: Track) {
    setEditingTrack(track ?? null);
    setModal('track');
  }

  return (
    <div className="app-shell">
      <div className="ambient" aria-hidden="true" />
      <div className="app-content">
        <header className="topbar">
          <a className="brand" href="/" aria-label="CHRAVAN home" data-testid="link-home"><span className="brand-mark"><AudioLines size={16} /></span>CHRAVAN</a>
          <nav className="nav-links" aria-label="Main navigation">
            {(['browse', 'favorites', 'playlists', 'manage'] as View[]).map((item) => <button key={item} className={`nav-button ${view === item ? 'active' : ''}`} onClick={() => chooseView(item)} data-testid={`nav-${item}`}>{item === 'browse' ? 'Discover' : item}</button>)}
          </nav>
          <div className="nav-actions"><span className="creator-chip">CREATED BY ALVAN CHRAVAN</span><button className="icon-button" aria-label="Open catalog manager" title="Catalog manager" onClick={() => chooseView('manage')} data-testid="button-open-catalog"><MoreHorizontal size={17} /></button></div>
        </header>

        <section className="hero" aria-label="CHRAVAN music world">
          <div className="hero-copy">
            <div className="eyebrow"><Radio size={13} /> THE NIGHT IS YOURS</div>
            <h1><span>CHRAVAN</span><span>SOUNDS</span></h1>
            <p className="hero-sub">A private frequency for the <strong>after hours.</strong><br />Find your next repeat.</p>
            <div className="creator-line">CREATED BY ALVAN CHRAVAN</div>
          </div>
          <div className="hero-art" aria-hidden="true"><div className="hero-orb" /><span className="orbit-dot" /><span className="floating-note n1">FREQ 08</span><span className="floating-note n2">♪ 04</span><span className="floating-note n3">SOUND / ON</span></div>
        </section>

        <main>
          <div className="section-heading">
            <div><div className="eyebrow">YOUR FREQUENCY / 0{tracks.length}</div><h2>{viewTitle}</h2><p>{view === 'manage' ? 'Shape the music in your world.' : view === 'favorites' ? 'All the sounds you kept close.' : view === 'playlists' ? 'A place for every kind of night.' : 'Eight public demo tracks. Find something that stays.'}</p></div>
            <span className="count-label">{shownTracks.length} {shownTracks.length === 1 ? 'TRACK' : 'TRACKS'}</span>
          </div>

          {view !== 'manage' && <div className="toolbar">
            <label className="search-wrap"><Search size={15} /><input type="search" placeholder="Search tracks, moods, genres..." value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search library" data-testid="input-search" />{query && <button aria-label="Clear search" className="clear-search" onClick={() => setQuery('')}><X size={14} /></button>}</label>
            <div className="genre-list" aria-label="Filter by genre">{genres.map((item) => <button key={item} className={`pill ${genre === item ? 'active' : ''}`} onClick={() => setGenre(item)} data-testid={`filter-${item.toLowerCase().replaceAll(' ', '-')}`}>{item}</button>)}</div>
          </div>}

          {view === 'playlists' && <section className="playlists-section" style={{ marginTop: 0, paddingBottom: 22 }}>
            <div className="playlist-strip">
              <button className={`playlist-card ${!activePlaylist ? 'active' : ''}`} onClick={() => setActivePlaylist(null)} data-testid="playlist-all"><strong>All saved mixes</strong><span>{playlists.length} playlists</span></button>
              {playlists.map((playlist) => <button key={playlist.id} className={`playlist-card ${activePlaylist === playlist.id ? 'active' : ''}`} onClick={() => setActivePlaylist(playlist.id)} data-testid={`playlist-${playlist.id}`}><strong>{playlist.name}</strong><span>{playlist.trackIds.length} {playlist.trackIds.length === 1 ? 'track' : 'tracks'}</span></button>)}
              <button className="playlist-card create-playlist-card" onClick={() => setModal('playlist')} data-testid="button-create-playlist"><strong><Plus size={15} /> New playlist</strong><span>Give the night a name</span></button>
            </div>
            {activePlaylist && <div className="playlist-tools"><span className="count-label">{playlists.find((item) => item.id === activePlaylist)?.name}</span><button className="button secondary" onClick={() => {
              const list = playlists.find((item) => item.id === activePlaylist);
              if (list && window.confirm(`Delete playlist “${list.name}”?`)) { setPlaylists((old) => old.filter((item) => item.id !== activePlaylist)); setActivePlaylist(null); }
            }}><Trash2 size={13} /> Delete playlist</button></div>}
          </section>}

          {view === 'manage' ? <div className="management-wrap">
            <div className="management-toolbar"><div className="inline-note"><Disc3 size={15} /> Add your own audio by URL, or edit the local catalog. Starter tracks are public SoundHelix demo audio.</div><button className="button" onClick={() => openTrackEditor()} data-testid="button-add-track"><Plus size={14} /> Add track</button></div>
            <div className="management-list">{visibleTracks.map((track) => <div className="management-row" key={track.id} data-testid={`row-track-${track.id}`}><Artwork track={track} /><div className="track-info"><div className="track-title">{track.title}</div><div className="track-artist">{track.artist}</div></div><div className="track-tags"><span className="track-tag">{track.genre}</span></div><span className="track-duration">{track.custom ? 'LOCAL' : 'DEMO'}</span><div className="row-actions"><button aria-label={`Edit ${track.title}`} onClick={() => openTrackEditor(track)} data-testid={`button-edit-${track.id}`}><Pencil size={14} /></button><button aria-label={`Remove ${track.title}`} onClick={() => removeTrack(track)} data-testid={`button-remove-${track.id}`}><Trash2 size={14} /></button></div></div>)}</div>
            {tracks.length === 0 && <div className="empty-state"><Library size={25} /><h3>Your catalog is clear</h3><p>Add an audio URL to bring a track into your library.</p><button className="button" onClick={() => openTrackEditor()}><Plus size={14} /> Add a track</button></div>}
          </div> : shownTracks.length ? <div className="track-grid">
            {shownTracks.map((track) => <article className="track-card" key={track.id} data-testid={`card-track-${track.id}`}>
              <Artwork track={track} />
              <div className="card-hover-actions">
                <button className={`cover-action ${favorites.includes(track.id) ? 'liked' : ''}`} aria-label={`${favorites.includes(track.id) ? 'Remove from' : 'Add to'} favorites: ${track.title}`} onClick={() => toggleFavorite(track.id)} data-testid={`button-favorite-${track.id}`}><Heart size={14} fill={favorites.includes(track.id) ? 'currentColor' : 'none'} /></button>
                <button className={`cover-action ${offlineIds.includes(track.id) ? 'liked' : ''}`} aria-label={`${offlineIds.includes(track.id) ? 'Remove offline copy of' : 'Save for offline'}: ${track.title}`} title={offlineIds.includes(track.id) ? 'Remove offline copy' : 'Save for offline listening'} onClick={() => void toggleOffline(track)} data-testid={`button-offline-${track.id}`}><Download size={14} /></button>
                <button className="cover-action" aria-label={`Add ${track.title} to playlist`} title="Add to playlist" onClick={() => { setPlaylistTrackId(track.id); setModal('add-to-playlist'); }} data-testid={`button-add-playlist-${track.id}`}><Plus size={14} /></button>
              </div>
              <button className="cover-play" aria-label={`Play ${track.title}`} onClick={() => playTrack(track)} data-testid={`button-play-${track.id}`}>{currentId === track.id && playing ? <Pause size={18} /> : <Play size={17} fill="currentColor" />}</button>
              <div className="track-info"><div><div className="track-title">{track.title}</div><div className="track-artist">{track.artist}</div></div><span className="track-duration">{track.duration}</span></div>
              <div className="track-tags"><span className="track-tag">{track.genre}</span><span className="track-tag">{track.mood}</span>{!track.custom && <span className="track-tag">Demo audio</span>}{offlineIds.includes(track.id) && <span className="track-tag">Offline</span>}</div>
            </article>)}
          </div> : <div className="empty-state"><Headphones size={26} /><h3>{view === 'favorites' ? 'Nothing saved yet' : view === 'playlists' && activePlaylist ? 'This mix is waiting for a first track' : 'No tracks found'}</h3><p>{view === 'favorites' ? 'Tap the heart on a track to keep it here.' : 'Try a different search or filter to tune back in.'}</p>{(query || genre !== 'All sounds') && <button className="button secondary" onClick={() => { setQuery(''); setGenre('All sounds'); }}>Clear filters</button>}</div>}

          {view !== 'manage' && <section className="playlists-section">
            <div className="section-heading"><div><div className="eyebrow">A SOUNDTRACK, YOUR WAY</div><h2>Your playlists</h2><p>Gather the sounds that belong together.</p></div><button className="button secondary" onClick={() => setModal('playlist')} data-testid="button-new-playlist"><Plus size={14} /> Create playlist</button></div>
            <div className="playlist-strip">{playlists.length === 0 ? <div className="empty-playlist"><ListMusic size={18} /><span>No playlists yet</span></div> : playlists.map((playlist) => <button className="playlist-card" key={playlist.id} onClick={() => { setActivePlaylist(playlist.id); setView('playlists'); window.scrollTo({ top: 460, behavior: 'smooth' }); }} data-testid={`playlist-home-${playlist.id}`}><strong>{playlist.name}</strong><span>{playlist.trackIds.length} TRACKS · OPEN MIX</span></button>)}
              <button className="playlist-card create-playlist-card" onClick={() => setModal('playlist')} data-testid="button-create-playlist-card"><strong><Plus size={15} /> Start a new mix</strong><span>Make something yours</span></button>
            </div>
          </section>}
        </main>
        <footer className="footer"><span>CHRAVAN / SOUND AFTER DARK</span><strong>CREATED BY ALVAN CHRAVAN</strong><span>PUBLIC DEMO AUDIO · SOUNDHELIX</span></footer>
      </div>

      <audio ref={audioRef} preload="none" onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
      <section className="player" aria-label="Audio player">
        <div className="player-track">{currentTrack ? <Artwork track={currentTrack} className="player-cover" /> : <div className="player-cover player-empty"><AudioLines size={19} /></div>}<div className="player-meta"><strong>{currentTrack?.title ?? 'Choose a sound'}</strong><span>{currentTrack?.artist ?? 'The night is yours'}</span></div></div>
        <div className="player-center"><div className="player-controls"><button aria-label="Previous track" onClick={previousTrack} data-testid="button-previous"><SkipBack size={17} fill="currentColor" /></button><button className="main-play" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay} data-testid="button-toggle-play">{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</button><button aria-label="Next track" onClick={nextTrack} data-testid="button-next"><SkipForward size={17} fill="currentColor" /></button></div>
          <div className="progress-row"><span>{formatTime(position)}</span><input className="range" type="range" min="0" max={duration || 100} value={duration ? Math.min(position, duration) : 0} aria-label="Track position" onChange={(event) => { const next = Number(event.target.value); if (audioRef.current && duration) audioRef.current.currentTime = next; }} data-testid="input-seek" /><span>{duration ? formatTime(duration) : '--:--'}</span></div>
        </div>
        <div className="player-extra"><span className="player-status">{playing ? 'NOW PLAYING' : currentTrack ? 'READY' : 'CHRAVAN RADIO'}</span><button aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted((old) => !old)} data-testid="button-mute">{muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}</button><input className="range" type="range" min="0" max="1" step=".01" value={muted ? 0 : volume} aria-label="Volume" onChange={(event) => { setVolume(Number(event.target.value)); setMuted(false); }} data-testid="input-volume" /></div>
      </section>
      <nav className="mobile-nav" aria-label="Mobile navigation">{(['browse', 'favorites', 'playlists', 'manage'] as View[]).map((item) => <button key={item} className={`nav-mobile-button ${view === item ? 'active' : ''}`} onClick={() => chooseView(item)} data-testid={`mobile-nav-${item}`}>{item === 'browse' ? <Radio size={16} /> : item === 'favorites' ? <Heart size={16} /> : item === 'playlists' ? <ListMusic size={16} /> : <Library size={16} />}{item === 'browse' ? 'Listen' : item}</button>)}</nav>
      {notice && <div role="alert" className="notice" data-testid="status-audio-error">{notice}</div>}

      {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setModal(null); setPlaylistTrackId(null); } }}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-head"><h3 id="modal-title">{modal === 'track' ? editingTrack ? 'Edit track' : 'Add a track' : modal === 'playlist' ? 'Create a playlist' : 'Add to a playlist'}</h3><button className="icon-button" aria-label="Close dialog" onClick={() => { setModal(null); setPlaylistTrackId(null); }}><X size={16} /></button></div>
          {modal === 'track' && <form onSubmit={saveTrack}><div className="form-grid">
            <div className="field"><label htmlFor="track-title">Track title</label><input id="track-title" name="title" defaultValue={editingTrack?.title ?? ''} required placeholder="A name for this sound" data-testid="input-track-title" /></div>
            <div className="field"><label htmlFor="track-artist">Artist / source</label><input id="track-artist" name="artist" defaultValue={editingTrack?.artist ?? ''} required placeholder="Artist or audio source" data-testid="input-track-artist" /></div>
            <div className="field"><label htmlFor="track-genre">Genre</label><select id="track-genre" name="genre" defaultValue={editingTrack?.genre ?? 'Electronic'}>{['Electronic', 'Ambient', 'Downtempo', 'Cinematic', 'Soul', 'Other'].map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="field"><label htmlFor="track-src">Audio URL</label><input id="track-src" name="src" type="url" defaultValue={editingTrack?.src ?? ''} required placeholder="https://…" data-testid="input-track-url" /></div>
            <div className="inline-note">Use an audio URL you have permission to play. SoundHelix starters are clearly labeled public demo audio.</div>
          </div><div className="form-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="button" data-testid="button-save-track"><Check size={14} /> {editingTrack ? 'Save changes' : 'Add track'}</button></div></form>}
          {modal === 'playlist' && <form onSubmit={createPlaylist}><div className="form-grid"><div className="field"><label htmlFor="playlist-name">Playlist name</label><input id="playlist-name" value={playlistName} onChange={(event) => setPlaylistName(event.target.value)} required autoFocus placeholder="Midnight drive, slow hours..." data-testid="input-playlist-name" /></div><div className="inline-note">Make a mix for a particular place, feeling, or hour.</div></div><div className="form-actions"><button type="button" className="button secondary" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="button" data-testid="button-save-playlist"><Plus size={14} /> Create playlist</button></div></form>}
          {modal === 'add-to-playlist' && <form onSubmit={addToPlaylist}><div className="form-grid">{playlists.length ? <div className="field"><label htmlFor="playlist-select">Choose playlist</label><select name="playlist" id="playlist-select" defaultValue={playlists[0].id}>{playlists.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div> : <div className="inline-note">Create a playlist first, then add this sound to your mix.</div>}</div><div className="form-actions"><button type="button" className="button secondary" onClick={() => { setModal(null); setPlaylistTrackId(null); }}>Cancel</button>{playlists.length ? <button type="submit" className="button" data-testid="button-confirm-add-playlist"><Plus size={14} /> Add track</button> : <button type="button" className="button" onClick={() => { setModal('playlist'); }}>Create playlist</button>}</div></form>}
        </section>
      </div>}
    </div>
  );
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export default App;
