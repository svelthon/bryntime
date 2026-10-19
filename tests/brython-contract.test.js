// @vitest-environment node
//
// Almost nothing Bryntime touches in the engine is public API, so `BRYTHON.md`
// is the contract: it names each member, says what is read off it and why, and
// a Brython release can be checked against it. That only works if it is
// complete: a contract that is 88 % complete is a contract that will be
// trusted 100 %.
//
// Read off the modules themselves, so a member cannot arrive unnoticed. A
// member reached by its name in a string, as the wrappers of `shapeDoors` are,
// is not seen here, and the contract names those by hand.
import { test, expect, describe } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

const at = (path) => new URL(`../${path}`, import.meta.url);
const contract = readFileSync(at('BRYTHON.md'), 'utf8');

// `$B.x` and `__BRYTHON__.x` are the same object under two names, and both are
// written in these files.
const REACHED = /(?:\$B|__BRYTHON__)\.([A-Za-z_$][A-Za-z0-9_$]*)/g;

// Marks Bryntime hangs on the engine. They are its own to name and to change,
// so they are not part of the contract.
const OURS = /^\$bryntime/;

const used = new Set();

for (const name of readdirSync(at('src')).filter((one) => one.endsWith('.js'))) {
    for (const [, member] of readFileSync(at(`src/${name}`), 'utf8').matchAll(REACHED)) {
        if (!OURS.test(member)) used.add(member);
    }
}

describe('BRYTHON.md names every member the code reaches for', () => {
    test('there are members to check at all', () => {
        // A regex that stopped matching would otherwise make this file pass by
        // finding nothing.
        expect(used.size).toBeGreaterThanOrEqual(60);
    });

    test.for([...used].sort().map((member) => [member]))('%s', ([member]) => {
        expect(contract).toContain(member);
    });
});
