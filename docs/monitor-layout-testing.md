# Testing persistent display layouts

Layouts now belong to a physical display and apply across all workspaces. Choose
2 Column Split for the laptop and 3 Column for the external monitor once. The menu
shows the display name, connector and selected layout.

## Install and start

From the repository directory:

```bash
npm test
npm run install-extension
```

Restart GNOME Shell: on Xorg, press Alt+F2, enter `r`, then Enter. On Wayland, log
out and back in. Installing alone does not reload the running extension.

For the first start, connect the displays you want to migrate and use the workspace
whose existing selections you want to keep. Existing settings are copied, byte for
byte, to `${XDG_CONFIG_HOME:-~/.config}/gSnap2/layouts.json.v1-<unique-id>.bak`
before migration. Only connected displays are migrated. Legacy workspace-specific
choices become one choice per display from the active workspace. Newly encountered
displays start with None; set their layout in the menu.

## Manual acceptance checklist

Record GNOME version (`gnome-shell --version`) and session type
(`echo "$XDG_SESSION_TYPE"`), then mark each applicable row pass or fail.
Allow roughly a second for display discovery after a display change.

| Action | Expected result |
| --- | --- |
| Select 2 columns on the laptop and 3 on the external display | Menu shows each choice under its display name; changing one does not change the other |
| Switch workspaces and create a new workspace | Laptop stays at 2 columns, external stays at 3 |
| Disconnect the external display | Laptop retains 2 columns |
| Reconnect the external display | External returns to 3 columns, laptop stays at 2 |
| Change which display is primary and move it left/right | Choices remain attached to physical displays |
| Change resolution, scale and orientation | Choices stay the same and zones use the new work area |
| Close/reopen the lid while docked | Each active display restores its own choice |
| Log out/in or disable/enable the extension | Both choices persist |
| Connect through another port, if available | A display with a usable unique serial retains its choice; connector fallback may appear as a new display |
| Mirror displays, then return to extended mode | One deterministically chosen profile drives the shared area; the other display's saved choice survives |
| Snap maximized windows and windows at screen edges | Snapping still works with the expected geometry |
| Put focus on one display and pointer on the other; use snapping/layout shortcuts | Shortcuts target the focused window's display |
| Enable/disable debug logging repeatedly, then reconnect | No duplicate actions, errors or stale display menus |

Mutter marks a *logical* monitor primary, but does not identify a physical primary
inside a mirror group. The extension selects a mirror member by stable identity
ordering and shows its name and all mirrored connectors in the menu. Changing a
layout while mirrored changes only that member's profile.

Missing, placeholder or duplicate serials use connector-qualified keys. Once a
serial has been observed as ambiguous, its connector profiles remain separate even
when one display is disconnected. Two identical displays with indistinguishable
serials cannot reliably be recognized after swapping their ports.

A display change cancels an open layout edit without saving it, and restores any
windows minimized for editing. Save an edit before changing display configuration.

## If something fails: capture and paste a report

Enable detailed logging **before reproducing** the problem:

```bash
GSNAP2_SCHEMA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/gSnap2@dicenameismy/schemas"
gsettings --schemadir "$GSNAP2_SCHEMA_DIR" set org.gnome.shell.extensions.gsnap2 debug true
```

This setting restarts the extension. Then reproduce the problem, note the time,
and run the collector from this repository:

```bash
bash scripts/collect-monitor-diagnostics.sh '15 minutes ago' > /tmp/gsnap2-monitor-report.txt
cat /tmp/gsnap2-monitor-report.txt
```

For a longer reproduction, replace `15 minutes ago` with, for example,
`1 hour ago` or a timestamp such as `2026-09-26 14:30:00`. The journal is restricted
to the current boot and the last 1500 matching entries. Collect promptly; if the
start of your reproduction has been truncated, reproduce a shorter sequence.
The collector reads state only, continues after failed commands, and uploads nothing.

Paste the output between BEGIN and END along with:

```text
GNOME version / Xorg or Wayland:
Steps:
Expected:
Actual:
Approximate failure time:
Diagnostic report:
```

Reports include monitor serials, custom layout names, file paths, and Shell logs
that may contain window titles or other extensions' messages. You can redact these;
keep repeated monitor identifiers consistent so mappings can still be compared.
The installed/checkout bundle checksums help detect an old installation or build.

After collecting the report, disable detailed logging:

```bash
GSNAP2_SCHEMA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/gSnap2@dicenameismy/schemas"
gsettings --schemadir "$GSNAP2_SCHEMA_DIR" set org.gnome.shell.extensions.gsnap2 debug false
```

For live observation while reproducing:

```bash
journalctl /usr/bin/gnome-shell -f -o cat
```

## Interpreting failures and recovery

- `discovery-start` and `mapping` show the event, Shell index, connector, persistent
  key and whether identification used a serial or connector fallback.
- `restore` shows the layout applied and workspace. `selection` shows an explicit
  choice; `persist` confirms a successful save. Automatic restoration does not
  change the saved choice.
- `discovery-failed` means profiles could not safely be resolved. The extension uses
  None temporarily and disables layout selection. Use **Retry display detection**
  in the extension menu, or reconnect the display. Saved choices remain intact.
- `settings-load-failed` leaves the original file untouched and blocks writes.
  Copy the report before repairing/restoring the JSON file, then restart the
  extension. Retrying discovery alone does not reload a damaged file.
- `persist-failed` reports an inability to back up or atomically replace settings.
  A failed layout selection keeps the previous selection. Check the reported path
  and permissions; repair the cause and retry. Migration never proceeds without a
  successful backup and save.
- `restore-invalid-layout` means a saved layout index no longer exists. None is
  temporary; the invalid saved reference remains available for diagnosis. Selecting
  a valid layout explicitly repairs that display's reference.

To roll back migration, disable the extension first, retain a copy of the current
`layouts.json`, restore the desired `layouts.json.v1-*.bak` as `layouts.json`, and
install the previous extension version before restarting Shell. Restoring a legacy
file while keeping the new extension will migrate it again on the next start.

## Automated coverage and remaining live checks

`npm test` runs pure profile/identity/migration tests and lifecycle tests with Shell
stubs. `npm run build` checks strict TypeScript and bundles the extension.
`npm run test:storage` additionally requires `gjs` and checks real Gio atomic writes,
byte-preserving backups, malformed-file protection and write failures in an isolated
temporary configuration directory. Expected failure-path log messages are printed
by that test; its exit status indicates whether assertions passed.
These cannot establish Mutter/Shell behavior in a real graphical session: the
manual checklist above is the acceptance test for reconnects, lid changes, window
geometry and session persistence. Record actual results instead of assuming that
successful compilation proves those behaviors.
