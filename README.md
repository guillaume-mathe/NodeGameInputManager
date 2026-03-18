# node-game-input-manager

Intent-mapping input layer for real-time browser games. Maps raw keyboard and gamepad input to abstract, remappable intent constants (`MOVE_X`, `JUMP`, `PRIMARY`, etc.) that game code consumes via a single `poll()` call each tick.

Designed for server-authoritative games using [node-game-client](https://github.com/anthropics/node-game-client) and [node-game-server](https://github.com/anthropics/node-game-server), but works standalone with any game loop.

## Install

```bash
npm install node-game-input-manager
```

## Quick Start

```js
import { IntentManager } from "node-game-input-manager";

const input = new IntentManager({
  keyboard: true,
  gamepad: true,
  debounce: { PRIMARY: 100, INTERACT: 250 },
});

// Call once per fixed-timestep tick
function update(sendAction) {
  const intent = input.poll();

  const dx = intent.MOVE_X.value * SPEED;
  const dy = intent.MOVE_Y.value * SPEED;
  if (dx !== 0 || dy !== 0) sendAction({ type: "MOVE", dx, dy });

  if (intent.JUMP.justPressed) sendAction({ type: "JUMP" });
  if (intent.PRIMARY.justPressed) sendAction({ type: "FIRE" });
}
```

## How It Works

```
Keyboard/Gamepad  →  Bindings  →  IntentManager.poll()  →  Intent states
     raw input        mapping       resolve + edges          game consumes
```

1. **Devices** capture raw input (key codes, button presses, axis values)
2. **Bindings** map each device source to an intent name, with optional value promotion
3. **`poll()`** resolves all bindings, applies OR/max-magnitude across sources, computes edge detection and debounce
4. **Game code** reads the flat result object — every intent is always present with `active`, `justPressed`, `justReleased`, and `value`

## Intents

28 built-in intents across 7 categories:

| Category | Digital | Analog |
|---|---|---|
| Movement | `MOVE_UP` `MOVE_DOWN` `MOVE_LEFT` `MOVE_RIGHT` `FORWARD` `BACKWARD` `STRAFE_LEFT` `STRAFE_RIGHT` | `MOVE_X` `MOVE_Y` |
| Actions | `PRIMARY` `SECONDARY` `TERTIARY` | |
| Navigation | `CONFIRM` `CANCEL` `PAUSE` `MENU` | |
| Camera | `ZOOM_IN` `ZOOM_OUT` | `AIM_X` `AIM_Y` |
| Modifiers | `SPRINT` `CROUCH` `JUMP` | |
| Interaction | `INTERACT` `USE_ITEM` `RELOAD` `DODGE` | |

**Digital** intents have `value` of `0` or `1` and boolean `active`.
**Analog** intents have `value` from `-1` to `1` and `active` is `|value| > 0`.

## Default Bindings

### Keyboard

| Key | Intent |
|---|---|
| W / ArrowUp | `MOVE_UP`, `MOVE_Y` (value: -1) |
| S / ArrowDown | `MOVE_DOWN`, `MOVE_Y` (value: 1) |
| A / ArrowLeft | `MOVE_LEFT`, `MOVE_X` (value: -1) |
| D / ArrowRight | `MOVE_RIGHT`, `MOVE_X` (value: 1) |
| Space | `JUMP` |
| Shift | `SPRINT` |
| Ctrl | `CROUCH` |
| E | `INTERACT` |
| R | `RELOAD` |
| Q | `USE_ITEM` |
| Enter | `CONFIRM` |
| Escape | `CANCEL` |
| Tab | `MENU` |

### Gamepad (Xbox layout)

| Input | Intent |
|---|---|
| Left stick | `MOVE_X` / `MOVE_Y` (analog) + digital directions |
| Right stick | `AIM_X` / `AIM_Y` |
| A (0) | `JUMP` |
| B (1) | `DODGE` |
| X (2) | `INTERACT` |
| Y (3) | `USE_ITEM` |
| LB (4) | `SECONDARY` |
| RB (5) | `PRIMARY` |
| LT (6) | `CROUCH` |
| RT (7) | `SPRINT` |
| Back (8) | `MENU` |
| Start (9) | `PAUSE` |

## Custom Bindings

```js
import { IntentManager, createDefaultKeyboardBindings } from "node-game-input-manager";

// Start from keyboard defaults, add a custom binding
const bindings = [
  ...createDefaultKeyboardBindings(),
  { intent: "PRIMARY", source: { device: "keyboard", code: "KeyF" } },
];

const input = new IntentManager({ bindings });
```

### Binding Format

A binding is a plain object: `{ intent, source, value? }`

**Keyboard source:**
```js
{ device: "keyboard", code: "KeyW" }
```

**Gamepad button source:**
```js
{ device: "gamepad", type: "button", index: 0 }
```

**Gamepad axis source (analog):**
```js
{ device: "gamepad", type: "axis", index: 0 }
```

**Gamepad axis-as-digital source:**
```js
{ device: "gamepad", type: "axis", index: 1, direction: -1, threshold: 0.5 }
```

### Cross-Type Promotion

A digital source (key/button) can drive an analog intent by adding `value`:

```js
{ intent: "MOVE_X", source: { device: "keyboard", code: "KeyA" }, value: -1 }
```

An analog source (axis) can drive a digital intent by adding `direction` + `threshold`:

```js
{ intent: "MOVE_UP", source: { device: "gamepad", type: "axis", index: 1, direction: -1, threshold: 0.5 } }
```

### Persistence

```js
import { serializeBindings, deserializeBindings } from "node-game-input-manager";

// Save to localStorage
localStorage.setItem("bindings", serializeBindings(input.getBindings()));

// Restore
const saved = localStorage.getItem("bindings");
if (saved) input.setBindings(deserializeBindings(saved));
```

## API Reference

Full API documentation: [docs/api.md](docs/api.md)

## Development

```bash
npm install
npm test          # vitest
npm run build     # esbuild bundles + TypeScript declarations
```

Requires Node.js >= 22.

## License

ISC
