// The first object of its kind that Bryntime ever watches.
//
// The instance dictionary was found by *discovery*: scan an object's symbols
// once, keep the one called `DICT`, and skip arrays so a plain list does not
// pay for the scan. A list subclass is an array **and** carries that
// dictionary, so it could never teach the symbol, and if it was the first such
// object watched, the symbol was never learned and its attributes were never
// walked: the watch depended on the order things were watched in. Brython
// publishes the symbol as `$B.DICT`, so there is nothing to discover.
//
// This file is deliberately alone: a test sharing a file with an ordinary
// instance would have the symbol taught to it by that neighbour. The mutation
// goes through an alias kept in a closure, so `box.rows` is never read again:
// the handover `$getattr` does at read time cannot cover it, and the initial
// walk, through the storage `adopt` takes, is the only route left.
import { test, expect } from 'vitest';
import { track } from '../src/bryntime.js';
import { python } from './python.js';

test('a list subclass is watched even when nothing taught Bryntime its shape', () => {
    const read = python(`
class Box(list):
    def __init__(self, rows):
        self.rows = rows

def make():
    rows = []
    box = Box(rows)

    def change():
        rows.append(1)

    return box, change

box, change = make()
`);
    let told = 0;

    track(read('box'), () => (told += 1));
    globalThis.__BRYTHON__.$call(read('change'));

    expect(told).toBe(1);
});
