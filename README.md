# Loopie

An installable Spotify companion for iPhone and Android. The Windows widget remains a separate application.

## Deploy to Vercel

See [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md) for the GitHub upload and Vercel import steps. The included vercel.json selects the correct backend build automatically. Set a server-only SESSION_SECRET, deploy, then register your final HTTPS callback URL with Spotify.

## Connect

Deploy to your Vercel account using the included instructions, then open Loopie Settings on your production domain.

1. Open your existing Spotify application in the [developer dashboard](https://developer.spotify.com/dashboard).
2. Register this exact redirect URI and save:

   ```text
   https://YOUR-ACTUAL-DOMAIN/auth/spotify/callback
   ```

3. Paste the public **Client ID** into Loopie Settings. No client secret is used.
4. Choose **Log in with Spotify** and authorize it yourself.
5. Open Spotify on your phone and start a song. Loopie controls that active device; the device picker can select a computer or speaker.

Spotify requires the development app owner to have Premium. Add any other permitted account to your developer app's user access list. iOS may separate Safari and installed-app sessions, so connect again inside the installed app if needed.

## Install

**iPhone:** open the Site in Safari → Share → Add to Home Screen. Turn on Open as Web App if offered, then Add. Launch its new icon and connect Spotify.

**Android:** use Chrome/Edge → Install app / Add to Home screen. Loopie Settings shows an install button when the browser provides it.

The interface can open offline after installation, but Spotify data and controls need internet. This is an app you open, not a native Home Screen widget or floating overlay.

## Features

- Live art, track/episode metadata, seek and progress.
- One row: shuffle, previous, play/pause, next, repeat, like/unlike.
- Supported device volume, device discovery and transfer. Phone audio uses physical volume buttons.
- Search songs, playlists, albums, artists, podcasts and episodes with filters and pagination.
- Album/artist/podcast/playlist pages; play, save/follow, queue, add-to-playlist and open-in-Spotify actions.
- Library: liked songs, playlists, albums, followed artists, shows, episodes, recent history and top songs/artists.
- Create public/private/collaborative playlists, edit owned playlist details, add/remove items and move playlist items up. Spotify removes matching URI instances when removing an item.
- Live/upcoming queue, manual refresh and add-to-queue.
- Blue/lilac palettes, animations, reduced motion, safe areas and small-screen layouts.
- Real error, permission, offline, restricted-device and rate-limit handling.

## Spotify limits

The [2026 development-mode rules](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide) restrict playlist tracks to playlists you own or collaborate on. Other playlist metadata can be viewed and opened in Spotify. Actions also depend on Premium, market, permissions and device restrictions.

Audio plays in Spotify, which handles background playback. This build does not enable the Web Playback SDK or promise browser/locked-screen streaming. Offline music downloads, lyrics, DJ, Jam, billing, recommendations and native widgets are not represented by fake controls. Queue deletion/reordering uses Spotify; playlist reordering is supported separately.

## Security

OAuth uses PKCE S256 and unpredictable state. Tokens are AES-GCM sealed in Secure, HttpOnly, SameSite=Lax, origin-bound cookies; only the server can decode them. They never enter browser JavaScript, localStorage, UI, logs or compiled client code. A separate active-session cookie prevents late refreshes from undoing logout. Refreshes are shared within each worker instance and briefly reused for old-cookie requests.

POSTs require the same Origin and JSON. The backend restricts endpoint/verb combinations, fixes the upstream hosts to Spotify, and uses timeouts. Successful command acknowledgements do not require JSON. The service worker caches only public interface assets, never API/auth data. Client ID, palette and motion preference are the only localStorage settings.

Hosted `SESSION_SECRET` is configured through Vercel environment settings and is absent from source. Rotating it signs everyone out. Logout clears the active marker and sealed session; revoke the Spotify grant in Spotify account settings if desired. An old request arriving during a new login can safely require reconnection rather than restore the old account.

## Run locally

Requires Node 22.12+ and npm. From this folder:

```powershell
npm ci
npm run build
npm start
```

Open http://127.0.0.1:8788 and register `http://127.0.0.1:8788/auth/spotify/callback` for local OAuth. The local runner uses an in-memory random encryption key; restarting invalidates local sessions. Optionally set a persistent, random 64-hex-character SESSION_SECRET in the environment outside source control.

`npm run dev` starts the compiled backend and Vite at http://127.0.0.1:5174. Build first; register that port's callback URI if logging in through Vite. Loopback is computer-local; use the hosted HTTPS Site on your phone.

## Build and verify

```powershell
npm test
npm run build
npm run test:mobile
```

Build output is `dist/server/index.js`, a Worker ESM containing the backend and embedded React/CSS/fonts/PWA assets, plus `dist/.openai/hosting.json`. Fixtures and test account data are excluded. A normal Node adapter is included in `scripts/serve.mjs` for local use.

Phone browser checks use headless Edge and controlled, test-only Spotify responses. They cover OAuth/cookies, transport, search, queue, playlist actions (including hidden entries), library categories, history pagination, devices/volume, rate limits, 320–430px layout, saved appearance, offline shell and logout. They never access the user's account. Actual iOS installation, consent and playback require checking on the user's phone.

## Source map

- `src/main.jsx`: screens and playback state.
- `src/api.mjs`: same-origin client and catalog normalization.
- `src/style.css`, `src/decorations.jsx`, `src/icons.jsx`: pixel design.
- `server/app.mjs`: PKCE, encrypted cookies and Spotify API validation.
- `server/worker.mjs`: assets and browser security headers.
- `public/`: manifest and service worker.
- `tests/`: protocol tests and test-only HTTP fixtures.

Independent Spotify companion. Follow Spotify developer terms when distributing it.

