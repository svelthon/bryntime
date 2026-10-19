// Reactions over Python values, on the least host a framework is
// (`tests/host.js`): a reaction that follows a value runs again when Python
// changes it or anything under it, and only then; a class's name read runs it
// again when the class's attribute is written; a reaction stops listening when
// it stops; and the rows a computation shapes follow what it read of them.
import { test, expect, describe } from 'vitest';
import { follow, track, shaped, trackOwns, host } from '../src/bryntime.js';
import { reaction, flush } from './host.js';
import { python } from './python.js';

const $B = globalThis.__BRYTHON__;
const call = (fn, ...args) => $B.$call(fn, ...args);

describe('a reaction following a value', () => {
    test('runs again when Python changes it or what it holds, and not when Python reads it', () => {
        const read = python(`
rows = [[1], [2]]
def total():
    return sum(len(row) for row in rows)
def grow():
    rows[0].append(9)
def look():
    return rows[1][0]
`);
        track(read('rows'), () => {});
        const seen = reaction(() => {
            follow(read('rows'));
            return call(read('total'));
        });

        expect([seen.value, seen.runs]).toEqual([2, 1]);
        call(read('look'));
        expect(flush()).toBe(0);
        call(read('grow'));
        expect(flush()).toBe(1);
        expect([seen.value, seen.runs]).toEqual([3, 2]);
        seen.stop();
    });

    test('stops being told once it stops', () => {
        const read = python(`
rows = [1]
def grow():
    rows.append(2)
`);
        track(read('rows'), () => {});
        const seen = reaction(() => follow(read('rows')));

        seen.stop();
        call(read('grow'));
        expect(flush()).toBe(0);
    });
});

describe("a class's name", () => {
    test('read in a reaction runs it again when the class writes it, on the class or through an instance', () => {
        const read = python(`
class Box:
    limit = 0
    def __init__(self, n):
        self.n = n
box = Box(1)
def through_class():
    return Box.limit
def through_instance():
    return box.limit
def raise_limit():
    Box.limit = 3
`);
        const onClass = reaction(() => call(read('through_class')));
        const onInstance = reaction(() => call(read('through_instance')));

        call(read('raise_limit'));
        expect(flush()).toBe(2);
        expect([onClass.value, onInstance.value]).toEqual([3, 3]);
        onClass.stop();
        onInstance.stop();
    });

    test("a builtin class's names follow nothing, since nothing can write them", () => {
        const read = python(`
def read_builtin():
    return str.upper("a") + int.__name__
`);
        const seen = reaction(() => call(read('read_builtin')));

        expect(seen.value).toBe('Aint');
        expect(flush()).toBe(0);
        seen.stop();
    });
});

describe('a write while a reaction renders', () => {
    test('is refused by the framework it tells, and the value keeps what it held', () => {
        const read = python(`
rows = [1]
def grow():
    rows.append(2)
`);
        track(read('rows'), () => {});
        reaction(() => follow(read('rows')));

        let refused = null;
        const seen = reaction(
            () => {
                try {
                    call(read('grow'));
                } catch (error) {
                    refused = error;
                }
            },
            { rendering: true }
        );

        expect(refused).not.toBe(null);
        expect($B.builtins.repr(read('rows'))).toBe('[1]');
        seen.stop();
    });

    test('is let through when it changes nothing, as an intersection_update keeping every member', () => {
        const read = python(`
tags = {1, 2}
def keep_all():
    tags.intersection_update({1, 2, 3})
def keep_one():
    tags.intersection_update({1})
`);
        track(read('tags'), () => {});
        reaction(() => follow(read('tags')));

        const outcome = [];
        const seen = reaction(
            () => {
                for (const name of ['keep_all', 'keep_one']) {
                    try {
                        call(read(name));
                        outcome.push(`${name} passed`);
                    } catch {
                        outcome.push(`${name} refused`);
                    }
                }
            },
            { rendering: true }
        );

        expect(outcome).toEqual(['keep_all passed', 'keep_one refused']);
        expect($B.builtins.repr(read('tags'))).toBe('{1, 2}');
        seen.stop();
    });
});

describe('rows a computation shapes', () => {
    test('are computed again when what the computation read changes, and not on a change it did not read', () => {
        const read = python(`
rows = [{"n": 2, "tags": []}, {"n": 1, "tags": []}]
def computed():
    return sorted(rows, key=lambda row: row["n"])
def retag():
    rows[0]["tags"].append("x")
def renumber():
    rows[0]["n"] = 0
def add():
    rows.append({"n": 5, "tags": []})
`);
        track(read('rows'), () => {});

        // As a host's block does: one subscriber for every row the computation
        // read the own changes of (`trackOwns`), joined in the same reaction.
        let owns = new Set();
        let told;
        const bump = () => told?.();
        const join = host.subscriber((update) => {
            told = update;
            return () => {
                told = undefined;
            };
        });
        const seen = reaction(() =>
            shaped(
                () => call(read('computed')),
                (markers) => {
                    join();
                    owns = trackOwns(markers, bump, owns);
                }
            )
        );

        call(read('retag'));
        expect(flush()).toBe(0);
        call(read('renumber'));
        expect(flush()).toBe(1);
        call(read('add'));
        expect(flush()).toBe(1);
        expect(seen.runs).toBe(3);
        seen.stop();
    });
});
