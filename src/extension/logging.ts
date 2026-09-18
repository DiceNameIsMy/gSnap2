/* Logging
 * Written by Sergey
*/ 

let debug: boolean = false;

/**
 * If called with a false argument, log statements are suppressed.
 */
export function setLoggingEnabled(enabled: boolean): void {
    debug = enabled;
}

/**
 * Log logs the given message using the gnome shell logger (global.log) if the
 * debug variable is set to true.
 *
 * Debug messages may be viewed using the bash command `journalctl
 * /usr/bin/gnome-shell` and grepping the results for 'gSnap'.
 */
export function log(message: string): void {
    if(debug) {
        console.warn("gSnap " + callSite(new Error().stack) + message);
    }
}

/**
 * Extracts "[file:line] " from the frame that called log(), i.e. the second
 * line of the stack (the first is this call to `new Error()` itself). Since
 * extension.js/prefs.js are single-file rollup bundles, the file name will
 * always be one of those two, not the original .ts module - only the line
 * number is useful for pinpointing a specific log call.
 */
function callSite(stack: string | undefined): string {
    const callerFrame = stack?.split('\n')[1];
    const match = callerFrame?.match(/([^/\\]+):(\d+):\d+\s*$/);
    return match ? `[${match[1]}:${match[2]}] ` : '';
}
