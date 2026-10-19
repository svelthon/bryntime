// The views of Python containers JavaScript reads (`views.js`), held against
// JavaScript's own: each operation is made on a JavaScript Array, object or Set
// and on the view of a Python list, dict, set or instance holding the same,
// and must answer the same, while what it writes lands in the Python value,
// which `repr()` reads back as `python3` would print it.
import { test, expect, describe } from 'vitest';
import { viewOf } from '../bryntime.js';
import { python } from './python.js';

const $B = globalThis.__BRYTHON__;
const repr = (value) => $B.builtins.repr(value);

// A fresh Python value for each test, made by the source given.
const made = (source) => python(`value = ${source}`)('value');

// The same operation on a JavaScript value and on the view of a Python one.
const both = (js, py, operation) => [operation(js), operation(viewOf(py))];

describe('a list read as an Array', () => {
    const list = () => made('[1, 2.5, "a"]');

    test('is an Array, reads its items and its length as one', () => {
        const view = viewOf(list());

        expect(Array.isArray(view)).toBe(true);
        expect([view.length, view[0], view[1], view[2], view[3]]).toEqual([3, 1, 2.5, 'a', undefined]);
    });

    test.each([
        ['map', (a) => a.map((x) => String(x))],
        ['filter', (a) => a.filter((x) => typeof x === 'number')],
        ['slice', (a) => a.slice(1)],
        ['indexOf', (a) => a.indexOf('a')],
        ['includes', (a) => a.includes(2.5)],
        ['join', (a) => a.join('-')],
        ['at', (a) => a.at(-1)],
        ['find', (a) => a.find((x) => x === 'a')],
        ['spread', (a) => [...a]],
        ['for of', (a) => {
            const out = [];
            for (const one of a) out.push(one);
            return out;
        }],
        ['keys', (a) => Object.keys(a)],
        ['JSON', (a) => JSON.stringify(a)],
        ['entries', (a) => [...a.entries()]],
        ['reduce', (a) => a.reduce((sum, x) => sum + String(x), '')]
    ])('%s answers as an Array does', (name, operation) => {
        const [js, py] = both([1, 2.5, 'a'], list(), operation);

        expect(py).toEqual(js);
    });

    test.each([
        ['push', (a) => a.push(4), '[1, 2.5, \'a\', 4]'],
        ['pop', (a) => a.pop(), '[1, 2.5]'],
        ['shift', (a) => a.shift(), '[2.5, \'a\']'],
        ['unshift', (a) => a.unshift(0), '[0, 1, 2.5, \'a\']'],
        ['splice', (a) => a.splice(1, 1, 'x', 'y'), '[1, \'x\', \'y\', \'a\']'],
        ['reverse', (a) => a.reverse().length, '[\'a\', 2.5, 1]'],
        ['an index written', (a) => (a[0] = 9), '[9, 2.5, \'a\']'],
        ['length shortened', (a) => (a.length = 1), '[1]'],
        ['fill', (a) => a.fill(0, 1).length, '[1, 0, 0]']
    ])('%s writes into the Python list, answering as an Array does', (name, operation, printed) => {
        const js = [1, 2.5, 'a'];
        const py = list();
        const view = viewOf(py);

        expect(operation(view)).toEqual(operation(js));
        expect([...view]).toEqual(js);
        expect(repr(py)).toBe(printed);
    });

    test('sort sorts the Python list as JavaScript sorts its own', () => {
        const py = made('[3, 1, 2]');
        const view = viewOf(py);

        view.sort((a, b) => a - b);
        expect(repr(py)).toBe('[1, 2, 3]');
    });

    test('a list holding a list hands over its view, the same each time', () => {
        const py = made('[[1, 2], [3]]');
        const view = viewOf(py);

        expect(view[0]).toBe(view[0]);
        expect([...view[0]]).toEqual([1, 2]);
        view[0].push(5);
        expect(repr(py)).toBe('[[1, 2, 5], [3]]');
    });

    test('a view handed back to Python is the list itself', () => {
        const py = made('[1]');

        expect(viewOf(py)).toBe(viewOf(py));
    });
});

