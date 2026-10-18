// Test-only service responses; not imported by the production worker.
const image =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><path fill="#b49ce0" d="M0 0h200v200H0z"/><path fill="#fffac2" d="M80 40h45v15h-25v50h40V90h20v30h-20v15H80v-15H60V60h20z"/><path fill="#edcafa" d="M0 155h50v-10h40v25h70v-15h40v45H0z"/></svg>',
  );
export const track = (n) => ({
  id: "track" + n,
  type: "track",
  uri: "spotify:track:track" + n,
  name: "Test moon " + n,
  duration_ms: 180000,
  artists: [{ name: "Fixture artist" }],
  album: { name: "Test sky", images: [{ url: image }] },
  external_urls: { spotify: "https://open.spotify.com/track/track" + n },
});
const artist = {
  id: "artist1",
  type: "artist",
  uri: "spotify:artist:artist1",
  name: "Fixture artist",
  images: [{ url: image }],
};
const album = {
  id: "album1",
  type: "album",
  uri: "spotify:album:album1",
  name: "Test sky",
  artists: [{ name: "Fixture artist" }],
  images: [{ url: image }],
};
const show = {
  id: "show1",
  type: "show",
  uri: "spotify:show:show1",
  name: "Test podcast",
  images: [{ url: image }],
  publisher: "Test only",
};
const episode = {
  id: "episode1",
  type: "episode",
  uri: "spotify:episode:episode1",
  name: "A test episode",
  images: [{ url: image }],
  show,
  duration_ms: 900000,
};
export function createFixture() {
  const state = {
    calls: [],
    playing: true,
    index: 1,
    liked: false,
    shuffle: false,
    repeat: "off",
    progress: 30000,
    volume: 65,
    device: "deviceA",
    queue: [track(2), track(3)],
    playlists: [
      {
        id: "list1",
        type: "playlist",
        uri: "spotify:playlist:list1",
        name: "My test playlist",
        owner: { id: "me1", display_name: "Daisy" },
        public: false,
        collaborative: false,
        images: [{ url: image }],
        external_urls: { spotify: "https://open.spotify.com/playlist/list1" },
      },
    ],
    items: [track(1), track(2)],
    rateLimit: false,
    malformed: false,
    denyPlaylist: false,
  };
  const page = (items) => ({ items, total: items.length, next: null });
  async function fetcher(raw, options = {}) {
    const url = new URL(raw),
      p = url.pathname.replace("/v1", ""),
      method = options.method || "GET";
    let body;
    try {
      body = JSON.parse(options.body);
    } catch {}
    state.calls.push({ path: p, method, query: url.search, body });
    if (url.hostname === "accounts.spotify.com")
      return Response.json({
        access_token: "test-private-access",
        refresh_token: "test-private-refresh",
        expires_in: 3600,
      });
    if (url.hostname !== "api.spotify.com")
      throw Error("Unexpected fixture host");
    if (state.rateLimit) {
      state.rateLimit = false;
      return new Response("", { status: 429, headers: { "Retry-After": "2" } });
    }
    if (state.malformed) {
      state.malformed = false;
      return new Response("V-private-response");
    }
    if (p === "/me")
      return Response.json({
        id: "me1",
        account_id: "account1",
        display_name: "Daisy",
      });
    if (p === "/me/player" && method === "GET")
      return Response.json({
        device: {
          id: state.device,
          name: state.device === "deviceA" ? "Test phone" : "Test speaker",
          type: state.device === "deviceA" ? "Smartphone" : "Speaker",
          is_restricted: false,
          supports_volume: true,
          volume_percent: state.volume,
        },
        item: track(state.index),
        is_playing: state.playing,
        shuffle_state: state.shuffle,
        repeat_state: state.repeat,
        progress_ms: state.progress,
        actions: { disallows: {} },
      });
    if (p === "/me/player/devices")
      return Response.json({
        devices: [
          {
            id: "deviceA",
            name: "Test phone",
            type: "Smartphone",
            is_active: state.device === "deviceA",
          },
          {
            id: "deviceB",
            name: "Test speaker",
            type: "Speaker",
            is_active: state.device === "deviceB",
          },
        ],
      });
    if (p === "/me/library/contains") {
      const liked = state.liked;
      if (state.containsGate) {
        const gate = state.containsGate;
        state.containsGate = null;
        await gate;
      }
      return Response.json([liked]);
    }
    if (p === "/me/player/queue" && method === "GET")
      return Response.json({
        currently_playing: track(state.index),
        queue: state.queue,
      });
    if (p === "/search") {
      const type = url.searchParams.get("type");
      return Response.json({
        [type + "s"]: page(
          type === "track"
            ? [track(4), track(5)]
            : type === "playlist"
              ? state.playlists
              : type === "album"
                ? [album]
                : type === "artist"
                  ? [artist]
                  : type === "show"
                    ? [show]
                    : [episode],
        ),
      });
    }
    if (p === "/me/playlists" && method === "GET")
      return Response.json(page(state.playlists));
    if (p === "/me/playlists" && method === "POST") {
      const list = {
        ...state.playlists[0],
        ...body,
        id: "list" + (state.playlists.length + 1),
        uri: "spotify:playlist:list" + (state.playlists.length + 1),
      };
      state.playlists.push(list);
      return Response.json(list, { status: 201 });
    }
    if (p.startsWith("/playlists/")) {
      const list = state.playlists.find((x) => x.id === p.split("/")[2]);
      if (p.endsWith("/items")) {
        if (method === "GET")
          return state.denyPlaylist
            ? new Response("", { status: 403 })
            : Response.json(page(state.items.map((item) => ({ item }))));
        if (method === "POST") state.items.push(track(4));
        if (method === "DELETE")
          state.items = state.items.filter(
            (x) => !x || x.uri !== body.items[0].uri,
          );
        if (method === "PUT") {
          const [moved] = state.items.splice(body.range_start, 1);
          state.items.splice(body.insert_before, 0, moved);
        }
      } else if (method === "GET") return Response.json(list);
      else if (method === "PUT") Object.assign(list, body);
      return new Response("V-test-acknowledgement");
    }
    if (p === "/me/tracks" || p === "/me/top/tracks")
      return Response.json(page([track(1), track(2)]));
    if (p === "/me/albums") return Response.json(page([{ album }]));
    if (p === "/me/shows") return Response.json(page([{ show }]));
    if (p === "/me/episodes") return Response.json(page([{ item: episode }]));
    if (p === "/me/following")
      return Response.json({ artists: page([artist]) });
    if (p === "/me/top/artists") return Response.json(page([artist]));
    if (p === "/me/player/recently-played")
      return Response.json({
        ...page([{ track: track(1) }]),
        next: url.searchParams.has("before")
          ? null
          : "https://api.spotify.com/v1/me/player/recently-played?before=100",
        cursors: { before: "100", after: "200" },
      });
    if (p === "/albums/album1") return Response.json(album);
    if (p === "/albums/album1/tracks") return Response.json(page([track(4)]));
    if (p === "/artists/artist1") return Response.json(artist);
    if (p === "/artists/artist1/albums") return Response.json(page([album]));
    if (p === "/shows/show1") return Response.json(show);
    if (p === "/shows/show1/episodes") return Response.json(page([episode]));
    if (p === "/episodes/episode1") return Response.json(episode);
    if (method !== "GET") {
      if (p === "/me/player/pause") state.playing = false;
      if (p === "/me/player/play") {
        state.playing = true;
        if (body?.uris)
          state.index = Number(body.uris[0].replace(/.*track/, "")) || 1;
      }
      if (p === "/me/player/next") state.index++;
      if (p === "/me/player/previous") state.index--;
      if (p === "/me/player/shuffle")
        state.shuffle = url.searchParams.get("state") === "true";
      if (p === "/me/player/repeat")
        state.repeat = url.searchParams.get("state");
      if (p === "/me/player/seek")
        state.progress = Number(url.searchParams.get("position_ms"));
      if (p === "/me/player/volume")
        state.volume = Number(url.searchParams.get("volume_percent"));
      if (p === "/me/library") state.liked = method === "PUT";
      if (p === "/me/player/queue") state.queue.push(track(4));
      if (p === "/me/player") state.device = body.device_ids[0];
      return new Response("V-test-acknowledgement");
    }
    throw Error("Unhandled fixture " + method + " " + p);
  }
  return { state, fetcher };
}
