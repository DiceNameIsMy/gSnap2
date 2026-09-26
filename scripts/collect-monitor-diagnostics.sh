#!/usr/bin/env bash
# Read-only: does not change GNOME settings, display configuration or saved profiles.
set -u

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
EXTENSION_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/gSnap2@dicenameismy"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/gSnap2"
SINCE="${1:-15 minutes ago}"

section() {
    printf '\n--- %s ---\n' "$1"
    shift
    "$@" 2>&1
    local result=$?
    if (( result != 0 )); then
        printf '[Command failed with exit code %s; continuing]\n' "$result"
    fi
    return 0
}

printf '===== BEGIN gSnap2 MONITOR DIAGNOSTICS =====\n'
section 'Capture time' date --iso-8601=seconds
printf '\nSession type: %s\nDesktop: %s\n' "${XDG_SESSION_TYPE:-unknown}" "${XDG_CURRENT_DESKTOP:-unknown}"
section 'GNOME version' gnome-shell --version
section 'Extension status' timeout 10s gnome-extensions info 'gSnap2@dicenameismy'
section 'Installed metadata' cat "$EXTENSION_DIR/metadata.json"
section 'Installed bundle checksum (distinguishes local builds)' sha256sum "$EXTENSION_DIR/extension.js"
section 'Checkout revision' git -C "$REPO_DIR" rev-parse HEAD
section 'Checkout changes' git -C "$REPO_DIR" status --short
section 'Checkout bundle checksum' sha256sum "$REPO_DIR/dist/extension.js"
section 'Debug setting' gsettings --schemadir "$EXTENSION_DIR/schemas" get org.gnome.shell.extensions.gsnap2 debug
section 'Mutter current state' timeout 10s gdbus call --session \
    --dest org.gnome.Mutter.DisplayConfig --object-path /org/gnome/Mutter/DisplayConfig \
    --method org.gnome.Mutter.DisplayConfig.GetCurrentState
section 'Saved layouts and display profiles' cat "$CONFIG_DIR/layouts.json"
section "GNOME Shell journal since: $SINCE (last 1500 entries; includes unprefixed errors)" \
    journalctl -b /usr/bin/gnome-shell --since "$SINCE" -n 1500 --no-pager -o short-iso
printf '\n===== END gSnap2 MONITOR DIAGNOSTICS =====\n'
