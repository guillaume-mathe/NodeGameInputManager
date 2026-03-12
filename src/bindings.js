/**
 * Binding data structures, default presets, and serialization.
 *
 * A binding maps a device source to an intent:
 *   { intent: string, source: Source, value?: number }
 *
 * Source types:
 *   { device: "keyboard", code: string }
 *   { device: "gamepad", type: "button", index: number }
 *   { device: "gamepad", type: "axis", index: number }
 *   { device: "gamepad", type: "axis", index: number, direction: number, threshold: number }
 *
 * @typedef {{ device: "keyboard", code: string }} KeyboardSource
 * @typedef {{ device: "gamepad", type: "button", index: number }} GamepadButtonSource
 * @typedef {{ device: "gamepad", type: "axis", index: number, direction?: number, threshold?: number }} GamepadAxisSource
 * @typedef {KeyboardSource | GamepadButtonSource | GamepadAxisSource} Source
 * @typedef {{ intent: string, source: Source, value?: number }} Binding
 */

/**
 * Create the default set of bindings (keyboard + gamepad).
 * @returns {Binding[]}
 */
export function createDefaultBindings() {
  return [
    ...createDefaultKeyboardBindings(),
    ...createDefaultGamepadBindings(),
  ];
}

/**
 * Create default keyboard bindings.
 * @returns {Binding[]}
 */
export function createDefaultKeyboardBindings() {
  return [
    // WASD movement — digital
    { intent: "MOVE_UP",    source: { device: "keyboard", code: "KeyW" } },
    { intent: "MOVE_DOWN",  source: { device: "keyboard", code: "KeyS" } },
    { intent: "MOVE_LEFT",  source: { device: "keyboard", code: "KeyA" } },
    { intent: "MOVE_RIGHT", source: { device: "keyboard", code: "KeyD" } },

    // Arrow keys — digital
    { intent: "MOVE_UP",    source: { device: "keyboard", code: "ArrowUp" } },
    { intent: "MOVE_DOWN",  source: { device: "keyboard", code: "ArrowDown" } },
    { intent: "MOVE_LEFT",  source: { device: "keyboard", code: "ArrowLeft" } },
    { intent: "MOVE_RIGHT", source: { device: "keyboard", code: "ArrowRight" } },

    // WASD → analog (key-as-analog with value)
    { intent: "MOVE_X", source: { device: "keyboard", code: "KeyA" },       value: -1 },
    { intent: "MOVE_X", source: { device: "keyboard", code: "KeyD" },       value:  1 },
    { intent: "MOVE_Y", source: { device: "keyboard", code: "KeyW" },       value: -1 },
    { intent: "MOVE_Y", source: { device: "keyboard", code: "KeyS" },       value:  1 },

    // Arrow keys → analog
    { intent: "MOVE_X", source: { device: "keyboard", code: "ArrowLeft" },  value: -1 },
    { intent: "MOVE_X", source: { device: "keyboard", code: "ArrowRight" }, value:  1 },
    { intent: "MOVE_Y", source: { device: "keyboard", code: "ArrowUp" },    value: -1 },
    { intent: "MOVE_Y", source: { device: "keyboard", code: "ArrowDown" },  value:  1 },

    // Modifiers
    { intent: "JUMP",   source: { device: "keyboard", code: "Space" } },
    { intent: "SPRINT", source: { device: "keyboard", code: "ShiftLeft" } },
    { intent: "CROUCH", source: { device: "keyboard", code: "ControlLeft" } },

    // Interaction
    { intent: "INTERACT", source: { device: "keyboard", code: "KeyE" } },
    { intent: "RELOAD",   source: { device: "keyboard", code: "KeyR" } },
    { intent: "USE_ITEM", source: { device: "keyboard", code: "KeyQ" } },

    // Navigation
    { intent: "CONFIRM", source: { device: "keyboard", code: "Enter" } },
    { intent: "CANCEL",  source: { device: "keyboard", code: "Escape" } },
    { intent: "MENU",    source: { device: "keyboard", code: "Tab" } },
  ];
}

/**
 * Create default gamepad bindings (Xbox layout).
 * @returns {Binding[]}
 */
export function createDefaultGamepadBindings() {
  return [
    // Left stick → analog movement
    { intent: "MOVE_X", source: { device: "gamepad", type: "axis", index: 0 } },
    { intent: "MOVE_Y", source: { device: "gamepad", type: "axis", index: 1 } },

    // Left stick → digital movement (axis-as-digital)
    { intent: "MOVE_LEFT",  source: { device: "gamepad", type: "axis", index: 0, direction: -1, threshold: 0.5 } },
    { intent: "MOVE_RIGHT", source: { device: "gamepad", type: "axis", index: 0, direction:  1, threshold: 0.5 } },
    { intent: "MOVE_UP",    source: { device: "gamepad", type: "axis", index: 1, direction: -1, threshold: 0.5 } },
    { intent: "MOVE_DOWN",  source: { device: "gamepad", type: "axis", index: 1, direction:  1, threshold: 0.5 } },

    // Right stick → analog aim
    { intent: "AIM_X", source: { device: "gamepad", type: "axis", index: 2 } },
    { intent: "AIM_Y", source: { device: "gamepad", type: "axis", index: 3 } },

    // Face buttons
    { intent: "JUMP",     source: { device: "gamepad", type: "button", index: 0 } },  // A
    { intent: "DODGE",    source: { device: "gamepad", type: "button", index: 1 } },  // B
    { intent: "INTERACT", source: { device: "gamepad", type: "button", index: 2 } },  // X
    { intent: "USE_ITEM", source: { device: "gamepad", type: "button", index: 3 } },  // Y

    // Bumpers
    { intent: "SECONDARY", source: { device: "gamepad", type: "button", index: 4 } }, // LB
    { intent: "PRIMARY",   source: { device: "gamepad", type: "button", index: 5 } }, // RB

    // Triggers
    { intent: "CROUCH", source: { device: "gamepad", type: "button", index: 6 } },    // LT
    { intent: "SPRINT", source: { device: "gamepad", type: "button", index: 7 } },    // RT

    // Meta
    { intent: "MENU",  source: { device: "gamepad", type: "button", index: 8 } },     // Back
    { intent: "PAUSE", source: { device: "gamepad", type: "button", index: 9 } },     // Start
  ];
}

/**
 * Serialize bindings to a JSON string.
 * @param {Binding[]} bindings
 * @returns {string}
 */
export function serializeBindings(bindings) {
  return JSON.stringify(bindings);
}

/**
 * Deserialize bindings from a JSON string.
 * @param {string} json
 * @returns {Binding[]}
 */
export function deserializeBindings(json) {
  return JSON.parse(json);
}
