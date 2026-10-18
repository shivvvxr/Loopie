export class ApiError extends Error {
  constructor(message, status, retryAfter) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
let waitUntil = 0;
async function post(route, body) {
  let response;
  try {
    response = await fetch(route, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("You are offline. Reconnect to use Spotify.", 0);
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new ApiError("The server could not respond. Please retry.", 502);
  }
  if (!response.ok) {
    if (response.status === 429)
      waitUntil = Date.now() + (result.retryAfter || 5) * 1000;
    if (response.status === 401)
      window.dispatchEvent(new Event("daisy-disconnected"));
    throw new ApiError(
      result.error || "Spotify could not complete the action.",
      response.status,
      result.retryAfter,
    );
  }
  return result;
}
export async function spotify(path, { method = "GET", body } = {}) {
  if (Date.now() < waitUntil)
    throw new ApiError(
      "Please wait for Spotify before trying again.",
      429,
      Math.ceil((waitUntil - Date.now()) / 1000),
    );
  return (
    await post("/api/spotify", { path, method, ...(body ? { body } : {}) })
  ).data;
}
export const auth = {
  status: async () => {
    const response = await fetch("/api/auth/status", { cache: "no-store" });
    if (!response.ok) throw Error("Cannot reach the app. Please retry.");
    return response.json();
  },
  login: async (clientId) => {
    const { url } = await post("/api/auth/login", { clientId });
    location.assign(url);
  },
  logout: () => post("/api/auth/logout", {}),
};
export function normalize(item, parent) {
  const value = item?.type
    ? item
    : item?.track ||
      item?.item ||
      item?.album ||
      item?.show ||
      item?.episode ||
      item;
  if (!value || !value.id || value.is_local) return null;
  return {
    ...value,
    ...(parent && !value.album && value.type === "track"
      ? { album: parent }
      : {}),
  };
}
export const artwork = (item) =>
  item?.images?.[0]?.url ||
  item?.album?.images?.[0]?.url ||
  item?.show?.images?.[0]?.url;
export const byline = (item) =>
  item?.artists?.map((x) => x.name).join(", ") ||
  item?.owner?.display_name ||
  item?.publisher ||
  {
    playlist: "Playlist",
    album: "Album",
    artist: "Artist",
    show: "Podcast",
    episode: "Episode",
  }[item?.type] ||
  "Spotify";
export const time = (ms) =>
  `${Math.floor(Math.max(0, ms || 0) / 60000)}:${String(Math.floor(Math.max(0, ms || 0) / 1000) % 60).padStart(2, "0")}`;
export const external = (item) => {
  try {
    const url = new URL(item?.external_urls?.spotify);
    return url.origin === "https://open.spotify.com" ? url.href : null;
  } catch {
    return null;
  }
};
