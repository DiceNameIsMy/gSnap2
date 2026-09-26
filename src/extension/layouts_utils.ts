// @ts-ignore
import GLib from 'gi://GLib';
// @ts-ignore
import Gio from 'gi://Gio';

import { LayoutsSettings } from "./layouts";
import { log, logError } from "./logging";
import { validateLayouts } from "./monitor_profiles";

export class LayoutsUtils {
    public writable = true;
    private legacySource: string | null = null;

    constructor(private basePath: string) {

    }

    get configPath() {
        return GLib.build_pathv('/', [GLib.get_user_config_dir(), 'gSnap2']);
    }

    get layoutsPath() {
        return GLib.build_filenamev([this.configPath, 'layouts.json']);
    }

    public resetToDefault() {
        log('Resetting default LayoutSettings');
        const defaults = this._getDefaultLayoutsV1();
        this.saveSettings(defaults);
    }

    public saveSettings(layouts: LayoutsSettings): boolean {
        if (!this.writable) {
            logError('persist-blocked', new Error('Original settings could not be loaded; repair the file and restart the extension'));
            return false;
        }
        try {
            if (GLib.mkdir_with_parents(this.configPath, 448) !== 0) throw new Error('Cannot create settings directory');
            if (layouts.version === 2 && this.legacySource) {
                // Never overwrite a previous backup. Each attempted migration
                // has its own copy of the original bytes, including whitespace.
                const backupPath = `${this.layoutsPath}.v1-${GLib.uuid_string_random()}.bak`;
                if (!Gio.File.new_for_path(this.legacySource).copy(Gio.File.new_for_path(backupPath),
                    Gio.FileCopyFlags.NONE, null, null)) throw new Error('Legacy backup failed');
                log(`migration-backup ${backupPath}`);
            }
            const [ok] = Gio.File.new_for_path(this.layoutsPath).replace_contents(
                JSON.stringify(layouts), null, false, Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            if (!ok) throw new Error('Atomic settings replacement failed');
            this.legacySource = null;
            log(`persist version=${layouts.version} profiles=${Object.keys(layouts.profiles || {}).length}`);
            return true;
        } catch (error) {
            logError('persist-failed', error);
            return false;
        }
    }

    public loadLayoutSettings(): LayoutsSettings {
        this.writable = true;
        this.legacySource = null;
        const candidates = [this.layoutsPath, GLib.build_filenamev([this.basePath, 'layouts.json'])];
        for (const path of candidates) {
            if (!GLib.file_test(path, GLib.FileTest.EXISTS)) continue;
            try {
                const [ok, contents] = GLib.file_get_contents(path);
                if (!ok) throw new Error(`Cannot read ${path}`);
                const settings = validateLayouts(JSON.parse(new TextDecoder('utf-8').decode(contents)));
                if (settings.version !== 2) this.legacySource = path;
                log(`settings-loaded path=${path} version=${settings.version || 1}`);
                return settings;
            } catch (error) {
                // Do not fall through and later overwrite a damaged file with defaults.
                this.writable = false;
                logError('settings-load-failed', error);
                return this._getDefaultLayoutsV1();
            }
        }
        const defaults = this._getDefaultLayoutsV1();
        return { version: 2, profiles: {}, definitions: defaults.definitions };
    }

    private _getDefaultLayoutsV1(): LayoutsSettings {
        log('Loading default layouts');
        return {
            workspaces: [[{ current: 2 }, { current: 3 }], [{ current: 2 }, { current: 3 }]],
            definitions: [
                {
                    name: "None", type: 0, length: 100, items: []
                },
                {
                    name: "1 Column", type: 0, length: 100,
                    items: [
                        { type: 1, length: 100, items: [] }
                    ]
                },
                {
                    name: "2 Column Split", type: 0, length: 100,
                    items: [
                        { type: 1, length: 50, items: [] },
                        { type: 1, length: 50, items: [] }
                    ]
                },
                {
                    name: "3 Column", type: 0, length: 100,
                    items: [
                        { type: 1, length: 33, items: [] },
                        { type: 1, length: 34, items: [] },
                        { type: 1, length: 33, items: [] }
                    ]
                },
                {
                    name: "3 Column (Focused)", type: 0, length: 100,
                    items: [
                        { type: 1, length: 25, items: [] },
                        { type: 1, length: 50, items: [] },
                        { type: 1, length: 25, items: [] }
                    ]
                },
                {
                    name: "3 Columns (Custom)", type: 0, length: 100,
                    items: [
                        { type: 1, length: 42, items: [] },
                        { type: 1, length: 16, items: [
                            { type: 0, length: 33, items: [] },
                            { type: 0, length: 34, items: [] },
                            { type: 0, length: 33, items: [] }
                        ]},
                        { type: 1, length: 42, items: [] }
                    ]
                }
            ]
        };
    }
}
