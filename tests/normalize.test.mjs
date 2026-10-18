import test from "node:test";
import assert from "node:assert/strict";
import { normalize, external } from "../src/api.mjs";
test("catalog tracks keep their identity instead of becoming their nested album", () => {
  const track = {
    id: "song",
    type: "track",
    uri: "spotify:track:song",
    name: "Moonlit",
    album: { id: "album", name: "Sky" },
  };
  assert.equal(normalize(track).id, "song");
  assert.equal(normalize({ item: track }).id, "song");
  assert.equal(normalize({ track }).id, "song");
  assert.equal(normalize({ ...track, is_local: true }), null);
  assert.equal(normalize(null), null);
});
test("saved content wrappers and simplified album tracks normalize safely", () => {
  const album = { id: "album", type: "album", name: "Sky" };
  assert.equal(normalize({ album }).type, "album");
  assert.equal(
    normalize({ episode: { id: "episode", type: "episode" } }).type,
    "episode",
  );
  const track = { id: "song", type: "track", uri: "spotify:track:song" };
  assert.deepEqual(normalize(track, album).album, album);
  assert.equal(
    external({ external_urls: { spotify: "https://evil.example" } }),
    null,
  );
});
