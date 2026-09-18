#!/usr/bin/env bash
#
# Installs the extension to the GNOME extensions folder.
#
# Usage:
#   bazel build :install-extension
#   ./bazel-bin/install-extension

set -Eeuo pipefail

BASEDIR="$(cd -- "$(dirname -- "$0")" && pwd)"
UUID="gSnap2@dicenameismy"
EXTDIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
UPDATEDIR="$HOME/.local/share/gnome-shell/extension-updates/$UUID"
DISTDIR="$BASEDIR/dist"
SCHEMADIR="$DISTDIR/schemas"

if ! command -v glib-compile-schemas >/dev/null 2>&1; then
    echo "Error: glib-compile-schemas is not installed or not in PATH." >&2
    echo "Install the GLib development/runtime tools for your distribution." >&2
    exit 1
fi

if [[ ! -d "$DISTDIR" ]]; then
    echo "Error: distribution directory does not exist: $DISTDIR" >&2
    exit 1
fi

if [[ ! -f "$DISTDIR/metadata.json" ]]; then
    echo "Error: metadata.json is missing from $DISTDIR" >&2
    exit 1
fi

if [[ -d "$SCHEMADIR" ]]; then
    echo "Compiling GSettings schemas in $SCHEMADIR"
    glib-compile-schemas --strict "$SCHEMADIR"
fi

echo "Installing from $DISTDIR"

rm -rf -- "$EXTDIR" "$UPDATEDIR"
mkdir -p -- "$EXTDIR"

cp -a -- "$DISTDIR"/. "$EXTDIR"/

echo
echo "Installation complete: $EXTDIR"

if [[ -f "$EXTDIR/schemas/gschemas.compiled" ]]; then
    echo "Compiled schema installed successfully."
fi

echo
echo "Restart GNOME Shell to pick up changes."
echo "On Xorg: press Alt+F2, type r, then press Enter."
echo "On Wayland: log out and back in, or restart the session."