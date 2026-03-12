import { describe, it, expect } from "vitest";
import {
  createDefaultBindings,
  createDefaultKeyboardBindings,
  createDefaultGamepadBindings,
  serializeBindings,
  deserializeBindings,
} from "../src/bindings.js";
import { INTENTS } from "../src/intents.js";

describe("createDefaultBindings", () => {
  it("returns an array of bindings", () => {
    const bindings = createDefaultBindings();
    expect(Array.isArray(bindings)).toBe(true);
    expect(bindings.length).toBeGreaterThan(0);
  });

  it("every binding has intent, source", () => {
    for (const b of createDefaultBindings()) {
      expect(b).toHaveProperty("intent");
      expect(b).toHaveProperty("source");
      expect(b.source).toHaveProperty("device");
    }
  });

  it("all intent names reference valid intents", () => {
    for (const b of createDefaultBindings()) {
      expect(INTENTS).toHaveProperty(b.intent);
    }
  });

  it("includes both keyboard and gamepad bindings", () => {
    const bindings = createDefaultBindings();
    const devices = new Set(bindings.map((b) => b.source.device));
    expect(devices.has("keyboard")).toBe(true);
    expect(devices.has("gamepad")).toBe(true);
  });
});

describe("createDefaultKeyboardBindings", () => {
  it("contains WASD movement bindings", () => {
    const kb = createDefaultKeyboardBindings();
    const wasd = kb.filter(
      (b) => ["KeyW", "KeyA", "KeyS", "KeyD"].includes(b.source.code),
    );
    expect(wasd.length).toBeGreaterThanOrEqual(4);
  });

  it("contains arrow key bindings", () => {
    const kb = createDefaultKeyboardBindings();
    const arrows = kb.filter(
      (b) => b.source.code.startsWith("Arrow"),
    );
    expect(arrows.length).toBeGreaterThanOrEqual(4);
  });

  it("keyboard analog bindings have value", () => {
    const kb = createDefaultKeyboardBindings();
    const analog = kb.filter((b) => b.value !== undefined);
    expect(analog.length).toBeGreaterThan(0);
    for (const b of analog) {
      expect([-1, 1]).toContain(b.value);
    }
  });
});

describe("createDefaultGamepadBindings", () => {
  it("contains axis bindings for sticks", () => {
    const gp = createDefaultGamepadBindings();
    const axes = gp.filter((b) => b.source.type === "axis");
    expect(axes.length).toBeGreaterThanOrEqual(4);
  });

  it("contains button bindings", () => {
    const gp = createDefaultGamepadBindings();
    const buttons = gp.filter((b) => b.source.type === "button");
    expect(buttons.length).toBeGreaterThanOrEqual(10);
  });

  it("axis-as-digital bindings have direction and threshold", () => {
    const gp = createDefaultGamepadBindings();
    const axisDigital = gp.filter(
      (b) => b.source.type === "axis" && b.source.direction !== undefined,
    );
    expect(axisDigital.length).toBe(4);
    for (const b of axisDigital) {
      expect(b.source.threshold).toBe(0.5);
      expect([-1, 1]).toContain(b.source.direction);
    }
  });
});

describe("serialization", () => {
  it("round-trips bindings through serialize/deserialize", () => {
    const original = createDefaultBindings();
    const json = serializeBindings(original);
    const restored = deserializeBindings(json);
    expect(restored).toEqual(original);
  });

  it("serializes to valid JSON string", () => {
    const json = serializeBindings(createDefaultBindings());
    expect(typeof json).toBe("string");
    expect(() => JSON.parse(json)).not.toThrow();
  });
});
