/**
 * Core intent manager: devices + bindings + debounce → poll().
 *
 * Consumes raw device input via KeyboardDevice and GamepadDevice,
 * resolves bindings to produce abstract intent states, and provides
 * edge detection (justPressed/justReleased) with optional per-intent debounce.
 */

import { KeyboardDevice } from "./devices/KeyboardDevice.js";
import { GamepadDevice } from "./devices/GamepadDevice.js";
import { INTENTS, INTENT_NAMES } from "./intents.js";
import { createDefaultBindings } from "./bindings.js";

/**
 * @typedef {import("./bindings.js").Binding} Binding
 *
 * @typedef {object} IntentState
 * @property {boolean} active
 * @property {boolean} justPressed
 * @property {boolean} justReleased
 * @property {number} value
 *
 * @typedef {Record<string, IntentState>} PollResult
 */

export class IntentManager {
  /**
   * @param {object} [opts]
   * @param {boolean} [opts.keyboard=true]
   * @param {boolean} [opts.gamepad=false]
   * @param {number} [opts.gamepadIndex=0]
   * @param {number} [opts.gamepadDeadZone=0.1]
   * @param {Binding[]} [opts.bindings]
   * @param {Record<string, number>} [opts.debounce]
   * @param {EventTarget} [opts.keyboardTarget]
   */
  constructor({
    keyboard = true,
    gamepad = false,
    gamepadIndex = 0,
    gamepadDeadZone = 0.1,
    bindings,
    debounce = {},
    keyboardTarget,
  } = {}) {
    /** @type {KeyboardDevice | null} */
    this._keyboard = keyboard ? new KeyboardDevice(keyboardTarget) : null;

    /** @type {GamepadDevice | null} */
    this._gamepad = gamepad ? new GamepadDevice({ deadZone: gamepadDeadZone }) : null;

    /** @type {number} */
    this._gamepadIndex = gamepadIndex;

    /** @type {Binding[]} */
    this._bindings = bindings ?? createDefaultBindings();

    /** @type {Map<string, number>} */
    this._debounce = new Map(Object.entries(debounce));

    /** @type {Map<string, boolean>} Previous frame active state for edge detection. */
    this._prevActive = new Map();
    for (const name of INTENT_NAMES) {
      this._prevActive.set(name, false);
    }

    /** @type {Map<string, number>} Last trigger time for debounce. */
    this._lastTriggerTime = new Map();

    /** @type {(() => number) | null} */
    this._now = null;
  }

  /**
   * Poll all devices and resolve bindings into intent states.
   * @returns {PollResult}
   */
  poll() {
    const now = this._now ? this._now() : performance.now();

    // 1. Poll devices
    const kb = this._keyboard ? this._keyboard.poll() : null;
    const gp = this._gamepad ? this._gamepad.poll() : null;
    const gamepad = gp ? gp.gamepads.find((g) => g.index === this._gamepadIndex) ?? null : null;

    // 2. Init result — all intents zeroed
    /** @type {PollResult} */
    const result = {};
    for (const name of INTENT_NAMES) {
      result[name] = { active: false, justPressed: false, justReleased: false, value: 0 };
    }

    // 3. Resolve each binding
    for (const binding of this._bindings) {
      const { intent, source } = binding;
      const def = INTENTS[intent];
      if (!def) continue;

      const resolved = this._resolveSource(source, binding, kb, gamepad);
      if (resolved === null) continue;

      const entry = result[intent];
      if (def.type === "digital") {
        if (resolved.active) {
          entry.active = true;
          entry.value = 1;
        }
      } else {
        // Analog: take max magnitude
        if (Math.abs(resolved.value) > Math.abs(entry.value)) {
          entry.value = resolved.value;
        }
        entry.active = Math.abs(entry.value) > 0;
      }
    }

    // 4. Edge detection + debounce
    for (const name of INTENT_NAMES) {
      const entry = result[name];
      const wasActive = this._prevActive.get(name);

      if (entry.active && !wasActive) {
        // Check debounce
        const cooldown = this._debounce.get(name);
        if (cooldown !== undefined) {
          const lastTime = this._lastTriggerTime.get(name) ?? -Infinity;
          if (now - lastTime < cooldown) {
            entry.justPressed = false;
          } else {
            entry.justPressed = true;
            this._lastTriggerTime.set(name, now);
          }
        } else {
          entry.justPressed = true;
        }
      }

      if (!entry.active && wasActive) {
        entry.justReleased = true;
      }

      this._prevActive.set(name, entry.active);
    }

    return result;
  }

