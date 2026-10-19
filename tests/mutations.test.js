// The tracking of the Python values a reaction reads (`mutations.js`): a value
// tracked tells its subscriber of every change made to it or to anything under
// it, by whichever operation Python makes it, and of nothing else: a read, a
// copy, and a write that changes nothing tell nobody, as Svelte's own state
// tells nobody. The subscriber is a plain callback (`track`), no host needed.
import { test, expect, describe } from 'vitest';
import { track, unsubscribe, follow, changesNothing } from '../src/bryntime.js';
import { python } from './python.js';

const $B = globalThis.__BRYTHON__;

// How many times a value's subscriber was told while `operation`, Python code
// run with `value` bound to a fresh value made by `source`, ran.
function told(source, operation) {
    const read = python(`
value = ${source}
def run():
    global value
${operation
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')}
`);
    let count = 0;
    const bump = () => (count += 1);

    track(read('value'), bump);
    $B.$call(read('run'));

    return count;
}

const CHANGES = [
    ['list.append', '[1, 2]', 'value.append(3)'],
    ['list.extend', '[1, 2]', 'value.extend([3, 4])'],
    ['list.insert', '[1, 2]', 'value.insert(0, 0)'],
    ['list.pop', '[1, 2]', 'value.pop()'],
    ['list.remove', '[1, 2]', 'value.remove(1)'],
    ['list.clear', '[1, 2]', 'value.clear()'],
    ['list.sort', '[2, 1]', 'value.sort()'],
    ['list.reverse', '[1, 2]', 'value.reverse()'],
    ['an item written', '[1, 2]', 'value[0] = 9'],
    ['an item deleted', '[1, 2]', 'del value[0]'],
    ['a slice written', '[1, 2, 3]', 'value[0:2] = ["a"]'],
    ['+=', '[1]', 'value += [2]'],
    ['*=', '[1]', 'value *= 2'],
    ['a key written', '{"a": 1}', 'value["b"] = 2'],
    ['a key deleted', '{"a": 1}', 'del value["a"]'],
    ['dict.pop', '{"a": 1}', 'value.pop("a")'],
    ['dict.popitem', '{"a": 1}', 'value.popitem()'],
    ['dict.update', '{"a": 1}', 'value.update({"b": 2})'],
    ['dict.setdefault of a new key', '{"a": 1}', 'value.setdefault("b", 2)'],
    ['dict.clear', '{"a": 1}', 'value.clear()'],
    ['|= on a dict', '{"a": 1}', 'value |= {"b": 2}'],
    ['set.add', '{1}', 'value.add(2)'],
    ['set.discard', '{1, 2}', 'value.discard(1)'],
    ['set.remove', '{1, 2}', 'value.remove(1)'],
    ['set.pop', '{1, 2}', 'value.pop()'],
    ['set.clear', '{1}', 'value.clear()'],
    ['set.update', '{1}', 'value.update({2})'],
    ['|= on a set', '{1}', 'value |= {2}'],
    ['set.intersection_update', '{1, 2}', 'value.intersection_update({1})'],
    ['set.difference_update', '{1, 2}', 'value.difference_update({1})'],
    ['bytearray.append', 'bytearray(b"a")', 'value.append(98)'],
    ['a byte written', 'bytearray(b"a")', 'value[0] = 98'],
    ['a list in a dict appended to', '{"rows": [1]}', 'value["rows"].append(2)'],
    ['a dict in a list written', '[{"a": 1}]', 'value[0]["b"] = 2'],
    ['a list in a list in a dict appended to', '{"rows": [[1]]}', 'value["rows"][0].append(2)']
];

const NOTHING = [
    ['a read of an item', '[1, 2]', 'value[0]'],
    ['len', '[1, 2]', 'len(value)'],
    ['in', '[1, 2]', '1 in value'],
    ['a copy', '[1, 2]', 'value.copy()'],
    ['a walk', '[1, 2]', 'for one in value:\n    pass'],
    ['dict.get', '{"a": 1}', 'value.get("a")'],
    ['dict.setdefault of a key there', '{"a": 1}', 'value.setdefault("a", 2)'],
    ['dict.update with nothing', '{"a": 1}', 'value.update({})'],
    ['set.add of a member there', '{1}', 'value.add(1)'],
    ['set.discard of a member not there', '{1}', 'value.discard(2)'],
    ['set.update with nothing new', '{1}', 'value.update({1})'],
    ['an operation making a new list', '[1]', 'other = value + [2]'],
    ['an item written the value it holds', '[1, 2.5]', 'value[0] = value[0]'],
    ['an item written an equal float', '[2.5]', 'value[0] = 5 / 2']
];

