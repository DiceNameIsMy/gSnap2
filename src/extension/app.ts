// GJS import system
declare var global: any;
// @ts-ignore
import Gio from 'gi://Gio';
// @ts-ignore
import GLib from 'gi://GLib';
// @ts-ignore
import St from 'gi://St';
// @ts-ignore
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
// @ts-ignore
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
// @ts-ignore
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
// @ts-ignore
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { log, logError } from './logging';
import { ShellVersion } from './shellversion';
import { bind as bindHotkeys, unbind as unbindHotkeys, Bindings } from './hotkeys';
import { ZoneEditor, ZonePreview, TabbedZoneManager, ZoneManager } from "./editor";
import { LayoutNameDialog } from "./dialogs";

import {
    Display,
    MaximizeFlags,
    MetaSizeChange,
    Rectangle,
    Window,
    WindowType,
    WorkspaceManager as WorkspaceManagerInterface
} from "./gnometypes";

import {
    activeMonitors,
    getMousePointerMonitorIndex,
    getFocusedWindowMonitorIndex,
    getWindowsOfMonitor,
} from './monitors';

import {
    SettingsObject,
    deinitSettings,
    getBoolSetting,
    gridSettings,
    initSettings,
} from './settings';

import * as SETTINGS from './settings_data';

import { cloneLayout, Layout, LayoutsSettings } from './layouts';
import { LayoutsUtils } from './layouts_utils';
import { readDisplayConfig } from './display_config';
import { addConnectedProfiles, DiscoveryGeneration, migrateProfiles, MonitorBinding, NONE_LAYOUT,
    profileFor, resolveMonitorBindings, selectedLayout } from './monitor_profiles';
import ModifiersManager, { MODIFIERS_ENUM } from './modifiers';

/*****************************************************************

 This extension has been developed by micahosborne

 With the help of the gnome-shell community

 Edited by Kvis for gnome 3.8
 Edited by Lundal for gnome 3.18
 Edited by Sergey to add keyboard shortcuts and prefs dialog

 ******************************************************************/

// Getter for accesing "get_active_workspace" on GNOME <=2.28 and >= 2.30
const WorkspaceManager: WorkspaceManagerInterface = (
    global.screen || global.workspace_manager);

const trackedWindows: Window[] = global.trackedWindows = [];

const SHELL_VERSION = ShellVersion.defaultVersion();

enum MoveDirection {
    Up,
    Down,
    Left,
    Right
}

export default class App extends Extension {
    private metadata: any;
    private settings: SettingsObject | null = null;
    private indicator: PanelMenu.Button;
    private editor: (ZoneEditor | null)[];
    private preview: (ZonePreview | null)[];
    private tabManager: (ZoneManager | null)[];
    private modifiersManager: ModifiersManager;
    private layoutsUtils: LayoutsUtils;
    private isGrabbing: boolean = false;
    private minimizedWindows: Window[];
    private isEnabled: boolean = false;
    private monitorsChangedConnect: any = false;
    private restackConnection: any;
    private workspaceSwitchedConnect: any;
    private workareasChangedConnect: any;


    private currentLayoutIdxPerMonitor: number[];
    private monitorBindings: MonitorBinding[] = [];
    private discovery = new DiscoveryGeneration();
    private discoverySource = 0;
    private discoveryCancellable: any = null;
    private displaySignals: number[] = [];
    private profilesReady = false;
    public layouts: LayoutsSettings = {
        version: 2,
        profiles: {},
        definitions: [
            {
                type: 0,
                name: "2 Column",
                length: 100,
                items: [
                    { type: 0, length: 50, items: [] },
                    { type: 0, length: 50, items: [] }
                ]
            },
        ]
    };


    private keyBindings: Bindings = new Map([
        [SETTINGS.MOVE_FOCUSED_UP, () => {
            this.moveFocusedWindow(MoveDirection.Up)
        }],
        [SETTINGS.MOVE_FOCUSED_DOWN, () => {
            this.moveFocusedWindow(MoveDirection.Down)
        }],
        [SETTINGS.MOVE_FOCUSED_LEFT, () => {
            this.moveFocusedWindow(MoveDirection.Left)
        }],
        [SETTINGS.MOVE_FOCUSED_RIGHT, () => {
            this.moveFocusedWindow(MoveDirection.Right)
        }],
    ]);
    
