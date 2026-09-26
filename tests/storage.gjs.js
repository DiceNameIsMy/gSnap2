import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { LayoutsUtils } from './layouts-utils.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}
function contents(path) {
    return new TextDecoder().decode(GLib.file_get_contents(path)[1]);
}
const store = new LayoutsUtils(GLib.get_user_config_dir());
const legacy = '{\n "workspaces": [[{"current": 0}]], "definitions": [{"name":"None","type":0,"length":100,"items":[]}]\n}';
GLib.mkdir_with_parents(store.configPath, 448);
GLib.file_set_contents(store.layoutsPath, legacy);
const loaded = store.loadLayoutSettings();
const migrated = { version: 2, profiles: {}, definitions: loaded.definitions };
assert(store.saveSettings(migrated), 'Migration/save must succeed using real Gio');
assert(JSON.parse(contents(store.layoutsPath)).version === 2, 'Version 2 must round-trip');
const directory = Gio.File.new_for_path(store.configPath).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
const backups = [];
let entry;
while ((entry = directory.next_file(null))) {
    if (entry.get_name().endsWith('.bak')) backups.push(entry.get_name());
}
directory.close(null);
assert(backups.length === 1, 'Exactly one backup expected');
assert(contents(GLib.build_filenamev([store.configPath, backups[0]])) === legacy, 'Backup must preserve original bytes');
assert(store.saveSettings(migrated), 'Subsequent save must succeed');
print('PASS: atomic save, migration backup and version 2 round-trip');

GLib.file_set_contents(store.layoutsPath, '{invalid');
store.loadLayoutSettings();
assert(!store.writable, 'Invalid JSON must block writes');
assert(!store.saveSettings(migrated), 'Must refuse to overwrite damaged settings');
assert(contents(store.layoutsPath) === '{invalid', 'Damaged file must be preserved');
print('PASS: malformed settings preservation');

GLib.file_set_contents(store.layoutsPath, legacy);
store.loadLayoutSettings();
const originalPath = store.layoutsPath + '.moved';
GLib.rename(store.layoutsPath, originalPath);
assert(!store.saveSettings(migrated), 'Missing migration source must fail backup and block save');
assert(!GLib.file_test(store.layoutsPath, GLib.FileTest.EXISTS), 'Backup failure must not write replacement');
assert(contents(originalPath) === legacy, 'Original contents must survive');
print('PASS: backup failure blocks migration');

GLib.rename(originalPath, store.layoutsPath);
store.loadLayoutSettings();
GLib.rename(store.layoutsPath, originalPath);
GLib.mkdir_with_parents(store.layoutsPath, 448);
// A fresh writer trying to replace a directory must report the error.
const second = new LayoutsUtils(GLib.get_user_config_dir());
assert(!second.saveSettings(migrated), 'Replacing a directory must fail');
assert(GLib.file_test(store.layoutsPath, GLib.FileTest.IS_DIR), 'Failed replacement must preserve destination');
print('PASS: replacement errors are reported');