// Told all the same, by rule. A list is Svelte's array, which writes on any of
// its mutators, and one that raises has often written already: it tells. And
// `intersection_update` is weighed only where a write is refused, while a
// reaction renders (`tests/reactions.test.js`): anywhere else it tells rather
// than read every member before it.
const TOLD_BY_RULE = [
    ['a list.remove that raises', '[1]', 'try:\n    value.remove(9)\nexcept ValueError:\n    pass'],
    ['set.intersection_update keeping every member', '{1}', 'value.intersection_update({1, 2})']
];

describe('a tracked value tells its subscriber of a change', () => {
    test.each(CHANGES)('%s', (name, source, operation) => {
        expect(told(source, operation)).toBeGreaterThan(0);
    });
});

describe('and of nothing else', () => {
    test.each(NOTHING)('%s', (name, source, operation) => {
        expect(told(source, operation)).toBe(0);
    });

});

describe('and tells, by rule, of a call that changes nothing', () => {
    test.each(TOLD_BY_RULE)('%s', (name, source, operation) => {
        expect(told(source, operation)).toBeGreaterThan(0);
    });
});

describe("an instance's attributes", () => {
    const point = `
class Point:
    def __init__(self):
        self.x = 1
value = Point()
`;

    test.each([
        ['an attribute written', 'value.x = 2'],
        ['an attribute added', 'value.y = 2'],
        ['an attribute deleted', 'del value.x'],
        ['setattr', 'setattr(value, "x", 3)']
    ])('%s tells', (name, operation) => {
        const read = python(`${point}
def run():
    ${operation}
`);
        let count = 0;

        track(read('value'), () => (count += 1));
        $B.$call(read('run'));
        expect(count).toBeGreaterThan(0);
    });

    test.each([
        ['a read of an attribute', 'return value.x'],
        ['an attribute written the value it holds', 'value.x = value.x']
    ])('%s does not', (name, operation) => {
        const read = python(`${point}
def run():
    ${operation}
`);
        let count = 0;

        track(read('value'), () => (count += 1));
        $B.$call(read('run'));
        expect(count).toBe(0);
    });

    // Read where the instance stores it when its class holds no data
    // descriptor under the name, and by Python's lookup otherwise: a property
    // may store the value anywhere, here where no write of the instance's is.
    test.each([
        ['an attribute shadowing its class\'s, written an equal float, does not tell','class Box:\n    x = 0\n    def __init__(self):\n        self.x = 2.5\nvalue = Box()', 'value.x = 5 / 2', false],
        ['a property storing its value elsewhere tells','stored = 1\nclass Box:\n    @property\n    def x(self):\n        return stored\n    @x.setter\n    def x(self, given):\n        global stored\n        stored = given\nvalue = Box()', 'value.x = 2', true]
    ])('%s', (name, source, operation, tells) => {
        const read = python(`${source}
def run():
    ${operation}
`);
        let count = 0;

        track(read('value'), () => (count += 1));
        $B.$call(read('run'));
        expect(count > 0).toBe(tells);
    });
});

describe('a subscription ends', () => {
    test('when the subscriber is handed another value, the first one no longer tells it', () => {
        const read = python(`
first = [1]
second = [2]
def grow(rows):
    rows.append(0)
`);
        let count = 0;
        const bump = () => (count += 1);

        track(read('first'), bump);
        track(read('second'), bump);
        $B.$call(read('grow'), read('first'));
        expect(count).toBe(0);
        $B.$call(read('grow'), read('second'));
        expect(count).toBe(1);
    });

    test('when its owner unsubscribes', () => {
        const read = python(`
rows = [1]
def grow():
    rows.append(0)
`);
        const owner = [];
        let count = 0;

        track(read('rows'), () => (count += 1), owner);
        unsubscribe(owner);
        $B.$call(read('grow'));
        expect(count).toBe(0);
    });

    test('follow hands back the value it is given, a scalar as it is', () => {
        const rows = python('value = [1]')('value');

        expect(follow(rows)).toBe(rows);
        expect(follow(3)).toBe(3);
    });
});

// A name written the value it holds tells nobody, as a Svelte state written a
// value `===` to its own: the same object, or two floats of one number. A
// value the page shows otherwise is a change: `-0.0` over `0.0`, `True` over
// `1`, and a NaN over another, which Svelte's `===` tells too.
test('a write of the value held changes nothing, and one the page shows otherwise does', () => {
    const read = python(`
rows = [1]
half, other_half = 2.5, 5 / 2
negative, zero = -0.0, 0.0
one, true = 1, True
nan, other_nan = float("nan"), float("nan")
`);

    expect(changesNothing(read('rows'), read('rows'))).toBe(true);
    expect(changesNothing(read('half'), read('other_half'))).toBe(true);
    expect(changesNothing(read('negative'), read('zero'))).toBe(false);
    expect(changesNothing(read('one'), read('true'))).toBe(false);
    expect(changesNothing(read('nan'), read('other_nan'))).toBe(false);
});