    private key_bindings_presets: Bindings = new Map([
        [SETTINGS.PRESET_RESIZE_1, () => {
            this.setLayout(0);
        }],
        [SETTINGS.PRESET_RESIZE_2, () => {
            this.setLayout(1);
        }],
        [SETTINGS.PRESET_RESIZE_3, () => {
            this.setLayout(2);
        }],
        [SETTINGS.PRESET_RESIZE_4, () => {
            this.setLayout(3);
        }],
        [SETTINGS.PRESET_RESIZE_5, () => {
            this.setLayout(4);
        }],
        [SETTINGS.PRESET_RESIZE_6, () => {
            this.setLayout(5);
        }],
        [SETTINGS.PRESET_RESIZE_7, () => {
            this.setLayout(6);
        }],
        [SETTINGS.PRESET_RESIZE_8, () => {
            this.setLayout(7);
        }],
        [SETTINGS.PRESET_RESIZE_9, () => {
            this.setLayout(8);
        }],
        [SETTINGS.PRESET_RESIZE_10, () => {
            this.setLayout(9);
        }],
        [SETTINGS.PRESET_RESIZE_11, () => {
            this.setLayout(10);
        }],
        [SETTINGS.PRESET_RESIZE_12, () => {
            this.setLayout(11);
        }],
        [SETTINGS.PRESET_RESIZE_13, () => {
            this.setLayout(12);
        }],
        [SETTINGS.PRESET_RESIZE_14, () => {
    
        }],
        [SETTINGS.PRESET_RESIZE_15, () => {
    
        }],
        [SETTINGS.PRESET_RESIZE_16, () => {
    
        }],
        [SETTINGS.PRESET_RESIZE_17, () => {
    
        }],
        [SETTINGS.PRESET_RESIZE_18, () => {
    
        }],
        [SETTINGS.PRESET_RESIZE_19, () => {
    
        }],
        [SETTINGS.PRESET_RESIZE_20, () => {
    
        }],
        [SETTINGS.PRESET_RESIZE_21, () => {
    
        }],
        [SETTINGS.PRESET_RESIZE_22, () => {
    
        }],
        [SETTINGS.PRESET_RESIZE_23, () => {
    
        }],
        [SETTINGS.PRESET_RESIZE_24, () => {
    
        }],
        [SETTINGS.PRESET_RESIZE_25, () => {
    
        }],
        [SETTINGS.PRESET_RESIZE_26, () => {
    
        }],
        [SETTINGS.PRESET_RESIZE_27, () => {
    
        }],
        [SETTINGS.PRESET_RESIZE_28, () => {
    
        }],
        [SETTINGS.PRESET_RESIZE_29, () => {
    
        }],
        [SETTINGS.PRESET_RESIZE_30, () => {
    
        }],
    ]);
    
    private keyBindingGlobalResizes: Bindings = new Map([
    
    ]);

    constructor(metadata: any) {
        super(metadata);
        const monitors = activeMonitors().length;
        this.editor = new Array<ZoneEditor>(monitors);
        this.preview = new Array<ZonePreview>(monitors);
        this.tabManager = new Array<ZoneManager>(monitors);
        this.currentLayoutIdxPerMonitor = new Array<number>(monitors);
        this.modifiersManager = new ModifiersManager();
        this.layoutsUtils = new LayoutsUtils(super.path);
        this.minimizedWindows = new Array<Window>();
        this.metadata = metadata;
    }

    setLayout(layoutIndex: number, monitorIndex = -1) {
        if (!Number.isInteger(layoutIndex) || layoutIndex < 0 || layoutIndex >= this.layouts.definitions.length) return;
        if (monitorIndex === -1) monitorIndex = getFocusedWindowMonitorIndex();
        const binding = this.monitorBindings.find(display => display.index === monitorIndex);
        if (!this.profilesReady || !binding || !this.layoutsUtils.writable) {
            logError('selection-blocked', new Error('Display identification or settings recovery is pending'));
            return;
        }
        const previous = this.layouts.profiles![binding.key];
        this.layouts.profiles![binding.key] = profileFor(binding, layoutIndex);
        if (!this.layoutsUtils.saveSettings(this.layouts)) {
            this.layouts.profiles![binding.key] = previous;
            return;
        }
        log(`selection workspace=${WorkspaceManager.get_active_workspace().index()} index=${monitorIndex} connector=${binding.connector} key=${binding.key} layout=${layoutIndex}`);
        this.applyLayout(layoutIndex, monitorIndex);
        this.reloadMenu();
    }

