// The views of Python containers JavaScript reads (`views.js`), held against
// JavaScript's own: each operation is made on a JavaScript Array, object or Set
// and on the view of a Python list, dict, set or instance holding the same,
// and must answer the same, while what it writes lands in the Python value,
// which `repr()` reads back as `python3` would print it.
import { test, expect, describe } from 'vitest';
import { viewOf } from '../src/bryntime.js';
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

describe("a set's view answers a Set's methods as a Set does", () => {
    const other = () => new Set([2, 3]);

    test.each([
        ['union', (s) => [...s.union(other())].sort()],
        ['intersection', (s) => [...s.intersection(other())]],
        ['difference', (s) => [...s.difference(other())]],
        ['symmetricDifference', (s) => [...s.symmetricDifference(other())].sort()],
        ['isSubsetOf', (s) => s.isSubsetOf(new Set([1, 2, 3]))],
        ['isSupersetOf', (s) => s.isSupersetOf(new Set([1]))],
        ['isDisjointFrom', (s) => s.isDisjointFrom(new Set([9]))],
        ['keys', (s) => [...s.keys()].sort()],
        ['values', (s) => [...s.values()].sort()],
        ['entries', (s) => [...s.entries()].sort()],
        ['forEach', (s) => {
            const seen = [];
            s.forEach((one) => seen.push(one));
            return seen.sort();
        }]
    ])('%s', (name, operation) => {
        const [js, py] = both(new Set([1, 2]), made('{1, 2}'), operation);

        expect(py).toEqual(js);
    });

    test('clear empties the Python set', () => {
        const py = made('{1, 2}');

        viewOf(py).clear();
        expect(repr(py)).toBe('set()');
    });
});

describe("a view keeps Svelte's rules for its own state", () => {
    test.each([
        ['a list', '[1]', '0'],
        ['a dict', '{"a": 1}', 'a']
    ])('%s takes a descriptor holding a value, writable, enumerable and configurable, and refuses any other', (name, source, key) => {
        const py = made(source);
        const view = viewOf(py);

        Object.defineProperty(view, key, { value: 7, writable: true, enumerable: true, configurable: true });
        expect(view[key]).toBe(7);
        expect(() => Object.defineProperty(view, key, { value: 8, writable: false })).toThrow(TypeError);
        expect(() => Object.defineProperty(view, key, { get: () => 9, enumerable: true, configurable: true })).toThrow(TypeError);
        expect(view[key]).toBe(7);
    });

    test.each([
        ['a list', '[1]'],
        ['a dict', '{"a": 1}']
    ])('%s can be neither locked nor given another prototype', (name, source) => {
        const view = viewOf(made(source));

        expect(() => Object.preventExtensions(view)).toThrow(TypeError);
        expect(() => Object.setPrototypeOf(view, null)).toThrow(TypeError);
        expect(Object.isExtensible(view)).toBe(true);
    });

    test('an instance too', () => {
        const view = viewOf(
            python(`
class Point:
    def __init__(self):
        self.x = 1
value = Point()
`)('value')
        );

        expect(() => Object.preventExtensions(view)).toThrow(TypeError);
        expect(() => Object.setPrototypeOf(view, null)).toThrow(TypeError);
        expect(() => Object.defineProperty(view, 'x', { value: 2, writable: false })).toThrow(TypeError);
        Object.defineProperty(view, 'x', { value: 2, writable: true, enumerable: true, configurable: true });
        expect(view.x).toBe(2);
    });
});

describe("an instance's view deletes as Python's delattr does", () => {
    const account = () =>
        python(`
class Account:
    def __init__(self):
        self.owner = "ada"
        self.log = []
    @property
    def balance(self):
        return 0
    @balance.deleter
    def balance(self):
        self.log.append("closed")
value = Account()
`)('value');

    test('an attribute of its own goes', () => {
        const py = account();

        delete viewOf(py).owner;
        expect($B.$getattr(py, 'owner', null)).toBe(null);
    });

    test('a deleter of its class runs', () => {
        const py = account();

        delete viewOf(py).balance;
        expect(repr($B.$getattr(py, 'log'))).toBe("['closed']");
    });
});

// A name its class reads itself, by a property or a descriptor of the author's
// that Python's lookup runs ahead of the instance's dictionary, which holds the
// name too: the view describes it as an accessor, as JavaScript describes a
// getter. Listing the keys, describing them or asking for one reads nothing; a
// copy reads it once. Described as the value read, they ran the getter, and a
// copy ran it twice, a getter that raises raising where nothing was read.
describe('an instance whose class reads an attribute itself', () => {
    const fresh = python(`
class Box:
    def __init__(self, mode):
        self.__dict__["value"] = 7
        self.reads = 0
        self.mode = mode
    @property
    def value(self):
        self.reads += 1
        if self.mode == "raising":
            raise ValueError("read")
        return self.reads if self.mode == "changing" else self.__dict__["value"]
    @value.setter
    def value(self, given):
        self.__dict__["value"] = given

class Descriptor:
    def __get__(self, obj, cls=None):
        obj.reads += 1
        if obj.mode == "raising":
            raise ValueError("read")
        return obj.reads if obj.mode == "changing" else obj.__dict__["value"]
    def __set__(self, obj, given):
        obj.__dict__["value"] = given

class Described:
    value = Descriptor()
    def __init__(self, mode):
        self.value = 7
        self.reads = 0
        self.mode = mode

def fresh(kind, mode):
    return Box(mode) if kind == "property" else Described(mode)
`)('fresh');

    // JavaScript's own: an enumerable getter, which counts and raises alike.
    const native = (mode) => {
        const box = {};

        Object.defineProperty(box, 'value', {
            get() {
                box.reads += 1;
                if (mode === 'raising') throw new Error('read');
                return mode === 'changing' ? box.reads : 7;
            },
            set() {},
            enumerable: true,
            configurable: true
        });
        box.reads = 0;
        box.mode = mode;

        return box;
    };

    const traced = (box, operation, reads) => {
        let answer;
        let raised = false;

        try {
            answer = operation(box);
        } catch {
            raised = true;
        }

        return { answer, raised, reads: reads() };
    };

    const OPERATIONS = [
        ['Object.keys', (box) => Object.keys(box)],
        ['Object.getOwnPropertyDescriptors', (box) => Object.keys(Object.getOwnPropertyDescriptors(box))],
        ['Object.hasOwn', (box) => Object.hasOwn(box, 'value')],
        ['a spread', (box) => ({ ...box }).value],
        ['Object.assign', (box) => Object.assign({}, box).value],
        ['Object.entries', (box) => Object.fromEntries(Object.entries(box)).value]
    ];

    test.each(
        ['property', 'descriptor'].flatMap((kind) =>
            ['stable', 'changing', 'raising'].flatMap((mode) => OPERATIONS.map(([name, operation]) => [kind, mode, name, operation]))
        )
    )('a %s, %s: %s reads as a getter does', (kind, mode, name, operation) => {
        const py = $B.$call(fresh, kind, mode);
        const js = native(mode);

        expect(traced(viewOf(py), operation, () => $B.$getattr(py, 'reads'))).toEqual(traced(js, operation, () => js.reads));
    });
});

test('a walk of a view left early is left as an Array walk is', () => {
    const view = viewOf(made('[1, 2, 3]'));
    const seen = [];

    for (const one of view) {
        seen.push(one);
        if (one === 2) break;
    }
    expect(seen).toEqual([1, 2]);
    expect([...view]).toEqual([1, 2, 3]);
});
