// The Python modules the tests import, run on the package's engine: compiled by
// Brython's own compiler, which this file loads, and each name the module holds
// handed over as a host's export is (`pyExport`), a name it does not hold as
// undefined. And Python run for a test's own values, read as Python holds them.
import { createRequire } from 'node:module';
import { pyExport } from '../bryntime.js';

createRequire(import.meta.url)('../vendor/brython_compiler.js');

const MISSING = {};
let runs = 0;

// The module a source makes once run, its values as Python holds them.
export function runPython(source, name = `test_module_${++runs}`) {
    // The engine names a script by the page's address, which Node has not.
    globalThis.location ??= new URL('file:///');

    return globalThis.__BRYTHON__.runPythonSource(source, { id: name });
}

// A name of a module a source makes, as Python holds it.
export const python = (source) => {
    const module = runPython(source);

    return (name) => globalThis.__BRYTHON__.$getattr(module, name);
};

export function pythonModule(source, name) {
    const $B = globalThis.__BRYTHON__;
    const module = runPython(source, name);

    return (key) => {
        const value = $B.$getattr(module, key, MISSING);

        return value === MISSING ? undefined : pyExport(value, `${name}.${key}`);
    };
}
