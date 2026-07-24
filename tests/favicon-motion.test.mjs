import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = await readFile(
  path.join(root, "assets", "favicon-motion.js"),
  "utf8",
);

function mediaQuery(initialMatches) {
  const listeners = new Set();
  return {
    matches: initialMatches,
    addEventListener(type, listener) {
      if (type === "change") listeners.add(listener);
    },
    addListener(listener) {
      listeners.add(listener);
    },
    setMatches(matches) {
      this.matches = matches;
      for (const listener of listeners) listener({ matches });
    },
  };
}

async function createHarness({
  dark = false,
  hidden = false,
  reduced = false,
  failedFrame = "",
} = {}) {
  const iconAttributes = new Map([
    ["href", "favicon.svg?v=3"],
    ["type", "image/svg+xml"],
  ]);
  const documentListeners = new Map();
  const windowListeners = new Map();
  const frameTimers = new Map();
  const reducedMotion = mediaQuery(reduced);
  const darkMode = mediaQuery(dark);
  let nextFrameTimer = 1;

  const icon = {
    getAttribute(name) {
      return iconAttributes.get(name) ?? null;
    },
    setAttribute(name, value) {
      iconAttributes.set(name, value);
    },
  };

  const document = {
    hidden,
    querySelector() {
      return icon;
    },
    addEventListener(type, listener) {
      documentListeners.set(type, listener);
    },
  };

  const window = {
    matchMedia(query) {
      return query.includes("reduced-motion") ? reducedMotion : darkMode;
    },
    setTimeout(callback, delay) {
      const identifier = nextFrameTimer;
      nextFrameTimer += 1;
      frameTimers.set(identifier, { callback, delay });
      return identifier;
    },
    clearTimeout(identifier) {
      frameTimers.delete(identifier);
    },
    addEventListener(type, listener) {
      windowListeners.set(type, listener);
    },
  };

  class FakeImage {
    set src(value) {
      this.value = value;
      if (failedFrame && value.includes(failedFrame)) this.onerror?.();
      else this.onload?.();
    }
  }

  vm.runInNewContext(source, {
    Array,
    document,
    Image: FakeImage,
    Math,
    Promise,
    window,
  });
  await new Promise((resolve) => setImmediate(resolve));

  return {
    darkMode,
    document,
    reducedMotion,
    get href() {
      return iconAttributes.get("href");
    },
    get pendingFrameTimers() {
      return frameTimers.size;
    },
    get type() {
      return iconAttributes.get("type");
    },
    async dispatchDocument(type) {
      documentListeners.get(type)?.();
      await new Promise((resolve) => setImmediate(resolve));
    },
    async dispatchWindow(type) {
      windowListeners.get(type)?.();
      await new Promise((resolve) => setImmediate(resolve));
    },
    runNextFrame() {
      const [identifier, timer] = frameTimers.entries().next().value;
      frameTimers.delete(identifier);
      assert.equal(timer.delay, 500);
      timer.callback();
    },
  };
}

test("favicon motion starts with the matching theme and advances frames", async () => {
  const light = await createHarness();
  assert.equal(light.href, "assets/favicon/motion-light-0.png?v=3");
  assert.equal(light.type, "image/png");
  assert.equal(light.pendingFrameTimers, 1);
  light.runNextFrame();
  assert.equal(light.href, "assets/favicon/motion-light-1.png?v=3");

  const dark = await createHarness({ dark: true });
  assert.equal(dark.href, "assets/favicon/motion-dark-0.png?v=3");
  assert.equal(dark.type, "image/png");
});

test("hidden pages stop and restore the adaptive static favicon", async () => {
  const harness = await createHarness();
  harness.document.hidden = true;
  await harness.dispatchDocument("visibilitychange");

  assert.equal(harness.href, "favicon.svg?v=3");
  assert.equal(harness.type, "image/svg+xml");
  assert.equal(harness.pendingFrameTimers, 0);
});

test("reduced motion never starts the favicon loop", async () => {
  const harness = await createHarness({ reduced: true });
  assert.equal(harness.href, "favicon.svg?v=3");
  assert.equal(harness.type, "image/svg+xml");
  assert.equal(harness.pendingFrameTimers, 0);
});

test("failed frame preloads degrade to the static favicon", async () => {
  const harness = await createHarness({ failedFrame: "motion-light-4.png" });
  assert.equal(harness.href, "favicon.svg?v=3");
  assert.equal(harness.type, "image/svg+xml");
  assert.equal(harness.pendingFrameTimers, 0);
});

test("page exit restores the static favicon", async () => {
  const harness = await createHarness();
  await harness.dispatchWindow("pagehide");
  assert.equal(harness.href, "favicon.svg?v=3");
  assert.equal(harness.type, "image/svg+xml");
  assert.equal(harness.pendingFrameTimers, 0);
});
