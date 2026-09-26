// @ts-ignore
import Gio from 'gi://Gio';

export function readDisplayConfig(cancellable: any): Promise<any[]> {
    return new Promise((resolve, reject) => {
        Gio.DBus.session.call('org.gnome.Mutter.DisplayConfig', '/org/gnome/Mutter/DisplayConfig',
            'org.gnome.Mutter.DisplayConfig', 'GetCurrentState', null, null,
            Gio.DBusCallFlags.NONE, 5000, cancellable, (connection: any, result: any) => {
                try {
                    resolve(connection.call_finish(result).deep_unpack());
                } catch (error) {
                    reject(error);
                }
            });
    });
}
