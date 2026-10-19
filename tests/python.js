// The Python modules the tests import, run on the package's engine: compiled by
// Brython's own compiler, which this file loads, and each name the module holds
// handed over as a host's export is (`pyExport`), a name it does not hold as
// undefined.
import { createRequire } from 'node:module';
import { pyExport } from '../bryntime.js';

createRequire(import.meta.url)('../vendor/brython_compiler.js');

const MISSING = {};

export function pythonModule(source, name) {
    const $B = globalThis.__BRYTHON__;

    // The engine names a script by the page's address, which Node has not.
    globalThis.location ??= new URL('file:///');

    const module = $B.runPythonSource(source, { id: name });

    return (key) => {
        const value = $B.$getattr(module, key, MISSING);

        return value === MISSING ? undefined : pyExport(value, `${name}.${key}`);
    };
}
