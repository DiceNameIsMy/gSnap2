const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const profiles = require('../build/tests/monitor_profiles.js');

function setup() {
    const pending = [];
    const writes = [];
    const errors = [];
    const timers = new Map();
    let timerId = 0;
    let saveSucceeds = true;
    const monitors = [{ index: 0, x: 0, y: 0, width: 1920, height: 1080 }];
    const state = [1, [[['eDP-1', 'Vendor', 'Laptop', 'L123'], [], {}]],
        [[0, 0, 1, 0, true, [['eDP-1', 'Vendor', 'Laptop', 'L123']], {}]], {}];
    class Manager {
        constructor(monitor, layout) { this.monitor = monitor; this.layout = layout; this.destroyed = false; }
        destroy() { this.destroyed = true; }
        layoutWindows() {}
    }
    const stubs = {
        'gi://Gio': { Cancellable: class { cancel() {} } },
        'gi://GLib': { Source: { remove: id => timers.delete(id) }, timeout_add: (_priority, _delay, callback) => { timers.set(++timerId, callback); return timerId; } },
        'gi://St': {},
        'resource:///org/gnome/shell/ui/main.js': { layoutManager: { disconnect() {} } },
        'resource:///org/gnome/shell/ui/panelMenu.js': {},
        'resource:///org/gnome/shell/ui/popupMenu.js': {},
        'resource:///org/gnome/shell/extensions/extension.js': { Extension: class { get path() { return '/tmp'; } }, gettext: x => x },
        './logging': { log() {}, logError: (...args) => errors.push(args) },
        './shellversion': { ShellVersion: { defaultVersion: () => ({}) } },
        './hotkeys': { unbind() {} },
        './editor': { ZoneManager: Manager, TabbedZoneManager: Manager },
        './dialogs': {},
        './gnometypes': {},
        './monitors': { activeMonitors: () => monitors, getFocusedWindowMonitorIndex: () => 0 },
        './settings': { gridSettings: {}, getBoolSetting: () => false, deinitSettings() {} },
        './settings_data': {},
        './layouts': {},
        './layouts_utils': { LayoutsUtils: class {
            writable = true;
            saveSettings(value) { writes.push(structuredClone(value)); return saveSucceeds; }
        } },
        './display_config': { readDisplayConfig: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) },
        './monitor_profiles': profiles,
        './modifiers': { default: class { destroy() {} }, MODIFIERS_ENUM: {} },
    };
    const module = { exports: {} };
    const source = ts.transpileModule(fs.readFileSync('src/extension/app.ts', 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
    }).outputText;
    vm.runInNewContext(source, {
        exports: module.exports, require: name => {
            if (!(name in stubs)) throw new Error(`Unexpected import: ${name}`);
            return name.startsWith('gi://') ? { default: stubs[name] } : stubs[name];
        },
        global: { workspace_manager: { get_active_workspace: () => ({ index: () => 0 }), disconnect() {} }, display: { disconnect() {} } },
    });
    const app = new module.exports.default({});
    app.isEnabled = true;
    app.reloadMenu = () => {};
    app.layouts = { definitions: [profiles.NONE_LAYOUT,
        { name: '2 columns', type: 0, length: 100, items: [{ type: 1, length: 50, items: [] }] }],
        workspaces: [[{ current: 1 }]] };
    return { app, pending, writes, errors, state, timers, failWrites: () => { saveSucceeds = false; } };
}

async function discover(context) {
    const promise = context.app.refreshMonitorProfiles('test', context.app.discovery.invalidate());
    context.pending.at(-1).resolve(context.state);
    await promise;
}

test('restoring and switching workspaces never write preferences; explicit selection does', async () => {
    const context = setup();
    await discover(context);
    assert.equal(context.app.profilesReady, true);
    assert.equal(context.writes.length, 1);
    assert.equal(context.app.currentLayoutIdxPerMonitor[0], 1);
    context.app.setToCurrentWorkspace();
    context.app.setToCurrentWorkspace();
    assert.equal(context.writes.length, 1);
    context.app.setLayout(0, 0);
    assert.equal(context.writes.length, 2);
    assert.equal(context.app.currentLayoutIdxPerMonitor[0], 0);
});

test('discovery error and failed migration preserve original settings and block selection', async () => {
    const context = setup();
    const original = JSON.stringify(context.app.layouts);
    const failed = context.app.refreshMonitorProfiles('test', context.app.discovery.invalidate());
    context.pending[0].reject(new Error('Mutter unavailable'));
    await failed;
    assert.equal(context.app.profilesReady, false);
    assert.equal(context.app.currentLayoutIdxPerMonitor[0], -1);
    context.app.setLayout(1, 0);
    assert.equal(context.writes.length, 0);
    assert.equal(JSON.stringify(context.app.layouts), original);
    context.failWrites();
    await discover(context);
    assert.equal(context.app.profilesReady, false);
    assert.equal(JSON.stringify(context.app.layouts), original);
    assert.ok(context.errors.length >= 2);
});

test('failed explicit selection keeps the applied layout and saved profile', async () => {
    const context = setup();
    await discover(context);
    const original = JSON.stringify(context.app.layouts);
    context.failWrites();
    context.app.setLayout(0, 0);
    assert.equal(JSON.stringify(context.app.layouts), original);
    assert.equal(context.app.currentLayoutIdxPerMonitor[0], 1);
});

test('out-of-order discovery and replies after disable cannot migrate, apply or save', async () => {
    const context = setup();
    const first = context.app.refreshMonitorProfiles('old', context.app.discovery.invalidate());
    const second = context.app.refreshMonitorProfiles('new', context.app.discovery.invalidate());
    context.pending[1].resolve(context.state);
    await second;
    const installedManager = context.app.tabManager[0];
    context.pending[0].resolve(context.state);
    await first;
    assert.strictEqual(context.app.tabManager[0], installedManager);
    assert.equal(context.writes.length, 1);
    const third = context.app.refreshMonitorProfiles('disable', context.app.discovery.invalidate());
    context.app.disable();
    assert.equal(installedManager.destroyed, true);
    context.pending[2].resolve(context.state);
    await third;
    assert.equal(context.writes.length, 1);
    assert.equal(context.app.profilesReady, false);
    assert.equal(context.app.tabManager.length, 0);
});


test('rapid monitor events coalesce, destroy disconnected resources, and disable cancels timers', async () => {
    const context = setup();
    await discover(context);
    const oldManager = context.app.tabManager[0];
    context.app.scheduleMonitorRefresh('first-change');
    context.app.scheduleMonitorRefresh('second-change');
    assert.equal(context.timers.size, 1);
    assert.equal(context.app.profilesReady, false);
    assert.equal(oldManager.destroyed, true);
    assert.equal(context.app.monitorBindings.length, 0);
    assert.equal(context.writes.length, 1);
    context.app.disable();
    assert.equal(context.timers.size, 0);
});
