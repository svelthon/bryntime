// The Python modules a page runs (`modules.js`), as a compiler hands them over:
// a namespace whose declared names are accessors (`bind`), the body run in it
// (`withNamespace`), `globals()` and `del` as CPython has them, the names
// published to JavaScript live (`liveExport`), and a body run once, at the
// import that needs it (`pythonModule`). Each answer below is what `python3`
// prints for the same module.
import { test, expect, describe } from 'vitest';
import { liveExport, pythonModule, registerModule, moduleNamespace, invoke, NONE } from '../bryntime.js';
import { compiledModule, runPython } from './python.js';

const $B = globalThis.__BRYTHON__;
const str = (value) => $B.builtins.str.$factory(value);
const errorName = (call) => {
    try {
        call();
    } catch (error) {
        return $B.$getattr($B.get_class(error), '__name__');
    }
    return 'no error';
};

describe('globals()', () => {
    test("lists the module's names in the order they were bound, and none it has not bound yet", () => {
        const { namespace, run } = compiledModule(
            `
first = 1
def second():
    pass
class Third:
    pass
listed = list(globals())
late = 2
`,
            'globals_order',
            ['first', 'second', 'listed', 'late']
        );

        run();
        expect([...namespace.listed].filter((name) => !name.startsWith('__'))).toEqual(['first', 'second', 'Third']);
    });

    test('is the dict a write through it binds, a deletion through it removes, and in asks', () => {
        const { namespace, run } = compiledModule(
            `
x = 1
globals()["made"] = 2
had = "made" in globals()
del globals()["x"]
gone = "x" not in globals()
here = locals() is globals()
`,
            'globals_writes',
            ['x', 'had', 'gone', 'here']
        );

        run();
        expect([namespace.made, namespace.had, namespace.gone, namespace.here]).toEqual([2, true, true, true]);
    });

    test('refuses a key that is not a string, in the words of the host', () => {
        const { namespace, run } = compiledModule(
            `
try:
    globals()[1] = 2
    said = "accepted"
except TypeError as error:
    said = str(error)
`,
            'globals_key',
            ['said']
        );

        run();
        expect(namespace.said).toMatch(/globals\(\) takes names, which are strings$/);
    });

    test('raises when a name is bound or deleted while it is walked, and not when one is bound again', () => {
        const { namespace, run } = compiledModule(
            `
existing = 1
doomed = 1
seen = []

def attempt(label, walk):
    try:
        walk()
        seen.append(label + " ok")
    except RuntimeError:
        seen.append(label + " RuntimeError")

def bind_new():
    global fresh
    for name in globals():
        fresh = 1

def bind_again():
    global existing
    for name in globals():
        existing = 2

def delete():
    global doomed
    for name in globals():
        del doomed

def define():
    global Made
    for name in globals():
        class Made:
            pass

attempt("new", bind_new)
attempt("again", bind_again)
attempt("delete", delete)
attempt("class", define)
`,
            'globals_walk',
            ['existing', 'doomed', 'seen', 'attempt', 'bind_new', 'bind_again', 'delete', 'define', 'fresh', 'Made']
        );

        run();
        expect([...namespace.seen]).toEqual(['new RuntimeError', 'again ok', 'delete RuntimeError', 'class RuntimeError']);
    });
});

describe('del', () => {
    test('a deleted name is absent: its read raises NameError, and a builtin of that name is found again', () => {
        const { namespace, run } = compiledModule(
            `
count = 1
len = "mine"
del count
del len

def read_count():
    return count

def read_len():
    return len("abc")
`,
            'deleted_names',
            ['count', 'len', 'read_count', 'read_len']
        );

        run();
        expect(errorName(() => namespace.read_count())).toBe('NameError');
        expect(namespace.read_len()).toBe(3);
    });

    test('a name bound again after its del is there again', () => {
        const { namespace, run } = compiledModule(
            `
x = 1
del x
x = 2
there = "x" in globals()
`,
            'rebound_name',
            ['x', 'there']
        );

        run();
        expect([namespace.x, namespace.there]).toEqual([2, true]);
    });
});

describe('liveExport', () => {
    test("hands JavaScript the name's value now and at each write, from the module or from a function of it", () => {
        const { namespace, run } = compiledModule(
            `
total = 1

def grow():
    global total
    total = total + 1
`,
            'live_total',
            ['total', 'grow']
        );
        const seen = [];

        run();
        liveExport(namespace, 'total', (value) => seen.push(value));
        namespace.grow();
        namespace.grow();
        expect(seen).toEqual([1, 2, 3]);
    });
});

describe('pythonModule', () => {
    test('runs the body once, when loaded, published under its name for an import to find', () => {
        let runs = 0;
        const { namespace, run } = compiledModule('value = 41 + 1', 'once_module', ['value']);
        const load = pythonModule(namespace, 'once_module', () => {}, () => {
            runs += 1;
            run();
        });

        expect(runs).toBe(0);
        load();
        load();
        expect([runs, $B.imported.once_module === namespace, namespace.value]).toEqual([1, true, 42]);
    });

    test('runs a waiting body at the import statement that needs it', () => {
        const order = [];
        const { namespace, run } = compiledModule('value = "loaded"', 'waiting_module', ['value']);

        pythonModule(namespace, 'waiting_module', () => {}, () => {
            order.push('body');
            run();
        });
        order.push('before import');

        const importer = runPython(
            `
import waiting_module
got = waiting_module.value
`
        );

        expect([order, $B.$getattr(importer, 'got')]).toEqual([['before import', 'body'], 'loaded']);
    });

    test('a body that raises is taken back out, and the next import runs it again in a new namespace', () => {
        const { namespace, run } = compiledModule('done = True', 'retry_module', ['done']);
        const fail = $B.$getattr(runPython('def fail():\n    raise ValueError("first time")'), 'fail');
        let renewed;
        let fails = true;
        const load = pythonModule(namespace, 'retry_module', (next) => (renewed = next), () => {
            if (fails) {
                fails = false;
                $B.$call(fail);
            }
            run(renewed ?? namespace);
        });

        expect(errorName(load)).toBe('ValueError');
        expect($B.imported.retry_module).toBeUndefined();
        expect(renewed).not.toBe(namespace);

        load();
        expect([$B.imported.retry_module === renewed, renewed.done]).toEqual([true, true]);
    });
});

test('registerModule publishes a namespace under its Python name', () => {
    const namespace = { value: 1 };

    registerModule('registered_here', namespace);
    expect([namespace.__name__, $B.imported.registered_here]).toEqual(['registered_here', namespace]);
});

test("moduleNamespace tells a JavaScript module's namespace from an object", async () => {
    const namespace = await import('./fixtures/plain_js_module.js');

    expect(moduleNamespace(namespace)).toBe(true);
    expect(moduleNamespace({ [Symbol.toStringTag]: 'Module' })).toBe(false);
    expect(moduleNamespace(null)).toBe(false);
});

test('invoke calls a body as Python calls it, a function as it is and a callable instance too', () => {
    const read = runPython(`
class Twice:
    def __call__(self):
        return 2
twice = Twice()
`);

    expect(invoke(() => 1)).toBe(1);
    expect(invoke($B.$getattr(read, 'twice'))).toBe(2);
    expect(invoke(() => NONE)).toBe(NONE);
    expect(str(invoke(() => 'text'))).toBe('text');
});
