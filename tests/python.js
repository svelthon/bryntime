// The Python modules the tests import, run on the package's engine: compiled by
// Brython's own compiler, which this file loads, and each name the module holds
// handed over as a host's export is (`pyExport`), a name it does not hold as
// undefined. And Python run for a test's own values, read as Python holds them.
import { bind, pyExport, withNamespace } from '../src/bryntime.js';
import 'bryve/compiler';

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

// A module as a compiler hands it to Bryntime: each declared name an accessor
// on the namespace's prototype (`bind`) over a cell of its own, the namespace
// made on it, and the body, compiled by Brython, run in it (`withNamespace`).
// The cells, as the generated code's own variables hold the values.
export function compiledModule(source, name, declared = []) {
    const $B = globalThis.__BRYTHON__;
    const cells = {};
    const proto = Object.create(null);

    for (const one of declared) {
        bind(proto, one, () => cells[one], (next) => (cells[one] = next), () => cells[one]);
    }

    const namespace = Object.create(proto);

    namespace.$proxy = true;
    namespace.__name__ = name;

    const js = $B.python_to_js(source, name);
    // In the namespace given, the one a failed run renewed (`pythonModule`).
    const run = (target = namespace) => withNamespace(name, target, () => (0, eval)(js));

    return { namespace, cells, run };
}

export function pythonModule(source, name) {
    const $B = globalThis.__BRYTHON__;
    const module = runPython(source, name);

    return (key) => {
        const value = $B.$getattr(module, key, MISSING);

        return value === MISSING ? undefined : pyExport(value, `${name}.${key}`);
    };
}
