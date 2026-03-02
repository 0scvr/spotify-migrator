import { useRef, useState } from 'react';
import {
  Music,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Loader2,
  Info,
  ListMusic,
  User,
  Github,
  Heart,
  FolderSync,
  PlugZap
} from 'lucide-react';
import AccountHeader from './components/AccountHeader';
import SelectableRow from './components/SelectableRow';
import ProgressStepper from './components/ProgressStepper';

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

type DemoUserProfile = {
  id: string;
  display_name: string;
};
type SpotifyUserProfile = {
  display_name: string;
  external_urls: { spotify: string };
  href: string;
  id: string;
  images: Image[];
  uri: string;
};

type DemoPlaylist = {
  id: string;
  images: Image[];
  name: string;
  isLikedSongs?: boolean;
  items: {
    total: number;
  };
};

type SpotifyPlaylistsResponse = {
  next: string | null;
  total: number;
  items: Playlist[];
};

type Playlist = {
  collaborative: boolean;
  description: string;
  external_urls: { spotify: string };
  id: string;
  images: Image[];
  name: string;
  owner: { display_name: string };
  public: boolean;
  snapshot_id: string;
  items: {
    href: string;
    total: number;
  };
  uri: string;
  isLikedSongs?: boolean;
};

type Image = {
  height: number;
  url: string;
  width: number;
}

type SpotifyArtist = {
  id: string;
  name: string;
  images: Image[];
  external_urls: { spotify: string };
  uri: string;
};

type FollowedArtistsResponse = {
  artists: {
    href: string;
    next: string | null;
    cursors: { after: string; before: string };
    total: number;
    items: SpotifyArtist[];
  };
};

