# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Intent-mapping input layer for real-time games. Sits on top of raw device input (keyboard, gamepad) and produces abstract intent constants (`MOVE_UP`, `JUMP`, `PRIMARY`, etc.) that game code consumes via `poll()`. Designed for server-authoritative games where input is sampled once per fixed-timestep tick.

Requires Node.js >= 22.

## Commands

### Run tests

```bash
npm test
```

Runs `vitest run` using Vitest.

### Build

```bash
npm run build
```

Produces ESM + IIFE bundles in `dist/` via esbuild, plus TypeScript declarations from JSDoc.

### Install dependencies

```bash
npm install
```

## Architecture

### Intent Constants (`src/intents.js`)

Frozen map of intent name → `{ type: "digital" | "analog" }`. 28 intents across movement, actions, navigation, camera, modifiers, and interaction categories.

### Binding System (`src/bindings.js`)

Bindings are JSON-serializable objects `{ intent, source, value? }` that map device inputs to intents. Supports keyboard keys, gamepad buttons, gamepad axes (raw for analog, axis-as-digital with direction+threshold). Multiple bindings per intent with OR logic. Exports `createDefaultBindings()`, `serializeBindings()`, `deserializeBindings()`.

### IntentManager (`src/IntentManager.js`)

Core class. Owns devices + bindings, produces poll() output with `active`, `justPressed`, `justReleased`, `value` for every intent. Supports per-intent debounce (suppresses `justPressed` edge only, not `active`). Runtime rebinding via `setBindings()`, `addBinding()`, `removeBinding()`. Runtime intent remapping via `setIntentMap()` / `clearIntentMap()` for illness effects (e.g. 180° reverse, 90° rotation). Custom intent definitions via `customIntents` constructor option or `registerIntent()` / `unregisterIntent()` at runtime.

### Device Layer (`src/devices/`)

`KeyboardDevice` and `GamepadDevice` — adapted from NodeGameClient. Same attach/detach/poll pattern. Standalone, no external imports.

## Conventions

- ES modules (`"type": "module"`)
- JSDoc for public API documentation
- camelCase for methods/variables
- Vitest for tests
- esbuild for bundling, TypeScript for declaration-only emit