    private applyLayout(layoutIndex: number, monitorIndex: number) {
        const monitor = activeMonitors()[monitorIndex];
        if (!monitor) return;
        this.currentLayoutIdxPerMonitor[monitorIndex] = layoutIndex;
        this.tabManager[monitorIndex]?.destroy();
        this.tabManager[monitorIndex] = null;
        const layout = this.layouts.definitions[layoutIndex] || NONE_LAYOUT;
        const animationsEnabled = getBoolSetting(SETTINGS.ANIMATIONS_ENABLED);
        this.tabManager[monitorIndex] = gridSettings[SETTINGS.SHOW_TABS]
            ? new TabbedZoneManager(monitor, layout, gridSettings[SETTINGS.WINDOW_MARGIN], animationsEnabled)
            : new ZoneManager(monitor, layout, gridSettings[SETTINGS.WINDOW_MARGIN], animationsEnabled);
        this.tabManager[monitorIndex]?.layoutWindows();
    }

    private clearMonitorResources() {
        this.preview.forEach(preview => preview?.destroy());
        this.editor.forEach(editor => editor?.destroy());
        this.tabManager.forEach(manager => manager?.destroy());
        this.preview = [];
        this.editor = [];
        this.tabManager = [];
        this.currentLayoutIdxPerMonitor = [];
        this.unminimizeAllWindows();
    }

