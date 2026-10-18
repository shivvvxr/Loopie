import http from "node:http";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium } from "playwright";
import { createHandler } from "../server/app.mjs";
import { createFixture } from "../tests/fixture.mjs";
import worker from "../dist/server/index.js";
const fixture = createFixture(),
  api = createHandler({ fetcher: fixture.fetcher }),
  env = { SESSION_SECRET: "ab".repeat(32) };
const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = new Request("http://" + req.headers.host + req.url, {
      method: req.method,
      headers: req.headers,
      ...(["GET", "HEAD"].includes(req.method)
        ? {}
        : { body: Buffer.concat(chunks) }),
    });
    const response = await (req.url.startsWith("/api/") ||
    req.url.startsWith("/auth/")
      ? api(request, env)
      : worker.fetch(request, env, {}));
    res.statusCode = response.status;
    for (const [k, v] of response.headers)
      if (k !== "set-cookie") res.setHeader(k, v);
    const cookies = response.headers.getSetCookie();
    if (cookies.length) res.setHeader("Set-Cookie", cookies);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    res.statusCode = 500;
    res.end(e.message);
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ ...(process.env.LOOPIE_BROWSER === "chromium" ? {} : { channel: "msedge" }), headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const button = (name) => page.getByRole("button", { name, exact: true });
  await page.goto(origin);
  await page
    .getByRole("heading", { name: "For you, dear ♡" })
    .waitFor();
  assert.equal(await button("Play").isEnabled(), false);
  assert.equal(await page.locator(".transport button").count(), 6);
  await button("Settings").click();
  await page
    .getByLabel("Spotify Client ID", { exact: true })
    .fill("a".repeat(32));
  await page.route("https://accounts.spotify.com/authorize*", (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      status: 302,
      headers: {
        location:
          origin +
          "/auth/spotify/callback?code=fixture&state=" +
          url.searchParams.get("state"),
      },
    });
  });
  await button("Log in with Spotify").click();
  await page
    .getByRole("heading", { name: "Test moon 1", exact: true })
    .waitFor();
  assert.equal(await page.evaluate(() => document.cookie), "");
  assert.ok(
    !(await page.evaluate(() => JSON.stringify({ ...localStorage }))).includes(
      "private-",
    ),
  );
  const cookies = await context.cookies();
  assert.ok(cookies.find((c) => c.name === "daisy_session")?.httpOnly);
  const row = await page
    .locator(".transport button")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
  assert.ok(Math.max(...row) - Math.min(...row) <= 5, "controls in one row");
  await button("Pause").click();
  await button("Play").waitFor();
  await button("Play").click();
  await button("Pause").waitFor();
  await button("Next song").click();
  await page
    .getByRole("heading", { name: "Test moon 2", exact: true })
    .waitFor();
  await button("Previous song").click();
  await page
    .getByRole("heading", { name: "Test moon 1", exact: true })
    .waitFor();
  await button("Turn shuffle on").click();
  await button("Turn shuffle off").waitFor();
  await button("Repeat: off").click();
  await button("Repeat: context").waitFor();
  await button("Add to liked songs").click();
  await button("Remove from liked songs").waitFor();
  let releaseContains;
  fixture.state.containsGate = new Promise(
    (resolve) => (releaseContains = resolve),
  );
  fixture.state.index = 2;
  fixture.state.liked = false;
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await page
    .getByRole("heading", { name: "Test moon 2", exact: true })
    .waitFor();
  assert.equal(
    await button("Add to liked songs").isEnabled(),
    false,
    "heart waits for the new track status",
  );
  releaseContains();
  await page.waitForFunction(
    () => !document.querySelector('[aria-label="Add to liked songs"]').disabled,
  );
  await button("Search").click();
  await page.getByRole("complementary", { name: "Now playing", exact: true }).waitFor();
  await button("Pause from mini player").click();
  await button("Play from mini player").waitFor();
  assert.equal(fixture.state.playing, false);
  await button("Play from mini player").click();
  await button("Pause from mini player").waitFor();
  for (const width of [320, 375, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await page.evaluate(() => {
      const mini = document.querySelector(".mini-player").getBoundingClientRect();
      const nav = document.querySelector(".bottom-nav").getBoundingClientRect();
      return { left: mini.left, right: mini.right, bottom: mini.bottom, navTop: nav.top, width: innerWidth };
    });
    assert.ok(bounds.left >= 0 && bounds.right <= bounds.width && bounds.bottom <= bounds.navTop, "mini player fits above navigation at " + width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Search Spotify", { exact: true }).fill("moon");
  await button("Go").click();
  await button("Play Test moon 4").waitFor();
  await button("Actions for Test moon 4").click();
  await button("Add to queue").click();
  await page
    .getByRole("status")
    .getByText(/Added to your queue/)
    .waitFor();
  assert.equal(fixture.state.queue.length, 3);
  await page.screenshot({ path: "test-results/mobile-note.png", fullPage: true });
  await button("Actions for Test moon 4").click();
  await button("Add to playlist").click();
  await button("My test playlist").click();
  await page
    .getByRole("status")
    .getByText(/Added to My test playlist/)
    .waitFor();
  assert.equal(fixture.state.items.length, 3);
  fixture.state.items.unshift(null);
  await button("Playlists").click();
  await button("Open My test playlist").click();
  await page
    .getByRole("heading", { name: "My test playlist", exact: true })
    .waitFor();
  await button("Move Test moon 2 up").click();
  await page
    .getByRole("status")
    .getByText(/Playlist order updated/)
    .waitFor();
  assert.equal(fixture.state.items[1].id, "track2");
  assert.equal(
    fixture.state.calls.findLast(
      (c) => c.method === "PUT" && c.path.endsWith("/items"),
    ).body.range_start,
    2,
    "hidden rows retain their Spotify position",
  );
  page.on("dialog", (dialog) => dialog.accept());
  await button("Remove Test moon 2").click();
  await page
    .getByRole("status")
    .getByText(/Playlist updated/)
    .waitFor();
  assert.equal(fixture.state.items.filter(Boolean).length, 2);
  await button("Edit playlist").click();
  await page.getByLabel("Name", { exact: true }).fill("Edited moon playlist");
  await button("Save playlist").click();
  await page
    .getByRole("heading", { name: "Edited moon playlist", exact: true })
    .waitFor();
  await button("Library").click();
  await button("Create playlist").click();
  await page.getByLabel("Name", { exact: true }).fill("A brand new moon");
  await button("Create playlist").last().click();
  await page
    .getByRole("heading", { name: "A brand new moon", exact: true })
    .waitFor();
  assert.equal(fixture.state.playlists.length, 2);
  await button("Library").click();
  for (const name of [
    "Albums",
    "Artists",
    "Podcasts",
    "Saved episodes",
    "Top songs",
    "Top artists",
  ]) {
    await button(name).click();
    await page.waitForFunction(
      () => document.querySelectorAll(".item-row").length > 0,
    );
  }
  await button("Recent").click();
  await button("Load more").waitFor();
  await button("Load more").click();
  await page.waitForFunction(
    () => document.querySelectorAll(".item-row").length === 2,
  );
  assert.ok(
    fixture.state.calls.some(
      (c) =>
        c.path === "/me/player/recently-played" &&
        c.query.includes("before=100"),
    ),
    "history pages backward using the before cursor",
  );
  await button("Queue").click();
  await page
    .getByRole("heading", { name: "Your queue", exact: true })
    .waitFor();
  await button("Play Test moon 4").waitFor();
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector(".main-content")).opacity === "1",
  );
  await page.screenshot({
    path: "test-results/mobile-queue.png",
    fullPage: true,
  });
  fixture.state.rateLimit = true;
  await button("Refresh queue").click();
  await page.getByRole("alert").first().waitFor();
  assert.equal(await button("Refresh queue").isEnabled(), false);
  await page.waitForTimeout(2200);
  await button("Player").click();
  if (await button("Dismiss error").count())
    await button("Dismiss error").click();
  await page.getByRole("button", { name: /Test phone/ }).click();
  await page.getByRole("button", { name: /Test speaker/ }).click();
  await page.getByRole("slider", { name: "Device volume" }).waitFor();
  const volume = page.getByRole("slider", { name: "Device volume" });
  await volume.focus();
  await volume.press("ArrowLeft");
  await page.waitForFunction(() =>
    document.querySelector(".volume-control")?.textContent.includes("64%"),
  );
  assert.equal(fixture.state.volume, 64);
  await page.screenshot({
    path: "test-results/mobile-player.png",
    fullPage: true,
  });
  for (const width of [320, 375, 430]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
      "no overflow at " + width,
    );
    const ys = await page
      .locator(".transport button")
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    assert.ok(Math.max(...ys) - Math.min(...ys) <= 5);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await button("Settings").click();
  await button("Lilac dusk").click();
  await page.getByLabel("Gentle animations", { exact: false }).uncheck();
  await page.reload();
  await button("Settings").click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "lilac");
  assert.equal(await page.locator("html").getAttribute("data-motion"), "off");
  assert.equal(await page.locator(".bow").evaluate(el => getComputedStyle(el).animationName), "none");
  assert.equal(
    (await page.request.get(origin + "/manifest.webmanifest")).status(),
    200,
  );
  assert.equal((await page.request.get(origin + "/sw.js")).status(), 200);
  const cachedUrls = await page.evaluate(async () => {
    const names = await caches.keys();
    return (
      await Promise.all(
        names.map(async (name) =>
          (await (await caches.open(name)).keys()).map(
            (request) => request.url,
          ),
        ),
      )
    ).flat();
  });
  assert.ok(
    cachedUrls.every(
      (url) => !url.includes("/api/") && !url.includes("/auth/"),
    ),
    "private responses never cached",
  );
  await button("Sign out & forget session").click();
  await button("Player").click();
  await page
    .getByRole("heading", { name: "For you, dear ♡" })
    .waitFor();
  assert.equal(await button("Play").isEnabled(), false);
  assert.equal(await page.locator(".mini-player").count(), 0);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await button("Settings").click();
  await page
    .getByRole("heading", { name: "Your little corner", exact: true })
    .waitFor();
  assert.equal(
    await page.locator("body").evaluate((el) => el.scrollWidth > innerWidth),
    false,
  );
  await context.setOffline(false);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Mobile OAuth/HttpOnly tokens, real backend fixture transport, search, queue, playlist add/create/edit/remove/reorder, devices/volume, 320–430px layout, saved appearance, PWA assets and logout.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}

