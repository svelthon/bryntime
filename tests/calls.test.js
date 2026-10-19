// The calls between the two languages (`calls.js`): a Python callable handed to
// JavaScript as one function per callable, its arguments crossing in as Python
// values and its result out as JavaScript's, a coroutine run and handed over as
// a promise, a JavaScript function called by Python, and a module's exports.
// Each result is what `python3` computes for the same call.
import { test, expect, describe } from 'vitest';
import { pyHandler, pyExport, pyArg, standsFor, NONE } from '../src/bryntime.js';
import { python } from './python.js';

const $B = globalThis.__BRYTHON__;
const repr = (value) => $B.builtins.repr(value);
const read = python(`
def add(a, b=10):
    return a + b

def half(x):
    return x / 2

def kinds(*args):
    return [type(one).__name__ for one in args]

def joined(parts, *, sep="-"):
    return sep.join(parts)

async def later(x):
    return x * 2

async def fails():
    raise ValueError("async bad")

class Counter:
    def __init__(self):
        self.n = 0
    def bump(self):
        self.n += 1
        return self.n
    def __call__(self):
        return "called"

counter = Counter()

def listed():
    return [1, 2.5]

def nothing():
    return None

def calls_back(callback):
    return callback(2) + 1

def same(value):
    return value
`);

describe('a Python callable handed to JavaScript', () => {
    test('is one function per callable, which JavaScript calls with its own values', () => {
        const add = pyHandler(read('add'));

        expect(typeof add).toBe('function');
        expect(pyHandler(read('add'))).toBe(add);
        expect([add(1), add(1, 2), add(1.5, 1)]).toEqual([11, 3, 2.5]);
    });

    test("a missing argument takes the parameter's default, an undefined one is None as CPython's add(1, None) is", () => {
        expect(pyHandler(read('add'))(1)).toBe(11);
        expect(() => pyHandler(read('add'))(1, undefined)).toThrow(/unsupported operand type\(s\) for \+: 'int' and 'NoneType'/);
    });

    test('each JavaScript scalar arrives as the Python value it stands for', () => {
        expect([...pyHandler(read('kinds'))(1, 1.5, 'a', true, undefined, null)]).toEqual([
            'int',
            'float',
            'str',
            'bool',
            'NoneType',
            'NullType'
        ]);
    });

    test('a float result is a number, a None one undefined, a list one an Array', () => {
        expect(pyHandler(read('half'))(3)).toBe(1.5);
        expect(pyHandler(read('nothing'))()).toBeUndefined();
        expect([...pyHandler(read('listed'))()]).toEqual([1, 2.5]);
    });

    test('a bound method is one function per receiver and method, and runs on its receiver', () => {
        const counter = read('counter');
        const bump = pyHandler($B.$getattr(counter, 'bump'));

        expect(pyHandler($B.$getattr(counter, 'bump'))).toBe(bump);
        expect([bump(), bump(), $B.$getattr(counter, 'n')]).toEqual([1, 2, 2]);
    });

    test('a callable instance is called as Python calls it', () => {
        expect(pyHandler(read('counter'))()).toBe('called');
    });

    test('a JavaScript function it is handed is called by Python with its values', () => {
        expect(pyHandler(read('calls_back'))((x) => x * 3)).toBe(7);
    });

    test('it stands for the Python callable it hands over', () => {
        expect(standsFor(pyHandler(read('add')), new Set([read('add')]))).toBe(true);
        expect(standsFor(pyHandler(read('half')), new Set([read('add')]))).toBe(false);
    });
});

describe('a coroutine', () => {
    test('an async def called from JavaScript is run, and its result handed over as a promise', async () => {
        const later = pyExport(read('later'), 'later');

        await expect(later(2)).resolves.toBe(4);
    });

    test('what it raises rejects the promise, described', async () => {
        const fails = pyExport(read('fails'), 'fails');

        await expect(fails()).rejects.toMatchObject({ message: expect.stringMatching(/^ValueError: async bad/) });
    });
});

describe('an export', () => {
    test('a function crosses callable, a scalar as JavaScript holds it, None as undefined', () => {
        expect(pyExport(read('half'), 'half')(5)).toBe(2.5);
        expect(pyExport(python('value = 2.5')('value'), 'value')).toBe(2.5);
        expect(pyExport(NONE, 'none')).toBeUndefined();
    });

    test('a dict of functions crosses as an object whose functions are called with JavaScript values', () => {
        const actions = pyExport(python(`
def save(form):
    return "saved " + form
value = {"save": save}
`)('value'), 'actions');

        expect(actions.save('draft')).toBe('saved draft');
    });

    test('a view handed back to Python is the list itself, and comes out as the same view', () => {
        const back = python(`
rows = [1, 2]
def check(value):
    return [repr(value), len(value), value is rows, isinstance(value, list), id(value) == id(rows)]
`);
        const exported = pyExport(back('rows'), 'rows');

        expect([...pyHandler(back('check'))(exported)]).toEqual(['[1, 2]', 2, true, true, true]);
        expect(pyHandler(read('same'))(exported)).toBe(exported);
    });
});

test('pyArg hands Python a JavaScript number as the int or the float it is', () => {
    expect([repr(pyArg(2)), repr(pyArg(2.5)), pyArg(undefined) === NONE || pyArg(undefined) === undefined]).toEqual([
        '2',
        '2.5',
        true
    ]);
});
