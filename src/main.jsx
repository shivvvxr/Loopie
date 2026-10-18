import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/pixelify-sans/400.css";
import "@fontsource/pixelify-sans/500.css";
import { Icon } from "./icons.jsx";
import { Bow, Moon } from "./decorations.jsx";
import {
  spotify,
  auth,
  normalize,
  artwork,
  byline,
  time,
  external,
} from "./api.mjs";
import "./style.css";
const tabs = [
  ["player", "play", "Player"],
  ["search", "search", "Search"],
  ["library", "library", "Library"],
  ["queue", "queue", "Queue"],
  ["settings", "settings", "Settings"],
];
const listKinds = [
  ["tracks", "Liked songs"],
  ["playlists", "Playlists"],
  ["albums", "Albums"],
  ["artists", "Artists"],
  ["shows", "Podcasts"],
  ["episodes", "Saved episodes"],
  ["recent", "Recent"],
  ["top", "Top songs"],
  ["topArtists", "Top artists"],
];
function IB({ icon, label, active = false, ...props }) {
  return (
    <button
      className={"icon-button " + (active ? "active" : "")}
      type="button"
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon name={icon} />
    </button>
  );
}
function Cover({ item, large = false }) {
  const src = artwork(item);
  return (
    <div className={"cover " + (large ? "large" : "")}>
      {src ? (
        <img
          src={src}
          alt=""
          loading={large ? "eager" : "lazy"}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <Moon small={!large} />
      )}
    </div>
  );
}
function Empty({ title, children, icon = "heart" }) {
  return (
    <div className="empty">
      <Icon name={icon} size={32} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function App() {
  const [tab, setTab] = useState("player"),
    [connected, setConnected] = useState(false),
    [ready, setReady] = useState(false),
    [profile, setProfile] = useState(null),
    [playback, setPlayback] = useState(null),
    [received, setReceived] = useState(Date.now()),
    [tick, setTick] = useState(Date.now()),
    [liked, setLiked] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [cooldown, setCooldown] = useState(0),
    [online, setOnline] = useState(navigator.onLine),
    [detail, setDetail] = useState(null),
    [sheet, setSheet] = useState(null),
    [devices, setDevices] = useState(null),
    [playlistPicker, setPlaylistPicker] = useState(null),
    [editor, setEditor] = useState(null);
  const [clientId, setClientId] = useState(
      () => localStorage.getItem("daisy-client-id") || "",
    ),
    [theme, setTheme] = useState(
      () => localStorage.getItem("daisy-theme") || "ice",
    ),
    [motion, setMotion] = useState(
      () => localStorage.getItem("daisy-motion") !== "off",
    ),
    [install, setInstall] = useState(null),
    [redirect, setRedirect] = useState(
      location.origin + "/auth/spotify/callback",
    );
  const actionLock = useRef(false),
    pollLock = useRef(false),
    generation = useRef(0),
    lastLike = useRef({ uri: null, at: 0 }),
    currentUri = useRef(null),
    likeRevision = useRef(0);
  const [seek, setSeek] = useState(null),
    [volume, setVolume] = useState(null);
  const fail = useCallback((e) => {
    setError(e.message);
    if (e.retryAfter) setCooldown(Date.now() + e.retryAfter * 1000);
  }, []);
  const disconnected = useCallback(() => {
    generation.current++;
    setConnected(false);
    setProfile(null);
    setPlayback(null);
    setLiked(null);
    currentUri.current = null;
    likeRevision.current++;
    lastLike.current = { uri: null, at: 0 };
    setDetail(null);
    setSheet(null);
    setDevices(null);
    setPlaylistPicker(null);
    setEditor(null);
  }, []);
  const sync = useCallback(async () => {
    if (pollLock.current || document.hidden || !navigator.onLine) return;
    pollLock.current = true;
    const gen = generation.current;
    try {
      const next = await spotify("/me/player?additional_types=track,episode");
      if (gen !== generation.current) return;
      setPlayback(next);
      setReceived(Date.now());
      const uri = next?.item?.type === "track" ? next.item.uri : null;
      if (uri !== currentUri.current) {
        currentUri.current = uri;
        likeRevision.current++;
        setLiked(null);
      }
      if (
        uri &&
        (uri !== lastLike.current.uri ||
          Date.now() - lastLike.current.at > 30000)
      ) {
        const revision = likeRevision.current;
        const values = await spotify(
          "/me/library/contains?uris=" + encodeURIComponent(uri),
        );
        if (
          gen === generation.current &&
          revision === likeRevision.current &&
          uri === currentUri.current
        ) {
          setLiked(!!values?.[0]);
          lastLike.current = { uri, at: Date.now() };
        }
      } else if (!uri) setLiked(false);
    } catch (e) {
      if (gen === generation.current) fail(e);
    } finally {
      pollLock.current = false;
    }
  }, [fail]);
  useEffect(() => {
    let live = true;
    auth
      .status()
      .then(async (status) => {
        if (!live) return;
        setRedirect(status.redirectUri);
        setConnected(status.connected);
        setReady(true);
        if (status.connected) {
          try {
            const me = await spotify("/me");
            if (live) setProfile(me);
          } catch (e) {
            if (live) fail(e);
          }
        }
      })
      .catch((e) => {
        if (live) {
          fail(e);
          setReady(true);
        }
      });
    const offline = () => setOnline(navigator.onLine),
      onInstall = (e) => {
        e.preventDefault();
        setInstall(e);
      };
    window.addEventListener("online", offline);
    window.addEventListener("offline", offline);
    window.addEventListener("daisy-disconnected", disconnected);
    window.addEventListener("beforeinstallprompt", onInstall);
    const timer = setInterval(() => setTick(Date.now()), 500);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("online", offline);
      window.removeEventListener("offline", offline);
      window.removeEventListener("daisy-disconnected", disconnected);
      window.removeEventListener("beforeinstallprompt", onInstall);
    };
  }, [disconnected, fail]);
  useEffect(() => {
    if (!connected) return;
    sync();
    const timer = setInterval(sync, playback?.is_playing ? 4000 : 7000);
    const visible = () => {
      if (!document.hidden) sync();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [connected, !!playback?.is_playing, sync]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("daisy-theme", theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.motion = motion ? "on" : "off";
    localStorage.setItem("daisy-motion", motion ? "on" : "off");
  }, [motion]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);
  async function act(task, message) {
    if (actionLock.current || Date.now() < cooldown) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    const gen = generation.current;
    try {
      const value = await task();
      if (gen !== generation.current) return;
      if (message) setToast(message);
      return value;
    } catch (e) {
      if (gen === generation.current) fail(e);
      throw e;
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  const quietly = (task, message) => act(task, message).catch(() => {});
  async function command(path, options = {}) {
    await spotify(path, { method: "PUT", ...options });
    await sync();
  }
  function play(item) {
    quietly(async () => {
      const audio = ["track", "episode"].includes(item.type);
      await command("/me/player/play", {
        body: audio ? { uris: [item.uri] } : { context_uri: item.uri },
      });
      setDetail(null);
      setTab("player");
    });
  }
  async function save(item, value = true) {
    const revision = ++likeRevision.current;
    await spotify("/me/library?uris=" + encodeURIComponent(item.uri), {
      method: value ? "PUT" : "DELETE",
    });
    if (item.uri === currentUri.current && revision === likeRevision.current) {
      setLiked(value);
      lastLike.current = { uri: item.uri, at: Date.now() };
    }
  }
  const pending = busy || !online || Date.now() < cooldown;
  const device = playback?.device,
    item = playback?.item,
    disallows = playback?.actions?.disallows || {},
    blocked = !connected || !device || device.is_restricted || pending;
  const progress =
    seek ??
    Math.min(
      item?.duration_ms || 0,
      (playback?.progress_ms || 0) +
        (playback?.is_playing ? tick - received : 0),
    );
  function navigate(next) {
    setTab(next);
    setDetail(null);
    setError("");
  }
  function open(item) {
    setDetail({ type: item.type, id: item.id, item });
  }
  async function showDevices() {
    try {
      const data = await spotify("/me/player/devices");
      setDevices(data.devices || []);
    } catch (e) {
      fail(e);
    }
  }
  const context = {
    connected,
    pending,
    profile,
    open,
    play,
    more: setSheet,
    fail,
    quietly,
    save,
    spotify,
    setEditor,
    playlistPicker: setPlaylistPicker,
    toast: setToast,
  };
  return (
    <div className={"phone-shell" + (connected && item && (tab !== "player" || detail) ? " has-mini-player" : "")}>
      <header className="app-header">
        <Bow />
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("player");
          }}
        >
          Loopie<span>for you, dear ♡</span>
        </a>
        <IB
          icon="palette"
          label="Appearance settings"
          onClick={() => navigate("settings")}
        />
      </header>
      <div className="sparkles" aria-hidden="true">
        <span>✦</span>
        <span>♡</span>
        <span>✧</span>
        <span>+</span>
      </div>
      <main id="main" className="main-content" key={tab}>
        {!online && (
          <div className="notice" role="status">
            You’re offline. Your music corner is here; Spotify needs internet.
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            <span><strong className="notice-title">A little hiccup</strong>{error}</span>
            <IB
              icon="close"
              label="Dismiss error"
              onClick={() => setError("")}
            />
          </div>
        )}
        {cooldown > tick && (
          <p className="cooldown" role="status">
            Spotify cooldown · {Math.ceil((cooldown - tick) / 1000)}s
          </p>
        )}
        {detail ? (
          <Detail
            key={detail.type + detail.id}
            detail={detail}
            context={context}
            onBack={() => setDetail(null)}
          />
        ) : tab === "player" ? (
          <>
            <section className="player-panel">
              <div className="eyebrow">
                <span
                  className={
                    "playing-bars " + (playback?.is_playing ? "playing" : "")
                  }
                >
                  <i />
                  <i />
                  <i />
                </span>
                {connected
                  ? playback?.is_playing
                    ? "NOW PLAYING"
                    : "A MOMENT OF QUIET"
                  : "MADE FOR YOUR MUSIC"}
                <span>✦</span>
              </div>
              <Cover key={item?.uri || "welcome"} item={item} large />
              <div className="song-heading">
                <div>
                  <h1>
                    {item?.name ||
                      (ready
                        ? "For you, dear ♡"
                        : "Opening your music corner…")}
                  </h1>
                  <p>
                    {item
                      ? byline(item)
                      : "A little love, a little music. Make yourself at home."}
                  </p>
                </div>
                {item && (
                  <IB
                    icon="more"
                    label="Song actions"
                    onClick={() => setSheet(item)}
                  />
                )}
              </div>
              <label className="visually-hidden" htmlFor="seek">
                Seek position
              </label>
              <input
                id="seek"
                className="seek"
                type="range"
                min="0"
                max={item?.duration_ms || 1}
                value={progress}
                disabled={blocked || disallows.seeking}
                onChange={(e) => setSeek(Number(e.target.value))}
                onPointerUp={(e) => {
                  const value = Number(e.currentTarget.value);
                  quietly(() =>
                    command("/me/player/seek?position_ms=" + value),
                  ).finally(() => setSeek(null));
                }}
                onKeyUp={(e) => {
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                  ) {
                    const value = Number(e.currentTarget.value);
                    quietly(() =>
                      command("/me/player/seek?position_ms=" + value),
                    );
                    setSeek(null);
                  }
                }}
              />
              <div className="times">
                <span>{time(progress)}</span>
                <span>{time(item?.duration_ms)}</span>
              </div>
              <div
                className="transport"
                role="group"
                aria-label="Playback controls"
              >
                <IB
                  icon="shuffle"
                  label={
                    playback?.shuffle_state
                      ? "Turn shuffle off"
                      : "Turn shuffle on"
                  }
                  active={playback?.shuffle_state}
                  disabled={blocked || disallows.toggling_shuffle}
                  onClick={() =>
                    quietly(() =>
                      command(
                        "/me/player/shuffle?state=" + !playback.shuffle_state,
                      ),
                    )
                  }
                />
                <IB
                  icon="previous"
                  label="Previous song"
                  disabled={blocked || disallows.skipping_prev}
                  onClick={() =>
                    quietly(() =>
                      command("/me/player/previous", { method: "POST" }),
                    )
                  }
                />
                <IB
                  icon={playback?.is_playing ? "pause" : "play"}
                  label={playback?.is_playing ? "Pause" : "Play"}
                  className="icon-button play-primary"
                  disabled={
                    blocked ||
                    (playback?.is_playing
                      ? disallows.pausing
                      : disallows.resuming)
                  }
                  onClick={() =>
                    quietly(() =>
                      command(
                        "/me/player/" +
                          (playback?.is_playing ? "pause" : "play"),
                      ),
                    )
                  }
                />
                <IB
                  icon="next"
                  label="Next song"
                  disabled={blocked || disallows.skipping_next}
                  onClick={() =>
                    quietly(() =>
                      command("/me/player/next", { method: "POST" }),
                    )
                  }
                />
                <IB
                  icon="repeat"
                  label={"Repeat: " + (playback?.repeat_state || "off")}
                  active={
                    playback?.repeat_state !== "off" && !!playback?.repeat_state
                  }
                  disabled={blocked || disallows.toggling_repeat_context}
                  onClick={() =>
                    quietly(() =>
                      command(
                        "/me/player/repeat?state=" +
                          ({ off: "context", context: "track", track: "off" }[
                            playback.repeat_state
                          ] || "off"),
                      ),
                    )
                  }
                />
                <IB
                  icon="heart"
                  label={
                    liked ? "Remove from liked songs" : "Add to liked songs"
                  }
                  active={liked}
                  disabled={
                    pending ||
                    !connected ||
                    item?.type !== "track" ||
                    liked === null ||
                    item?.is_local
                  }
                  onClick={() =>
                    quietly(
                      () => save(item, !liked),
                      liked
                        ? "Removed from liked songs"
                        : "Saved to liked songs",
                    )
                  }
                />
              </div>
              {connected ? (
                <>
                  <button
                    className="device-pill"
                    onClick={showDevices}
                    disabled={pending}
                  >
                    <Icon name="device" size={17} />
                    {device?.name || "Choose a Spotify device"}
                    <span>⌄</span>
                  </button>
                  {device?.supports_volume && device?.type !== "Smartphone" ? (
                    <div className="volume-control">
                      <Icon name="volume" size={16} />
                      <input
                        aria-label="Device volume"
                        type="range"
                        min="0"
                        max="100"
                        disabled={blocked}
                        value={volume ?? device.volume_percent ?? 0}
                        onChange={(e) => setVolume(Number(e.target.value))}
                        onPointerUp={(e) => {
                          quietly(() =>
                            command(
                              "/me/player/volume?volume_percent=" +
                                e.currentTarget.value,
                            ),
                          );
                          setVolume(null);
                        }}
                        onKeyUp={(e) => {
                          if (e.key.startsWith("Arrow")) {
                            quietly(() =>
                              command(
                                "/me/player/volume?volume_percent=" +
                                  e.currentTarget.value,
                              ),
                            );
                            setVolume(null);
                          }
                        }}
                      />
                      <span>{volume ?? device.volume_percent ?? 0}%</span>
                    </div>
                  ) : (
                    <p className="tiny muted">
                      Use your phone’s volume buttons for phone audio
                    </p>
                  )}
                  <button
                    className="text-button"
                    disabled={pending}
                    onClick={() => quietly(sync)}
                  >
                    Refresh playback
                  </button>
                  {!device && (
                    <p className="hint">
                      Open Spotify and start a song on the same account, then
                      choose that device.
                    </p>
                  )}
                </>
              ) : (
                <button
                  className="primary connect"
                  onClick={() => navigate("settings")}
                >
                  Connect Spotify <Icon name="spotify" size={18} />
                </button>
              )}
            </section>
            <div className="player-footer">
              <span>♡ made for slow mornings & late nights</span>
              <button onClick={() => navigate("queue")}>
                Your queue <Icon name="queue" size={15} />
              </button>
            </div>
          </>
        ) : tab === "search" ? (
          <Search context={context} />
        ) : tab === "library" ? (
          <Library context={context} />
        ) : tab === "queue" ? (
          <Queue context={context} current={item} />
        ) : (
          <section className="settings">
            <PanelHeading
              eyebrow="MAKE YOURSELF AT HOME"
              title="Your little corner"
            />
            <div className="settings-card">
              <h3>
                {connected
                  ? `Hello, ${profile?.display_name || "music lover"} ♡`
                  : "Connect your Spotify"}
              </h3>
              <p>
                {connected
                  ? "Your Spotify account is connected securely."
                  : "Use your existing Spotify developer app and Premium account. No client secret is needed."}
              </p>
              {!connected && (
                <>
                  <label htmlFor="client-id">Spotify Client ID</label>
                  <input
                    id="client-id"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={clientId}
                    maxLength={32}
                    onChange={(e) => setClientId(e.target.value.trim())}
                    placeholder="32-character public Client ID"
                  />
                  <label>Register this exact redirect URI</label>
                  <div className="copy-field">
                    <code>{redirect}</code>
                    <IB
                      icon="copy"
                      label="Copy redirect URI"
                      onClick={() =>
                        quietly(async () => {
                          await navigator.clipboard.writeText(redirect);
                        }, "Redirect URI copied")
                      }
                    />
                  </div>
                  <button
                    className="primary"
                    disabled={pending || !ready}
                    onClick={() =>
                      quietly(async () => {
                        localStorage.setItem("daisy-client-id", clientId);
                        await auth.login(clientId);
                      })
                    }
                  >
                    Log in with Spotify <Icon name="spotify" size={18} />
                  </button>
                  <p className="tiny">
                    Add your account to your Spotify app’s user access list.
                    Login opens Spotify’s secure page.
                  </p>
                  <a
                    className="text-link"
                    href="https://developer.spotify.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Spotify developer dashboard ↗
                  </a>
                </>
              )}
              {connected && (
                <button
                  className="secondary"
                  disabled={pending}
                  onClick={() =>
                    quietly(async () => {
                      await auth.logout();
                      disconnected();
                    }, "Signed out")
                  }
                >
                  Sign out & forget session
                </button>
              )}
            </div>
            <div className="settings-card">
              <h3>Make it yours</h3>
              <div className="theme-choices">
                <button
                  className={theme === "ice" ? "selected" : ""}
                  onClick={() => setTheme("ice")}
                >
                  <i className="swatch ice" />
                  Icy blue
                </button>
                <button
                  className={theme === "lilac" ? "selected" : ""}
                  onClick={() => setTheme("lilac")}
                >
                  <i className="swatch lilac" />
                  Lilac dusk
                </button>
              </div>
              <label className="toggle">
                <span>
                  Gentle animations
                  <small>Respects your phone’s reduced-motion setting</small>
                </span>
                <input
                  type="checkbox"
                  checked={motion}
                  onChange={(e) => setMotion(e.target.checked)}
                />
              </label>
            </div>
            <div className="settings-card">
              <h3>Keep Loopie on your phone</h3>
              <p>
                On iPhone: open this link in Safari, tap Share, then Add to Home
                Screen. Enable “Open as Web App” if shown.
              </p>
              {install && (
                <button
                  className="secondary"
                  onClick={async () => {
                    await install.prompt();
                    setInstall(null);
                  }}
                >
                  Install Loopie
                </button>
              )}
              <p className="tiny">
                On Android, use your browser’s Install app option. The app needs
                internet to control Spotify.
              </p>
            </div>
            <div className="settings-card limits">
              <h3>A companion for Spotify</h3>
              <p>
                Audio plays in Spotify on your selected device. Personal Spotify
                apps cannot read every public playlist; some actions depend on
                your Premium access and device.
              </p>
              <p>
                Offline music downloads, lyrics, DJ, Jam, billing and native
                Home Screen widgets are not provided by this web app.
              </p>
              <a
                href="https://open.spotify.com"
                target="_blank"
                rel="noreferrer"
              >
                Open Spotify ↗
              </a>
              <small>Independent companion · Loopie 1.1.0</small>
            </div>
          </section>
        )}
      </main>
      {connected && item && (tab !== "player" || detail) && (
        <aside className="mini-player" aria-label="Now playing">
          <button className="mini-track" onClick={() => navigate("player")} aria-label="Open now playing">
            <Cover item={item} />
            <span>
              <small>{playback?.is_playing ? "a song for you ♡" : "a little pause ♡"}</small>
              <strong>{item.name}</strong>
              <em>{byline(item)}</em>
            </span>
          </button>
          <IB icon={playback?.is_playing ? "pause" : "play"}
            label={playback?.is_playing ? "Pause from mini player" : "Play from mini player"}
            disabled={blocked || (playback?.is_playing ? disallows.pausing : disallows.resuming)}
            onClick={() => quietly(() => command(playback?.is_playing ? "/me/player/pause" : "/me/player/play"))} />
          <div className="mini-progress" aria-hidden="true"><i style={{ width: `${item.duration_ms ? Math.min(100, progress / item.duration_ms * 100) : 0}%` }} /></div>
        </aside>
      )}
      <nav className="bottom-nav" aria-label="Main navigation">
        {tabs.map(([value, icon, label]) => (
          <button
            key={value}
            aria-current={tab === value ? "page" : undefined}
            className={tab === value ? "selected" : ""}
            onClick={() => navigate(value)}
          >
            <Icon name={icon} size={21} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status" key={toast}>
          <span className="toast-seal" aria-hidden="true"><Icon name="heart" /></span>
          <span><strong>A little note for you</strong><span>{toast}</span></span>
          <span className="note-sparkle" aria-hidden="true">✦</span>
        </div>
      )}
      {sheet && (
        <Sheet title={sheet.name} onClose={() => setSheet(null)}>
          <div className="sheet-track">
            <Cover item={sheet} />
            <p>{byline(sheet)}</p>
          </div>
          {["track", "episode", "album", "playlist"].includes(sheet.type) && (
            <button
              disabled={pending}
              onClick={() => {
                play(sheet);
                setSheet(null);
              }}
            >
              <Icon name="play" />
              Play now
            </button>
          )}
          {["track", "episode"].includes(sheet.type) && (
            <>
              <button
                disabled={pending}
                onClick={() =>
                  quietly(async () => {
                    await spotify(
                      "/me/player/queue?uri=" + encodeURIComponent(sheet.uri),
                      { method: "POST" },
                    );
                    setSheet(null);
                  }, "Added to your queue")
                }
              >
                <Icon name="queue" />
                Add to queue
              </button>
              <button
                disabled={pending}
                onClick={() => {
                  setPlaylistPicker({ item: sheet });
                  setSheet(null);
                }}
              >
                <Icon name="plus" />
                Add to playlist
              </button>
            </>
          )}
          <button
            disabled={pending}
            onClick={() =>
              quietly(
                async () => {
                  await save(sheet);
                  setSheet(null);
                },
                sheet.type === "artist"
                  ? "Following artist"
                  : "Saved to your library",
              )
            }
          >
            <Icon name="heart" />
            Save / follow
          </button>
          <button
            disabled={pending}
            onClick={() =>
              quietly(async () => {
                await save(sheet, false);
                setSheet(null);
              }, "Removed from your library")
            }
          >
            <Icon name="minus" />
            Remove / unfollow
          </button>
          {external(sheet) && (
            <a href={external(sheet)} target="_blank" rel="noreferrer">
              <Icon name="spotify" />
              Open in Spotify ↗
            </a>
          )}
        </Sheet>
      )}
      {devices && (
        <Sheet title="Where shall we play?" onClose={() => setDevices(null)}>
          {devices.length ? (
            devices.map((d) => (
              <button
                key={d.id}
                disabled={pending || d.is_restricted || !d.id}
                onClick={() =>
                  quietly(async () => {
                    await command("/me/player", {
                      body: { device_ids: [d.id], play: false },
                    });
                    setDevices(null);
                  }, "Device selected")
                }
              >
                <Icon name="device" />
                <span>
                  {d.name}
                  <small>
                    {d.is_restricted
                      ? "Control restricted"
                      : d.is_active
                        ? "Currently playing"
                        : d.type}
                  </small>
                </span>
                {d.is_active ? "✓" : ""}
              </button>
            ))
          ) : (
            <p>Open Spotify and start a song, then refresh devices.</p>
          )}
          <button disabled={pending} onClick={showDevices}>
            <Icon name="refresh" />
            Refresh devices
          </button>
        </Sheet>
      )}
      {playlistPicker && (
        <PlaylistPicker
          context={context}
          item={playlistPicker.item}
          onClose={() => setPlaylistPicker(null)}
        />
      )}
      {editor && (
        <PlaylistEditor
          context={context}
          value={editor}
          onClose={() => setEditor(null)}
          onSaved={(list) => {
            setEditor(null);
            setTab("library");
            setDetail({
              type: "playlist",
              id: list.id,
              item: list,
              version: Date.now(),
            });
          }}
        />
      )}
    </div>
  );
}
function PanelHeading({ eyebrow, title, action }) {
  return (
    <div className="panel-heading">
      <p className="eyebrow">✦ {eyebrow}</p>
      <div>
        <h1>{title}</h1>
        {action}
      </div>
    </div>
  );
}
function Sheet({ title, children, onClose }) {
  const closeRef = useRef();
  useEffect(() => {
    const before = document.activeElement;
    closeRef.current?.focus();
    const escape = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const elements = [
          ...closeRef.current
            .closest('[role="dialog"]')
            .querySelectorAll("button:not(:disabled),a,input,textarea,select"),
        ];
        const first = elements[0],
          last = elements.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      before?.focus?.();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="action-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sheet-header">
          <h2>{title}</h2>
          <button
            ref={closeRef}
            className="icon-button"
            aria-label="Close panel"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Rows({ items, context, parent, onRemove, onMove }) {
  return (
    <div className="rows">
      {items.map((entry, index) => {
        const item = normalize(entry, parent);
        if (!item) return null;
        const audio = ["track", "episode"].includes(item.type);
        return (
          <article className="item-row" key={item.uri + "-" + index}>
            <button
              className="item-main"
              disabled={!context.connected || context.pending}
              onClick={() => (audio ? context.play(item) : context.open(item))}
              aria-label={(audio ? "Play " : "Open ") + item.name}
            >
              <Cover item={item} />
              <span>
                <strong>{item.name}</strong>
                <small>{byline(item)}</small>
              </span>
              {audio && <Icon name="play" size={14} />}
            </button>
            {onMove && (
              <IB
                icon="up"
                label={"Move " + item.name + " up"}
                disabled={context.pending || index === 0}
                onClick={() => onMove(index)}
              />
            )}
            <IB
              icon={onRemove ? "minus" : "more"}
              label={(onRemove ? "Remove " : "Actions for ") + item.name}
              disabled={context.pending}
              onClick={() =>
                onRemove ? onRemove(item, index) : context.more(item)
              }
            />
          </article>
        );
      })}
    </div>
  );
}
function ConnectNote({ context }) {
  return !context.connected ? (
    <Empty title="Your music is waiting" icon="spotify">
      Connect Spotify in Settings to explore your account.
    </Empty>
  ) : null;
}
function Search({ context }) {
  const [query, setQuery] = useState(""),
    [term, setTerm] = useState(""),
    [type, setType] = useState("track"),
    [page, setPage] = useState({ items: [], next: null }),
    [loading, setLoading] = useState(false),
    [err, setErr] = useState("");
  const request = useRef(0);
  useEffect(() => {
    if (!context.connected) {
      request.current++;
      setPage({ items: [], next: null });
      setTerm("");
      setQuery("");
      setLoading(false);
      setErr("");
    }
  }, [context.connected]);
  async function load(text, kind, append = false) {
    const seq = ++request.current;
    if (!text.trim()) return;
    setLoading(true);
    setErr("");
    try {
      const data = await spotify(
        "/search?q=" +
          encodeURIComponent(text.trim()) +
          "&type=" +
          kind +
          "&limit=10&offset=" +
          (append ? page.items.length : 0),
      );
      if (seq !== request.current) return;
      const results =
        data[
          {
            track: "tracks",
            playlist: "playlists",
            album: "albums",
            artist: "artists",
            show: "shows",
            episode: "episodes",
          }[kind]
        ];
      setPage({
        items: append
          ? [...page.items, ...(results?.items || [])]
          : results?.items || [],
        next: results?.next,
      });
    } catch (e) {
      if (seq === request.current) setErr(e.message);
    } finally {
      if (seq === request.current) setLoading(false);
    }
  }
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  return (
    <section>
      <PanelHeading
        eyebrow="FIND YOUR NEXT FAVOURITE"
        title="A little discovery"
      />
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(query.trim());
          load(query, type);
        }}
      >
        <Icon name="search" />
        <input
          aria-label="Search Spotify"
          placeholder="Songs, artists, albums…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={180}
        />
        <button
          type="submit"
          disabled={!context.connected || !query.trim() || loading}
        >
          Go
        </button>
      </form>
      <div className="chips" role="group" aria-label="Search category">
        {[
          ["track", "Songs"],
          ["playlist", "Playlists"],
          ["album", "Albums"],
          ["artist", "Artists"],
          ["show", "Podcasts"],
          ["episode", "Episodes"],
        ].map(([key, label]) => (
          <button
            className={key === type ? "selected" : ""}
            key={key}
            onClick={() => {
              setType(key);
              setPage({ items: [], next: null });
              if (term) load(term, key);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <ConnectNote context={context} />
      {err && (
        <div role="alert" className="notice error">
          {err}
        </div>
      )}
      {!term && context.connected && (
        <Empty title="What’s your mood today?" icon="search">
          Search Spotify for a song, artist or playlist.
        </Empty>
      )}
      {term && <h2 className="section-label">Results for “{term}”</h2>}
      <Rows items={page.items} context={context} />
      {loading && (
        <p className="loading" role="status">
          Looking through the stars…
        </p>
      )}
      {term && !loading && !page.items.length && !err && (
        <Empty title="Nothing here just yet">
          Try a different name or another category.
        </Empty>
      )}
      {page.next && (
        <button
          className="secondary load-more"
          disabled={loading || context.pending}
          onClick={() => load(term, type, true)}
        >
          More results
        </button>
      )}
    </section>
  );
}
function Library({ context }) {
  const [kind, setKind] = useState("tracks"),
    [items, setItems] = useState([]),
    [next, setNext] = useState(null),
    [loading, setLoading] = useState(false),
    [err, setErr] = useState("");
  const seq = useRef(0),
    cursor = useRef(null);
  async function load(append = false) {
    if (!context.connected) return;
    const version = ++seq.current;
    setLoading(true);
    setErr("");
    let path;
    if (kind === "recent")
      path =
        "/me/player/recently-played?limit=20" +
        (append && cursor.current ? "&before=" + cursor.current : "");
    else if (kind === "top" || kind === "topArtists")
      path =
        "/me/top/" +
        (kind === "top" ? "tracks" : "artists") +
        "?time_range=medium_term&limit=20&offset=" +
        (append ? items.length : 0);
    else if (kind === "artists")
      path =
        "/me/following?type=artist&limit=20" +
        (append && cursor.current ? "&after=" + cursor.current : "");
    else
      path = "/me/" + kind + "?limit=20&offset=" + (append ? items.length : 0);
    try {
      let data = await spotify(path);
      if (version !== seq.current) return;
      if (kind === "artists") data = data.artists;
      const values = data?.items || [];
      setItems((old) => (append ? [...old, ...values] : values));
      setNext(data?.next);
      cursor.current =
        kind === "recent" ? data?.cursors?.before : data?.cursors?.after;
    } catch (e) {
      if (version === seq.current) setErr(e.message);
    } finally {
      if (version === seq.current) setLoading(false);
    }
  }
  useEffect(() => {
    setItems([]);
    setNext(null);
    cursor.current = null;
    load();
    return () => {
      seq.current++;
    };
  }, [kind, context.connected]);
  return (
    <section>
      <PanelHeading
        eyebrow="COLLECTED WITH LOVE"
        title="Your library"
        action={
          <IB
            icon="plus"
            label="Create playlist"
            disabled={!context.connected || context.pending}
            onClick={() => context.setEditor({})}
          />
        }
      />
      <div className="chips" role="group" aria-label="Library category">
        {listKinds.map(([key, label]) => (
          <button
            key={key}
            className={kind === key ? "selected" : ""}
            onClick={() => setKind(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <ConnectNote context={context} />
      {err && (
        <div className="notice error" role="alert">
          {err}
          <button onClick={() => load()}>Retry</button>
        </div>
      )}
      <Rows items={items} context={context} />
      {loading && (
        <p className="loading" role="status">
          Gathering your favourites…
        </p>
      )}
      {!loading && !err && context.connected && !items.length && (
        <Empty title="Room for new favourites">
          Save some music in Spotify and it will find its way here.
        </Empty>
      )}
      {next && (
        <button
          className="secondary load-more"
          disabled={loading || context.pending}
          onClick={() => load(true)}
        >
          Load more
        </button>
      )}
      {context.connected && (
        <button
          className="text-button"
          disabled={loading || context.pending}
          onClick={() => load()}
        >
          Refresh library
        </button>
      )}
    </section>
  );
}
function Queue({ context, current }) {
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(false),
    [err, setErr] = useState("");
  const seq = useRef(0);
  useEffect(() => {
    if (!context.connected) {
      seq.current++;
      setData(null);
      setLoading(false);
      setErr("");
    }
  }, [context.connected]);
  async function load() {
    if (!context.connected) return;
    const version = ++seq.current;
    setLoading(true);
    setErr("");
    try {
      const value = await spotify("/me/player/queue");
      if (seq.current === version) setData(value);
    } catch (e) {
      if (seq.current === version) {
        setErr(e.message);
        context.fail(e);
      }
    } finally {
      if (seq.current === version) setLoading(false);
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 20000);
    return () => {
      seq.current++;
      clearInterval(timer);
    };
  }, [context.connected, current?.id]);
  return (
    <section>
      <PanelHeading
        eyebrow="LET THE NIGHT PLAY ON"
        title="Your queue"
        action={
          <IB
            icon="refresh"
            label="Refresh queue"
            onClick={load}
            disabled={!context.connected || loading || context.pending}
          />
        }
      />
      <ConnectNote context={context} />
      {data?.currently_playing && (
        <>
          <h2 className="section-label">Now playing</h2>
          <div className="current-card">
            <Cover item={data.currently_playing} />
            <div>
              <strong>{data.currently_playing.name}</strong>
              <small>{byline(data.currently_playing)}</small>
            </div>
            <span className="playing-bars playing">
              <i />
              <i />
              <i />
            </span>
          </div>
        </>
      )}
      <h2 className="section-label">✦ Up next</h2>
      {err && (
        <div className="notice error" role="alert">
          {err}
        </div>
      )}
      <Rows items={data?.queue || []} context={context} />
      {loading && (
        <p className="loading" role="status">
          Listening for what’s next…
        </p>
      )}
      {!loading && context.connected && !data?.queue?.length && !err && (
        <Empty title="A quiet queue">
          Find a song in Search and choose Add to queue.
        </Empty>
      )}
      <p className="tiny muted">
        Spotify decides upcoming order. Use Spotify to remove or rearrange
        queued tracks.
      </p>
    </section>
  );
}
function Detail({ detail, context, onBack }) {
  const [info, setInfo] = useState(detail.item),
    [items, setItems] = useState([]),
    [next, setNext] = useState(null),
    [loading, setLoading] = useState(false),
    [err, setErr] = useState(""),
    [refresh, setRefresh] = useState(0);
  const sequence = useRef(0);
  const owned =
      detail.type === "playlist" && info?.owner?.id === context.profile?.id,
    editable = owned || info?.collaborative;
  async function load(append = false) {
    const seq = ++sequence.current;
    setLoading(true);
    setErr("");
    try {
      let object = info;
      if (!append) {
        object = await spotify(
          "/" +
            {
              playlist: "playlists",
              album: "albums",
              artist: "artists",
              show: "shows",
              episode: "episodes",
              track: "tracks",
            }[detail.type] +
            "/" +
            detail.id,
        );
        if (seq !== sequence.current) return;
        setInfo(object);
      }
      let path;
      if (detail.type === "playlist")
        path =
          "/playlists/" +
          detail.id +
          "/items?limit=20&offset=" +
          (append ? items.length : 0) +
          "&additional_types=track,episode";
      if (detail.type === "album")
        path =
          "/albums/" +
          detail.id +
          "/tracks?limit=20&offset=" +
          (append ? items.length : 0);
      if (detail.type === "artist")
        path =
          "/artists/" +
          detail.id +
          "/albums?include_groups=album,single&limit=10&offset=" +
          (append ? items.length : 0);
      if (detail.type === "show")
        path =
          "/shows/" +
          detail.id +
          "/episodes?limit=20&offset=" +
          (append ? items.length : 0);
      if (path) {
        const page = await spotify(path);
        if (seq !== sequence.current) return;
        // Keep raw entries, including unavailable items, so offsets and reorder
        // positions continue to match Spotify's playlist positions.
        const values = page?.items || [];
        setItems((old) => (append ? [...old, ...values] : values));
        setNext(page?.next);
      }
    } catch (e) {
      if (seq === sequence.current) setErr(e.message);
    } finally {
      if (seq === sequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    load();
    return () => {
      sequence.current++;
    };
  }, [detail.id, refresh, detail.version]);
  return (
    <section className="detail">
      <button className="back-button" onClick={onBack}>
        <Icon name="back" size={17} />
        Back
      </button>
      <div className="detail-hero">
        <Cover item={info} />
        <p className="eyebrow">{detail.type}</p>
        <h1>{info.name}</h1>
        <p>{byline(info)}</p>
        {info.description && (
          <p className="description">
            {info.description.replace(/<[^>]*>/g, "")}
          </p>
        )}
      </div>
      <div className="detail-actions">
        {["playlist", "album", "track", "episode"].includes(detail.type) && (
          <button
            className="primary"
            disabled={context.pending}
            onClick={() => context.play(info)}
          >
            <Icon name="play" size={18} />
            Play
          </button>
        )}
        <IB
          icon="more"
          label="More actions"
          disabled={context.pending}
          onClick={() => context.more(info)}
        />
        {owned && (
          <button
            className="secondary"
            disabled={context.pending}
            onClick={() => context.setEditor(info)}
          >
            Edit playlist
          </button>
        )}
        {external(info) && (
          <a
            className="text-link"
            href={external(info)}
            target="_blank"
            rel="noreferrer"
          >
            Spotify ↗
          </a>
        )}
      </div>
      {err && (
        <div className="notice error" role="alert">
          {err}
        </div>
      )}
      <Rows
        items={items}
        context={context}
        parent={detail.type === "album" ? info : null}
        onRemove={
          editable
            ? (item) =>
                context.quietly(async () => {
                  if (
                    !window.confirm(
                      "Remove “" + item.name + "” from this playlist?",
                    )
                  )
                    return;
                  await spotify("/playlists/" + detail.id + "/items", {
                    method: "DELETE",
                    body: { items: [{ uri: item.uri }] },
                  });
                  setRefresh((x) => x + 1);
                }, "Playlist updated")
            : undefined
        }
        onMove={
          editable
            ? (index) =>
                context.quietly(async () => {
                  await spotify("/playlists/" + detail.id + "/items", {
                    method: "PUT",
                    body: {
                      range_start: index,
                      insert_before: index - 1,
                      range_length: 1,
                    },
                  });
                  setRefresh((x) => x + 1);
                }, "Playlist order updated")
            : undefined
        }
      />
      {loading && (
        <p className="loading" role="status">
          Opening your music…
        </p>
      )}
      {next && (
        <button
          className="secondary load-more"
          disabled={loading || context.pending}
          onClick={() => load(true)}
        >
          Load more
        </button>
      )}
      {!loading &&
        !err &&
        !items.length &&
        ["playlist", "album", "artist", "show"].includes(detail.type) && (
          <Empty title="Nothing here yet">
            Add something you love in Spotify or from Search.
          </Empty>
        )}
    </section>
  );
}
function PlaylistPicker({ context, item, onClose }) {
  const [lists, setLists] = useState([]),
    [loading, setLoading] = useState(true),
    [err, setErr] = useState(""),
    [offset, setOffset] = useState(0),
    [next, setNext] = useState(null);
  async function load(append = false) {
    setLoading(true);
    try {
      const data = await spotify(
        "/me/playlists?limit=50&offset=" + (append ? offset : 0),
      );
      const all = data.items || [];
      const writable = all.filter(
        (p) => p.owner?.id === context.profile?.id || p.collaborative,
      );
      setLists((old) => (append ? [...old, ...writable] : writable));
      setOffset((append ? offset : 0) + all.length);
      setNext(data.next);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <Sheet title="Add to a playlist" onClose={onClose}>
      <p className="tiny">Choose a playlist you own or collaborate on.</p>
      {err && <p role="alert">{err}</p>}
      {lists.map((list) => (
        <button
          key={list.id}
          disabled={context.pending}
          onClick={() =>
            context.quietly(async () => {
              await spotify("/playlists/" + list.id + "/items", {
                method: "POST",
                body: { uris: [item.uri] },
              });
              onClose();
            }, "Added to " + list.name)
          }
        >
          <Cover item={list} />
          <span>{list.name}</span>
        </button>
      ))}
      {loading && <p role="status">Finding your playlists…</p>}
      {!loading && !lists.length && !err && (
        <p>No editable playlists found. Create one from Library.</p>
      )}
      {next && (
        <button disabled={loading} onClick={() => load(true)}>
          More playlists
        </button>
      )}
    </Sheet>
  );
}
function PlaylistEditor({ context, value, onClose, onSaved }) {
  const [name, setName] = useState(value.name || ""),
    [description, setDescription] = useState(value.description || ""),
    [isPublic, setPublic] = useState(value.public || false),
    [collaborative, setCollaborative] = useState(value.collaborative || false);
  return (
    <Sheet
      title={value.id ? "Edit playlist" : "A new little playlist"}
      onClose={onClose}
    >
      <form
        className="playlist-form"
        onSubmit={(e) => {
          e.preventDefault();
          context.quietly(
            async () => {
              const body = {
                name: name.trim(),
                description,
                public: isPublic,
                collaborative,
              };
              if (value.id) {
                await spotify("/playlists/" + value.id, {
                  method: "PUT",
                  body,
                });
                onSaved({ ...value, ...body });
              } else {
                const list = await spotify("/me/playlists", {
                  method: "POST",
                  body,
                });
                onSaved(list);
              }
            },
            value.id ? "Playlist updated" : "Playlist created",
          );
        }}
      >
        <label htmlFor="playlist-name">Name</label>
        <input
          id="playlist-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
          placeholder="Songs for a blue afternoon"
        />
        <label htmlFor="playlist-description">Description</label>
        <textarea
          id="playlist-description"
          maxLength={300}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label className="toggle">
          Public playlist
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => {
              setPublic(e.target.checked);
              if (e.target.checked) setCollaborative(false);
            }}
          />
        </label>
        <label className="toggle">
          Collaborative
          <input
            type="checkbox"
            checked={collaborative}
            onChange={(e) => {
              setCollaborative(e.target.checked);
              if (e.target.checked) setPublic(false);
            }}
          />
        </label>
        <button
          type="submit"
          className="primary"
          disabled={context.pending || !name.trim()}
        >
          {value.id ? "Save playlist" : "Create playlist"}
          <Icon name="plus" size={16} />
        </button>
      </form>
    </Sheet>
  );
}
createRoot(document.getElementById("root")).render(<App />);
if ("serviceWorker" in navigator)
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("/sw.js").catch(() => {}),
  );
