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

  describe("intent remapping", () => {
    it("setIntentMap swaps MOVE_UP and MOVE_DOWN", () => {
      mgr.setIntentMap({ MOVE_UP: "MOVE_DOWN", MOVE_DOWN: "MOVE_UP" });
      target.dispatch("keydown", { code: "KeyW", repeat: false }); // normally MOVE_UP
      const result = mgr.poll();
      expect(result.MOVE_UP.active).toBe(false);
      expect(result.MOVE_DOWN.active).toBe(true);
    });

    it("full 180° reverse (illReverse)", () => {
      mgr.setIntentMap({
        MOVE_UP: "MOVE_DOWN",
        MOVE_DOWN: "MOVE_UP",
        MOVE_LEFT: "MOVE_RIGHT",
        MOVE_RIGHT: "MOVE_LEFT",
      });
      target.dispatch("keydown", { code: "KeyW", repeat: false });
      target.dispatch("keydown", { code: "KeyA", repeat: false });
      const result = mgr.poll();
      expect(result.MOVE_DOWN.active).toBe(true);
      expect(result.MOVE_RIGHT.active).toBe(true);
      expect(result.MOVE_UP.active).toBe(false);
      expect(result.MOVE_LEFT.active).toBe(false);
    });

    it("90° rotation (illReverse2)", () => {
      mgr.setIntentMap({
        MOVE_UP: "MOVE_RIGHT",
        MOVE_RIGHT: "MOVE_DOWN",
        MOVE_DOWN: "MOVE_LEFT",
        MOVE_LEFT: "MOVE_UP",
      });
      target.dispatch("keydown", { code: "KeyW", repeat: false }); // UP → RIGHT
      const result = mgr.poll();
      expect(result.MOVE_RIGHT.active).toBe(true);
      expect(result.MOVE_UP.active).toBe(false);
    });

    it("clearIntentMap restores normal mapping", () => {
      mgr.setIntentMap({ MOVE_UP: "MOVE_DOWN", MOVE_DOWN: "MOVE_UP" });
      target.dispatch("keydown", { code: "KeyW", repeat: false });
      let result = mgr.poll();
      expect(result.MOVE_DOWN.active).toBe(true);

      target.dispatch("keyup", { code: "KeyW" });
      mgr.poll(); // consume release

      mgr.clearIntentMap();
      target.dispatch("keydown", { code: "KeyW", repeat: false });
      result = mgr.poll();
      expect(result.MOVE_UP.active).toBe(true);
      expect(result.MOVE_DOWN.active).toBe(false);
    });

    it("getIntentMap returns current map or null", () => {
      expect(mgr.getIntentMap()).toBe(null);
      mgr.setIntentMap({ MOVE_UP: "MOVE_DOWN" });
      expect(mgr.getIntentMap()).toEqual({ MOVE_UP: "MOVE_DOWN" });
      mgr.clearIntentMap();
      expect(mgr.getIntentMap()).toBe(null);
    });

    it("edge detection fires correctly on remap activation", () => {
      // Hold W (MOVE_UP active)
      target.dispatch("keydown", { code: "KeyW", repeat: false });
      mgr.poll();

      // Activate remap — MOVE_UP bindings now produce MOVE_DOWN
      mgr.setIntentMap({ MOVE_UP: "MOVE_DOWN", MOVE_DOWN: "MOVE_UP" });
      const result = mgr.poll();
      // MOVE_DOWN was inactive, now active → justPressed
      expect(result.MOVE_DOWN.justPressed).toBe(true);
      // MOVE_UP was active, now inactive → justReleased
      expect(result.MOVE_UP.justReleased).toBe(true);
    });

    it("does not affect non-remapped intents", () => {
      mgr.setIntentMap({ MOVE_UP: "MOVE_DOWN", MOVE_DOWN: "MOVE_UP" });
      target.dispatch("keydown", { code: "Space", repeat: false });
      const result = mgr.poll();
      expect(result.JUMP.active).toBe(true);
    });

    it("remaps analog intents", () => {
      mgr.setIntentMap({ MOVE_X: "MOVE_Y", MOVE_Y: "MOVE_X" });
      target.dispatch("keydown", { code: "KeyA", repeat: false }); // MOVE_X = -1
      const result = mgr.poll();
      expect(result.MOVE_Y.value).toBe(-1); // remapped
      expect(result.MOVE_X.active).toBe(false);
    });
  });

  describe("dispose", () => {
    it("clears all state", () => {
      mgr.dispose();
      expect(mgr._bindings).toEqual([]);
      expect(mgr._keyboard).toBe(null);
      expect(mgr._intentMap).toBe(null);
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

describe("IntentManager custom intents", () => {
  /** @type {StubTarget} */
  let target;
  /** @type {IntentManager} */
  let mgr;

  afterEach(() => {
    mgr?.dispose();
  });

  it("accepts customIntents in constructor", () => {
    target = new StubTarget();
    mgr = new IntentManager({
      keyboardTarget: target,
      customIntents: { PLACE_BOMB: { type: "digital" } },
    });
    const result = mgr.poll();
    expect(result).toHaveProperty("PLACE_BOMB");
    expect(result.PLACE_BOMB.active).toBe(false);
  });

  it("custom intent works with bindings", () => {
    target = new StubTarget();
    mgr = new IntentManager({
      keyboardTarget: target,
      customIntents: { PLACE_BOMB: { type: "digital" } },
      bindings: [
        { intent: "PLACE_BOMB", source: { device: "keyboard", code: "KeyB" } },
      ],
    });
    target.dispatch("keydown", { code: "KeyB", repeat: false });
    const result = mgr.poll();
    expect(result.PLACE_BOMB.active).toBe(true);
    expect(result.PLACE_BOMB.justPressed).toBe(true);
  });

  it("custom analog intent works", () => {
    target = new StubTarget();
    mgr = new IntentManager({
      keyboardTarget: target,
      customIntents: { THROTTLE: { type: "analog" } },
      bindings: [
        { intent: "THROTTLE", source: { device: "keyboard", code: "KeyT" }, value: 0.75 },
      ],
    });
    target.dispatch("keydown", { code: "KeyT", repeat: false });
    const result = mgr.poll();
    expect(result.THROTTLE.value).toBe(0.75);
    expect(result.THROTTLE.active).toBe(true);
  });

  it("custom intent gets edge detection", () => {
    target = new StubTarget();
    mgr = new IntentManager({
      keyboardTarget: target,
      customIntents: { PLACE_BOMB: { type: "digital" } },
      bindings: [
        { intent: "PLACE_BOMB", source: { device: "keyboard", code: "KeyB" } },
      ],
    });

    target.dispatch("keydown", { code: "KeyB", repeat: false });
    const r1 = mgr.poll();
    expect(r1.PLACE_BOMB.justPressed).toBe(true);

    const r2 = mgr.poll();
    expect(r2.PLACE_BOMB.justPressed).toBe(false);
    expect(r2.PLACE_BOMB.active).toBe(true);

    target.dispatch("keyup", { code: "KeyB" });
    const r3 = mgr.poll();
    expect(r3.PLACE_BOMB.justReleased).toBe(true);
  });

  it("custom intent gets debounce", () => {
    target = new StubTarget();
    mgr = new IntentManager({
      keyboardTarget: target,
      customIntents: { PLACE_BOMB: { type: "digital" } },
      bindings: [
        { intent: "PLACE_BOMB", source: { device: "keyboard", code: "KeyB" } },
      ],
      debounce: { PLACE_BOMB: 200 },
    });
    let time = 0;
    mgr._now = () => time;

    target.dispatch("keydown", { code: "KeyB", repeat: false });
    mgr.poll();
    target.dispatch("keyup", { code: "KeyB" });
    mgr.poll();

    time = 100;
    target.dispatch("keydown", { code: "KeyB", repeat: false });
    const result = mgr.poll();
    expect(result.PLACE_BOMB.active).toBe(true);
    expect(result.PLACE_BOMB.justPressed).toBe(false); // debounced
  });

  it("registerIntent adds at runtime", () => {
    target = new StubTarget();
    mgr = new IntentManager({ keyboardTarget: target, bindings: [] });
    mgr.registerIntent("TAUNT", { type: "digital" });
    mgr.addBinding({ intent: "TAUNT", source: { device: "keyboard", code: "KeyT" } });

    target.dispatch("keydown", { code: "KeyT", repeat: false });
    const result = mgr.poll();
    expect(result.TAUNT.active).toBe(true);
  });

  it("registerIntent throws for duplicate", () => {
    target = new StubTarget();
    mgr = new IntentManager({ keyboardTarget: target });
    expect(() => mgr.registerIntent("JUMP", { type: "digital" })).toThrow(
      'Intent "JUMP" already exists',
    );
  });

  it("registerIntent throws for invalid type", () => {
    target = new StubTarget();
    mgr = new IntentManager({ keyboardTarget: target });
    expect(() => mgr.registerIntent("BAD", { type: "bogus" })).toThrow(
      'Intent "BAD" must have type',
    );
  });

  it("unregisterIntent removes custom intent", () => {
    target = new StubTarget();
    mgr = new IntentManager({
      keyboardTarget: target,
      customIntents: { PLACE_BOMB: { type: "digital" } },
      bindings: [],
    });
    expect(mgr.poll()).toHaveProperty("PLACE_BOMB");

    mgr.unregisterIntent("PLACE_BOMB");
    expect(mgr.poll()).not.toHaveProperty("PLACE_BOMB");
  });

  it("unregisterIntent throws for built-in intent", () => {
    target = new StubTarget();
    mgr = new IntentManager({ keyboardTarget: target });
    expect(() => mgr.unregisterIntent("JUMP")).toThrow(
      'Cannot remove built-in intent "JUMP"',
    );
  });

  it("unregisterIntent throws for nonexistent intent", () => {
    target = new StubTarget();
    mgr = new IntentManager({ keyboardTarget: target });
    expect(() => mgr.unregisterIntent("NOPE")).toThrow(
      'Intent "NOPE" does not exist',
    );
  });

  it("getIntents returns merged registry", () => {
    target = new StubTarget();
    mgr = new IntentManager({
      keyboardTarget: target,
      customIntents: { PLACE_BOMB: { type: "digital" } },
    });
    const intents = mgr.getIntents();
    expect(intents.JUMP).toEqual({ type: "digital" });
    expect(intents.PLACE_BOMB).toEqual({ type: "digital" });
  });

  it("constructor throws when custom intent collides with built-in", () => {
    target = new StubTarget();
    expect(() => new IntentManager({
      keyboardTarget: target,
      customIntents: { JUMP: { type: "digital" } },
    })).toThrow('Custom intent "JUMP" collides with built-in intent');
  });

  it("custom intents work with intent remapping", () => {
    target = new StubTarget();
    mgr = new IntentManager({
      keyboardTarget: target,
      customIntents: {
        BOMB_A: { type: "digital" },
        BOMB_B: { type: "digital" },
      },
      bindings: [
        { intent: "BOMB_A", source: { device: "keyboard", code: "KeyA" } },
        { intent: "BOMB_B", source: { device: "keyboard", code: "KeyB" } },
      ],
    });
    mgr.setIntentMap({ BOMB_A: "BOMB_B", BOMB_B: "BOMB_A" });

    target.dispatch("keydown", { code: "KeyA", repeat: false });
    const result = mgr.poll();
    expect(result.BOMB_B.active).toBe(true);
    expect(result.BOMB_A.active).toBe(false);
  });
});
