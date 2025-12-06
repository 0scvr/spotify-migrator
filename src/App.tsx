import { useRef, useState } from 'react';
import { 
  Music, 
  ArrowRight, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Copy, 
  LogOut,
  Info,
  ListMusic,
  User
} from 'lucide-react';

/**
 * SPOTIFY API HELPER FUNCTIONS
 */
const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to chunk arrays (Spotify limits adding 100 tracks per request)
const chunkArray = (array: any[], size: number) => {
  const chunked = [];
  let index = 0;
  while (index < array.length) {
    chunked.push(array.slice(index, size + index));
    index += size;
  }
  return chunked;
};

export default function SpotifyMigrator() {
  // --- STATE ---
  const [step, setStep] = useState(1); // 1: Tokens, 2: Select, 3: Copying, 4: Done
  const [demoMode, setDemoMode] = useState(false);
  
  // Auth State
  const [sourceToken, setSourceToken] = useState('');
  const [targetToken, setTargetToken] = useState('');
  const [sourceProfile, setSourceProfile] = useState(null);
  const [targetProfile, setTargetProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data State
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylists, setSelectedPlaylists] = useState<Set<string>>(() => new Set());
  const playlistsContainerRef = useRef<HTMLDivElement>(null);
  
  // Migration State
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentAction, setCurrentAction] = useState('');

  // --- ACTIONS ---

  const fetchProfile = async (token: string, type: string) => {
    if (demoMode) {
      return type === 'source' 
        ? { id: 'demo_user_1', display_name: 'Alice (Demo)' } 
        : { id: 'demo_user_2', display_name: 'Bob (Demo)' };
    }

    try {
      const res = await fetch(`${SPOTIFY_API_BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Invalid ${type} token or API error`);
      return await res.json();
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleConnect = async () => {
    setError(null);
    setLoadingProfile(true);
    try {
      // Validate tokens by fetching profiles
      const sProfile = await fetchProfile(sourceToken, 'source');
      setSourceProfile(sProfile);
      
      const tProfile = await fetchProfile(targetToken, 'target');
      setTargetProfile(tProfile);

      // Fetch playlists for source
      await fetchSourcePlaylists(sourceToken, sProfile.id);
      
      setStep(2);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message || "Failed to connect. Please check your tokens.");
      } else {
        setError("Failed to connect. Please check your tokens.");
      }
    } finally {
      setLoadingProfile(false);
    }
  };

  const fetchSourcePlaylists = async (token: string, userId: any) => {
    if (demoMode) {
      setPlaylists([
        { id: '1', name: 'Summer Vibes 2024', tracks: { total: 45 }, images: [] },
        { id: '2', name: 'Coding Focus', tracks: { total: 120 }, images: [] },
        { id: '3', name: 'Workout Mix', tracks: { total: 32 }, images: [] },
        { id: '4', name: 'Sad Boi Hours', tracks: { total: 15 }, images: [] },
        { id: '5', name: 'Cowboy songs 2025', tracks: { total: 57 }, images: [] },
        { id: '6', name: 'Late night driving', tracks: { total: 9 }, images: [] },
        { id: '7', name: 'Road Trip', tracks: { total: 88 }, images: [] },
      ]);
      return;
    }

    let allPlaylists = [];
    let url = `${SPOTIFY_API_BASE}/users/${userId}/playlists?limit=50`;

    try {
      while (url) {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Failed to fetch playlists");
        const data = await res.json();
        allPlaylists = [...allPlaylists, ...data.items];
        url = data.next;
      }
      // Filter out nulls and strictly verify ownership if needed, 
      // but usually we want to copy any playlist the user follows/owns.
      setPlaylists(allPlaylists.filter(p => p !== null));
    } catch (err) {
      throw new Error("Could not fetch playlists. Token might verify but lack permissions.");
    }
  };

  const toggleSelection = (id: string) => {
    const container = playlistsContainerRef.current;
    const savedScrollTop = container?.scrollTop ?? 0;

    setSelectedPlaylists((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });

    if (container) {
      requestAnimationFrame(() => {
        if (playlistsContainerRef.current) {
          playlistsContainerRef.current.scrollTop = savedScrollTop;
        }
      });
    }
  };

  const selectAll = () => {
    if (selectedPlaylists.size === playlists.length) {
      setSelectedPlaylists(new Set());
    } else {
      setSelectedPlaylists(new Set(playlists.map(p => p.id)));
    }
  };

  const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

  const startMigration = async () => {
    setStep(3);
    setLogs([]);
    setProgress(0);
    const total = selectedPlaylists.size;
    let completed = 0;

    const playlistsToCopy = playlists.filter(p => selectedPlaylists.has(p.id));

    for (const playlist of playlistsToCopy) {
      setCurrentAction(`Copying "${playlist.name}"...`);
      addLog(`Starting migration for: ${playlist.name}`);

      try {
        let uris = [];
        
        // 1. Fetch Tracks (Source)
        if (demoMode) {
          await wait(800); // Simulate network
          uris = Array(Math.min(playlist.tracks.total, 50)).fill('spotify:track:demo'); 
          addLog(`Fetched ${playlist.tracks.total} tracks from source.`);
        } else {
          let url = playlist.tracks.href;
          while (url) {
            const res = await fetch(url, { headers: { Authorization: `Bearer ${sourceToken}` } });
            const data = await res.json();
            // Extract URIs, filtering out local tracks (which have no URI)
            const chunkUris = data.items.map(item => item.track?.uri).filter(uri => uri && uri.includes('spotify:track'));
            uris = [...uris, ...chunkUris];
            url = data.next;
          }
          addLog(`Fetched ${uris.length} tracks.`);
        }

        // 2. Create Playlist (Target)
        let newPlaylistId;
        if (demoMode) {
          await wait(500);
          newPlaylistId = 'demo_new_id';
          addLog(`Created playlist "${playlist.name}" on target account.`);
        } else {
          const playlistDescription = playlist.description?.trim() ? playlist.description : `Copied from ${sourceProfile.display_name} via Spotify Migrator`;
          const createRes = await fetch(`${SPOTIFY_API_BASE}/users/${targetProfile.id}/playlists`, {
            method: 'POST',
            headers: { 
              Authorization: `Bearer ${targetToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: playlist.name,
              description: playlistDescription,
              public: false
            })
          });
          const createData = await createRes.json();
          newPlaylistId = createData.id;
          addLog(`Created playlist "${playlist.name}" on target account.`);
        }

        // 3. Add Tracks (Target)
        if (uris.length > 0) {
          if (demoMode) {
            await wait(500);
            addLog(`Added tracks to target playlist.`);
          } else {
            const chunks = chunkArray(uris, 100);
            for (const chunk of chunks) {
              await fetch(`${SPOTIFY_API_BASE}/playlists/${newPlaylistId}/tracks`, {
                method: 'POST',
                headers: { 
                  Authorization: `Bearer ${targetToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ uris: chunk })
              });
            }
            addLog(`Successfully added ${uris.length} tracks.`);
          }
        } else {
          addLog(`Skipping track addition: No valid tracks found.`);
        }

      } catch (err) {
        console.error(err);
        addLog(`ERROR copying ${playlist.name}: ${err.message}`);
      }

      completed++;
      setProgress((completed / total) * 100);
    }

    setCurrentAction('Migration Complete!');
    setStep(4);
  };

  // --- RENDER HELPERS ---

  const Step1Tokens = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
        <h3 className="font-semibold text-slate-200 mb-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-sky-400" />
          How to get tokens
        </h3>
        <p className="text-sm text-slate-400 mb-2">
          Because this tool runs entirely in your browser without a backend server, you need to manually provide access tokens.
        </p>
        <ol className="list-decimal list-inside text-sm text-slate-400 space-y-1 ml-1">
          <li>Go to the <a href="https://developer.spotify.com/console/get-current-user-playlists/" target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">Spotify Web API Console</a>.</li>
          <li>Click "Get Token" (check <code>playlist-read-private</code>, <code>playlist-modify-public</code>, <code>playlist-modify-private</code>).</li>
          <li>Copy the OAuth Token generated.</li>
          <li>Repeat for the target account (you may need to use an Incognito window to log in to the second account).</li>
        </ol>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Source Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">Source Account Token</label>
          <textarea
            value={sourceToken}
            onChange={(e) => setSourceToken(e.target.value)}
            disabled={demoMode}
            placeholder={demoMode ? "Demo Mode Active" : "Paste token from Account A..."}
            className="w-full h-32 p-3 bg-slate-900 border border-slate-700 rounded-md text-xs font-mono text-slate-300 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none resize-none disabled:opacity-50"
          />
        </div>

        {/* Target Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-300">Target Account Token</label>
          <textarea
             value={targetToken}
             onChange={(e) => setTargetToken(e.target.value)}
             disabled={demoMode}
             placeholder={demoMode ? "Demo Mode Active" : "Paste token from Account B..."}
             className="w-full h-32 p-3 bg-slate-900 border border-slate-700 rounded-md text-xs font-mono text-slate-300 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none resize-none disabled:opacity-50"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-200 p-3 rounded-md flex items-center gap-2 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-4">
        <label className="flex items-center gap-2 cursor-pointer group">
          <input 
            id='demoCheckBox'
            type="checkbox" 
            checked={demoMode} 
            onChange={(e) => {
              setDemoMode(e.target.checked);
              setSourceToken(e.target.checked ? 'demo' : '');
              setTargetToken(e.target.checked ? 'demo' : '');
            }}
            className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-green-500 focus:ring-green-500" 
          />
          <span className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors">Use Demo Mode (No tokens needed)</span>
        </label>

        <button
          onClick={handleConnect}
          disabled={(!sourceToken || !targetToken) && !demoMode || loadingProfile}
          className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-full font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loadingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
          Connect Accounts
        </button>
      </div>
    </div>
  );

  const Step2Select = () => (
    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex items-center justify-between bg-slate-800 p-4 rounded-lg border border-slate-700">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">From</div>
              <div className="font-medium text-slate-200">{sourceProfile?.display_name}</div>
            </div>
          </div>
          <ArrowRight className="text-slate-500" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wider">To</div>
              <div className="font-medium text-slate-200">{targetProfile?.display_name}</div>
            </div>
          </div>
        </div>
        <button 
          onClick={() => setStep(1)}
          className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
        >
          <LogOut className="w-3 h-3" /> Change Accounts
        </button>
      </div>

      <div className="flex items-center justify-between py-2">
        <h2 className="text-xl font-semibold text-white">Select Playlists</h2>
        <button 
          onClick={selectAll}
          className="text-sm text-green-400 hover:text-green-300 font-medium"
        >
          {selectedPlaylists.size === playlists.length ? 'Deselect All' : 'Select All'}
        </button>
      </div>

      <div
        ref={playlistsContainerRef}
        className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden max-h-[400px] overflow-y-auto custom-scrollbar"
      >
        {playlists.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No playlists found on source account.</div>
        ) : (
          playlists.map(p => (
            <div 
              key={p.id}
              onClick={() => toggleSelection(p.id)}
              className={`p-4 flex items-center gap-4 cursor-pointer border-b border-slate-800 transition-colors hover:bg-slate-800/50 ${selectedPlaylists.has(p.id) ? 'bg-slate-800' : ''}`}
            >
              <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedPlaylists.has(p.id) ? 'bg-green-500 border-green-500' : 'border-slate-600'}`}>
                {selectedPlaylists.has(p.id) && <CheckCircle className="w-3.5 h-3.5 text-black" />}
              </div>
              
              {p.images?.[0]?.url ? (
                <img src={p.images[0].url} alt="" className="w-12 h-12 rounded bg-slate-800 object-cover" />
              ) : (
                <div className="w-12 h-12 rounded bg-slate-800 flex items-center justify-center">
                  <Music className="w-6 h-6 text-slate-600" />
                </div>
              )}
              
              <div className="flex-1">
                <div className="font-medium text-slate-200">{p.name}</div>
                <div className="text-sm text-slate-500">{p.tracks.total} tracks</div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={startMigration}
          disabled={selectedPlaylists.size === 0}
          className="bg-green-600 hover:bg-green-500 text-white px-8 py-3 rounded-full font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-900/20 flex items-center gap-2"
        >
          <Copy className="w-4 h-4" />
          Copy {selectedPlaylists.size} Playlists
        </button>
      </div>
    </div>
  );

  const Step3Progress = () => (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="text-center space-y-2 py-8">
        <Loader2 className="w-12 h-12 text-green-500 animate-spin mx-auto" />
        <h2 className="text-2xl font-bold text-white">{currentAction}</h2>
        <p className="text-slate-400">Please do not close this tab.</p>
      </div>

      <div className="bg-slate-800 rounded-full h-4 overflow-hidden border border-slate-700">
        <div 
          className="h-full bg-green-500 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="bg-slate-950 rounded-lg p-4 h-48 overflow-y-auto font-mono text-xs text-slate-400 border border-slate-800 shadow-inner">
        {logs.map((log, i) => (
          <div key={i} className="mb-1 border-l-2 border-slate-700 pl-2">{log}</div>
        ))}
        <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
      </div>
    </div>
  );

  const Step4Done = () => (
    <div className="text-center space-y-6 py-10 animate-in fade-in zoom-in-95 duration-300">
      <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle className="w-10 h-10 text-green-500" />
      </div>
      
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Transfer Complete!</h2>
        <p className="text-slate-400">
          Successfully migrated {selectedPlaylists.size} playlists to {targetProfile?.display_name}.
        </p>
      </div>

      <div className="flex justify-center gap-4 pt-4">
        <button
          onClick={() => {
            setStep(2);
            setLogs([]);
            setProgress(0);
          }}
          className="px-6 py-2 rounded-full border border-slate-600 text-slate-300 hover:bg-slate-800 transition-colors"
        >
          Copy More
        </button>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2 rounded-full bg-white text-black hover:bg-slate-200 transition-colors font-medium"
        >
          Start Over
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col font-sans selection:bg-green-500/30">
      
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-green-500 p-2 rounded-full">
              <ListMusic className="w-5 h-5 text-black" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">Spotify Migrator</h1>
          </div>
          <div className="text-xs font-mono text-slate-500 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
            v1.0.0
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-8">
        
        {/* Progress Stepper */}
        <div className="flex items-center justify-between mb-12 relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-slate-800 -z-10" />
          
          {[
            { num: 1, label: 'Connect' },
            { num: 2, label: 'Select' },
            { num: 3, label: 'Transfer' },
            { num: 4, label: 'Done' }
          ].map((s) => {
            const isActive = step >= s.num;
            const isCurrent = step === s.num;
            return (
              <div key={s.num} className="flex flex-col items-center gap-2 bg-slate-950 px-2">
                <div 
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300
                    ${isActive ? 'bg-green-500 text-black scale-110' : 'bg-slate-800 text-slate-500'}
                    ${isCurrent ? 'ring-4 ring-green-500/20' : ''}
                  `}
                >
                  {isActive ? <CheckCircle className="w-5 h-5" /> : s.num}
                </div>
                <span className={`text-xs font-medium ${isActive ? 'text-green-400' : 'text-slate-600'}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Views */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl">
          {step === 1 && <Step1Tokens />}
          {step === 2 && <Step2Select />}
          {step === 3 && <Step3Progress />}
          {step === 4 && <Step4Done />}
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 text-center text-slate-500 text-sm">
        <p>This tool runs entirely in your browser. No data is stored on external servers.</p>
      </footer>

    </div>
  );
}