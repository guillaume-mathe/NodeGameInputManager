import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { IntentManager } from "../src/IntentManager.js";
import { INTENT_NAMES, INTENTS } from "../src/intents.js";

/**
 * Minimal EventTarget stub.
 */
class StubTarget {
  constructor() { this._listeners = {}; }
  addEventListener(type, fn) { (this._listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) {
    const arr = this._listeners[type];
    if (arr) this._listeners[type] = arr.filter((f) => f !== fn);
  }
  dispatch(type, data) {
    for (const fn of this._listeners[type] ?? []) fn(data);
  }
}

describe("IntentManager", () => {
  /** @type {StubTarget} */
  let target;
  /** @type {IntentManager} */
  let mgr;

  beforeEach(() => {
    target = new StubTarget();
    mgr = new IntentManager({
      keyboard: true,
      gamepad: false,
      keyboardTarget: target,
    });
    // Use a controllable time source
    let time = 0;
    mgr._now = () => time;
    mgr._advanceTime = (ms) => { time += ms; };
  });

  afterEach(() => {
    mgr.dispose();
  });

  describe("poll() structure", () => {
    it("returns all intents", () => {
      const result = mgr.poll();
      for (const name of INTENT_NAMES) {
        expect(result).toHaveProperty(name);
        expect(result[name]).toHaveProperty("active");
        expect(result[name]).toHaveProperty("justPressed");
        expect(result[name]).toHaveProperty("justReleased");
        expect(result[name]).toHaveProperty("value");
      }
    });

    it("all intents start inactive", () => {
      const result = mgr.poll();
      for (const name of INTENT_NAMES) {
        expect(result[name].active).toBe(false);
        expect(result[name].value).toBe(0);
      }
    });
  });

  describe("digital intents from keyboard", () => {
    it("JUMP activates on Space press", () => {
      target.dispatch("keydown", { code: "Space", repeat: false });
      const result = mgr.poll();
      expect(result.JUMP.active).toBe(true);
      expect(result.JUMP.justPressed).toBe(true);
      expect(result.JUMP.value).toBe(1);
    });

    it("JUMP deactivates on Space release", () => {
      target.dispatch("keydown", { code: "Space", repeat: false });
      mgr.poll(); // consume press
      target.dispatch("keyup", { code: "Space" });
      const result = mgr.poll();
      expect(result.JUMP.active).toBe(false);
      expect(result.JUMP.justReleased).toBe(true);
      expect(result.JUMP.value).toBe(0);
    });

    it("MOVE_UP activates on KeyW", () => {
      target.dispatch("keydown", { code: "KeyW", repeat: false });
      const result = mgr.poll();
      expect(result.MOVE_UP.active).toBe(true);
    });

    it("MOVE_UP also activates on ArrowUp", () => {
      target.dispatch("keydown", { code: "ArrowUp", repeat: false });
      const result = mgr.poll();
      expect(result.MOVE_UP.active).toBe(true);
    });

    it("SPRINT activates on ShiftLeft", () => {
      target.dispatch("keydown", { code: "ShiftLeft", repeat: false });
      const result = mgr.poll();
      expect(result.SPRINT.active).toBe(true);
    });
  });

  describe("analog intents from keyboard", () => {
    it("MOVE_X = -1 on KeyA", () => {
      target.dispatch("keydown", { code: "KeyA", repeat: false });
      const result = mgr.poll();
      expect(result.MOVE_X.active).toBe(true);
      expect(result.MOVE_X.value).toBe(-1);
    });

    it("MOVE_X = 1 on KeyD", () => {
      target.dispatch("keydown", { code: "KeyD", repeat: false });
      const result = mgr.poll();
      expect(result.MOVE_X.value).toBe(1);
    });

    it("MOVE_X uses max magnitude when both pressed", () => {
      target.dispatch("keydown", { code: "KeyA", repeat: false });
      target.dispatch("keydown", { code: "KeyD", repeat: false });
      const result = mgr.poll();
      // Both -1 and 1 have same magnitude, last-write-wins for max abs
      expect(Math.abs(result.MOVE_X.value)).toBe(1);
    });

    it("MOVE_Y = -1 on KeyW", () => {
      target.dispatch("keydown", { code: "KeyW", repeat: false });
      const result = mgr.poll();
      expect(result.MOVE_Y.value).toBe(-1);
    });
  });

  describe("edge detection", () => {
    it("justPressed is true only on first poll after press", () => {
      target.dispatch("keydown", { code: "Space", repeat: false });
      const r1 = mgr.poll();
      expect(r1.JUMP.justPressed).toBe(true);

      // Still held, second poll
      const r2 = mgr.poll();
      expect(r2.JUMP.active).toBe(true);
      expect(r2.JUMP.justPressed).toBe(false);
    });

    it("justReleased is true only on first poll after release", () => {
      target.dispatch("keydown", { code: "Space", repeat: false });
      mgr.poll();
      target.dispatch("keyup", { code: "Space" });
      const r1 = mgr.poll();
      expect(r1.JUMP.justReleased).toBe(true);

      const r2 = mgr.poll();
      expect(r2.JUMP.justReleased).toBe(false);
    });
  });

  describe("debounce", () => {
    it("suppresses justPressed within cooldown window", () => {
      mgr.setDebounce("JUMP", 200);

      target.dispatch("keydown", { code: "Space", repeat: false });
      const r1 = mgr.poll();
      expect(r1.JUMP.justPressed).toBe(true);

      target.dispatch("keyup", { code: "Space" });
      mgr.poll(); // release

      // Press again within cooldown
      mgr._advanceTime(100);
      target.dispatch("keydown", { code: "Space", repeat: false });
      const r2 = mgr.poll();
      expect(r2.JUMP.active).toBe(true);
      expect(r2.JUMP.justPressed).toBe(false); // debounced
    });

    it("allows justPressed after cooldown expires", () => {
      mgr.setDebounce("JUMP", 200);

      target.dispatch("keydown", { code: "Space", repeat: false });
      mgr.poll();
      target.dispatch("keyup", { code: "Space" });
      mgr.poll();

      // Press again after cooldown
      mgr._advanceTime(300);
      target.dispatch("keydown", { code: "Space", repeat: false });
      const result = mgr.poll();
      expect(result.JUMP.justPressed).toBe(true);
    });

    it("debounce does not suppress active state", () => {
      mgr.setDebounce("JUMP", 200);

      target.dispatch("keydown", { code: "Space", repeat: false });
      mgr.poll();
      target.dispatch("keyup", { code: "Space" });
      mgr.poll();

      mgr._advanceTime(50);
      target.dispatch("keydown", { code: "Space", repeat: false });
      const result = mgr.poll();
      expect(result.JUMP.active).toBe(true); // active is not debounced
    });
  });

  describe("rebinding API", () => {
    it("setBindings replaces all bindings", () => {
      mgr.setBindings([
        { intent: "PRIMARY", source: { device: "keyboard", code: "KeyZ" } },
      ]);
      target.dispatch("keydown", { code: "KeyZ", repeat: false });
      const result = mgr.poll();
      expect(result.PRIMARY.active).toBe(true);

      // Old bindings no longer work
      target.dispatch("keyup", { code: "KeyZ" });
      target.dispatch("keydown", { code: "Space", repeat: false });
      const r2 = mgr.poll();
      expect(r2.JUMP.active).toBe(false);
    });

    it("addBinding appends a binding", () => {
      mgr.addBinding({
        intent: "TERTIARY",
        source: { device: "keyboard", code: "KeyZ" },
      });
      target.dispatch("keydown", { code: "KeyZ", repeat: false });
      const result = mgr.poll();
      expect(result.TERTIARY.active).toBe(true);
    });

    it("removeBinding removes specific binding", () => {
      // Remove Space → JUMP
      mgr.removeBinding("JUMP", { device: "keyboard", code: "Space" });
      target.dispatch("keydown", { code: "Space", repeat: false });
      const result = mgr.poll();
      expect(result.JUMP.active).toBe(false);
    });

    it("getBindings returns current bindings", () => {
      const bindings = mgr.getBindings();
      expect(Array.isArray(bindings)).toBe(true);
      expect(bindings.length).toBeGreaterThan(0);
    });
  });

  describe("dispose", () => {
    it("clears all state", () => {
      mgr.dispose();
      expect(mgr._bindings).toEqual([]);
      expect(mgr._keyboard).toBe(null);
    });
  });
});

describe("IntentManager with gamepad", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves gamepad button bindings", () => {
    const target = new StubTarget();

    vi.stubGlobal("navigator", {
      getGamepads: () => [
        {
          index: 0,
          id: "test",
          connected: true,
          axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 10 }, (_, i) =>
            ({ pressed: i === 0 }), // A button pressed
          ),
        },
      ],
    });

    const mgr = new IntentManager({
      keyboard: true,
      gamepad: true,
      gamepadDeadZone: 0.1,
      keyboardTarget: target,
    });

    const result = mgr.poll();
    expect(result.JUMP.active).toBe(true); // A(0) → JUMP

    mgr.dispose();
  });

  it("resolves gamepad axis bindings for analog intents", () => {
    const target = new StubTarget();

    vi.stubGlobal("navigator", {
      getGamepads: () => [
        {
          index: 0,
          id: "test",
          connected: true,
          axes: [-0.73, 0.5, 0, 0],
          buttons: Array.from({ length: 10 }, () => ({ pressed: false })),
        },
      ],
    });

    const mgr = new IntentManager({
      keyboard: true,
      gamepad: true,
      gamepadDeadZone: 0.1,
      keyboardTarget: target,
    });

    const result = mgr.poll();
    expect(result.MOVE_X.value).toBe(-0.73);
    expect(result.MOVE_X.active).toBe(true);
    expect(result.MOVE_Y.value).toBe(0.5);

    mgr.dispose();
  });

  it("resolves axis-as-digital bindings", () => {
    const target = new StubTarget();

    vi.stubGlobal("navigator", {
      getGamepads: () => [
        {
          index: 0,
          id: "test",
          connected: true,
          axes: [-0.8, 0, 0, 0],
          buttons: Array.from({ length: 10 }, () => ({ pressed: false })),
        },
      ],
    });

    const mgr = new IntentManager({
      keyboard: true,
      gamepad: true,
      gamepadDeadZone: 0.1,
      keyboardTarget: target,
    });

    const result = mgr.poll();
    expect(result.MOVE_LEFT.active).toBe(true);  // axis 0, direction -1, threshold 0.5
    expect(result.MOVE_RIGHT.active).toBe(false);

    mgr.dispose();
  });
});
