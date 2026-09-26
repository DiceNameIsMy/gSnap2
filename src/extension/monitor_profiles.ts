import { Layout, LayoutsSettings, MonitorProfile } from './layouts';

export interface DisplayIdentity {
    connector: string;
    vendor: string;
    product: string;
    serial: string;
    name: string;
}

export interface MonitorBinding extends DisplayIdentity {
    index: number;
    key: string;
    reason: string;
    mirrored: string[];
}

export const NONE_LAYOUT: Layout = { name: 'None', type: 0, length: 100, items: [] };

function hardwareKey(display: DisplayIdentity): string {
    return JSON.stringify([display.vendor, display.product, display.serial]);
}

function usableSerial(serial: string): boolean {
    return !/^(?:|0+|unknown|none|n\/a|unspecified)$/i.test(serial.trim());
}

/** Geometry is used only to join the two live APIs, never as a persistent key. */
export function resolveMonitorBindings(state: any[], monitors: { index: number; x: number; y: number }[],
    profiles: Record<string, MonitorProfile> = {}): MonitorBinding[] {
    const physical: DisplayIdentity[] = state[1].map((entry: any[]) => {
        const [connector, vendor, product, serial] = entry[0];
        const unpack = (value: any) => value?.deep_unpack ? value.deep_unpack() : value;
        return { connector, vendor, product, serial,
            name: unpack(entry[2]['is-builtin']) ? 'Built-in display'
                : unpack(entry[2]['display-name']) || product || connector };
    });
    const keyed = physical.map(display => {
        const base = hardwareKey(display);
        const duplicate = physical.filter(other => hardwareKey(other) === base).length > 1;
        // Once ambiguous hardware has been seen, keep using connector keys even
        // when one of the identical displays is subsequently disconnected.
        const previouslyAmbiguous = Object.entries(profiles).some(([key, profile]) =>
            key.startsWith('connector:') && hardwareKey(profile) === base);
        const fallback = !usableSerial(display.serial) || duplicate || previouslyAmbiguous;
        return { ...display,
            key: fallback ? `connector:${JSON.stringify([display.connector, display.vendor, display.product, display.serial])}` : `hardware:${base}`,
            reason: fallback ? 'connector fallback (missing or ambiguous serial)' : 'unique hardware serial' };
    });
    return monitors.map(monitor => {
        const logical = state[2].filter((entry: any[]) => entry[0] === monitor.x && entry[1] === monitor.y);
        if (logical.length !== 1) throw new Error(`Cannot map Shell monitor ${monitor.index} at ${monitor.x},${monitor.y}`);
        const members = logical[0][5].map((spec: string[]) => {
            const match = keyed.find(display => display.connector === spec[0]
                && display.vendor === spec[1] && display.product === spec[2] && display.serial === spec[3]);
            if (!match) throw new Error(`Missing physical monitor ${spec[0]}`);
            return match;
        }).sort((a: DisplayIdentity & { key: string }, b: DisplayIdentity & { key: string }) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
        if (!members.length) throw new Error(`No physical displays for Shell monitor ${monitor.index}`);
        // Mutter marks the logical monitor primary, not an individual mirror
        // member. Use stable ordering where a physical primary is unavailable.
        return { ...members[0], index: monitor.index, mirrored: members.map((display: DisplayIdentity) => display.connector) };
    });
}

export function noneLayoutIndex(settings: LayoutsSettings): number {
    return settings.definitions.findIndex(layout => layout.items.length === 0);
}

export function selectedLayout(settings: LayoutsSettings, binding?: MonitorBinding): number {
    const current = binding ? settings.profiles?.[binding.key]?.current : undefined;
    return Number.isInteger(current) && current! >= 0 && current! < settings.definitions.length
        ? current! : noneLayoutIndex(settings);
}

/** Pure migration: the caller must back up and persist before adopting it. */
export function migrateProfiles(settings: LayoutsSettings, bindings: MonitorBinding[], workspace: number): LayoutsSettings {
    if (settings.version === 2) return settings;
    const profiles: Record<string, MonitorProfile> = {};
    for (const binding of bindings) {
        const current = settings.workspaces?.[workspace]?.[binding.index]?.current ?? noneLayoutIndex(settings);
        profiles[binding.key] = profileFor(binding, current);
    }
    return { version: 2, profiles, definitions: settings.definitions };
}

export function profileFor(binding: MonitorBinding, current: number): MonitorProfile {
    const { connector, vendor, product, serial, name } = binding;
    return { connector, vendor, product, serial, name, current };
}

export function addConnectedProfiles(settings: LayoutsSettings, bindings: MonitorBinding[]): boolean {
    let changed = false;
    const profiles = settings.profiles!;
    for (const binding of bindings) {
        const existing = profiles[binding.key];
        if (existing) {
            if (existing.connector !== binding.connector || existing.name !== binding.name) {
                profiles[binding.key] = profileFor(binding, existing.current);
                changed = true;
            }
            continue;
        }
        // If a previously unique serial becomes ambiguous, transfer only the
        // profile whose last known connector matches this physical display.
        const previous = profiles[`hardware:${hardwareKey(binding)}`];
        const current = binding.key.startsWith('connector:') && previous?.connector === binding.connector
            ? previous.current : noneLayoutIndex(settings);
        profiles[binding.key] = profileFor(binding, current);
        changed = true;
    }
    return changed;
}

export function validateLayouts(value: any): LayoutsSettings {
    const validItem = (item: any, depth = 0): boolean => depth < 32 && item != null
        && (item.type === 0 || item.type === 1) && Number.isFinite(item.length)
        && item.length >= 0 && Array.isArray(item.items)
        && item.items.every((child: any) => validItem(child, depth + 1));
    if (!value || !Array.isArray(value.definitions) || !value.definitions.length
        || !value.definitions.every((layout: any) => typeof layout.name === 'string' && validItem(layout))) {
        throw new Error('Invalid layout definitions');
    }
    if (value.version === 2) {
        if (!value.profiles || typeof value.profiles !== 'object' || Array.isArray(value.profiles)
            || !Object.values(value.profiles).every((profile: any) => profile &&
                ['connector', 'vendor', 'product', 'serial', 'name'].every(key => typeof profile[key] === 'string')
                && Number.isInteger(profile.current))) throw new Error('Invalid display profiles');
    } else if (value.version !== undefined && value.version !== 1) {
        throw new Error(`Unsupported layouts version ${value.version}`);
    } else if (!Array.isArray(value.workspaces) || !value.workspaces.every((workspace: any) =>
        Array.isArray(workspace) && workspace.every((slot: any) => slot && Number.isInteger(slot.current)))) {
        throw new Error('Invalid legacy workspace settings');
    }
    return value;
}

/** Invalidating on every event also protects against replies after disable. */
export class DiscoveryGeneration {
    private generation = 0;
    invalidate(): number { return ++this.generation; }
    isCurrent(generation: number): boolean { return generation === this.generation; }
}