    private scheduleMonitorRefresh(reason: string) {
        const generation = this.discovery.invalidate();
        this.discoveryCancellable?.cancel();
        this.discoveryCancellable = null;
        if (this.discoverySource) GLib.Source.remove(this.discoverySource);
        this.profilesReady = false;
        this.monitorBindings = [];
        this.clearMonitorResources();
        // No old index-to-display association is usable during a transition.
        activeMonitors().forEach(monitor => this.applyLayout(-1, monitor.index));
        this.reloadMenu();
        this.discoverySource = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
            this.discoverySource = 0;
            void this.refreshMonitorProfiles(reason, generation);
            return GLib.SOURCE_REMOVE;
        });
    }

    private refreshMonitorProfiles(reason: string, generation: number): Promise<void> {
        const cancellable = new Gio.Cancellable();
        this.discoveryCancellable = cancellable;
        log(`discovery-start reason=${reason} generation=${generation}`);
        return readDisplayConfig(cancellable).then(state => {
            if (!this.isEnabled || !this.discovery.isCurrent(generation)) return;
            const bindings = resolveMonitorBindings(state, activeMonitors(), this.layouts.profiles);
            if (!bindings.length) return; // Do not migrate while the screen is temporarily absent.
            const workspace = WorkspaceManager.get_active_workspace().index();
            const migrating = this.layouts.version !== 2;
            // Copy so failed writes cannot become the in-memory source of truth.
            const candidate = migrateProfiles(JSON.parse(JSON.stringify(this.layouts)), bindings, workspace);
            const added = addConnectedProfiles(candidate, bindings);
            if (!this.layoutsUtils.writable) throw new Error('Settings file needs recovery before profiles can be restored');
            if ((migrating || added) && !this.layoutsUtils.saveSettings(candidate)) throw new Error('Profile migration/creation could not be persisted');
            this.layouts = candidate;
            this.monitorBindings = bindings;
            this.profilesReady = true;
            if (migrating) log(`migration-complete workspace=${workspace}`);
            for (const binding of bindings) {
                log(`mapping reason=${reason} serial=${state[0]} workspace=${workspace} index=${binding.index} connector=${binding.connector} key=${binding.key} match=${binding.reason} mirrors=${JSON.stringify(binding.mirrored)}`);
            }
            this.clearMonitorResources();
            this.setToCurrentWorkspace();
            this.reloadMenu();
        }).catch(error => {
            if (!this.isEnabled || !this.discovery.isCurrent(generation)) return;
            logError(`discovery-failed reason=${reason} fallback=None`, error);
            this.profilesReady = false;
            this.monitorBindings = [];
            this.clearMonitorResources();
            activeMonitors().forEach(monitor => this.applyLayout(-1, monitor.index));
            this.reloadMenu();
        }).finally(() => {
            if (this.discoveryCancellable === cancellable) this.discoveryCancellable = null;
        });
    }

    showLayoutPreview(monitorIndex: number, layout: Layout) {
        this.preview[monitorIndex]?.destroy();
        this.preview[monitorIndex] = null;

        this.preview[monitorIndex] = new ZonePreview(activeMonitors()[monitorIndex], layout, gridSettings[SETTINGS.WINDOW_MARGIN]);
        this.preview[monitorIndex]!.show();
    }

    hideLayoutPreview() {
        activeMonitors().forEach(monitor => {
            this.preview[monitor.index]?.destroy();
            this.preview[monitor.index] = null;
        });
    }

    /** Returns true if the settings allow to span multiple zones and 
     *  the user is holding ALT. The user must enable it in the settings
     *  and it is not possible to span multiple zones in "tab" mode */
    canSpanMultipleZones() {
        return !getBoolSetting(SETTINGS.SHOW_TABS) &&
                getBoolSetting(SETTINGS.SPAN_MULTIPLE_ZONES) &&
                this.modifiersManager.isHolding(MODIFIERS_ENUM.ALT);
    }

    enable() {
        this.settings = super.getSettings() as SettingsObject;
        initSettings(this.settings, () => this.changed_settings());
        log("Extension enable begin");
        SHELL_VERSION.print_version();

        this.layouts = this.layoutsUtils.loadLayoutSettings();
        log(JSON.stringify(this.layouts));
        this.profilesReady = false;
        this.monitorBindings = [];
        activeMonitors().forEach(monitor => this.applyLayout(-1, monitor.index));
        this.monitorsChangedConnect = Main.layoutManager.connect(
            'monitors-changed', () => this.scheduleMonitorRefresh('monitors-changed'));

        const validWindow = (window: Window): boolean => window != null
            && window.get_window_type() == WindowType.NORMAL;

        this.displaySignals.push(global.display.connect('window-created', (_display: Display, win: Window) => {
            if (validWindow(win)) {
                activeMonitors().forEach(m => {
                    this.tabManager[m.index]?.layoutWindows();
                });
            }
        }));

        this.displaySignals.push(global.display.connect('in-fullscreen-changed', (_display: Display) => {
            activeMonitors().forEach(m => {
                if (global.display.get_monitor_in_fullscreen(m.index)) {
                    // Keep zones available for other windows above the fullscreen window.
                    this.tabManager[m.index]?.hide();
                } else {
                    this.setToCurrentWorkspace(m.index);
                }
            });
        }));
    

        this.displaySignals.push(global.display.connect('grab-op-begin', (_display: Display, win: Window) => {
            // only start isGrabbing if is a valid window to avoid conflict 
            // with dash-to-panel/appIcons.js:1021 where are emitting a grab-op-begin
            // without never emitting a grab-op-end
            if (!validWindow(win)) return;

            const spanMultipleZones = this.canSpanMultipleZones();

            const useModifier = getBoolSetting(SETTINGS.USE_MODIFIER);
            const preventSnapping = getBoolSetting(SETTINGS.PREVENT_SNAPPING);
            this.isGrabbing = true;

            if (useModifier &&
                !this.modifiersManager.isHolding(MODIFIERS_ENUM.CONTROL))
                return;

            if (preventSnapping &&
                this.modifiersManager.isHolding(MODIFIERS_ENUM.SUPER))
                return;
            
            activeMonitors().forEach(m => {
                this.tabManager[m.index]?.allow_multiple_zones_selection(spanMultipleZones);
                this.tabManager[m.index]?.show();
            });
        }));

        this.displaySignals.push(global.display.connect('grab-op-end', (_display: Display, win: Window) => {
            const useModifier = getBoolSetting(SETTINGS.USE_MODIFIER);
            const preventSnapping = getBoolSetting(SETTINGS.PREVENT_SNAPPING);

            this.isGrabbing = false;

            if (!validWindow(win)) {
                return;
            }

            let selection: Rectangle | undefined;
            activeMonitors().forEach(m => {
                if((!useModifier && !preventSnapping) ||
                   (useModifier && this.modifiersManager.isHolding(MODIFIERS_ENUM.CONTROL)) ||
                   (preventSnapping && !this.modifiersManager.isHolding(MODIFIERS_ENUM.SUPER))) {
                    if (!trackedWindows.includes(win)) {
                        trackedWindows.push(win);
                    }
                    
                    if (!selection) { // ensure window is moved one time only
                        selection = this.tabManager[m.index]?.getSelectionRect();
                        // may be undefined if there are no zones selected in this monitor
                        if (selection) {
                            this.moveWindow(win, selection.x, selection.y, selection.width, selection.height);
                        }
                    }
                    
                    this.tabManager[m.index]?.hide(); // hide zones after the window was moved
                    this.tabManager[m.index]?.layoutWindows();
                    return;
                }

                this.tabManager[m.index]?.hide();
                if (trackedWindows.includes(win) && (
                    (useModifier && !this.modifiersManager.isHolding(MODIFIERS_ENUM.CONTROL)) ||
                    (preventSnapping && this.modifiersManager.isHolding(MODIFIERS_ENUM.SUPER)))) {
                    trackedWindows.splice(trackedWindows.indexOf(win), 1);
                }
            });
        }));

        if (getBoolSetting(SETTINGS.USE_MODIFIER) || getBoolSetting(SETTINGS.SPAN_MULTIPLE_ZONES)
            || getBoolSetting(SETTINGS.PREVENT_SNAPPING)) {
            // callback run when a modifier change state (e.g from not pressed to pressed)
            this.modifiersManager.connect("changed", () => {
                if (!this.isGrabbing) {
                    return;
                }

                const spanMultipleZones = getBoolSetting(SETTINGS.SPAN_MULTIPLE_ZONES);
                if (spanMultipleZones) {
                    const allow_multiple_selections = this.canSpanMultipleZones();
                    activeMonitors().forEach(m => {
                        this.tabManager[m.index]?.allow_multiple_zones_selection(allow_multiple_selections);
                    });
                }


                const useModifier = getBoolSetting(SETTINGS.USE_MODIFIER);
                if (useModifier && this.modifiersManager.isHolding(MODIFIERS_ENUM.CONTROL)) {
                    activeMonitors().forEach(m => {
                        this.tabManager[m.index]?.show()
                    });
                    return;
                }

                const preventSnapping = getBoolSetting(SETTINGS.PREVENT_SNAPPING);
                if(preventSnapping && !this.modifiersManager.isHolding(MODIFIERS_ENUM.SUPER)) {
                    activeMonitors().forEach(m => {
                        this.tabManager[m.index]?.show()
                    });
                    return
                }

                activeMonitors().forEach(m => this.tabManager[m.index]?.hide());
            });
        }

        this.restackConnection = global.display.connect('restacked', () => {
            activeMonitors().forEach(m => {
                this.tabManager[m.index]?.layoutWindows();
            });
        });

        this.workspaceSwitchedConnect = WorkspaceManager.connect('workspace-switched', () => {
            this.setToCurrentWorkspace();
            this.reloadMenu();
        });

        this.workareasChangedConnect = global.display.connect('workareas-changed', () => {
            activeMonitors().forEach(m => {
                this.tabManager[m.index]?.reinit();
                this.tabManager[m.index]?.layoutWindows();
            });
        });

        this.createIndicator()

        bindHotkeys(this.keyBindings, this.settings);
        if (gridSettings[SETTINGS.GLOBAL_PRESETS]) {
            bindHotkeys(this.key_bindings_presets, this.settings);
        }
        if (gridSettings[SETTINGS.MOVERESIZE_ENABLED]) {
            bindHotkeys(this.keyBindingGlobalResizes, this.settings);
        }

        this.modifiersManager.enable();

        this.isEnabled = true;

        this.scheduleMonitorRefresh("enable");
        log("Extension enable completed");
    }

    changed_settings() {
        log("changed_settings");
        if (this.isEnabled) {
            this.disable();
            this.enable();
        }
        log("changed_settings complete");
    }

    moveFocusedWindow(direction: MoveDirection) {
        let monitorIndex = getFocusedWindowMonitorIndex();
        const monitor = activeMonitors()[monitorIndex];
        if (!monitor) return;

        let windows = getWindowsOfMonitor(monitor).filter(w => w.has_focus());
        if (windows.length <= 0) return;
        let focusedWindow = windows[0];

        log(`Move ${focusedWindow.title} ${direction}`);

        const useModifier = getBoolSetting(SETTINGS.USE_MODIFIER);
        const preventSnapping = getBoolSetting(SETTINGS.PREVENT_SNAPPING);
        if (useModifier || preventSnapping) {
            if (!trackedWindows.includes(focusedWindow)) {
                trackedWindows.push(focusedWindow);
            }
        }

        let zoneManager = this.tabManager[monitorIndex];
        if (!zoneManager) return;

        let frameRect = focusedWindow.get_frame_rect();
        // get window center position
        let x = frameRect.x + (frameRect.width / 2);
        let y = frameRect.y + (frameRect.height / 2);

        // Move the center position to outside of the window
        switch (direction) {
            // add/remove 2 to avoid zone not being recognized due to rounding errors

            // min/max the point in order stay within the screen bounds
            case MoveDirection.Up:
                const minHeight = zoneManager.y + 2;
                y = Math.max(frameRect.y - (2 + zoneManager.margin), minHeight);
                break;
            case MoveDirection.Down:
                const maxHeight = zoneManager.y + zoneManager.height - 2;
                y = Math.min(frameRect.y + frameRect.height + (2 + zoneManager.margin), maxHeight);
                break;
            case MoveDirection.Left:
                const minWidth = zoneManager.x + 2;
                x = Math.max(frameRect.x - (2 + zoneManager.margin), minWidth);
                break;
            case MoveDirection.Right:
                const maxWidth = zoneManager.x + zoneManager.width - 2;
                x = Math.min(frameRect.x + frameRect.width + (2 + zoneManager.margin), maxWidth);
                break;
        }

        let layoutZones = zoneManager.recursiveChildren();
        for (let i = 0; i < layoutZones.length; i++) {
            let zone = layoutZones[i];
            log(`Zone: ${zone.x}/${zone.y}/${zone.width}/${zone.height} contains: ${x}, ${y}`);
            if (zone.contains(x, y)) {
                this.moveWindow(focusedWindow, zone.innerX, zone.innerY, zone.innerWidth, zone.innerHeight);
                this.tabManager[monitorIndex]?.layoutWindows();
                return;
            }
        }

    }

    private moveWindow(window: Window, x: number, y: number, width: number, height: number) {
        log(`moveWindow moving to x:${x}, y:${y}`);
        if (window.maximized_horizontally || window.maximized_vertically) {
            window.unmaximize(MaximizeFlags.BOTH);
        }
        if (getBoolSetting(SETTINGS.ANIMATIONS_ENABLED)) {
            const windowActor = window.get_compositor_private();
            windowActor.remove_all_transitions();
            Main.wm._prepareAnimationInfo(
                global.window_manager,
                windowActor,
                window.get_frame_rect().copy(),
                MetaSizeChange.MAXIMIZE
            );
        }
        window.move_frame(true, x, y);
        window.move_resize_frame(true, x, y, width, height);
    }

    minimizeAllWindows() {
        // we need to know what windows have been minimized by the user
        // so we don't accidentally restore them when calling unminimizeAllWindows()
        this.minimizedWindows = WorkspaceManager
            .get_active_workspace()
            .list_windows()
            .filter(x => !x.minimized);
        this.minimizedWindows.forEach(w => w.minimize());
    }

    unminimizeAllWindows() {
        this.minimizedWindows.forEach(w => w.unminimize());
        this.minimizedWindows = [];
    }

    createIndicator() {
        this.indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
        this.indicator.label = "Layouts";
        let icon = new St.Icon({ style_class: 'tiling-icon' });
        icon.gicon = Gio.icon_new_for_string(`${super.path}/images/tray.svg`);
        this.indicator.add_child(icon);

        if (gridSettings[SETTINGS.SHOW_ICON]) {
            Main.panel.addToStatusArea("GSnapStatusButton", this.indicator);
            this.reloadMenu();
        }
    }

    reloadMenu() {
        if (this.indicator == null) return;
        this.indicator.menu.removeAll();
        if (!this.profilesReady) {
            const status = new PopupMenu.PopupMenuItem(_('Display layouts unavailable — retry or check logs'), { reactive: false });
            this.indicator.menu.addMenuItem(status);
            this.indicator.menu.addAction(_('Retry display detection'), () => this.scheduleMonitorRefresh('manual-retry'));
            this.indicator.menu.addAction(_('Settings'), () => super.openPreferences());
            return;
        }
        let resetLayoutButton = new PopupMenu.PopupMenuItem(_("Reset Layout"));
        let editLayoutButton = new PopupMenu.PopupMenuItem(_("Edit Layout"));
        let saveLayoutButton = new PopupMenu.PopupMenuItem(_("Save Layout"));
        let cancelEditingButton = new PopupMenu.PopupMenuItem(_("Cancel Editing"));
        let newLayoutButton = new PopupMenu.PopupMenuItem(_("Create New Layout"));

        const currentMonitorLayoutIdx = this.currentLayoutIdxPerMonitor[getMousePointerMonitorIndex()];
        const currentLayout = this.layouts.definitions[currentMonitorLayoutIdx] || NONE_LAYOUT;
        let renameLayoutButton = new PopupMenu.PopupMenuItem(_("Rename: " + currentLayout.name));

        renameLayoutButton.setSensitive(currentMonitorLayoutIdx >= 0);
        editLayoutButton.setSensitive(activeMonitors().every(monitor => this.currentLayoutIdxPerMonitor[monitor.index] >= 0));
        let currentMonitorIndex = getMousePointerMonitorIndex();
        if (this.editor[currentMonitorIndex] != null) {
            this.indicator.menu.addMenuItem(resetLayoutButton);
            this.indicator.menu.addMenuItem(saveLayoutButton);
            this.indicator.menu.addMenuItem(cancelEditingButton);
        } else {
            for (const binding of this.monitorBindings) {
                const selected = this.layouts.definitions[this.currentLayoutIdxPerMonitor[binding.index]] || NONE_LAYOUT;
                const mirrorLabel = binding.mirrored.length > 1 ? `; mirrored: ${binding.mirrored.join(', ')}` : '';
                const monitorMenu = new PopupMenu.PopupSubMenuMenuItem(`${binding.name} (${binding.connector}${mirrorLabel}) — ${selected.name}`);
                this.indicator.menu.addMenuItem(monitorMenu);
                this.createLayoutMenuItems(binding.index).forEach(item => monitorMenu.menu.addMenuItem(item));
            }

            let sep = new PopupMenu.PopupSeparatorMenuItem();
            this.indicator.menu.addMenuItem(sep);
            this.indicator.menu.addMenuItem(editLayoutButton);
            this.indicator.menu.addMenuItem(renameLayoutButton);
            this.indicator.menu.addMenuItem(newLayoutButton);

            // Add an entry-point for more settings
            this.indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            const settingsButton = this.indicator.menu.addAction('Settings',
                () => super.openPreferences());
            this.indicator.menu.addMenuItem(settingsButton);
        }


        renameLayoutButton.connect('activate', () => {
            const currentMonitorLayoutIdx = this.currentLayoutIdxPerMonitor[getMousePointerMonitorIndex()];
            const currentMonitorLayout = this.layouts.definitions[currentMonitorLayoutIdx];

            let dialog = new LayoutNameDialog(
                `Rename Layout ${currentMonitorLayout.name}`,
                currentMonitorLayout.name,
                (text: string) => {
                    if (!this.profilesReady || !this.isEnabled || !this.layouts.definitions.includes(currentMonitorLayout)) return;
                    currentMonitorLayout.name = text;
                    this.saveLayouts();
                    this.reloadMenu();
                });
            dialog.open();
        });

        newLayoutButton.connect('activate', () => {
            let dialog = new LayoutNameDialog(
                `Create new layout`,
                'New Layout',
                (text: string) => {
                    if (!this.profilesReady || !this.isEnabled) return;
                    this.layouts.definitions.push({
                        name: text,
                        type: 0,
                        length: 100,
                        items: [
                            {
                                type: 0,
                                length: 100,
                                items: []
                            }
                        ]
                    });
                    this.setLayout(this.layouts.definitions.length - 1);
                    this.saveLayouts();
                    this.reloadMenu();
                });
            dialog.open();
        });

        editLayoutButton.connect('activate', () => {
            activeMonitors().forEach(m => {
                const currentMonitorLayoutIdx = this.currentLayoutIdxPerMonitor[m.index];
                const currentMonitorLayout = this.layouts.definitions[currentMonitorLayoutIdx];
                const editLayout = cloneLayout(currentMonitorLayout);

                this.editor[m.index]?.destroy();
                this.editor[m.index] = new ZoneEditor(activeMonitors()[m.index], editLayout, gridSettings[SETTINGS.WINDOW_MARGIN]);
                this.editor[m.index]?.init();
                this.editor[m.index]?.show();
            });

            this.minimizeAllWindows();
            this.reloadMenu();
        });

        saveLayoutButton.connect('activate', () => {
            this.saveLayouts();
            this.setToCurrentWorkspace();
            this.reloadMenu();
        });

        resetLayoutButton.connect('activate', () => {
            activeMonitors().forEach(m => {
                let editor = this.editor[m.index];
                if (editor) {
                    editor.destroy();
                    editor.layoutItem = {
                        type: 0,
                        length: 100,
                        items: [
                            {
                                type: 0,
                                length: 100,
                                items: [],
                            }
                        ]
                    }
                    editor.applyLayout(editor);
                    this.reloadMenu();
                }
            });
        });

        cancelEditingButton.connect('activate', () => {
            activeMonitors().forEach(m => {
                this.editor[m.index]?.destroy();
                this.editor[m.index] = null;
            });

            this.unminimizeAllWindows();
            this.reloadMenu();
        });
    }

    createLayoutMenuItems(monitorIndex: number): Array<any> {
        let items = [];
        for (let i = 0; i < this.layouts.definitions.length; i++) {
            let item = new PopupMenu.PopupMenuItem(_(this.layouts.definitions[i].name == null ? "Layout " + i : this.layouts.definitions[i].name));
            if (this.currentLayoutIdxPerMonitor[monitorIndex] === i) item.setOrnament(PopupMenu.Ornament.DOT);
            item.connect('activate', () => {
                this.setLayout(i, monitorIndex);
                this.hideLayoutPreview();
            });
            item.actor.connect('enter-event', () => {
                this.showLayoutPreview(monitorIndex, this.layouts.definitions[i]);
            });
            item.actor.connect('leave-event', () => {
                this.hideLayoutPreview();
            });
            items.push(item);
        }
        return items;
    }

    saveLayouts() {
        if (!this.profilesReady || !this.layoutsUtils.writable) return;
        activeMonitors().forEach(m => {
            const idx = this.currentLayoutIdxPerMonitor[m.index];
            const editor = this.editor[m.index];
            if (editor) {
                if (editor.layout) {
                    this.layouts.definitions[idx] = editor.layout;
                }
                editor.apply();
                editor.destroy();
            }
            this.editor[m.index] = null;
        });

        this.layoutsUtils.saveSettings(this.layouts);
        this.unminimizeAllWindows();
    }

    disable() {
        log("Extension disable begin");
        this.discovery.invalidate();
        this.discoveryCancellable?.cancel();
        this.discoveryCancellable = null;
        if (this.discoverySource) GLib.Source.remove(this.discoverySource);
        this.discoverySource = 0;
        this.profilesReady = false;
        this.monitorBindings = [];
        this.displaySignals.forEach(signal => global.display.disconnect(signal));
        this.displaySignals = [];
        deinitSettings();
        this.settings = null;
        this.isEnabled = false;
        this.modifiersManager.destroy();
        this.clearMonitorResources();

        if (this.workspaceSwitchedConnect) {
            WorkspaceManager.disconnect(this.workspaceSwitchedConnect);
            this.workspaceSwitchedConnect = false;
        }
        if (this.restackConnection) {
            global.display.disconnect(this.restackConnection);
            this.restackConnection = false;
        }
        if (this.monitorsChangedConnect) {
            log("Disconnecting monitors-changed");
            Main.layoutManager.disconnect(this.monitorsChangedConnect);
            this.monitorsChangedConnect = false;
        }

        if (this.workareasChangedConnect) {
            global.display.disconnect(this.workareasChangedConnect);
            this.workareasChangedConnect = false;
        }

        unbindHotkeys(this.keyBindings);
        unbindHotkeys(this.key_bindings_presets);
        unbindHotkeys(this.keyBindingGlobalResizes);

        this.indicator?.destroy();
        this.indicator = null;
    }


    /**
     * onFocus is called when the global focus changes.
     */
    onFocus() { }

    private setToCurrentWorkspace(monitorIndex?: number) {
        const monitors = activeMonitors().filter(monitor => monitorIndex === undefined || monitor.index === monitorIndex);
        for (const monitor of monitors) {
            const binding = this.monitorBindings.find(display => display.index === monitor.index);
            const selected = this.profilesReady ? selectedLayout(this.layouts, binding) : -1;
            const stored = binding ? this.layouts.profiles?.[binding.key]?.current : undefined;
            if (stored !== undefined && (stored < 0 || stored >= this.layouts.definitions.length)) {
                logError('restore-invalid-layout', new Error(`key=${binding!.key} stored=${stored} fallback=None`));
            }
            log(`restore workspace=${WorkspaceManager.get_active_workspace().index()} index=${monitor.index} key=${binding?.key || 'unresolved'} layout=${selected}`);
            this.applyLayout(selected, monitor.index);
        }
    }
}
