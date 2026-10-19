// A host for the tests, the least a reactive framework answers Bryntime
// (`host`): reactions that run a function, join each subscription it calls,
// and are run again by `flush` once one of them is told. A reaction may be
// rendering, where telling a subscription is refused, as Svelte refuses a
// write to its state while it renders (`state_unsafe_mutation`).
import { host } from '../src/bryntime.js';

let current = null;
const dirty = new Set();

export function reaction(fn, { rendering = false } = {}) {
    const self = {
        runs: 0,
        value: undefined,
        rendering,
        leaves: [],
        run() {
            for (const leave of self.leaves.splice(0)) leave();
            const outer = current;
            current = self;
            try {
                self.value = fn();
            } finally {
                current = outer;
                self.runs += 1;
            }
            return self;
        },
        stop() {
            for (const leave of self.leaves.splice(0)) leave();
            dirty.delete(self);
        }
    };

    return self.run();
}

// The reactions told since the last flush, each run again once.
export function flush() {
    const due = [...dirty];

    dirty.clear();
    for (const one of due) one.run();

    return due.length;
}

host.reacting = () => current !== null;
host.refuses = () => current?.rendering === true;
host.untrack = (fn) => {
    const outer = current;
    current = null;
    try {
        return fn();
    } finally {
        current = outer;
    }
};
host.subscriber = (start) => {
    const joined = new Set();
    let stop;

    return () => {
        const self = current;

        if (self === null || joined.has(self)) return;

        joined.add(self);
        if (joined.size === 1) {
            stop = start(() => {
                if (current?.rendering) throw new Error('state_unsafe_mutation');
                joined.forEach((one) => dirty.add(one));
            });
        }

        self.leaves.push(() => {
            joined.delete(self);
            if (joined.size === 0) {
                stop?.();
                stop = undefined;
            }
        });
    };
};
