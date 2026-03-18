# API Reference

## IntentManager

The core class. Manages devices, resolves bindings, and produces intent states via `poll()`.

```js
import { IntentManager } from "node-game-input-manager";
```

### `new IntentManager(opts?)`

| Option | Type | Default | Description |
|---|---|---|---|
| `keyboard` | `boolean` | `true` | Enable keyboard input |
| `gamepad` | `boolean` | `false` | Enable gamepad input |
| `gamepadIndex` | `number` | `0` | Which gamepad index to read |
| `gamepadDeadZone` | `number` | `0.1` | Axis dead zone threshold |
| `bindings` | `Binding[]` | `createDefaultBindings()` | Initial binding set |
| `debounce` | `Record<string, number>` | `{}` | Per-intent debounce cooldowns in ms |
| `keyboardTarget` | `EventTarget` | `globalThis` | Element to listen for keyboard events |

### `poll(): PollResult`

Polls all enabled devices, resolves bindings, computes edge detection and debounce, and returns a flat object keyed by intent name.

Call once per game tick.

```js
const intent = input.poll();

intent.JUMP.active;       // true if held
intent.JUMP.justPressed;  // true on first frame of press
intent.JUMP.justReleased; // true on first frame of release
intent.JUMP.value;        // 1 (digital) or 0

intent.MOVE_X.value;      // -1..1 (analog)
intent.MOVE_X.active;     // |value| > 0
```

**Return type — `PollResult`:**

```ts
type PollResult = Record<string, IntentState>;

interface IntentState {
  active: boolean;       // Currently active
  justPressed: boolean;  // Became active this frame
  justReleased: boolean; // Became inactive this frame
  value: number;         // 0 or 1 for digital, -1..1 for analog
}
```

Every intent is always present in the result, even if no binding exists for it (defaults to inactive/zero).

**Resolution rules:**
- **Digital intents:** OR across all bound sources — any source active makes the intent active, `value` is `0` or `1`
- **Analog intents:** max magnitude wins — the source with the largest `|value|` determines the intent value, `active` is `|value| > 0`

### `setBindings(bindings)`

Replace all bindings.

| Param | Type | Description |
|---|---|---|
| `bindings` | `Binding[]` | New binding set |

### `addBinding(binding)`

Append a single binding.

| Param | Type | Description |
|---|---|---|
| `binding` | `Binding` | Binding to add |

### `removeBinding(intent, source)`

Remove a specific binding by intent name and source match.

| Param | Type | Description |
|---|---|---|
| `intent` | `string` | Intent name (e.g. `"JUMP"`) |
| `source` | `Source` | Source to match |

Source matching compares:
- **Keyboard:** `code`
- **Gamepad button:** `index`
- **Gamepad axis:** `index`, `direction`, `threshold`

### `getBindings(): Binding[]`

Returns the current bindings array. Use with `serializeBindings()` for persistence.

### `setDebounce(intent, ms)`

Set a per-intent debounce cooldown. Only suppresses `justPressed` edges — `active` is unaffected.

| Param | Type | Description |
|---|---|---|
| `intent` | `string` | Intent name |
| `ms` | `number` | Cooldown in milliseconds. Pass `0` or negative to remove. |

When debounce is active, `justPressed` fires at most once per cooldown window. A held button remains `active: true` but won't re-trigger `justPressed` until the cooldown expires after a release-and-repress.

### `dispose()`

Detach all devices and clear internal state. The instance should not be used after disposal.

---

## Bindings

```js
import {
  createDefaultBindings,
  createDefaultKeyboardBindings,
  createDefaultGamepadBindings,
  serializeBindings,
  deserializeBindings,
} from "node-game-input-manager";
```

### Binding Type

```ts
interface Binding {
  intent: string;   // Intent name (e.g. "JUMP", "MOVE_X")
  source: Source;    // Device source
  value?: number;    // Explicit value for digital-to-analog promotion
}
```

### Source Types

**Keyboard:**
```ts
{ device: "keyboard", code: string }
```
`code` uses the [KeyboardEvent.code](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code) standard — physical key position, layout-independent (e.g. `"KeyW"`, `"Space"`, `"ShiftLeft"`).

**Gamepad button:**
```ts
{ device: "gamepad", type: "button", index: number }
```
`index` is the [Gamepad.buttons](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/buttons) index (0 = A, 1 = B, etc. on standard mapping).

