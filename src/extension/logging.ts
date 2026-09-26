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
 * /usr/bin/gnome-shell` and grepping the results for 'gSnap2'.
 */
export function log(message: string): void {
    if(debug) {
        console.warn("gSnap2 " + callSite(new Error().stack) + message);
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

/** Persistence/discovery failures must remain visible with debug disabled. */
export function logError(event: string, error: unknown): void {
    // GJS Error.stack contains frames without the message; GI errors may not
    // inherit from JavaScript Error. Preserve both the message and any frames.
    const stack = error && typeof error === 'object' && 'stack' in error
        ? String((error as { stack?: unknown }).stack || '') : '';
    console.error(`gSnap2 ${event}: ${String(error)}${stack ? '\n' + stack : ''}`);
}
