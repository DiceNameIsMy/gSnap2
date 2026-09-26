export interface WorkspaceMonitorSettings {
    current: number
};

export interface LayoutItem {
    type: number,
    length: number,
    items: LayoutItem[]
};

export interface Layout extends LayoutItem {
    name: string,
};

export interface MonitorProfile {
    connector: string;
    vendor: string;
    product: string;
    serial: string;
    name: string;
    current: number;
}

export interface LayoutsSettings {
    version?: 1 | 2,
    workspaces?: WorkspaceMonitorSettings[][],
    profiles?: Record<string, MonitorProfile>,
    definitions: Layout[]
};


export function cloneLayoutItem(layoutItem: LayoutItem) : LayoutItem {
    return {
        type: layoutItem.type,
        length: layoutItem.length,
        items: layoutItem.items?.map(x => cloneLayoutItem(x)) ?? [],
    };
}

export function cloneLayout(layout: Layout) : Layout {
    return {
        name: layout.name,
        type: layout.type,
        length: layout.length,
        items: layout.items?.map(x => cloneLayoutItem(x)) ?? [],
    };
}