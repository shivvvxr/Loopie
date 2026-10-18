# Publish Loopie with GitHub and Vercel

## Upload this ZIP to GitHub

1. Extract **Loopie-GitHub-Vercel-1.1.0.zip** on your computer. GitHub does not extract an uploaded ZIP.
2. Create a GitHub repository named `loopie` (private is fine).
3. Choose **uploading an existing file**. Upload the extracted project contents so `package.json`, `vercel.json`, `src/`, `server/`, and `scripts/` are at the repository root. Commit the files.
4. Include the dotfiles `.gitignore` and `.env.example` if your file picker hides them. No account credentials are included. Do not upload a real `.env`, `node_modules`, `.git`, or `.vercel` folder.

## Import into Vercel

1. Sign in at [Vercel](https://vercel.com/new), choose **Add New → Project**, and import your `loopie` GitHub repository.
2. Keep the Root Directory at the repository root. Framework is **Other**. `vercel.json` sets the install command to `npm ci` and build command to `npm run build:vercel`. Leave Output Directory at its default; the build writes Vercel's Build Output API automatically. Use Node.js **22.x**.
3. Before deploying, add the server-only environment variable **SESSION_SECRET** for Production (and Preview if needed). Generate its value locally:

   ```shell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Copy the resulting 64 hexadecimal characters into Vercel's environment settings. Keep the value private. Never use a `VITE_` prefix, put it in source code, or paste it into an issue. The Spotify Client ID is public and is entered inside Loopie Settings; a Spotify client secret is not required.

4. Deploy. Vercel assigns the actual address; `loopie.vercel.app` might already belong to someone else. Use the URL Vercel gives you or a custom domain.
5. Open your app in the [Spotify developer dashboard](https://developer.spotify.com/dashboard) and add the exact redirect URI using your final address:

   ```text
   https://YOUR-ACTUAL-DOMAIN/auth/spotify/callback
   ```

6. Open that same address → Loopie Settings → enter your public Spotify Client ID → Log in with Spotify. Start music in Spotify to activate your playback device.
7. iPhone: Safari → Share → Add to Home Screen. Android: Chrome → Install app. If you installed the older Daisy version, remove its home-screen shortcut and install Loopie again to refresh the cached name/icon. The Loopie icon uses the desktop app's original artwork; Android's maskable version adds crop-safe padding.

GitHub commits trigger new Vercel deployments after import. A fresh Vercel domain needs a fresh Spotify login because encrypted sessions are bound to the domain. Stable production URLs work best; each preview address would need its own exact Spotify redirect registration.

## Architecture and verification

The build emits `.vercel/output/config.json` and a standalone Node.js function at `.vercel/output/functions/loopie.func`. It handles `/api/*`, `/auth/*`, and the bundled PWA interface. The server sets private/no-store API headers and keeps Spotify tokens in encrypted HttpOnly cookies. No database or Cloudflare binding is required. Source files outside the function are not served.

```shell
npm ci
npm test
npm run build:vercel
npm run test:vercel
```

For optional browser checks, install Microsoft Edge or run `npx playwright install chromium` and set `LOOPIE_BROWSER=chromium` before `npm run test:mobile`. The default test browser is Microsoft Edge. Tests use isolated fixtures, never real account tokens.

The backend keeps OAuth replay tracking and refresh deduplication in instance memory. Vercel instances may restart or run in parallel; rare concurrent refresh failures require logging in again. Cookies remain encrypted and origin-bound. Spotify account permissions and API limitations described in README.md also apply on Vercel.

Official references: [Vercel Build Output API](https://vercel.com/docs/build-output-api), [Node.js function configuration](https://vercel.com/docs/build-output-api/primitives), [Spotify redirect URIs](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri).