**Gamepad axis (analog):**
```ts
{ device: "gamepad", type: "axis", index: number }
```
`index` is the [Gamepad.axes](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/axes) index (0 = left stick X, 1 = left stick Y, etc.). Returns the raw axis value after dead zone filtering.

**Gamepad axis-as-digital:**
```ts
{ device: "gamepad", type: "axis", index: number, direction: number, threshold: number }
```
Converts an axis to a digital signal. Active when the axis value crosses `threshold` in the given `direction` (`1` for positive, `-1` for negative).

### `createDefaultBindings(): Binding[]`

Returns the full default binding set (keyboard + gamepad). See [Default Bindings](../README.md#default-bindings) for the complete mapping.

### `createDefaultKeyboardBindings(): Binding[]`

Returns only the keyboard portion of the default bindings.

### `createDefaultGamepadBindings(): Binding[]`

Returns only the gamepad portion of the default bindings (Xbox layout).

### `serializeBindings(bindings): string`

Serializes a bindings array to a JSON string. Suitable for `localStorage` or file storage.

### `deserializeBindings(json): Binding[]`

Deserializes a JSON string back to a bindings array.

---

## Intents

```js
import { INTENTS, INTENT_NAMES } from "node-game-input-manager";
```

### `INTENTS: Record<string, { type: "digital" | "analog" }>`

Frozen map of all 28 intent names to their type metadata.

```js
INTENTS.JUMP    // { type: "digital" }
INTENTS.MOVE_X  // { type: "analog" }
```

### `INTENT_NAMES: string[]`

Array of all intent name strings. Useful for iteration.

### Intent List

| Name | Type |
|---|---|
| `MOVE_UP` | digital |
| `MOVE_DOWN` | digital |
| `MOVE_LEFT` | digital |
| `MOVE_RIGHT` | digital |
| `FORWARD` | digital |
| `BACKWARD` | digital |
| `STRAFE_LEFT` | digital |
| `STRAFE_RIGHT` | digital |
| `MOVE_X` | analog |
| `MOVE_Y` | analog |
| `PRIMARY` | digital |
| `SECONDARY` | digital |
| `TERTIARY` | digital |
| `CONFIRM` | digital |
| `CANCEL` | digital |
| `PAUSE` | digital |
| `MENU` | digital |
| `AIM_X` | analog |
| `AIM_Y` | analog |
| `ZOOM_IN` | digital |
| `ZOOM_OUT` | digital |
| `SPRINT` | digital |
| `CROUCH` | digital |
| `JUMP` | digital |
| `INTERACT` | digital |
| `USE_ITEM` | digital |
| `RELOAD` | digital |
| `DODGE` | digital |

---

## Devices

Low-level device classes. These are used internally by `IntentManager` but are exported for advanced use cases (e.g. custom input pipelines, debugging).

### KeyboardDevice

```js
import { KeyboardDevice } from "node-game-input-manager";
```

#### `new KeyboardDevice(target?)`

| Param | Type | Default | Description |
|---|---|---|---|
| `target` | `EventTarget` | `globalThis` | Element to listen on |

Auto-attaches on construction.

#### `poll(): { keys: Set<string>, justPressed: Set<string>, justReleased: Set<string> }`

Returns a snapshot of current keyboard state:
- `keys` — currently held key codes
- `justPressed` — keys pressed since last `poll()`
- `justReleased` — keys released since last `poll()`

Accumulators are cleared after each `poll()` call.

#### `enabled: boolean`

Get/set. Disabling detaches listeners and clears all state.

#### `attach(target)` / `detach()`

Manually attach to or detach from an `EventTarget`.

---

### GamepadDevice

```js
import { GamepadDevice } from "node-game-input-manager";
```

#### `new GamepadDevice(opts?)`

| Option | Type | Default | Description |
|---|---|---|---|
| `deadZone` | `number` | `0.1` | Axis dead zone — values below this are zeroed |

Auto-attaches to `globalThis` in browser environments.

#### `poll(): { gamepads: Array<{ index, id, axes, buttons }> }`

Returns all connected gamepads:
- `index` — gamepad index
- `id` — gamepad identifier string
- `axes` — `number[]` with dead zone applied
- `buttons` — `boolean[]` of pressed states

#### `enabled: boolean`

Get/set. Disabling detaches listeners and clears connected indices.

#### `attach(target)` / `detach()`

Manually attach to or detach from an `EventTarget` for gamepadconnected/gamepaddisconnected events.
