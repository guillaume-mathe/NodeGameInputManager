/**
 * Intent constant definitions with type metadata.
 *
 * Each intent has a `type` of either "digital" (boolean on/off) or
 * "analog" (float value from -1 to 1).
 *
 * @typedef {"digital" | "analog"} IntentType
 * @typedef {{ type: IntentType }} IntentDef
 */

/** @type {Readonly<Record<string, IntentDef>>} */
export const INTENTS = Object.freeze({
  // Movement — digital
  MOVE_UP:    { type: "digital" },
  MOVE_DOWN:  { type: "digital" },
  MOVE_LEFT:  { type: "digital" },
  MOVE_RIGHT: { type: "digital" },

  // Movement — 3D / FPS
  FORWARD:      { type: "digital" },
  BACKWARD:     { type: "digital" },
  STRAFE_LEFT:  { type: "digital" },
  STRAFE_RIGHT: { type: "digital" },

  // Movement — analog
  MOVE_X: { type: "analog" },
  MOVE_Y: { type: "analog" },

  // Actions
  PRIMARY:   { type: "digital" },
  SECONDARY: { type: "digital" },
  TERTIARY:  { type: "digital" },

  // Navigation
  CONFIRM: { type: "digital" },
  CANCEL:  { type: "digital" },
  PAUSE:   { type: "digital" },
  MENU:    { type: "digital" },

  // Camera — analog
  AIM_X: { type: "analog" },
  AIM_Y: { type: "analog" },

  // Camera — digital
  ZOOM_IN:  { type: "digital" },
  ZOOM_OUT: { type: "digital" },

  // Modifiers
  SPRINT: { type: "digital" },
  CROUCH: { type: "digital" },
  JUMP:   { type: "digital" },

  // Interaction
  INTERACT: { type: "digital" },
  USE_ITEM: { type: "digital" },
  RELOAD:   { type: "digital" },
  DODGE:    { type: "digital" },
});

/** All intent names as an array. */
export const INTENT_NAMES = /** @type {string[]} */ (Object.keys(INTENTS));
