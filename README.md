# Bryntime

**The Brython runtime for JavaScript frameworks.**

Brython runs Python in the browser. Bryntime is what a JavaScript framework,
or a page with none, needs on top of it to use Python's values as its own: to
read them, to write them, to call them, and to know when they change.

Install it from [npm](https://www.npmjs.com/package/bryntime):

```sh
npm install bryntime
```

```js
import { viewOf, track, pyExport } from 'bryntime';

const list = viewOf(todos); // a Python list of dicts, read as an Array of objects
list[1].done = true; // written into the Python dict, as `todos[1]["done"] = True`
track(todos, render); // told of every change, Python's `todos.append(…)` included
const add = pyExport(addTodo); // a Python function JavaScript calls
```

## What it does

Python and JavaScript do not see a value the same way. A dict, a set and an
instance are Brython objects to JavaScript, `None` is an object rather than
`undefined`, and a mutation made in Python, `rows.append(x)`, `d["k"] = v`,
`point.x += 1`, happens inside the engine, where no framework sees it.
Bryntime closes each gap:

- **Live views** (`viewOf`): a list read as an `Array`, a dict and an
  instance as objects, a set as a `Set`. Reads are live, and JavaScript's
  writes are Python's writes.
- **Change tracking** (`track`, `follow`): a subscriber is told of every
  change Python makes to a value or to anything inside it, whichever
  operation makes it, and of nothing else: a read, a copy, or a write of the
  value already held tells nobody, as a framework's own state does.
- **Copies under one rule** (`plainData`, `pyData`): `None` is JavaScript's
  `undefined` at every door and `null` in JSON alone, `javascript.NULL` is
  `null`, and two keys JavaScript cannot tell apart are refused, not merged.
- **Calls** (`pyExport`): a Python function JavaScript calls, and JavaScript
  functions Python calls, their arguments and results crossing both ways.
- **Errors** (`pyError`, `refused`): what Python raises reaches JavaScript
  with its message and its stack, and what Bryntime refuses is signed with the
  framework's name.
- **Modules** (`bind`, `withNamespace`): a Python module whose globals are a
  framework's states, each name an accessor over one of them, with
  `globals()`, `del` and `import` behaving as Python's.

## A framework's side

A framework imports one entry, `bryntime`, and answers through `host` what
only it knows: whether one of its states owns a value (`owns`), how it makes
an object its state (`adopt`), its name (`name`), whether a reaction is
running (`reacting`), whether a write would be refused (`refuses`), a
subscription (`subscriber`), a read that follows nothing (`untrack`), and
whether an unbound name read at a line is an absence (`absent`). With no host
at all, every read is taken for a reaction's and nothing is refused, which is
what a page with no framework wants.

```js
import { host } from 'bryntime';
```

A compiler loads Brython's other half onto the same engine:

```js
import 'bryntime';
import 'bryntime/compiler';
```

## Demo

`demo/` is a page with no framework and a to-do list held by a Python module:
the tasks instances of a class, their tags a set, the filter a global.
JavaScript renders them, ticks a box, stars a task and removes one by writing
into Python's own values; Python adds a task, refuses an empty title with a
`ValueError` the page shows, deletes the done ones and rebinds `todos = []`;
and the page is told of each change, whichever side made it.

It is online at <https://svelthon.github.io/bryntime/>, deployed from `main`
once the tests pass. Locally, it is served as it is, from the repository's
root:

```sh
python3 -m http.server
```

then `http://localhost:8000/demo/`. The suite runs the same page, so the demo
cannot drift from the API it shows.

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