export default function SpotifyMigrator() {
  // --- STATE ---
  const [step, setStep] = useState(1); // 1: Tokens, 2: Select, 3: Copying, 4: Done
  const [demoMode, setDemoMode] = useState(false);

  // Auth State
  const [sourceToken, setSourceToken] = useState('');
  const [targetToken, setTargetToken] = useState('');
  const [sourceProfile, setSourceProfile] = useState<SpotifyUserProfile | DemoUserProfile | null>(null);
  const [targetProfile, setTargetProfile] = useState<SpotifyUserProfile | DemoUserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data State
  const [playlists, setPlaylists] = useState<(Playlist | DemoPlaylist)[]>([]);
  const [selectedPlaylists, setSelectedPlaylists] = useState<Set<string>>(() => new Set());
  const playlistsContainerRef = useRef<HTMLDivElement>(null);

  // Artist State
  const [followedArtists, setFollowedArtists] = useState<SpotifyArtist[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<Set<string>>(() => new Set());
  const artistsContainerRef = useRef<HTMLDivElement>(null);

  // Migration State
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentAction, setCurrentAction] = useState('');
  const [migrationErrors, setMigrationErrors] = useState(0);

  const fetchProfile = async (token: string, type: string): Promise<DemoUserProfile | SpotifyUserProfile> => {
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
      await fetchSourcePlaylists(sourceToken);

      // Fetch followed artists for source
      try {
        const artists = await fetchFollowedArtists(sourceToken);
        setFollowedArtists(artists);
      } catch (err) {
        console.warn('Could not fetch followed artists:', err);
        setFollowedArtists([]);
      }

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

  const fetchFollowedArtists = async (token: string): Promise<SpotifyArtist[]> => {
    if (demoMode) {
      return [
        { id: 'demo_artist_1', name: 'Tame Impala', images: [], external_urls: { spotify: '' }, uri: 'spotify:artist:demo_artist_1' },
        { id: 'demo_artist_2', name: 'Caribou',     images: [], external_urls: { spotify: '' }, uri: 'spotify:artist:demo_artist_2' },
      ];
    }

    const allArtists: SpotifyArtist[] = [];
    // Cursor-based pagination: start without an `after` param, then follow `next` URLs
    let url: string | null = `${SPOTIFY_API_BASE}/me/following?type=artist&limit=50`;

    while (url) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch followed artists (HTTP ${res.status})`);
      }
      const data: FollowedArtistsResponse = await res.json();
      allArtists.push(...data.artists.items);
      url = data.artists.next; // null when there are no more pages
    }

    return allArtists;
  };

  /**
   * Saves followed artists to the target account's library using PUT /me/library
   * with spotify:user:{id} URIs (artists are also users). Max 40 URIs per request.
   * Requires user-library-modify scope on the target token.
   */
  const saveFollowedArtists = async (artists: SpotifyArtist[]): Promise<{ saved: number; errors: number }> => {
    if (artists.length === 0) return { saved: 0, errors: 0 };

    if (demoMode) {
      await wait(600);
      return { saved: artists.length, errors: 0 };
    }

    const uris = artists.map(a => `spotify:user:${a.id}`);
    const chunks = chunkArray(uris, 40);
    let saved = 0;
    let errors = 0;

    for (const [i, chunk] of chunks.entries()) {
      const urisParam = chunk.join(',');
      const res = await fetch(`${SPOTIFY_API_BASE}/me/library?uris=${encodeURIComponent(urisParam)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${targetToken}` }
      });

      if (!res.ok) {
        console.error(`Failed to save artist chunk ${i + 1}/${chunks.length} (HTTP ${res.status})`);
        errors += chunk.length;
      } else {
        saved += chunk.length;
      }

      // Throttle to avoid rate limits
      if (i < chunks.length - 1) await wait(100);
    }

    return { saved, errors };
  };

  const fetchSourcePlaylists = async (token: string) => {
    if (demoMode) {
      setPlaylists([
        { id: '__LIKED_SONGS__', name: 'Liked Songs', items: { total: 154 }, isLikedSongs: true, images: [] }, // Demo Liked Songs
        { id: '1', name: 'Summer Vibes 2024', items: { total: 45 }, images: [] },
        { id: '2', name: 'Coding Focus', items: { total: 120 }, images: [] },
        { id: '3', name: 'Workout Mix', items: { total: 32 }, images: [] },
        { id: '4', name: 'Sad Boi Hours', items: { total: 15 }, images: [] },
        { id: '5', name: 'Cowboy songs 2025', items: { total: 57 }, images: [] },
        { id: '6', name: 'Late night driving', items: { total: 9 }, images: [] },
        { id: '7', name: 'Road Trip', items: { total: 88 }, images: [] },
      ]);
      return;
    }

    let allPlaylists: (Playlist | DemoPlaylist)[] = [];

    try {
      // 1. Fetch Liked Songs Count first
      try {
        const likedRes = await fetch(`${SPOTIFY_API_BASE}/me/tracks?limit=1`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (likedRes.ok) {
          const likedData = await likedRes.json();
          // Create a special playlist object for Liked Songs
          allPlaylists.push({
            id: '__LIKED_SONGS__',
            name: 'Liked Songs',
            items: { total: likedData.total },
            isLikedSongs: true, // Flag to identify this special item
            images: []
          });
        }
      } catch (e) {
        console.warn("Could not fetch liked songs count, skipping.", e);
      }

      // 2. Fetch User Playlists
      let url = `${SPOTIFY_API_BASE}/me/playlists?limit=50`;
      while (url) {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Failed to fetch playlists");
        const data: SpotifyPlaylistsResponse = await res.json();
        allPlaylists = [...allPlaylists, ...data.items];
        url = data.next;
      }

      // Filter out nulls
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

  const toggleArtistSelection = (id: string) => {
    const container = artistsContainerRef.current;
    const savedScrollTop = container?.scrollTop ?? 0;

    setSelectedArtists((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });

    if (container) {
      requestAnimationFrame(() => {
        if (artistsContainerRef.current) {
          artistsContainerRef.current.scrollTop = savedScrollTop;
        }
      });
    }
  };

  const selectAllArtists = () => {
    if (selectedArtists.size === followedArtists.length) {
      setSelectedArtists(new Set());
    } else {
      setSelectedArtists(new Set(followedArtists.map(a => a.id)));
    }
  };

  const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

  const startMigration = async () => {
    setStep(4);
    setLogs([]);
    setProgress(0);
    setMigrationErrors(0);
    const total = selectedPlaylists.size + (selectedArtists.size > 0 ? 1 : 0);
    let completed = 0;
    let totalErrors = 0;

    const playlistsToCopy = playlists.filter(p => selectedPlaylists.has(p.id));

    for (const playlist of playlistsToCopy) {
      setCurrentAction(`Copying "${playlist.name}"...`);
      addLog(`Starting migration for: ${playlist.name}`);

      try {
        // ==========================================
        // STRATEGY A: MIGRATE LIKED SONGS
        // ==========================================
        if (playlist.isLikedSongs) {
          let trackUris: string[] = []; // URIs for PUT /me/library

          // 1. Fetch Source Liked Songs
          if (demoMode) {
            await wait(800);
            trackUris = Array(Math.min(playlist.items.total, 50)).fill('spotify:track:demo_track_id');
            addLog(`Fetched ${playlist.items.total} liked songs from source.`);
          } else {
            let url = `${SPOTIFY_API_BASE}/me/tracks?limit=50`;
            while (url) {
              const res = await fetch(url, { headers: { Authorization: `Bearer ${sourceToken}` } });
              if (!res.ok) {
                addLog(`ERROR: Failed to fetch liked songs (HTTP ${res.status}). Stopping fetch.`);
                totalErrors++;
                break;
              }
              const data = await res.json();
              // Extract URIs. Liked songs endpoint returns object { track: { uri, ... } }
              const chunkUris = data.items.map((item: { track: { uri: string; }; }) => item.track?.uri).filter((uri: string) => uri && uri.includes('spotify:track'));
              trackUris = [...trackUris, ...chunkUris];
              url = data.next;
            }
            addLog(`Fetched ${trackUris.length} liked songs.`);
          }

          // 2. Add to Target Liked Songs
          if (trackUris.length > 0) {
            if (demoMode) {
              await wait(500);
              addLog(`Added tracks to target Liked Songs.`);
            } else {
              // The endpoint for saving items is PUT /me/library.
              // It accepts a comma-separated list of URIs as a query param. MAX 40 per request.
              const chunks = chunkArray(trackUris, 40);
              let savedCount = 0;
              for (const [i, chunk] of chunks.entries()) {
                const urisParam = chunk.join(',');
                const saveRes = await fetch(`${SPOTIFY_API_BASE}/me/library?uris=${encodeURIComponent(urisParam)}`, {
                  method: 'PUT',
                  headers: {
                    Authorization: `Bearer ${targetToken}`
                  }
                });
                if (!saveRes.ok) {
                  addLog(`ERROR: Failed to save chunk ${i + 1}/${chunks.length} to library (HTTP ${saveRes.status}).`);
                  totalErrors++;
                } else {
                  savedCount += chunk.length;
                }
                // Throttle to avoid rate limits
                if (i < chunks.length - 1) await wait(100);
              }
              addLog(`Saved ${savedCount}/${trackUris.length} songs to target library.`);
            }
          } else {
            addLog(`No liked songs found to copy.`);
          }

        }
        // ==========================================
        // STRATEGY B: MIGRATE NORMAL PLAYLIST
        // ==========================================
        else {
          let uris: string[] = [];

          // 1. Fetch Tracks (Source)
          if (demoMode) {
            await wait(800); // Simulate network
            uris = Array(Math.min(playlist.items.total, 50)).fill('spotify:track:demo');
            addLog(`Fetched ${playlist.items.total} tracks from source.`);
          } else {
            if ('href' in playlist.items) {
              let url = `${playlist.items.href}?fields=${encodeURIComponent("total,next,items(track(name,uri)")}`;

              while (url) {
                const res = await fetch(url, { headers: { Authorization: `Bearer ${sourceToken}` } });
                if (!res.ok) {
                  addLog(`ERROR: Failed to fetch playlist tracks (HTTP ${res.status}). Stopping fetch.`);
                  totalErrors++;
                  break;
                }
                const data: { total: number, next: string, items: { track: { name: string, uri: string } }[] } = await res.json();
                // Extract URIs, filtering out local tracks (which have no URI)
                // Note: field renamed from .track to .item per Feb 2026 API changes
                const chunkUris = data.items.map((item) => item.track?.uri).filter((uri: string) => uri && uri.includes('spotify:track'));
                uris = [...uris, ...chunkUris];
                url = data.next;
              }
              addLog(`Fetched ${uris.length} tracks.`);
            }
          }

          // 2. Create Playlist (Target)
          let newPlaylistId;
          if (demoMode) {
            await wait(500);
            newPlaylistId = 'demo_new_id';
            addLog(`Created playlist "${playlist.name}" on target account.`);
          } else {
            const playlistDescription = 'description' in playlist && playlist.description?.trim() ? playlist.description : `Copied from ${sourceProfile.display_name} via Spotify Migrator`;
            const createRes = await fetch(`${SPOTIFY_API_BASE}/me/playlists`, {
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
            if (!createRes.ok) {
              const errText = await createRes.text();
              addLog(`ERROR: Failed to create playlist "${playlist.name}" (HTTP ${createRes.status}): ${errText}`);
              totalErrors++;
              completed++;
              setProgress((completed / total) * 100);
              continue;
            }
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
              let addedCount = 0;
              for (const [i, chunk] of chunks.entries()) {
                const addRes = await fetch(`${SPOTIFY_API_BASE}/playlists/${newPlaylistId}/items`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${targetToken}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ uris: chunk })
                });
                if (!addRes.ok) {
                  addLog(`ERROR: Failed to add chunk ${i + 1}/${chunks.length} to playlist (HTTP ${addRes.status}).`);
                  totalErrors++;
                } else {
                  addedCount += chunk.length;
                }
              }
              addLog(`Added ${addedCount}/${uris.length} tracks to playlist.`);
            }
          } else {
            addLog(`Skipping track addition: No valid tracks found.`);
          }
        }

      } catch (err) {
        console.error(err);
        addLog(`ERROR copying ${playlist.name}: ${err.message}`);
        totalErrors++;
      }

      completed++;
      setProgress((completed / total) * 100);
    }

    // ==========================================
    // MIGRATE FOLLOWED ARTISTS
    // ==========================================
    if (selectedArtists.size > 0) {
      setCurrentAction('Migrating followed artists...');
      addLog(`Starting migration for ${selectedArtists.size} followed artist(s).`);

      try {
        const artistsToSave = followedArtists.filter(a => selectedArtists.has(a.id));
        if (artistsToSave.length === 0) {
          addLog('No matching artists found to migrate.');
        } else {
          const result = await saveFollowedArtists(artistsToSave);

          if (result.errors > 0) {
            addLog(`WARNING: ${result.errors} artist(s) failed to save to target library.`);
            totalErrors += result.errors;
          }
          if (result.saved > 0) {
            addLog(`Successfully saved ${result.saved}/${artistsToSave.length} artist(s) to target library.`);
          }
          if (result.saved === 0 && result.errors === 0) {
            addLog('No artists were saved (empty response from API).');
          }
        }
      } catch (err) {
        console.error(err);
        addLog(`ERROR migrating artists: ${err instanceof Error ? err.message : 'Unknown error'}`);
        totalErrors++;
      }

      completed++;
      setProgress((completed / total) * 100);
    }

    setMigrationErrors(totalErrors);
    setCurrentAction('Migration Complete!');
    setStep(5);
  };

  // --- RENDER HELPERS ---

  const Step1Tokens = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
        <h3 className="font-semibold text-slate-200 mb-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-sky-400" />
          How to get your auth tokens
        </h3>
        <p className="text-sm text-slate-400 mb-2">
          To copy Playlists & Liked Songs & Followed Artists, you need the following permissions:
        </p>
        <ul className="list-disc list-inside text-sm text-slate-400 space-y-1 ml-1 mb-2">
          <li><strong>Source:</strong> <code>playlist-read-private</code>, <code>user-library-read</code>, <code>playlist-read-collaborative</code>, <code>user-follow-read</code></li>
          <li><strong>Target:</strong> <code>playlist-modify-public</code>, <code>playlist-modify-private</code>, <code>user-library-modify</code></li>
        </ul>
        <ol className="list-decimal list-inside text-sm text-slate-400 space-y-1 ml-1">
          <li>The simplest way to get your access tokens is to use <a href="https://github.com/0scvr/spotify-access-token" target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">this utility script</a> that automates the login process. (Recommended)</li>
          <li>Alternatively you can follow <a href="https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow" target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">Spotify for Developers</a> to generate your auth tokens yourself.</li>
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
          {loadingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
          Connect Accounts
        </button>
      </div>
    </div>
  );

  const Step2SelectPlaylists = () => (
    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
      <AccountHeader
        sourceProfile={sourceProfile}
        targetProfile={targetProfile}
        onChangeAccounts={() => setStep(1)}
      />

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
            <SelectableRow
              key={p.id}
              selected={selectedPlaylists.has(p.id)}
              onClick={() => toggleSelection(p.id)}
              thumbnail={
                p.isLikedSongs ? (
                  <div className="w-12 h-12 rounded bg-gradient-to-br from-purple-700 to-blue-600 flex items-center justify-center">
                    <Heart className="w-6 h-6 text-white fill-current" />
                  </div>
                ) : p.images?.[0]?.url ? (
                  <img src={p.images[0].url} alt="" className="w-12 h-12 rounded bg-slate-800 object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded bg-slate-800 flex items-center justify-center">
                    <Music className="w-6 h-6 text-slate-600" />
                  </div>
                )
              }
            >
              <div className="font-medium text-slate-200">{p.name}</div>
              <div className="text-sm text-slate-500">{p.items.total} tracks</div>
            </SelectableRow>
          ))
        )}
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={() => setStep(3)}
          className="bg-green-600 hover:bg-green-500 text-white px-8 py-3 rounded-full font-medium transition-all shadow-lg shadow-green-900/20 flex items-center gap-2"
        >
          <ArrowRight className="w-4 h-4" />
          Next: Select Followed Artists
        </button>
      </div>
    </div>
  );

  const Step3SelectArtists = () => (
    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
      <AccountHeader
        sourceProfile={sourceProfile}
        targetProfile={targetProfile}
        onChangeAccounts={() => setStep(1)}
      />

      <div className="flex items-center justify-between py-2">
        <h2 className="text-xl font-semibold text-white">Select Artists to Follow</h2>
        {followedArtists.length > 0 && (
          <button
            onClick={selectAllArtists}
            className="text-sm text-green-400 hover:text-green-300 font-medium"
          >
            {selectedArtists.size === followedArtists.length ? 'Deselect All' : 'Select All'}
          </button>
        )}
      </div>

      <div
        ref={artistsContainerRef}
        className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden max-h-[400px] overflow-y-auto custom-scrollbar"
      >
        {followedArtists.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No followed artists found on source account.</div>
        ) : (
          followedArtists.map(a => (
            <SelectableRow
              key={a.id}
              selected={selectedArtists.has(a.id)}
              onClick={() => toggleArtistSelection(a.id)}
              thumbnail={
                a.images?.[0]?.url ? (
                  <img src={a.images[0].url} alt="" className="w-12 h-12 rounded-full bg-slate-800 object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                    <User className="w-6 h-6 text-slate-600" />
                  </div>
                )
              }
            >
              <div className="font-medium text-slate-200">{a.name}</div>
            </SelectableRow>
          ))
        )}
      </div>

      <div className="flex justify-between pt-4">
        <button
          onClick={() => setStep(2)}
          className="px-6 py-3 rounded-full border border-slate-600 text-slate-300 hover:bg-slate-800 transition-colors flex items-center gap-2"
        >
          Back to Playlists
        </button>
        <button
          onClick={startMigration}
          disabled={selectedPlaylists.size === 0 && selectedArtists.size === 0}
          className="bg-green-600 hover:bg-green-500 text-white px-8 py-3 rounded-full font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-900/20 flex items-center gap-2"
        >
          <FolderSync className="w-4 h-4" />
          Start Migration
        </button>
      </div>
    </div>
  );

  const Step4Progress = () => (
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

  const Step5Done = () => (
    <div className="text-center space-y-6 py-10 animate-in fade-in zoom-in-95 duration-300">
      <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle className="w-10 h-10 text-green-500" />
      </div>

      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Transfer Complete!</h2>
        <p className="text-slate-400">
          Migrated {selectedPlaylists.size} playlist{selectedPlaylists.size !== 1 ? 's' : ''} and {selectedArtists.size} artist{selectedArtists.size !== 1 ? 's' : ''} to {targetProfile?.display_name}.
        </p>
        {migrationErrors > 0 ? (
          <p className="mt-2 text-sm text-red-400">
            ⚠ {migrationErrors} error{migrationErrors !== 1 ? 's' : ''} occurred during migration. Check the logs for details.
          </p>
        ) : (
          <p className="mt-2 text-sm text-green-400">All items copied successfully with no errors.</p>
        )}
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

      <div className="pt-8 border-t border-slate-800 mt-8">
        <a
          href="https://github.com/0scvr/spotify-migrator"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <Github className="w-4 h-4" />
          <span>Star this project on GitHub</span>
        </a>
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
            v1.3.0
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-8">

        {/* Progress Stepper */}
        <ProgressStepper
          currentStep={step}
          steps={[
            { num: 1, label: 'Connect' },
            { num: 2, label: 'Playlists' },
            { num: 3, label: 'Artists' },
            { num: 4, label: 'Transfer' },
            { num: 5, label: 'Done' }
          ]}
        />

        {/* Views */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl">
          {step === 1 && <Step1Tokens />}
          {step === 2 && <Step2SelectPlaylists />}
          {step === 3 && <Step3SelectArtists />}
          {step === 4 && <Step4Progress />}
          {step === 5 && <Step5Done />}
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 text-center text-slate-500 text-sm">
        <p>This tool runs entirely in your browser. No data is stored on external servers.</p>
      </footer>

    </div>
  );
}