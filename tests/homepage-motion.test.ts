import test from "node:test";
import assert from "node:assert/strict";
import { mountHomepageMotion } from "../packages/homepage/motion";

test("homepage motion reverses with scroll, honors preference changes, and cleans up", (t) => {
  const listeners = new Map<string, () => void>();
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  let disconnected = false;
  const preference = {
    matches: true,
    addEventListener: (_: string, callback: () => void) =>
      listeners.set("preference", callback),
    removeEventListener: () => listeners.delete("preference"),
  };
  const viewport = {
    innerHeight: 800,
    scrollY: 0,
    matchMedia: () => preference,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    addEventListener: (name: string, callback: () => void) =>
      listeners.set(name, callback),
    removeEventListener: (name: string) => listeners.delete(name),
  };
  for (const [name, value] of Object.entries({
    window: viewport,
    ResizeObserver: class {
      observe() {}
      disconnect() {
        disconnected = true;
      }
    },
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  const properties = new Map<string, string>();
  const element = {
    dataset: {} as Record<string, string>,
    offsetTop: 1100,
    offsetParent: { offsetTop: 100, offsetParent: null },
    style: {
      setProperty: (key: string, value: string) => properties.set(key, value),
      removeProperty: (key: string) => properties.delete(key),
    },
  };
  const root = {
    dataset: {} as Record<string, string>,
    querySelectorAll: () => [element],
  };
  const cleanup = mountHomepageMotion(root as unknown as HTMLElement);
  assert.equal(root.dataset.motion, undefined);
  listeners.get("scroll")!();
  assert.equal(frames.size, 0);

  preference.matches = false;
  listeners.get("preference")!();
  assert.equal(root.dataset.motion, "active");
  assert.equal(properties.get("--reveal-progress"), "0");
  viewport.scrollY = 700;
  listeners.get("scroll")!();
  listeners.get("scroll")!();
  assert.equal(frames.size, 1, "scroll events share a frame");
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  };
  flush();
  assert.equal(properties.get("--reveal-progress"), "0.5");
  viewport.scrollY = 1600;
  listeners.get("scroll")!();
  flush();
  assert.equal(properties.get("--reveal-progress"), "1");
  viewport.scrollY = 0;
  listeners.get("scroll")!();
  flush();
  assert.equal(properties.get("--reveal-progress"), "0");

  listeners.get("scroll")!();
  preference.matches = true;
  listeners.get("preference")!();
  assert.equal(root.dataset.motion, undefined);
  assert.equal(frames.size, 0);
  preference.matches = false;
  listeners.get("preference")!();
  listeners.get("scroll")!();
  cleanup();
  assert.equal(frames.size, 0);
  assert.equal(listeners.size, 0);
  assert.equal(disconnected, true);
  assert.equal(root.dataset.motion, undefined);
  assert.equal(element.dataset.scrollReveal, undefined);
  assert.equal(properties.size, 0);
});
