import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseURL = process.env.TEST_URL || "http://localhost:5173";
const output = "output/playwright";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
const results = [];
const state = (page) =>
  page.evaluate(() => JSON.parse(window.render_game_to_text()));
async function settled(page) {
  await page.waitForTimeout(220);
}
async function key(page, key, duration = 70) {
  await page.keyboard.down(key);
  await page.waitForTimeout(duration);
  await page.keyboard.up(key);
  await settled(page);
}
async function resume(page) {
  if ((await state(page)).mode === "menu") {
    await page.locator('[data-menu="resume"]').click();
    await settled(page);
  }
}
function watch(page) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
}
async function check(name, action) {
  await action();
  results.push(name);
  console.log(`PASS ${name}`);
}

try {
  const viewportContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const viewportPage = await viewportContext.newPage();
  watch(viewportPage);
  await viewportPage.goto(baseURL);
  await viewportPage.waitForFunction(() => typeof window.render_game_to_text === "function");
  await check("window blur saves and clears held input without pausing", async () => {
    await viewportPage.keyboard.down("ArrowRight");
    await viewportPage.waitForTimeout(70);
    const before = await viewportPage.evaluate(() => {
      window.dispatchEvent(new Event("blur"));
      return JSON.parse(window.render_game_to_text());
    });
    assert.equal((await state(viewportPage)).mode, "play", "Clicking elsewhere keeps play active");
    await viewportPage.waitForTimeout(450);
    await viewportPage.keyboard.up("ArrowRight");
    const after = await state(viewportPage);
    assert.deepEqual(after.player, before.player, "Held keyboard input is cleared on blur");
    assert.equal(after.steps, before.steps);
    const saved = await viewportPage.evaluate(() => JSON.parse(localStorage.getItem("pmd-field-save-v1")));
    assert.deepEqual(saved.player, before.player);
    assert.equal(saved.steps, before.steps);
  });
  await check("canvas fills every viewport without page scrolling", async () => {
    for (const [width, height] of [[1440,900], [960,540], [390,844], [640,360]]) {
      await viewportPage.setViewportSize({ width, height });
      await settled(viewportPage);
      const bounds = await viewportPage.locator("#game").boundingBox();
      assert.deepEqual(bounds, { x: 0, y: 0, width, height }, `Canvas fills ${width}x${height}`);
      assert.ok(await viewportPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight));
      const view = await state(viewportPage);
      const camera = view.camera;
      assert.ok(camera && camera.scale > 0, "World camera is exposed");
      assert.ok(Math.abs(camera.width / camera.height - width / height) < 0.01, "World view preserves viewport aspect ratio");
      const playerX = view.player.x * 32 + 16, playerY = view.player.y * 32 + 16;
      assert.ok(playerX >= camera.x && playerX <= camera.x + camera.width, "Camera keeps explorer visible horizontally");
      assert.ok(playerY >= camera.y && playerY <= camera.y + camera.height, "Camera keeps explorer visible vertically");
    }
  });
  await check("pause journal keeps connection and save details accessible", async () => {
    await key(viewportPage, "Escape");
    await viewportPage.locator('[data-menu="journal"]').click();
    assert.equal(await viewportPage.locator("#journal-panel").isVisible(), true);
    assert.equal(await viewportPage.locator("#copy-diagnostics").isVisible(), true);
    assert.equal(await viewportPage.locator("#save-status").isVisible(), true);
    await viewportPage.screenshot({ path: `${output}/journal-menu.png` });
    await viewportPage.locator("#journal-back").click();
    assert.equal(await viewportPage.locator('[data-menu="resume"]').isVisible(), true);
    await resume(viewportPage);
  });
  await viewportContext.close();
  const diagnosticContext = await browser.newContext();
  await diagnosticContext.addInitScript(() => {
    window.__odinPad = {
      id: "Odin Controller (Vendor: 2020 Product: 0111)",
      index: 0,
      connected: true,
      mapping: "",
      timestamp: 0,
      axes: [0, 0, 0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({
        pressed: false,
        touched: false,
        value: 0,
      })),
    };
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => [window.__odinPad],
    });
  });
  const diagnosticPage = await diagnosticContext.newPage();
  watch(diagnosticPage);
  await diagnosticPage.goto(baseURL);
  await diagnosticPage.waitForFunction(
    () => typeof window.render_game_to_text === "function",
  );
  await settled(diagnosticPage);
  await check(
    "Odin diagnostics capture raw stick and shoulder history",
    async () => {
      assert.ok(
        (await state(diagnosticPage)).inputDiagnostics,
        "Input diagnostics are exposed",
      );
      await diagnosticPage.evaluate(() => {
        window.__odinPad.axes[0] = -0.85;
        window.__odinPad.axes[1] = 0.75;
        window.__odinPad.buttons[4] = {
          pressed: true,
          touched: true,
          value: 1,
        };
        window.__odinPad.buttons[5] = {
          pressed: true,
          touched: true,
          value: 1,
        };
      });
      await settled(diagnosticPage);
      const active = (await state(diagnosticPage)).inputDiagnostics;
      assert.equal(active.apiAvailable, true);
      assert.equal(active.secureContext, true);
      assert.equal(active.error, null);
      assert.equal(
        active.devices[0].id,
        "Odin Controller (Vendor: 2020 Product: 0111)",
      );
      assert.equal(active.devices[0].mapping, "");
      assert.equal(active.devices[0].buttonsCount, 17);
      assert.equal(active.devices[0].axes[0], -0.85);
      assert.equal(active.devices[0].axes[1], 0.75);
      assert.ok(active.devices[0].activeButtons.includes(4));
      assert.ok(active.devices[0].activeButtons.includes(5));
      await diagnosticPage.evaluate(() => {
        window.__odinPad.axes.fill(0);
        window.__odinPad.buttons[4] = {
          pressed: false,
          touched: false,
          value: 0,
        };
        window.__odinPad.buttons[5] = {
          pressed: false,
          touched: false,
          value: 0,
        };
      });
      await settled(diagnosticPage);
      const released = (await state(diagnosticPage)).inputDiagnostics
        .devices[0];
      assert.deepEqual(released.activeButtons, []);
      assert.ok(released.seenButtons.includes(4));
      assert.ok(released.seenButtons.includes(5));
      assert.ok(released.axisRanges[0].min <= -0.85);
      assert.ok(released.axisRanges[1].max >= 0.75);
      await key(diagnosticPage, "ArrowRight");
      await diagnosticPage.evaluate(() =>
        document.dispatchEvent(
          new WheelEvent("wheel", { deltaY: 20, bubbles: true }),
        ),
      );
      const diagnostics = (await state(diagnosticPage)).inputDiagnostics;
      assert.deepEqual(diagnostics.lastKey, {
        key: "ArrowRight",
        code: "ArrowRight",
      });
      assert.ok(diagnostics.wheelEvents >= 1);
    },
  );
  await check(
    "gamepad API errors are visible instead of swallowed",
    async () => {
      await diagnosticPage.evaluate(() =>
        Object.defineProperty(navigator, "getGamepads", {
          configurable: true,
          value: () => {
            throw new DOMException(
              "Gamepad access denied by test",
              "SecurityError",
            );
          },
        }),
      );
      await settled(diagnosticPage);
      assert.match(
        (await state(diagnosticPage)).inputDiagnostics.error,
        /Gamepad access denied by test/,
      );
      if ((await state(diagnosticPage)).mode === "play") await key(diagnosticPage, "Escape");
      await diagnosticPage.locator('[data-menu="journal"]').click();
      assert.match(
        await diagnosticPage.locator("body").innerText(),
        /Gamepad access denied by test/,
      );
    },
  );
  await diagnosticContext.close();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  watch(page);
  await page.goto(baseURL);
  await page.waitForFunction(
    () => typeof window.render_game_to_text === "function",
  );
  await settled(page);
  await page.screenshot({
    path: `${output}/desktop-initial.png`,
    fullPage: true,
  });

  await check("keyboard movement, collision, pause and resume", async () => {
    let before = await state(page);
    assert.equal(before.mode, "play");
    assert.deepEqual(
      { x: before.player.x, y: before.player.y },
      { x: 3, y: 5 },
    );
    await key(page, "ArrowRight", 500);
    let after = await state(page);
    assert.ok(after.player.x > before.player.x, "Holding right moves continuously");
    assert.ok(after.steps > before.steps);
    await key(page, "ArrowLeft", 2200);
    after = await state(page);
    assert.ok(after.player.x > 0.5, "Collision body cannot cross left boundary");
    await key(page, "ArrowUp", 2200);
    assert.ok((await state(page)).player.y > 0.5, "Collision body cannot cross top boundary");
    await key(page, "Escape");
    before = await state(page);
    assert.equal(before.mode, "menu");
    await key(page, "ArrowRight", 300);
    after = await state(page);
    assert.deepEqual(after.player, before.player, "Movement freezes in menu");
    await page.screenshot({
      path: `${output}/desktop-menu.png`,
      fullPage: true,
    });
    await resume(page);
    assert.equal((await state(page)).mode, "play");
    await key(page, "Escape");
    await key(page, "Enter");
    assert.equal(
      (await state(page)).mode,
      "play",
      "Enter activates focused resume",
    );
  });

  await check("local save survives reload", async () => {
    await key(page, "ArrowRight");
    const before = await state(page);
    await key(page, "Escape");
    await page.locator('[data-menu="save"]').click();
    await settled(page);
    await page.reload();
    await page.waitForFunction(
      () => typeof window.render_game_to_text === "function",
    );
    const after = await state(page);
    assert.equal(after.player.x, before.player.x);
    assert.equal(after.player.y, before.player.y);
    assert.equal(after.steps, before.steps);
    await resume(page);
    await page.screenshot({
      path: `${output}/desktop-game.png`,
      fullPage: true,
    });
  });

  await check(
    "visibility loss pauses and requires explicit resume",
    async () => {
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          get: () => true,
        });
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      assert.equal((await state(page)).mode, "menu");
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          get: () => false,
        });
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await settled(page);
      assert.equal((await state(page)).mode, "menu");
      await resume(page);
    },
  );

  await check("save export and import preserve progress", async () => {
    const before = await state(page);
    await key(page, "Escape");
    const downloading = page.waitForEvent("download");
    await page.locator('[data-menu="export"]').click();
    const download = await downloading;
    const content = await readFile(await download.path());
    const saved = JSON.parse(content.toString());
    assert.equal(saved.player.x, before.player.x);
    assert.equal(saved.player.y, before.player.y);
    await resume(page);
    await key(page, "ArrowRight");
    await key(page, "Escape");
    await page.locator("#import-file").setInputFiles({
      name: "restore.json",
      mimeType: "application/json",
      buffer: content,
    });
    await settled(page);
    assert.deepEqual((await state(page)).player, before.player);
    assert.equal((await state(page)).steps, before.steps);
    await resume(page);
  });

  await check("service worker allows offline reload", async () => {
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise((resolve) =>
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            resolve,
            { once: true },
          ),
        );
      }
    });
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(
      () => typeof window.render_game_to_text === "function",
    );
    assert.ok(["play", "menu"].includes((await state(page)).mode));
    await context.setOffline(false);
  });
  await context.close();

  const gamepadContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await gamepadContext.addInitScript(() => {
    window.__testPad = {
      id: "Test standard gamepad",
      index: 0,
      connected: true,
      mapping: "standard",
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({
        pressed: false,
        touched: false,
        value: 0,
      })),
    };
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => (window.__testPad ? [window.__testPad] : []),
    });
  });
  const padPage = await gamepadContext.newPage();
  watch(padPage);
  await padPage.goto(baseURL);
  await padPage.waitForFunction(
    () => typeof window.render_game_to_text === "function",
  );
  await settled(padPage);
  await resume(padPage);
  await check("Thor gamepad A confirms and B returns", async () => {
    async function button(index) {
      await padPage.evaluate((index) => {
        window.__testPad.buttons[index] = {
          pressed: true,
          touched: true,
          value: 1,
        };
      }, index);
      await padPage.waitForTimeout(130);
      await padPage.evaluate((index) => {
        window.__testPad.buttons[index] = {
          pressed: false,
          touched: false,
          value: 0,
        };
      }, index);
      await settled(padPage);
    }
    await button(9);
    assert.equal((await state(padPage)).mode, "menu");
    await button(13);
    await button(13);
    assert.equal(
      await padPage.locator("button.selected").getAttribute("data-menu"),
      "controls",
    );
    await button(1);
    assert.equal(
      (await state(padPage)).submenu,
      true,
      "Physical A opens controls",
    );
    await button(0);
    assert.equal(
      (await state(padPage)).submenu,
      false,
      "Physical B returns to main menu",
    );
    assert.equal((await state(padPage)).mode, "menu");
    await button(1);
    assert.equal((await state(padPage)).mode, "play", "Physical A resumes");
    await button(9);
    await button(0);
    assert.equal(
      (await state(padPage)).mode,
      "play",
      "Physical B closes pause menu",
    );
  });
  await check("standard gamepad d-pad and analog deadzone", async () => {
    const before = await state(padPage);
    await padPage.evaluate(() => {
      window.__testPad.buttons[15] = { pressed: true, touched: true, value: 1 };
    });
    await padPage.waitForTimeout(80);
    await padPage.evaluate(() => {
      window.__testPad.buttons[15] = {
        pressed: false,
        touched: false,
        value: 0,
      };
    });
    await settled(padPage);
    const after = await state(padPage);
    assert.ok(after.player.x > before.player.x, "D-pad moves right");
    await padPage.evaluate(() => {
      window.__testPad.axes[0] = 0.08;
    });
    await padPage.waitForTimeout(500);
    assert.deepEqual(
      (await state(padPage)).player,
      after.player,
      "Stick drift below deadzone ignored",
    );
    await padPage.evaluate(() => {
      window.__testPad.axes[0] = -0.8;
    });
    await padPage.waitForTimeout(80);
    await padPage.evaluate(() => {
      window.__testPad.axes[0] = 0;
    });
    await settled(padPage);
    assert.ok((await state(padPage)).player.x < after.player.x, "Analog stick moves left");
  });
  await check("gamepad remapping works and persists", async () => {
    await key(padPage, "Escape");
    await padPage.locator('[data-menu="controls"]').click();
    await padPage.locator('[data-binding="right"]').click();
    await settled(padPage);
    await padPage.evaluate(() => {
      window.__testPad.buttons[3] = { pressed: true, touched: true, value: 1 };
    });
    await padPage.waitForTimeout(80);
    await padPage.evaluate(() => {
      window.__testPad.buttons[3] = {
        pressed: false,
        touched: false,
        value: 0,
      };
    });
    await settled(padPage);
    assert.deepEqual((await state(padPage)).mapping.right, {
      type: "button",
      index: 3,
    });
    await padPage.locator("#controls-back").click();
    await resume(padPage);
    const before = await state(padPage);
    await padPage.evaluate(() => {
      window.__testPad.buttons[3] = { pressed: true, touched: true, value: 1 };
    });
    await padPage.waitForTimeout(80);
    await padPage.evaluate(() => {
      window.__testPad.buttons[3] = {
        pressed: false,
        touched: false,
        value: 0,
      };
    });
    await settled(padPage);
    assert.ok((await state(padPage)).player.x > before.player.x, "Remapped button moves right");
    await padPage.reload();
    await padPage.waitForFunction(
      () => typeof window.render_game_to_text === "function",
    );
    await settled(padPage);
    assert.deepEqual((await state(padPage)).mapping.right, {
      type: "button",
      index: 3,
    });
  });
  await check("gamepad disconnect pauses", async () => {
    await padPage.evaluate(() => {
      const pad = window.__testPad;
      window.__testPad = null;
      const event = new Event("gamepaddisconnected");
      Object.defineProperty(event, "gamepad", { value: pad });
      window.dispatchEvent(event);
    });
    await settled(padPage);
    assert.equal((await state(padPage)).mode, "menu");
  });
  await gamepadContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 960, height: 540 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const mobilePage = await mobileContext.newPage();
  watch(mobilePage);
  await mobilePage.goto(baseURL);
  await mobilePage.waitForFunction(
    () => typeof window.render_game_to_text === "function",
  );
  await check("mobile layout fits the viewport", async () => {
    assert.ok(
      await mobilePage.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    const before = await state(mobilePage);
    const touchButton = await mobilePage.locator('[data-action="right"]').boundingBox();
    await mobilePage.mouse.move(touchButton.x + touchButton.width / 2, touchButton.y + touchButton.height / 2);
    await mobilePage.mouse.down();
    await mobilePage.waitForTimeout(180);
    await mobilePage.mouse.up();
    await settled(mobilePage);
    assert.ok((await state(mobilePage)).player.x > before.player.x, "Held touch d-pad moves continuously");
    await mobilePage.screenshot({
      path: `${output}/thor-game.png`,
      fullPage: true,
    });
    await key(mobilePage, "Escape");
    await mobilePage.screenshot({
      path: `${output}/thor-menu.png`,
      fullPage: true,
    });
  });
  await mobileContext.close();
  const portraitContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const portrait = await portraitContext.newPage();
  watch(portrait);
  await portrait.goto(baseURL);
  await portrait.waitForFunction(
    () => typeof window.render_game_to_text === "function",
  );
  await check("portrait layout and touch menu", async () => {
    assert.ok(
      await portrait.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await portrait.screenshot({
      path: `${output}/mobile-game.png`,
      fullPage: true,
    });
    await portrait.locator('#menu-toggle').tap();
    await settled(portrait);
    assert.equal((await state(portrait)).mode, "menu");
    await portrait.screenshot({
      path: `${output}/mobile-menu.png`,
      fullPage: true,
    });
  });
  await portraitContext.close();
  const compactContext = await browser.newContext({
    viewport: { width: 640, height: 360 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const compact = await compactContext.newPage();
  watch(compact);
  await compact.goto(baseURL);
  await compact.waitForFunction(
    () => typeof window.render_game_to_text === "function",
  );
  await check(
    "compact landscape keeps the full playfield above the fold",
    async () => {
      assert.ok(
        await compact.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      );
      const frame = await compact.locator(".game-frame").boundingBox();
      assert.ok(
        frame.y >= 0 && frame.y + frame.height <= 360,
        "Playfield is entirely in viewport",
      );
      await compact.screenshot({ path: `${output}/compact-game.png` });
      await compact.locator('#menu-toggle').tap();
      await settled(compact);
      assert.equal((await state(compact)).mode, "menu");
      await compact.screenshot({ path: `${output}/compact-menu.png` });
    },
  );
  await compactContext.close();
  const deniedContext = await browser.newContext();
  await deniedContext.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("Blocked", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException("Blocked", "SecurityError");
    };
  });
  const denied = await deniedContext.newPage();
  watch(denied);
  await denied.goto(baseURL);
  await denied.waitForFunction(
    () => typeof window.render_game_to_text === "function",
  );
  await check(
    "unavailable browser storage preserves play and export",
    async () => {
      assert.equal((await state(denied)).storage, false);
      await key(denied, "ArrowRight");
      const moved = (await state(denied)).player.x;
      assert.ok(moved > 3, "Movement works without browser storage");
      await key(denied, "Escape");
      const downloading = denied.waitForEvent("download");
      await denied.locator('[data-menu="export"]').click();
      const saved = JSON.parse(
        await readFile(await (await downloading).path(), "utf8"),
      );
      assert.equal(saved.player.x, moved);
      await denied.locator("#import-file").setInputFiles({
        name: "invalid.json",
        mimeType: "application/json",
        buffer: Buffer.from('{"version":1,"player":{"x":-99,"y":0}}'),
      });
      await settled(denied);
      assert.equal(
        (await state(denied)).player.x,
        moved,
        "Invalid import preserves state",
      );
    },
  );
  await deniedContext.close();
  await check("future save survives movement, menu, blur and reload until a valid import", async () => {
    const context = await browser.newContext();
    try {
      const original = JSON.stringify({ version: 3, progress: "future expedition" });
      await context.addInitScript(raw => {
        if (!sessionStorage.getItem("future-save-seeded")) {
          localStorage.setItem("pmd-field-save-v1", raw);
          sessionStorage.setItem("future-save-seeded", "true");
        }
      }, original);
      const page = await context.newPage();
      watch(page);
      await page.goto(baseURL);
      await page.waitForFunction(() => typeof window.render_game_to_text === "function");
      assert.equal((await state(page)).storage, false);
      await key(page, "ArrowRight", 600);
      await key(page, "Escape");
      await page.locator('[data-menu="save"]').click();
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      assert.equal(await page.evaluate(() => localStorage.getItem("pmd-field-save-v1")), original);
      await page.locator("#import-file").setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from("bad JSON") });
      await settled(page);
      assert.equal(await page.evaluate(() => localStorage.getItem("pmd-field-save-v1")), original);
      await page.reload();
      await page.waitForFunction(() => typeof window.render_game_to_text === "function");
      assert.equal(await page.evaluate(() => localStorage.getItem("pmd-field-save-v1")), original);
      const imported = { version: 1, player: { x: 3, y: 5 }, steps: 42, collected: [0], facing: "right" };
      await page.locator("#import-file").setInputFiles({ name: "valid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(imported)) });
      await settled(page);
      assert.equal((await state(page)).storage, true);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("pmd-field-save-v1")));
      assert.equal(saved.version, 2);
      assert.equal(saved.steps, 42);
      assert.deepEqual(saved.collected, [0]);
    } finally { await context.close(); }
  });
  assert.deepEqual(errors, [], "Browser console has no errors");
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ baseURL, passed: results, errors }, null, 2),
  );
  console.log(
    `${results.length} browser checks passed. Screenshots: ${output}`,
  );
} finally {
  await browser.close();
}
