const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { rollup } = require('rollup');

(async () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'gsnap2-storage-test-'));
    try {
        const bundle = await rollup({ input: 'build/layouts_utils.js', external: id => id.startsWith('gi://') });
        await bundle.write({ file: path.join(temporary, 'layouts-utils.js'), format: 'es' });
        await bundle.close();
        fs.copyFileSync('tests/storage.gjs.js', path.join(temporary, 'storage.gjs.js'));
        const result = spawnSync('gjs', ['-m', path.join(temporary, 'storage.gjs.js')], {
            env: { ...process.env, XDG_CONFIG_HOME: path.join(temporary, 'config') }, encoding: 'utf8',
        });
        process.stdout.write(result.stdout || '');
        process.stderr.write(result.stderr || '');
        if (result.error) throw result.error;
        process.exitCode = result.status ?? 1;
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
