// The protocols of Python a host's syntax asks (`protocols.js`): a key that
// equal values share, as `{#key}` and a keyed block take one, what `**` and a
// starred name take of a value, and a key looked up by `__getitem__`. Each
// equality below is CPython's: `python3` answers `True` where two values share
// a key here, and `False` where they do not.
import { test, expect, describe } from 'vitest';
import { key, restOf, starredEntries, unpackStarred, lookup, byIndex, javaScriptRow, MISSING, NONE } from '../src/bryntime.js';
import { python } from './python.js';

const read = python(`
class Score(float):
    pass

class Point:
    def __init__(self, x):
        self.x = x
    def move(self):
        return self.x

class Always(tuple):
    def __eq__(self, other):
        return True
    __hash__ = tuple.__hash__

class Slotted:
    __slots__ = ("a",)
    def __init__(self):
        self.a = 1

class Mapping:
    def __getitem__(self, key):
        return key * 2
    def keys(self):
        return ["a", "b"]

class KeysField:
    keys = 3
    def __init__(self):
        self.kept = 1

class Raising:
    def __getitem__(self, key):
        raise ValueError("mine")

class Absent:
    def __getitem__(self, key):
        raise KeyError(key)

class Rows(list):
    pass

p, q = Point(1), Point(1)
values = {
    "tuple_a": (1, 2), "tuple_b": (1, 2), "tuple_c": (1, 3), "single": (1,),
    "float": 1.0, "int": 1, "bool": True, "score": Score(1.0),
    "nan_a": float("nan"), "nan_b": float("nan"),
    "frozen_a": frozenset({1, 2}), "frozen_b": frozenset({2, 1}),
    "complex": complex(2, 0), "two": 2, "complex_nan": complex(float("nan"), 0),
    "big": 2 ** 60, "big_float": float(2 ** 60),
    "neg_zero": -0.0, "zero": 0.0,
    "list_a": [1], "list_b": [1], "point": p,
    "always_a": Always((1,)), "always_b": Always((1,)),
    "text": "0.5", "half": 0.5, "bytes_a": b"ab", "bytes_b": b"ab",
    "method_a": p.move, "method_b": p.move, "method_q": q.move,
    "dict": {"a": 1, "b": 2, "c": 3}, "slotted": Slotted(), "mapping": Mapping(),
    "keys_field": KeysField(), "raising": Raising(), "absent": Absent(),
    "rows": Rows([10, 20]), "tuple_rows": (10, 20), "text_rows": "ab",
}
`);
const v = (name) => globalThis.__BRYTHON__.$getitem(read('values'), name);

describe('a key equal values share', () => {
    test('equal tuples, frozensets and bytes share one, unequal ones do not', () => {
        expect(key(v('tuple_a'))).toBe(key(v('tuple_b')));
        expect(key(v('tuple_a'))).not.toBe(key(v('tuple_c')));
        expect(key(v('frozen_a'))).toBe(key(v('frozen_b')));
        expect(key(v('bytes_a'))).toBe(key(v('bytes_b')));
        expect(String(key(v('single')))).toBe('(1,)');
    });

    test('1, 1.0, True and a float subclass equal to 1 are one key, the number 1', () => {
        for (const name of ['float', 'int', 'bool', 'score']) expect(key(v(name))).toBe(1);
    });

    test('a number past 2 ** 53 keys as the exact integer, whether an int or an equal float', () => {
        expect(key(v('big'))).toBe(2n ** 60n);
        expect(key(v('big_float'))).toBe(key(v('big')));
    });

    test('-0.0 and 0.0 are one key, and a complex with no imaginary part is its real part', () => {
        expect(key(v('neg_zero'))).toBe(key(v('zero')));
        expect(key(v('complex'))).toBe(key(v('two')));
    });

    test('a NaN equals nothing but itself', () => {
        expect(key(v('nan_a'))).not.toBe(key(v('nan_b')));
        expect(key(v('nan_a'))).toBe(key(v('nan_a')));
        expect(key(v('complex_nan'))).toBe(key(v('complex_nan')));
    });

    test('a list and an instance key by identity, and a class with its own equality too', () => {
        expect(key(v('list_a'))).not.toBe(key(v('list_b')));
        expect(key(v('list_a'))).toBe(v('list_a'));
        expect(key(v('point'))).toBe(v('point'));
        expect(key(v('always_a'))).not.toBe(key(v('always_b')));
    });

    test('a bound method keys by what it binds, read anew or not', () => {
        expect(key(v('method_a'))).toBe(key(v('method_b')));
        expect(key(v('method_a'))).not.toBe(key(v('method_q')));
    });

    test('a string and a number that print alike are two keys, and None is undefined', () => {
        expect(key(v('text'))).toBe('0.5');
        expect(key(v('half'))).toBe(0.5);
        expect(key(NONE)).toBeUndefined();
    });
});

