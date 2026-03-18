import { describe, it, expect } from "vitest";
import { INTENTS, INTENT_NAMES } from "../src/intents.js";

describe("INTENTS", () => {
  it("is frozen", () => {
    expect(Object.isFrozen(INTENTS)).toBe(true);
  });

  it("has 28 intents", () => {
    expect(INTENT_NAMES.length).toBe(28);
  });

  it("every intent has a valid type", () => {
    for (const name of INTENT_NAMES) {
      expect(["digital", "analog"]).toContain(INTENTS[name].type);
    }
  });

  it("contains expected digital intents", () => {
    const digital = INTENT_NAMES.filter((n) => INTENTS[n].type === "digital");
    expect(digital).toContain("MOVE_UP");
    expect(digital).toContain("JUMP");
    expect(digital).toContain("PRIMARY");
    expect(digital).toContain("CONFIRM");
    expect(digital).toContain("INTERACT");
  });

  it("contains expected analog intents", () => {
    const analog = INTENT_NAMES.filter((n) => INTENTS[n].type === "analog");
    expect(analog).toEqual(expect.arrayContaining(["MOVE_X", "MOVE_Y", "AIM_X", "AIM_Y"]));
    expect(analog.length).toBe(4);
  });

  it("INTENT_NAMES matches Object.keys(INTENTS)", () => {
    expect(INTENT_NAMES).toEqual(Object.keys(INTENTS));
  });
});
