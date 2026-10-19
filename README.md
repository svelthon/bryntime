# Bryntime

**The Brython runtime for JavaScript frameworks.**

Python and JavaScript reading each other's values in a page, on Brython's
engine: what crosses and how, the tracking of the Python values a reaction
reads, the calls between the two languages, the live views of Python
containers, the errors, and the Python modules a page runs.

A framework imports one entry, `bryntime`, and answers through `host` what
only it knows: whether one of its states owns a value (`owns`), how it makes
an object its state (`adopt`), its name (`name`), whether a reaction is
running (`reacting`), whether a write would be refused (`refuses`), a
subscription (`subscriber`), a read that follows nothing (`untrack`), and
whether an unbound name read at a line is an absence (`absent`).

```js
import { host } from 'bryntime';
```

A compiler loads Brython's other half onto the same engine:

```js
import 'bryntime';
require('bryntime/compiler');
```

## The engine

Bryntime runs on Brython's engine, in `vendor/`, built from Brython's master
and the repairs proposed there and not merged yet, one commit each. It carries
**four** edits made in the file itself, each held by a test: a guard against a
second execution in one process, `/* @vite-ignore */` on the two dynamic
imports, CPython's order for an int formatted with a base prefix, and the
binding of a `__call__` that is not a function. `vendor/BRYTHON_FIX.md` lists
them all. They live in the file rather than in a build step, because Node loads
the same copy, for a compiler and for a server's rendering, so a patch applied
only while serving would leave both on an unrepaired engine.

A page loads `vendor/brython_runtime.js`, the half without the parsing chain:
**224 KB** gzipped. The full bundle it is cut from is 275 KB and never ships; a
compiler adds the other half through `bryntime/compiler`.

What Bryntime asks of the engine, member by member, is in `BRYTHON.md`.

## License

Bryntime is licensed under the BSD 3-Clause License, the same license as
Brython.
