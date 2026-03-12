import { describe, it, expect, beforeEach, vi } from "vitest";
import { KeyboardDevice } from "../src/devices/KeyboardDevice.js";
import { GamepadDevice } from "../src/devices/GamepadDevice.js";

/**
 * Minimal EventTarget stub for testing keyboard device.
 */
class StubTarget {
  constructor() {
    this._listeners = {};
  }
  addEventListener(type, fn) {
    (this._listeners[type] ??= []).push(fn);
  }
  removeEventListener(type, fn) {
    const arr = this._listeners[type];
    if (arr) {
      this._listeners[type] = arr.filter((f) => f !== fn);
    }
  }
  dispatch(type, data) {
    for (const fn of this._listeners[type] ?? []) {
      fn(data);
    }
  }
}

describe("KeyboardDevice", () => {
  /** @type {StubTarget} */
  let target;
  /** @type {KeyboardDevice} */
  let kbd;

  beforeEach(() => {
    target = new StubTarget();
    kbd = new KeyboardDevice(target);
  });

  it("tracks held keys", () => {
    target.dispatch("keydown", { code: "KeyW", repeat: false });
    const poll = kbd.poll();
    expect(poll.keys.has("KeyW")).toBe(true);
  });

  it("tracks justPressed", () => {
    target.dispatch("keydown", { code: "Space", repeat: false });
    const poll = kbd.poll();
    expect(poll.justPressed.has("Space")).toBe(true);
  });

  it("tracks justReleased", () => {
    target.dispatch("keydown", { code: "KeyA", repeat: false });
    kbd.poll(); // consume press
    target.dispatch("keyup", { code: "KeyA" });
    const poll = kbd.poll();
    expect(poll.justReleased.has("KeyA")).toBe(true);
    expect(poll.keys.has("KeyA")).toBe(false);
  });

  it("ignores repeat keydown events", () => {
    target.dispatch("keydown", { code: "KeyW", repeat: false });
    kbd.poll();
    target.dispatch("keydown", { code: "KeyW", repeat: true });
    const poll = kbd.poll();
    expect(poll.justPressed.has("KeyW")).toBe(false);
  });

  it("clears accumulators after poll", () => {
    target.dispatch("keydown", { code: "KeyW", repeat: false });
    kbd.poll();
    const poll2 = kbd.poll();
    expect(poll2.justPressed.size).toBe(0);
  });

  it("returns empty sets when disabled", () => {
    target.dispatch("keydown", { code: "KeyW", repeat: false });
    kbd.enabled = false;
    const poll = kbd.poll();
    expect(poll.keys.size).toBe(0);
    expect(poll.justPressed.size).toBe(0);
  });

  it("re-attaches when re-enabled", () => {
    kbd.enabled = false;
    kbd.enabled = true;
    target.dispatch("keydown", { code: "KeyW", repeat: false });
    const poll = kbd.poll();
    expect(poll.keys.has("KeyW")).toBe(true);
  });

  it("detach removes listeners", () => {
    kbd.detach();
    target.dispatch("keydown", { code: "KeyW", repeat: false });
    const poll = kbd.poll();
    expect(poll.justPressed.size).toBe(0);
  });
});

describe("GamepadDevice", () => {
  it("returns empty gamepads when navigator is undefined", () => {
    const gp = new GamepadDevice();
    const poll = gp.poll();
    expect(poll.gamepads).toEqual([]);
  });

  it("returns empty gamepads when disabled", () => {
    const gp = new GamepadDevice();
    gp.enabled = false;
    const poll = gp.poll();
    expect(poll.gamepads).toEqual([]);
  });

  it("applies dead zone to axes", () => {
    vi.stubGlobal("navigator", {
      getGamepads: () => [
        {
          index: 0,
          id: "test",
          connected: true,
          axes: [0.05, -0.8, 0.0, 0.15],
          buttons: [{ pressed: false }],
        },
      ],
    });

    const gp = new GamepadDevice({ deadZone: 0.1 });
    gp._enabled = true;
    const poll = gp.poll();

    expect(poll.gamepads.length).toBe(1);
    expect(poll.gamepads[0].axes[0]).toBe(0);    // below dead zone
    expect(poll.gamepads[0].axes[1]).toBe(-0.8);  // above dead zone
    expect(poll.gamepads[0].axes[2]).toBe(0);     // exactly 0
    expect(poll.gamepads[0].axes[3]).toBe(0.15);  // above dead zone

    vi.unstubAllGlobals();
  });
});
