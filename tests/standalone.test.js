// @vitest-environment node
//
// **Bryntime stands alone**: its modules import the engine and one another,
// nothing else, and the engine is imported where it is started; and loaded
// with no host to answer, it still turns JavaScript values into Python ones
// and back. What a host adds, the states it owns and how it makes an object
// one of them, is asked through `host`, which answers nothing here.
import { test, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { host, pyData, plainData, entering, pyBind, refused, NONE } from '../src/bryntime.js';

const at = (path) => new URL(`../${path}`, import.meta.url);
const ENTRY = JSON.parse(readFileSync(at('package.json'), 'utf8')).exports['.'];
const ENGINE = '../vendor/brython_runtime.js';
const IMPORTS = /^(?:import|export)\s+(?:[^'";]*\s+from\s+)?'([^']+)';/gm;
const read = (file) => readFileSync(at(`src/${file}`), 'utf8');

// The modules the entry reaches, read as the package ships them.
const modules = () => {
    const seen = new Set();
    const visit = (file) => {
        if (seen.has(file)) return;
        seen.add(file);
        for (const [, from] of read(file).matchAll(IMPORTS)) {
            if (/^\.\/[\w-]+\.js$/.test(from)) visit(from.slice(2));
        }
    };

    visit(ENTRY.split('/').pop());
    return [...seen];
};

describe('the engine is imported where it is started', () => {
    // The engine is a CommonJS file, so a bundler wraps it in a lazy
    // initialiser and places the call where the binding is used, not where the
    // import sits. Left to a neighbour's import order, that call lands after
    // `boot.js` in a production server build and `$B.brython` is undefined:
    // the site builds and answers 500.
    test("boot.js imports it", () => {
        expect(read('boot.js')).toMatch(/^import '\.\.\/vendor\/brython_runtime\.js';$/m);
    });

    test('and it is the module that calls brython(), and the only one', () => {
        expect(modules().filter((file) => read(file).includes('$B.brython('))).toEqual(['boot.js']);
    });

    // The half without the parsing chain is what a page gets, and the README
    // states its weight.
    test('the README states the size of the engine a page loads', () => {
        const size = Math.round(gzipSync(readFileSync(at('vendor/brython_runtime.js'))).length / 1024);
        const stated = Number(readFileSync(at('README.md'), 'utf8').match(/\*\*(\d+) KB\*\* gzipped/)[1]);

        expect(stated).toBe(size);
    });
});

test('Bryntime imports the engine and itself, and nothing else', () => {
    const imports = modules().flatMap((file) =>
        [...read(file).matchAll(IMPORTS)].map(([, from]) => `${file}: ${from}`)
    );

    expect(modules()).toContain('bryntime.js');
    expect(imports).toContain(`boot.js: ${ENGINE}`);
    expect(imports.filter((one) => !one.endsWith(`: ${ENGINE}`) && !/: \.\/[\w-]+\.js$/.test(one))).toEqual([]);
});

test('loaded alone, with no host, it crosses data both ways', () => {
    const $B = globalThis.__BRYTHON__;
    const python = pyData({ name: 'a', rows: [1, 2.5, { deep: null }] });

    expect($B.class_name(python)).toBe('dict');
    // `null` comes in as `javascript.NULL` and goes out as `null`.
    expect(plainData(python)).toEqual({ name: 'a', rows: [1, 2.5, { deep: null }] });
    expect(pyBind(undefined)).toBe(NONE);
    expect(host.owns(python)).toBe(false);
    expect($B.class_name(entering({ n: 1 }))).toBe('dict');
});

// With no host to answer how its reactions read and write, every read is taken
// for a reaction's, nothing is refused, nobody subscribes, and a call that
// reads without following runs as it is.
test('alone, it follows nothing and refuses nothing', () => {
    let started = 0;
    const join = host.subscriber(() => {
        started += 1;
        return () => {};
    });

    expect(host.reacting()).toBe(true);
    expect(host.refuses()).toBe(false);
    join();
    expect(started).toBe(0);
    expect(host.untrack(() => 7)).toBe(7);
});

// With no host to give its name, a refusal is signed with Bryntime's own, and
// known as one by `refused`.
test('alone, it signs its refusals with its own name', () => {
    const $B = globalThis.__BRYTHON__;
    const keys = $B.builtins.dict.$factory();
    let thrown;

    $B.$setitem(keys, 1, 'numeric');
    $B.$setitem(keys, '1', 'text');

    try {
        plainData(keys);
    } catch (error) {
        thrown = error;
    }

    expect(host.name).toBe('bryntime');
    expect(thrown.message).toMatch(/^bryntime — this dict has two keys JavaScript cannot tell apart/);
    expect(refused(thrown)).toBe(true);
    expect(refused(new Error('bryntime — written by hand'))).toBe(false);
});
