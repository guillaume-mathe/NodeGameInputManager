/**
 * Core intent manager: devices + bindings + debounce → poll().
 *
 * Consumes raw device input via KeyboardDevice and GamepadDevice,
 * resolves bindings to produce abstract intent states, and provides
 * edge detection (justPressed/justReleased) with optional per-intent debounce.
 *
 * Supports runtime intent remapping (e.g. for illness effects that swap
 * directional controls) and custom intent definitions beyond the built-in set.
 */

import { KeyboardDevice } from "./devices/KeyboardDevice.js";
import { GamepadDevice } from "./devices/GamepadDevice.js";
import { INTENTS, INTENT_NAMES } from "./intents.js";
import { createDefaultBindings } from "./bindings.js";

/**
 * @typedef {import("./intents.js").IntentDef} IntentDef
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
   * @param {Record<string, IntentDef>} [opts.customIntents] Additional game-specific intents
   */
  constructor({
    keyboard = true,
    gamepad = false,
    gamepadIndex = 0,
    gamepadDeadZone = 0.1,
    bindings,
    debounce = {},
    keyboardTarget,
    customIntents = {},
  } = {}) {
    // Validate custom intents don't collide with built-in ones
    for (const name of Object.keys(customIntents)) {
      if (INTENTS[name]) {
        throw new Error(`Custom intent "${name}" collides with built-in intent`);
      }
      _validateIntentDef(name, customIntents[name]);
    }

    /** @type {Record<string, IntentDef>} Merged intent registry (built-in + custom). */
    this._intents = { ...INTENTS, ...customIntents };

    /** @type {string[]} */
    this._intentNames = Object.keys(this._intents);

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
    for (const name of this._intentNames) {
      this._prevActive.set(name, false);
    }

    /** @type {Map<string, number>} Last trigger time for debounce. */
    this._lastTriggerTime = new Map();

    /** @type {Map<string, string> | null} Intent remap table (source → target). */
    this._intentMap = null;

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
    for (const name of this._intentNames) {
      result[name] = { active: false, justPressed: false, justReleased: false, value: 0 };
    }

    // 3. Resolve each binding (with optional intent remapping)
    for (const binding of this._bindings) {
      const { source } = binding;
      let intent = binding.intent;

      // Apply intent remap: redirect binding's intent to a different slot
      if (this._intentMap) {
        intent = this._intentMap.get(intent) ?? intent;
      }

      const def = this._intents[intent];
      if (!def) continue;

      const resolved = this._resolveSource(source, binding, kb, gamepad);
      if (resolved === null) continue;

      const entry = result[intent];
      if (!entry) continue;

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
    for (const name of this._intentNames) {
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

  // ── Intent remapping ──────────────────────────────────

  /**
   * Set an intent remap table. Each key is a source intent name whose
   * bindings will be redirected to the value intent name during poll().
   *
   * For a 180° reverse: `{ MOVE_UP: "MOVE_DOWN", MOVE_DOWN: "MOVE_UP",
   *   MOVE_LEFT: "MOVE_RIGHT", MOVE_RIGHT: "MOVE_LEFT" }`
   *
   * For a 90° rotation: `{ MOVE_UP: "MOVE_RIGHT", MOVE_RIGHT: "MOVE_DOWN",
   *   MOVE_DOWN: "MOVE_LEFT", MOVE_LEFT: "MOVE_UP" }`
   *
   * @param {Record<string, string>} map Source intent → target intent
   */
  setIntentMap(map) {
    this._intentMap = new Map(Object.entries(map));
  }

  /**
   * Clear the intent remap table, restoring normal intent mapping.
   */
  clearIntentMap() {
    this._intentMap = null;
  }

  /**
   * Get the current intent remap table, or null if none is set.
   * @returns {Record<string, string> | null}
   */
  getIntentMap() {
    if (!this._intentMap) return null;
    return Object.fromEntries(this._intentMap);
  }

  // ── Custom intent registration ───────────────────────

  /**
   * Register a custom intent definition at runtime.
   * @param {string} name
   * @param {IntentDef} def
   */
  registerIntent(name, def) {
    if (this._intents[name]) {
      throw new Error(`Intent "${name}" already exists`);
    }
    _validateIntentDef(name, def);
    this._intents[name] = def;
    this._intentNames = Object.keys(this._intents);
    this._prevActive.set(name, false);
  }

  /**
   * Remove a custom intent definition. Built-in intents cannot be removed.
   * @param {string} name
   */
  unregisterIntent(name) {
    if (INTENTS[name]) {
      throw new Error(`Cannot remove built-in intent "${name}"`);
    }
    if (!this._intents[name]) {
      throw new Error(`Intent "${name}" does not exist`);
    }
    delete this._intents[name];
    this._intentNames = Object.keys(this._intents);
    this._prevActive.delete(name);
    this._lastTriggerTime.delete(name);
    this._debounce.delete(name);
  }

  /**
   * Get the current intent registry (built-in + custom).
   * @returns {Readonly<Record<string, IntentDef>>}
   */
  getIntents() {
    return { ...this._intents };
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
    this._intentMap = null;
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

/**
 * Validate an intent definition has a valid type.
 * @param {string} name
 * @param {IntentDef} def
 * @private
 */
function _validateIntentDef(name, def) {
  if (!def || (def.type !== "digital" && def.type !== "analog")) {
    throw new Error(
      `Intent "${name}" must have type "digital" or "analog", got "${def?.type}"`,
    );
  }
}
