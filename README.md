# Spotify Migrator

Spotify Migrator is a browser-first app for copying playlists between two Spotify accounts. It runs purely in the browser with no backend and lets you paste OAuth tokens from Spotify's Web API console or switch to demo mode for offline preview data.

## Getting started

```bash
pnpm install
pnpm dev
```

1. Open the local dev server (`http://localhost:5173` by default) to view the app.
2. Paste the access tokens for the source and target Spotify accounts into the two text areas. To copy Playlists & Liked Songs, you need the following permissions:
	- Source: `playlist-read-private`, `user-library-read`, `playlist-read-collaborative`
    - Target: `playlist-modify-public`, `playlist-modify-private`, `user-library-modify`<br>

    The simplest way to get your access tokens is to use [this utility script](https://github.com/0scvr/spotify-access-token) I made that automates the login process. <br>Alternatively you can follow <a href="https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow" target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">Spotify for Developers</a> to generate your auth tokens yourself. Use a private/incognito window when swapping accounts to avoid session conflicts.
3. Click **Connect Accounts**. The app will fetch your playlists, let you select which ones to copy, and then migrate them to the destination account.

### Demo mode

Check **Use Demo Mode** to skip auth tokens and work with false playlists and logs. Useful for experimentation without hitting Spotify APIs.

### Production scripts

- `pnpm build`: bundle the app for production.
- `pnpm preview`: serve the production build locally.

### Notes

- The app uses the Spotify Web API directly from the browser, so tokens must be refreshed if they expire.
- Playlist descriptions are preserved when available.
- No data is persisted outside the browser—everything happens during the current session.