  /**
   * Resolve a single source against polled device state.
   * @param {import("./bindings.js").Source} source
   * @param {Binding} binding
   * @param {{ keys: Set<string>, justPressed: Set<string>, justReleased: Set<string> } | null} kb
   * @param {{ axes: number[], buttons: boolean[] } | null} gamepad
   * @returns {{ active: boolean, value: number } | null}
   * @private
   */
  _resolveSource(source, binding, kb, gamepad) {
    if (source.device === "keyboard") {
      if (!kb) return null;
      const pressed = kb.keys.has(source.code);
      if (!pressed) return { active: false, value: 0 };

      // Key bound to analog intent with explicit value
      if (binding.value !== undefined) {
        return { active: true, value: binding.value };
      }
      return { active: true, value: 1 };
    }

    if (source.device === "gamepad") {
      if (!gamepad) return null;

      if (source.type === "button") {
        const pressed = gamepad.buttons[source.index] ?? false;
        return { active: pressed, value: pressed ? 1 : 0 };
      }

      if (source.type === "axis") {
        const raw = gamepad.axes[source.index] ?? 0;

        // Axis-as-digital: direction + threshold
        if (source.direction !== undefined && source.threshold !== undefined) {
          const active = source.direction > 0
            ? raw >= source.threshold
            : raw <= -source.threshold;
          return { active, value: active ? 1 : 0 };
        }

        // Raw axis for analog intent
        return { active: raw !== 0, value: raw };
      }
    }

    return null;
  }

  /**
   * Replace all bindings.
   * @param {Binding[]} bindings
   */
  setBindings(bindings) {
    this._bindings = bindings;
  }

  /**
   * Append a single binding.
   * @param {Binding} binding
   */
  addBinding(binding) {
    this._bindings.push(binding);
  }

  /**
   * Remove a specific binding by intent and source match.
   * @param {string} intent
   * @param {import("./bindings.js").Source} source
   */
  removeBinding(intent, source) {
    this._bindings = this._bindings.filter(
      (b) => !(b.intent === intent && this._sourceEquals(b.source, source)),
    );
  }

  /**
   * Get current bindings array (for serialization).
   * @returns {Binding[]}
   */
  getBindings() {
    return this._bindings;
  }

  /**
   * Set per-intent debounce cooldown.
   * @param {string} intent
   * @param {number} ms
   */
  setDebounce(intent, ms) {
    if (ms <= 0) {
      this._debounce.delete(intent);
    } else {
      this._debounce.set(intent, ms);
    }
  }

  /**
   * Detach devices and null references.
   */
  dispose() {
    if (this._keyboard) {
      this._keyboard.detach();
      this._keyboard = null;
    }
    if (this._gamepad) {
      this._gamepad.detach();
      this._gamepad = null;
    }
    this._bindings = [];
    this._debounce.clear();
    this._prevActive.clear();
    this._lastTriggerTime.clear();
  }

  /**
   * @param {import("./bindings.js").Source} a
   * @param {import("./bindings.js").Source} b
   * @returns {boolean}
   * @private
   */
  _sourceEquals(a, b) {
    if (a.device !== b.device) return false;
    if (a.device === "keyboard" && b.device === "keyboard") {
      return a.code === b.code;
    }
    if (a.device === "gamepad" && b.device === "gamepad") {
      if (a.type !== b.type) return false;
      if (a.type === "button" && b.type === "button") return a.index === b.index;
      if (a.type === "axis" && b.type === "axis") {
        return a.index === b.index
          && a.direction === b.direction
          && a.threshold === b.threshold;
      }
    }
    return false;
  }
}
