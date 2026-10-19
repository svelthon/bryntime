# Bryntime

Python and JavaScript reading each other's values in a page, on Brython's
engine: what crosses and how, the tracking of the Python values a reaction
reads, the calls between the two languages, the live views of Python
containers, the errors, and the Python modules a page runs.

A framework imports one file, `bryntime.js`, and answers through `host` what
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

## License

Bryntime is licensed under the BSD 3-Clause License, Brython's own: see the
`LICENSE` file. The engine in `vendor/` is Brython, its copyright notice kept
in `vendor/LICENSE`, with the patches `vendor/BRYTHON_FIX.md` lists.
