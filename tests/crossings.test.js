// What crosses and how (`core.js`), by the crossing's own doors: a Python value
// copied out for JavaScript (`plainData`), under the graph rule a JavaScript
// reader gets and the JSON rule a serialiser asks for, and a JavaScript value
// copied in for Python (`pyData`). None is JavaScript's undefined at every
// door, and null in JSON alone; `javascript.NULL` is null.
import { test, expect, describe } from 'vitest';
import { plainData, pyData, plainScalar } from '../src/bryntime.js';
import { python } from './python.js';

const $B = globalThis.__BRYTHON__;
const repr = (value) => $B.builtins.repr(value);
const typeName = (value) => $B.class_name(value);
const read = python(`
from javascript import NULL
null = NULL
cycle = []
cycle.append(cycle)
shared = {"a": 1}
twice = [shared, shared]
class Point:
    def __init__(self):
        self.x = 1
point = Point()
`);
const value = (source) => python(`value = ${source}`)('value');
const json = (v) => JSON.stringify(plainData(v, new Set(), (fn) => fn));

describe('a Python value copied out, for a JavaScript reader', () => {
    test.each([
        ['None', 'None', undefined],
        ['True', 'True', true],
        ['an int', '1', 1],
        ['an int past 2 ** 53', '2 ** 60', 2n ** 60n],
        ['a float', '1.5', 1.5],
        ['an integral float', '1.0', 1],
        ['inf', 'float("inf")', Infinity],
        ['a str', '"a"', 'a'],
        ['a list holding None', '[1, None]', [1, undefined]],
        ['a tuple', '(1, 2)', [1, 2]],
        ['a dict holding None', '{"a": None}', { a: undefined }],
        ['a dict keyed by an int', '{1: "x"}', { 1: 'x' }],
        ['a dict keyed by None', '{None: 1}', { undefined: 1 }],
        ['an instance', 'None', undefined]
    ])('%s', (name, source, expected) => {
        expect(plainData(value(source))).toEqual(expected);
    });

    test('a NaN is NaN, and javascript.NULL is null', () => {
        expect(plainData(value('float("nan")'))).toBeNaN();
        expect(plainData(read('null'))).toBe(null);
    });

    test('a set and a frozenset are Sets', () => {
        expect(plainData(value('{1, 2}'))).toEqual(new Set([1, 2]));
        expect(plainData(value('frozenset({3})'))).toEqual(new Set([3]));
    });

    test('an instance is the object of its attributes', () => {
        expect(plainData(read('point'))).toEqual({ x: 1 });
    });

    test('a graph stays one: a cycle holds itself, and a value held twice is one object', () => {
        const cycle = plainData(read('cycle'));
        const twice = plainData(read('twice'));

        expect(cycle[0]).toBe(cycle);
        expect(twice[0]).toBe(twice[1]);
    });

    test('a scalar crosses as the scalar it is', () => {
        expect([plainScalar(value('1.0')), plainScalar(value('None')), plainScalar(value('2 ** 60'))]).toEqual([1, undefined, 2n ** 60n]);
    });
});

describe('a Python value copied out for JSON', () => {
    test.each([
        ['None is null', 'None', 'null'],
        ['a list holding None', '[1, None]', '[1,null]'],
        ['a dict keyed by None', '{None: 1}', '{"null":1}'],
        ['inf and nan, which JSON has not', '[float("inf"), float("nan")]', '[null,null]'],
        ['a dict', '{"a": [1, 2.5], "b": True}', '{"a":[1,2.5],"b":true}']
    ])('%s', (name, source, expected) => {
        expect(json(value(source))).toBe(expected);
    });

    test('a value held twice comes out twice, and a cycle comes out null', () => {
        expect(json(read('twice'))).toBe('[{"a":1},{"a":1}]');
        expect(json(read('cycle'))).toBe('[null]');
    });
});

describe('a JavaScript value copied in, for Python', () => {
    test.each([
        ['an integral number is an int', 1, 'int', '1'],
        ['a number with a fraction is a float', 1.5, 'float', '1.5'],
        ['a BigInt is an int', 2n ** 60n, 'int', '1152921504606846976'],
        ['NaN is a float', NaN, 'float', 'nan'],
        ['undefined is None', undefined, 'NoneType', 'None'],
        ['true is True', true, 'bool', 'True'],
        ['a string is a str', 'a', 'str', "'a'"],
        ['an array is a list', [1, 2.5, 'a'], 'list', "[1, 2.5, 'a']"],
        ['an object is a dict', { a: 1, b: [2] }, 'dict', "{'a': 1, 'b': [2]}"]
    ])('%s', (name, js, type, printed) => {
        const crossed = pyData(js);

        expect([typeName(crossed), repr(crossed)]).toEqual([type, printed]);
    });

    test('null is javascript.NULL', () => {
        expect(pyData(null)).toBe(null);
    });

    test('a graph stays one: an object holding itself is a dict holding itself, and one held twice one dict', () => {
        const cyclic = { a: 1 };
        cyclic.self = cyclic;
        const shared = { k: 1 };

        const dict = pyData(cyclic);
        const list = pyData([shared, shared]);

        expect($B.$getitem(dict, 'self')).toBe(dict);
        expect($B.$getitem(list, 0)).toBe($B.$getitem(list, 1));
    });

    test('only a plain object is copied: a Date, a Map, a Set and an instance of a JavaScript class keep their own crossing', () => {
        for (const js of [new Date(0), new Map([['a', 1]]), new Set([1]), new (class Record {})()]) {
            expect(['dict', 'list', 'set']).not.toContain(typeName(pyData(js)));
        }
    });
});

// `ob_type` is the engine's marker and an ordinary key, so a JavaScript object
// can carry one. Holding data there is data; holding a real Brython class
// cannot be told from the genuine article without a mark of the engine's own
// on what it made, which is upstream's to give (`core.js`, beside `pyScalar`).
describe('a key called ob_type', () => {
    test('holding data is data', () => {
        expect(plainData({ ob_type: 'business', value: 42, label: 'kept' })).toEqual({
            ob_type: 'business',
            value: 42,
            label: 'kept'
        });
    });

    // Its own `label` is lost, because what it says it is has no room for one.
    // The row exists so the next reader meets the limit here and not in a page.
    test('holding a Brython class is taken at its word', () => {
        expect(plainData({ ob_type: $B.builtins.float, value: 42, label: 'kept' })).toBe(42);
    });

    // Reading it off the descriptor instead costs 3 to 8 % on crossings and
    // class reads, measured, so the engine reads the field as it reads its own.
    test('as a getter, is run when Python reads an attribute of the object', () => {
        let reads = 0;
        const row = Object.defineProperty({ x: 1 }, 'ob_type', {
            enumerable: true,
            get: () => {
                reads += 1;
                return undefined;
            }
        });
        const x = python('def x(row):\n    return row.x\n')('x');

        expect($B.$call(x, row)).toBe(1);
        expect(reads).toBeGreaterThan(0);
    });
});
