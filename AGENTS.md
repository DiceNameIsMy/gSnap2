# Repository Guidelines

## Project Purpose

gSnap2 is a personal fork of gSnap for GNOME Shell window snapping. Preserve the fork’s fixes for tiling maximized windows and choosing the focused window’s monitor independently of the pointer. Recent commits and current code take precedence over outdated upstream comments or documentation. Keep the extension identity `gSnap2@dicenameismy` consistent with its metadata and installer.

## Project Structure & Module Organization

- `src/extension/`: TypeScript implementation; `app.ts` coordinates behavior, `monitors.ts` handles monitor selection, `hotkeys.ts` binds shortcuts, and `prefs_builder.ts` builds preferences. Layout and editor modules manage snap zones.
- `src/schemas/`: GSettings XML, compiled schema, and the generator for `src/extension/settings_data.ts`.
- `src/images/` and `src/stylesheet.css`: runtime visuals; `assets/`: repository artwork.
- `build/` and `dist/`: generated JavaScript and packaged extension files. No automated test directory exists.

## Build, Test, and Development Commands

- `npm install`: install development dependencies. This checkout lacks a lockfile, so the documented/CI `npm ci` requires one first.
- `npm run build`: run strict TypeScript compilation, then bundle extension and preferences with Rollup.
- `npm run gen-schemas`: regenerate compiled schemas and settings typings after XML changes; requires `glib-compile-schemas` and invokes `ts-node` through npx.
- `npm run install-extension`: build and replace the local installation under `~/.local/share/gnome-shell/extensions/gSnap2@dicenameismy`.
- `npm run pack`: zip an existing `dist/` into `dist.zip`.

Restart Shell after installation: Alt+F2, then `r` on Xorg; log out and back in on Wayland.

## Coding Style & Naming Conventions

Use four-space indentation and semicolons in TypeScript. Follow surrounding quote and brace styles; no formatter or linter is configured. Use camelCase for functions/variables, PascalCase for classes/types, and existing snake_case module filenames. Regenerate `settings_data.ts` instead of hand-editing it.

## Testing Guidelines

No test framework or coverage threshold is configured. Run `npm run build` and manually verify affected behavior in GNOME Shell. For snapping changes, check maximized windows, screen edges, and multiple monitors with pointer and focus on different displays. Inspect logs with `journalctl /usr/bin/gnome-shell -f -o cat`.

## Commit & Pull Request Guidelines

History uses short imperative subjects, sometimes prefixed with `fix:`; no strict convention is enforced. Keep changes focused. PRs should explain the behavior change, link relevant issues, and record build/manual checks with GNOME version and session type. Include screenshots for visible UI changes.