describe('what ** takes of a row', () => {
    const entries = (dict) => Object.fromEntries(globalThis.__BRYTHON__.builtins.dict.$iter_items(dict).map((e) => [String(e.key), e.value]));
    const items = (dict) => [...globalThis.__BRYTHON__.builtins.dict.$iter_items(dict)].map((e) => [typeof e.key === 'symbol' ? 'symbol' : String(e.key), e.value]);

    test('a dict, all but the keys taken', () => {
        expect(items(restOf(v('dict'), ['a']))).toEqual([['b', 2], ['c', 3]]);
    });

    test('a JavaScript object, its own enumerable properties and symbols, a key compared as a property is', () => {
        const symbol = Symbol('s');
        const row = { a: 1, 2024: 'year', [symbol]: 3 };
        Object.defineProperty(row, 'hidden', { value: 4, enumerable: false });

        expect(items(restOf(row, ['a', 2024]))).toEqual([['symbol', 3]]);
        expect(javaScriptRow(row)).toBe(true);
        expect(javaScriptRow(v('dict'))).toBe(false);
    });

    test('a mapping by keys() and its __getitem__, an instance by its attributes', () => {
        expect(items(restOf(v('mapping'), ['a']))).toEqual([['b', 'bb']]);
        expect(items(restOf(v('keys_field'), []))).toEqual([['kept', 1]]);
    });

    test('a value with neither is refused as Python refuses {**value}', () => {
        expect(() => starredEntries(v('slotted'))).toThrow();
        try {
            starredEntries(NONE);
        } catch (error) {
            expect(globalThis.__BRYTHON__.$getattr(globalThis.__BRYTHON__.get_class(error), '__name__')).toBe('TypeError');
            expect(String(globalThis.__BRYTHON__.builtins.str.$factory(error))).toBe(
                "'NoneType' object is not a mapping, and has no attributes for ** to take"
            );
            return;
        }
        throw new Error('not refused');
    });

    test('a starred name takes the middle as a list, and a row too short raises', () => {
        const out = unpackStarred(v('tuple_rows'), 1, 0);
        expect([out[0], [...out[1]]]).toEqual([10, [20]]);
        expect([...unpackStarred(v('rows'), 0, 1)].map((one) => (Array.isArray(one) ? [...one] : one))).toEqual([[10], 20]);
        expect(() => unpackStarred(v('tuple_rows'), 2, 1)).toThrow();
    });
});

describe('a key looked up by __getitem__', () => {
    test('a dict answers its key, and a missing one is an absence', () => {
        expect(lookup(v('dict'), 'b')).toBe(2);
        expect(lookup(v('dict'), 'z')).toBe(MISSING);
    });

    test('a sequence refusing a string key, a KeyError and no __getitem__ are absences', () => {
        expect(lookup(v('rows'), 'name')).toBe(MISSING);
        expect(lookup(v('text_rows'), 'name')).toBe(MISSING);
        expect(lookup(v('absent'), 'name')).toBe(MISSING);
        expect(lookup(v('point'), 'name')).toBe(MISSING);
    });

    test('a plain JavaScript object answers its key as a mapping does, an instance of a JavaScript class does not', () => {
        expect(lookup({ name: 1 }, 'name')).toBe(1);
        expect(lookup(new (class Record {})(), 'name')).toBe(MISSING);
    });

    test("what the author's __getitem__ raises otherwise goes on", () => {
        expect(() => lookup(v('raising'), 'name')).toThrow();
    });
});

test('an array read by index whatever it holds as data', () => {
    const array = [1, 2];
    array.map = 'data';
    array.constructor = 'data';

    expect(byIndex(array)).toEqual([1, 2]);
    expect(byIndex(array, (one) => one * 10)).toEqual([10, 20]);
});