describe('a dict read as an object', () => {
    const dict = () => made('{"a": 1, "b": [1, 2]}');

    test('reads its keys and values, a nested list as its view', () => {
        const view = viewOf(dict());

        expect([view.a, [...view.b], 'a' in view, 'z' in view, view.z]).toEqual([1, [1, 2], true, false, undefined]);
        expect(Object.keys(view)).toEqual(['a', 'b']);
        expect(JSON.stringify(view)).toBe('{"a":1,"b":[1,2]}');
        expect(Object.entries(view).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v])).toEqual([['a', 1], ['b', [1, 2]]]);
    });

    test('a key written and a key deleted land in the Python dict', () => {
        const py = dict();
        const view = viewOf(py);

        view.c = 3;
        delete view.a;
        expect(repr(py)).toBe("{'b': [1, 2], 'c': 3}");
    });

    test('a spread copies it as JavaScript copies an object', () => {
        const view = viewOf(made('{"a": 1, "b": "x"}'));

        expect({ ...view }).toEqual({ a: 1, b: 'x' });
    });
});

describe('a set read as a Set', () => {
    test('answers has, size and iteration, and its writes land in the Python set', () => {
        const py = made('{1, 2}');
        const view = viewOf(py);

        expect(view instanceof Set).toBe(true);
        expect([view.size, view.has(1), view.has(3)]).toEqual([2, true, false]);
        view.add(3);
        view.delete(1);
        expect([...view].sort()).toEqual([2, 3]);
        expect(repr(py)).toBe('{2, 3}');
    });
});

describe('a tuple read as a frozen Array', () => {
    test('reads as an Array and refuses a write as a frozen one does, the tuple untouched', () => {
        const py = made('(1, 2)');
        const view = viewOf(py);
        const frozen = Object.freeze([1, 2]);

        expect([Array.isArray(view), [...view], view.length]).toEqual([true, [1, 2], 2]);
        for (const write of [(a) => (a[0] = 9), (a) => a.push(3), (a) => a.pop()]) {
            expect(() => write(frozen)).toThrow(TypeError);
            expect(() => write(view)).toThrow(TypeError);
        }
        expect(repr(py)).toBe('(1, 2)');
    });
});

describe('a dict whose keys are ints', () => {
    test('reads each key under the property JavaScript spells it as, and keeps the int', () => {
        const py = made('{1: "a", 2: "b"}');
        const view = viewOf(py);

        expect([view[1], view['2'], Object.keys(view)]).toEqual(['a', 'b', ['1', '2']]);
        view[1] = 'z';
        expect(repr(py)).toBe("{1: 'z', 2: 'b'}");
    });
});

describe('an instance of a class with __slots__', () => {
    test('lists its slots as its attributes, and writes them', () => {
        const py = python(`
class Pair:
    __slots__ = ("left", "right")
    def __init__(self):
        self.left = 1
        self.right = 2
value = Pair()
`)('value');
        const view = viewOf(py);

        expect([Object.keys(view), view.left, JSON.stringify(view)]).toEqual([['left', 'right'], 1, '{"left":1,"right":2}']);
        view.right = 5;
        expect($B.$getattr(py, 'right')).toBe(5);
    });
});

describe("an instance read as an object of its attributes", () => {
    const point = () =>
        python(`
class Point:
    def __init__(self):
        self.x = 1
        self.y = 2
value = Point()
`)('value');

    test('reads, lists and serialises its attributes', () => {
        const view = viewOf(point());

        expect([view.x, view.y, Object.keys(view), JSON.stringify(view)]).toEqual([1, 2, ['x', 'y'], '{"x":1,"y":2}']);
    });

    test('an attribute written lands on the instance', () => {
        const py = point();

        viewOf(py).x = 5;
        expect($B.$getattr(py, 'x')).toBe(5);
    });
});
