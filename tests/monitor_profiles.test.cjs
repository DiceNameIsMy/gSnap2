const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveMonitorBindings, selectedLayout, migrateProfiles, addConnectedProfiles,
    profileFor, validateLayouts, DiscoveryGeneration } = require('../build/tests/monitor_profiles.js');

const laptop = ['eDP-1', 'Vendor', 'Laptop', 'L123'];
const external = ['DP-1', 'Vendor', 'External', 'E456'];
const definitions = [
    { name: 'None', type: 0, length: 100, items: [] },
    { name: '2 columns', type: 0, length: 100, items: [{ type: 1, length: 50, items: [] }, { type: 1, length: 50, items: [] }] },
    { name: '3 columns', type: 0, length: 100, items: [33, 34, 33].map(length => ({ type: 1, length, items: [] })) },
];
const fresh = () => ({ version: 2, profiles: {}, definitions: structuredClone(definitions) });
function fixture(specs = [laptop, external]) {
    return [1, specs.map(spec => [spec, [], { 'display-name': spec[2] }]),
        specs.map((spec, index) => [index * 1920, 0, 1, 0, index === 0, [spec], {}]), {}];
}
function shell(state) {
    return state[2].map((logical, index) => ({ index, x: logical[0], y: logical[1] }));
}
function bindings(state, settings = fresh()) {
    return resolveMonitorBindings(state, shell(state), settings.profiles);
}
function configured() {
    const state = fixture();
    const settings = fresh();
    for (const binding of bindings(state)) settings.profiles[binding.key] = profileFor(binding, binding.index + 1);
    return settings;
}

test('physical layouts survive monitor reorder, primary, scale, resolution and position changes', () => {
    const settings = configured();
    const state = fixture([external, laptop]);
    state[2][0][0] = -2560;
    state[2][0][2] = 1.5;
    state[2][0][4] = false;
    state[2][1][4] = true;
    const found = bindings(state, settings);
    assert.deepEqual(found.map(binding => selectedLayout(settings, binding)), [2, 1]);
    assert.equal(found[0].connector, 'DP-1');
});

test('disconnect, reconnect and moving a uniquely identified display to another port retain layouts', () => {
    const settings = configured();
    const before = structuredClone(settings);
    const alone = bindings(fixture([laptop]), settings);
    assert.equal(selectedLayout(settings, alone[0]), 1);
    assert.equal(addConnectedProfiles(settings, alone), false);
    const reconnected = bindings(fixture([['HDMI-1', ...external.slice(1)], laptop]), settings);
    assert.equal(selectedLayout(settings, reconnected[0]), 2);
    assert.deepEqual(settings, before);
});

test('new displays get None and selections remain independent across workspace-free profiles', () => {
    const settings = configured();
    const found = bindings(fixture([laptop, ['DP-2', 'New', 'Display', 'NEW']]), settings);
    addConnectedProfiles(settings, found);
    assert.equal(selectedLayout(settings, found[1]), 0);
    settings.profiles[found[1].key].current = 2;
    assert.equal(selectedLayout(settings, found[0]), 1);
    assert.equal(settings.workspaces, undefined);
});

test('missing and placeholder serials use connector-qualified identities', () => {
    for (const serial of ['', '0', '000000', 'unknown', 'n/a']) {
        const state = fixture([['DP-1', 'Vendor', 'Display', serial], ['DP-2', 'Vendor', 'Display', serial]]);
        const found = bindings(state);
        assert.ok(found.every(binding => binding.key.startsWith('connector:')));
        assert.notEqual(found[0].key, found[1].key);
    }
});

test('duplicate serial discovery transfers only matching connector and remains stable after disconnect', () => {
    const settings = configured();
    const duplicate = ['DP-2', ...external.slice(1)];
    const found = bindings(fixture([external, duplicate]), settings);
    addConnectedProfiles(settings, found);
    assert.equal(selectedLayout(settings, found[0]), 2);
    assert.equal(selectedLayout(settings, found[1]), 0);
    settings.profiles[found[1].key].current = 1;
    const alone = bindings(fixture([duplicate]), settings);
    assert.equal(alone[0].key, found[1].key);
    assert.equal(selectedLayout(settings, alone[0]), 1);
});

test('migration uses active workspace, preserves definitions, and never assigns disconnected legacy slots', () => {
    const legacy = { definitions, workspaces: [[{ current: 1 }, { current: 2 }], [{ current: 2 }, { current: 1 }]] };
    const before = structuredClone(legacy);
    const found = bindings(fixture([laptop]));
    const migrated = migrateProfiles(legacy, found, 1);
    assert.equal(migrated.version, 2);
    assert.equal(Object.keys(migrated.profiles).length, 1);
    assert.equal(selectedLayout(migrated, found[0]), 2);
    assert.equal(migrated.workspaces, undefined);
    assert.deepEqual(legacy, before);
    const reconnected = bindings(fixture(), migrated);
    addConnectedProfiles(migrated, reconnected);
    assert.equal(selectedLayout(migrated, reconnected[1]), 0);
    assert.strictEqual(migrateProfiles(migrated, reconnected, 0), migrated);
});

test('invalid references restore None without changing the saved preference', () => {
    const settings = configured();
    const found = bindings(fixture(), settings);
    settings.profiles[found[0].key].current = 99;
    assert.equal(selectedLayout(settings, found[0]), 0);
    assert.equal(settings.profiles[found[0].key].current, 99);
    assert.strictEqual(validateLayouts(settings), settings);
});

test('malformed data and unsupported versions fail validation', () => {
    for (const bad of [null, {}, { definitions: [] }, { ...fresh(), version: 3 },
        { ...fresh(), profiles: [] }, { definitions, workspaces: [[null]] },
        { ...fresh(), definitions: [{ ...definitions[0], items: null }] },
        { ...fresh(), profiles: { broken: { current: 0 } } }]) {
        assert.throws(() => validateLayouts(bad));
    }
    assert.strictEqual(validateLayouts(fresh()).version, 2);
});

test('logical monitor order does not substitute for Shell indexes; mismatches fail without mutation', () => {
    const settings = configured();
    const before = structuredClone(settings);
    const state = fixture();
    const found = resolveMonitorBindings(state, [{ index: 7, x: 1920, y: 0 }, { index: 3, x: 0, y: 0 }], settings.profiles);
    assert.deepEqual(found.map(binding => [binding.index, selectedLayout(settings, binding)]), [[7, 2], [3, 1]]);
    assert.throws(() => resolveMonitorBindings(state, [{ index: 0, x: 999, y: 0 }], settings.profiles), /Cannot map/);
    assert.deepEqual(settings, before);
});

test('mirroring picks a deterministic physical profile, independent of member order', () => {
    const settings = configured();
    const state = fixture();
    state[2] = [[0, 0, 1, 0, true, [laptop, external], {}]];
    const first = bindings(state, settings)[0];
    state[2][0][5].reverse();
    const second = bindings(state, settings)[0];
    assert.equal(first.key, second.key);
    const before = structuredClone(settings);
    selectedLayout(settings, first);
    assert.deepEqual(settings, before);
});

test('new events and disable invalidate outstanding discovery responses', () => {
    const gate = new DiscoveryGeneration();
    const first = gate.invalidate();
    const second = gate.invalidate();
    assert.equal(gate.isCurrent(first), false);
    assert.equal(gate.isCurrent(second), true);
    gate.invalidate();
    assert.equal(gate.isCurrent(second), false);
});
