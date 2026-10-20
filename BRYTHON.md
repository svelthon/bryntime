# What Bryntime asks of Brython

Bryntime runs Python on Brython's engine and lets JavaScript and Python read
each other's values. Almost none of what it touches is a public API: it is the
shape of Brython's internals. This file is the contract, so that a Brython change
can be checked against it, and so that whoever reads `src/` knows which
assumptions are load-bearing.

Verified against the vendored engine, Bryvend, `$B.version_info == [3, 14, 0]`.
What it carries on top of Brython's master is in Bryvend's `BRYTHON_FIX.md`.

## The single point everything rests on

```js
locals_Counter = $B.namespace('Counter')
locals_Counter.count = 0
```

Brython keeps a module's state in a **namespace object**, never in lexical
bindings, since Python semantics require it, for `globals()`, `exec`, and dynamic name
resolution. Bryntime replaces that object with one whose every property is an
accessor onto a state of the host's, a Svelte signal for one, and every
assignment the code generator already emits becomes a reactive write.

The substitution happens at run time, by swapping `$B.namespace` for the duration
of the module body (`withNamespace`), and only for the requested name, since an
import during initialisation creates its own namespace through the same
function.

**If this shape changed, a module would stop being reactive entirely.**

## Internals used

The engine comes started, from Bryvend, which runs Brython outside the classic
`<script>` it was written for, in a page or under Node.

### Namespaces and name resolution

| | |
|---|---|
| `$B.namespace(name)` | intercepted; the whole design hangs here |
| `$B.$import_from(module, names, aliases, level, locals)` | what `from m import …` compiles to; intercepted beside `$B.namespace` while a reactive module runs, so the names a `from m import *` writes onto the namespace, which no statement lists, get the accessor every other name has |
| `$B.$__import__(name, globals, locals, fromlist)` | where `import m`, `from m import …` and `__import__("m")` all look `m` up in `$B.imported`; wrapped, so the body of a project module imported by name runs at that statement and not when its code is evaluated |
| `ns.$proxy = true` | makes `resolve_in_namespace` read the property normally instead of demanding an *own* property, the only place in Brython that consults this flag, and what lets accessors live on the prototype |
| `$B.resolve_global(name, ns)` | not called, and the reason `$proxy` exists: it is the function that would demand an own property. It is here because it is the member whose disappearance would stop the whole namespace trick, and the one nobody would think to grep for |
| `$B.delete_for_reassign(name, ns)` | emitted before rebinding a global; its `delete` is why accessors must be inherited, never own |
| `$B.$delete(name, locals, inum)` | what a real `del name` compiles to, `locals` being the namespace or `'global'`, the frame's globals then being `$B.frame_obj.frame[3]`; distinct from `$B.delete_for_reassign`, which precedes a rebinding. Wrapped so that deleting a name `bind` publishes makes it absent: its accessor answers `undefined`, which a `$proxy` namespace reads as no name, until the next write puts it back |
| `$B.$is_member(item, container)` | what `in` compiles to; `"name" in namespace` may pass the namespace itself as `container`. Wrapped so that a deleted name is not in it |
| `$B.builtins.globals`, `$B.builtins.locals` | what `globals()` and `locals()` call, `frame[3]` and `frame[1]` of the running frame. Wrapped so that for a namespace of ours both answer the same dict, a view of the namespace, as a module's `globals()` is its own dict |
| `$B.resolve_in_scopes(name, namespaces, inum)` | the search of a name through namespaces then the builtins, `NameError` if none holds it; a read of a module global falls back on it when the namespace no longer holds the name, proposed upstream and vendored (see Bryvend's `BRYTHON_FIX.md`). Wrapped so that where the host says a read is an absence (`host.absent`), a name the module declares and has not bound reads as None |
| `$B.parse_kwargs(carrier, fname)` | the engine's reading of a call's keywords, explicit ones then each `**` mapping through `keys()` and `__getitem__`, a key given twice refused; `parseKeywords` reads them through it, as a Python function does |
| `$B.KW` | the symbol a call's keyword arguments travel under, as a trailing `{[$B.KW]: [named, ...unpacked]}`; carried as a commit proposed upstream. `keywordsOf` and the JavaScript call adapter read it to tell keywords from an argument, which no Python dict or JavaScript object can pass for |
| `$B.frame_obj` | read by `$B.$import`, null until a module body runs |
| `$B.leave_frame()` | called in the success path handed to `browser.aio.run` |

### Objects

| | |
|---|---|
| `$B.$getattr(obj, name)` | Python attribute protocol |
| `$B.get_class(obj)` | class of a Python object. **It probes the object's symbols**, so it must never be called on a foreign proxy that records reads |
| `$B.builtins` | `str.$factory`, `bool.$factory`, `dict.$factory`, `set.$factory`, `list.$factory`, `repr`, `None`, `type` |
| `$B.coroutine` | compared against `get_class` to spot a coroutine without calling `aio.iscoroutine` |
| `$B.$call(callable, ...args)` | calls anything Python calls, a class object included, which is how a class handed to JavaScript is constructed |
| `$B.pyobj2jsobj_hook(value, memo)` | an extension point `pyobj2jsobj` asks first, proposed upstream and vendored (see Bryvend's `BRYTHON_FIX.md`), which Bryntime sets so every Python callable the engine hands to JavaScript crosses as `pyHandler` publishes it, and every Python list, tuple or dict as a named import's arguments cross. `memo` is the one the engine keeps for the call, so a value passed twice is one object |
| `$B.hasOnlyStringKeys(dict)` | whether a dict holds string keys only, all of them ordinary properties, read off its table's absence: a dict view looks a non-string key up by its name only when the dict holds one, so a read of a missing property on an ordinary dict costs no walk of its entries |
| `$B.get_dict(obj)` | an object's attribute dict, the one `vars(obj)` hands back, or `undefined` for a value that has none, read off a slot with no Python code run: what `**` takes of an instance (`starredEntries`), and how it knows a value with neither entries nor attributes, to refuse it |
| `$B.empty_dict()` | a new empty Python dict: the one the dict a module's `globals()` hands back stands on, and the one a dict's symbols are found on |
| `$B.RAISE(cls, message)` | raises a Python exception of that class, with that message: `pyRaise`, which a host calls to raise Python's own error, and the refusals of `**` and of a dict changed during a walk |
| `$B.fast_tuple(array)` | makes the array itself a Python tuple, without copying it: the pairs of a module's `globals()` walked backwards, whose value is read only when asked for |
| `dict.$iter_items(d)`, `dict.$iter_items_reversed(d)` | how Brython walks a dict, forwards and backwards, each item with its value read. Replaced for the dict `globals()` hands back, whose values may be derived and run by being read: there the value is read only when asked for, and a key added or removed meanwhile still ends the walk |
| `$B.jsobj2pyobj(value)` | every value coming back from a JavaScript call, so the most-used inbound function there is and the one whose shape changing upstream would be felt first |
| `$B.PYOBJ_MAP` | the WeakMap holding a converted container's back-reference to the Python object it came from, so the original is handed back rather than a copy. Read with `?.`, which is why a rename upstream would be silent and why a test names it |
| `$B.is_dict(obj)` | whether a value is a Python dict, answered from a flag on the object rather than by probing its symbols, which is what `get_class` would do. `isDict` answers it, and so is a mapping told from every other Python object, all of which are objects here too |
| a dict's `VERSION` and `KEYS` symbols (`py_dict.js`), found by their description | `VERSION` moves at each insertion and deletion of a key; `KEYS` is the array a dict holding a key that is not a string keeps its keys in, in the order they entered: a deletion leaves a hole, an insertion goes at the end, `clear` drops the array. A dict view takes its table of names again when `VERSION` moves, and names a key by its place, so a key that left and came back is named again |
| a set's `$store` | its members in buckets by hash, keyed by the hash. A set view's walk reads the members there and asks a member's bucket whether it is still in; where it stands says nothing of its history, since a member put back may land where it was and `intersection_update` builds new buckets for the members it keeps, so a departure is learnt from the call that made it |
| `$B.is_list(obj)`, `$B.is_tuple(obj)` | the same question for a list and a tuple, subclasses included. Brython builds other objects on an array too, a frame among them, so being an array does not make a value a sequence |
| `$B.dict_keys`, `$B.dict_values`, `$B.dict_items` | the classes of a dict's three live views, `{ob_type, dict_obj}`: a view holds no entry of its own, only the dict it reads under `dict_obj`, so watching a view watches that dict |
| `$B.dict_itemiterator`, `_b_.enumerate`, `_b_.zip` and their `tp_iternext` | the iterators that make a pair at each step, in `tp_iternext`, a generator which `make_next` reads anew at each `__next__`. Replaced while `notingPairs` computes, so the pairs they make are known wherever the expression hands them on, `sorted(d.items())` |
| `$B.mappingproxy` | the read-only view a dict view hands out as `.mapping`, `{ob_type, mapping}`: live like the others, so watching it watches `mapping` when that is a dict |
| `_b_.memoryview` | a buffer's view, `{ob_type, obj, …}`: it reads the buffer it keeps under `obj`, a `bytearray` changed directly or through another view, so watching a view watches `obj`, as a dict's view watches its dict |
| `$B.OB_TYPE` | the symbol under which a dict, and every subclass of one, keeps its class: it has no `ob_type` property, so a protocol looked up on the class of a value reads both places; and where a module's namespace keeps `$B.module`, read before its `ob_type` field, which may be a name of the module's own |
| `$B.method_wrapper` | the class of a **special method read off a builtin**: `rows.__setitem__` kept in a name is one of these, an object rather than a function, so a wrapper that follows mutators has to recognise it by class and call it with `$B.$call` |
| `$B.method_descriptor` | the class of a **method read off a type**: `list.append` kept in a name. Also an object, and the one whose target is the caller's first argument rather than a receiver it carries |
| `$B.wrapper_descriptor` | the class of a **slot read off a type**, a "slot wrapper": `object.__setattr__` kept in a name. Its target is the caller's first argument too |
| `$B.member_descriptor` | the class of a **`__slots__` member**. Its `__set__` and `__delete__` are built once from `tp_descr_set` and write the instance's storage without `$setattr`, so Bryntime rebuilds the two, with `$B.wrapper_descriptor.$factory`, around a setter that notifies |
| `$B.set_to_dict(cls, name, value)` | writes a name into a builtin class's dictionary, which is how the two methods above are put back |
| `descriptor.sm_callable` | the function inside a `staticmethod`, which is what a class dictionary holds for one. A `@staticmethod def __call__` is found by the lookup above as this object, and reading it as though it were the function made an instance that Python calls perfectly well cross as something JavaScript cannot call. It also says the arity is the whole signature: a static call carries no receiver to leave out |
| `$B.method` | the class of a **bound method**, `{ob_type: method, im_func, im_self}` built fresh on every read (`descriptors.js`, `tp_new`). `typeof` calls it an object, so the boundary that decides what to adapt asks for this class instead: *callable in Python* is wider than *is a JavaScript function* |
| `$B.search_in_dict(cls, name, absent)` | a name looked up in **one** class dictionary, rather than through the attribute protocol, so nothing of the author's runs. It stops at the class it is given: the bases are the caller's to walk, and Brython's own `super.__getattribute__` does exactly that, asking once per class of `tp_mro`. This line used to say *and its bases*, and two boundaries were written against the sentence rather than against the function — an instance whose `__call__` came from a base class was callable from nowhere, and a subclass inheriting `__slots__` without redeclaring them crossed with its fields gone |
| `$B.NULL` | Brython's *absent*, which is not `None`: what `search_in_dict` gives back when the name is nowhere in that class |
| a `str`'s storage | a JavaScript string; a `String` object carrying `ob_type` and `surrogates`, which `$B.String` makes of one holding a character past U+FFFF; or a subclass instance's `$brython_value`, one of the first two. `pyScalar` hands JavaScript the string itself whichever it is: `"🌍"` used to cross every boundary as an object, and JSON refused it |
| `cls.tp_mro` | a class's method resolution order, starting at the class itself: `[cls, ...bases, object]`. What a lookup walks when it means *declared here or above*, and what says a subclass of `set` is a set |
| `cls.noargs_methods` | the methods of a builtin type that take nothing but their receiver, as CPython flags them `METH_NOARGS`, proposed upstream and vendored (`noargs-method-arity`, see Bryvend's `BRYTHON_FIX.md`). Read for a builtin bound to its receiver, `rows.clear`, which then crosses to JavaScript as a callback handed nothing, as a `def` without parameters is |
| `f.ml.ml_name`, `f.m_self` | a builtin bound to its receiver, `rows.clear` or `"hello".upper`: the method's name and the receiver, which `method_descriptor.tp_descr_get` puts on the function it hands out |
| `f.__text_signature__` | the text signature a builtin carries, `($self, /, *, key=None, reverse=False)` for `list.sort`, copied onto the bound method by `tp_descr_get`, proposed upstream and vendored (`list-sort-keyword-only`). One with no positional parameter makes the bound method a callback handed nothing, as `noargs_methods` does |
| `$B.class_name(obj)` | the name Python prints for a value's class, `range` or `complex`, which is what a refusal has to say when it has nothing else: the serialiser's message names the class of the value rather than accusing the value of being one |
| `$B.search_in_mro(cls, name, absent)` | what the dictionaries along a class's MRO hold under a name, read without running the metaclass's `__getattribute__`. It is how `obj[k]` finds `__getitem__`, and `lookup` asks it the same way whether a value has keys to read |
| `$B.search_slot(cls, slot, absent)` | one of the engine's own slots looked up through a class's MRO, `tp_iternext` being the one read here. It is how `iter()` itself decides whether something is an **iterator** rather than merely iterable, which is the difference between an argument that still holds what it was given and one that has handed it all over |
| `$B.unpacker(value, targets, starred, after)` | what `first, *others, last = row` compiles to: the row walked once, `read_one()` for each name and `read_rest()`, a list, for the starred one, and Python's errors for a row too short or not iterable. `unpackStarred` unpacks a pattern that holds a star, `[first, *others]`, by it, so a pattern and the script unpack alike |
| `$B.make_js_iterator(value, frame)` | a Python iterable walked as a JavaScript one. It runs `iter()`, which is the only call that **validates** the protocol — an `__iter__` returning a plain list is a `TypeError`, and `list()` never notices because its argument is iterable either way. It also keeps the storage fast path where it is still true: Brython copies that path onto a subclass only when the subclass leaves `__iter__` alone, so this is one call for both halves of the question. `$B.NULL` as the frame is the engine's own spelling for *called from JavaScript*, and without it a line number is written into whatever frame happens to be current |
| `$B.JSObj` | the class the engine gives a JavaScript object it holds, whose hash is its identity through a slot of its own. A set's view, walking, asks such a member's hash for its bucket, which runs nothing of an author's |
| `$B.function` | the class of a **Python function**, which keeps its attributes in a dictionary as an instance does. The watch reaches a function of this class, `counter.count += 1` repainting what reads it; a function of JavaScript's is `$B.JSFunction` to the engine and is not watched |
| `$B.TPFLAGS` | the class flags, `HEAPTYPE` among them, CPython's heap type, which the engine sets on a class written by a `class` statement and on none of its own. The watch reaches a class so flagged, `Counter.total += 1` repainting what reads it, and no class of the engine's |
| `$B.$hash(value)` | Python's `hash()`. A key's text names a JavaScript symbol by it: the engine gives each symbol a hash of its own, held weakly where the engine takes a symbol as a weak key, so two symbols made with one description are two keys |
| `$B.hash_for(value, role)` | Python's `hash()` as a set's lookup asks it, its role named in the error it raises. A set's view looks up the member JavaScript deletes as the engine's lookup does (`set_lookkey`), that hash and then each member filed under it in `$store`, and takes out the member it finds as the engine's `discard` does (`set_remove`, then `$version`): its answer is the lookup's, decided where the member is found |
| `$B.check_nb_args_no_kw(name, expected, args)` | the engine's refusal of a call with the wrong number of arguments or with a keyword, the one its `locals()` makes. The adapter that gives a module's `locals()` as its dict calls it first, so `locals(1)` and `locals(x=1)` raise at the top of a module as in a function |
| `$B.is_or_equals(a, b)` | Python's test for one member of a set: the same object, or equal. A set's view asks it when a member is held anew by another object, the other set's float that `intersection_update` kept, to tell that member stayed |
| `$B.$list(array)` | a JavaScript array made into a Python list in place. `list.$factory` is the road for anything else, but it copies the storage of **any** array-shaped argument, subclass included, so it answers the question of what iterating a subclass means with the question |
| `$B.keyword_is_empty(kw)` | whether a call's keywords carry any name at all. `f(x, **{})` is not a keyword call, and a Python program writes one whenever the mapping it spreads happens to be empty |

### Dispatch points, for reactivity

Every mutation a Python program makes goes through one of these, which is what
lets an in-place mutation become reactive without proxying anything. An object
that carries no marker pays one property miss.

| | |
|---|---|
| `$B.call_attr(obj, name, nargs, ...)` | every method call written on the object |
| `$B.$getattr(obj, name)` | a method taken off the object and called later, `add = xs.append`. `$B.$getattr_pep657` delegates here and so does the builtin `getattr`, so this one covers all three and they must not be wrapped as well |
| `$B.augm_assign(left, op, right)` | `row += [1]`, `d \|= other`; every operator with an `=` after it. They mutate and rebind the name to the same object, so a watched container changes without a watched name being written. A *different* object back is a rebinding, which the accessor already answers for |
| `$B.$setitem(obj, key, value)` / `$B.$delitem` | `d[k] = v`, `del d[k]` |
| `$B.$getitem(obj, key)` | every indexed read, the hottest of them |
| `$B.$setattr(obj, name, value)` / `$B.$setattr1` | attribute writes; Brython emits one or the other depending on the statement, and both have to be covered |
| `$B.$delattr(obj, name)` | `del obj.attr` |
| `$B.$raise(exc, cause)` / `$B.set_exc(exc, frame)` | `raise`, which writes the exception's `__cause__` and `__context__` before throwing it, and the catch, which writes its `__traceback__`: an exception changed in place with no method called |

And every read a reaction makes of a value's shape goes through one of these,
which `shapeDoors` wraps by name while a reaction that follows shapes runs:
`$B.$getattr`, `$B.$getattr_pep657`, `$B.$getitem`, `$B.getitem_slice`,
`$B.$is_member`, `$B.unpacker`, `$B.make_js_iterator`, `$B.$bool`,
`list.$unpack`, `str.$factory`, `repr`, `ascii`, `format`, `$B.pattern_match`,
`$B.pyobj2jsobj`, `$B.rich_comp`, `$B.rich_op`, `$B.call_attr` and `$B.$call`.

A container reached out of a watched one is watched too, and that is settled on
the way **in** rather than on the way out: marking a container walks what is
already inside it, and the mutators above hand the watch to what arrives
afterwards. Covering the entrances is what leaves reading alone, so Brython's own
iteration, `reversed()` and `list()` need no hook at all.

The walk is bounded to what Python calls a container, an array or a dict by
`$B.get_class`. Walking any object's keys let it leave the author's data: it
reached `__BRYTHON__` itself, 558 keys, and from there `localStorage`, which is a
`Storage` and turns every value it is given into a string, so the marker came
back as its own source text.

Wrap them with rest arguments, `function (a, b, ...rest)`, and never with
`arguments` + `apply`: these are the hottest functions Brython has, and the old
form blocks V8's optimiser enough to be visible on a page load.

An instance's attributes live under a **private symbol** (`Symbol('DICT')`, not
`Symbol.for`), and Brython publishes it as **`$B.DICT`** (`py_type.js`). Reading
it there rather than discovering it from an object is not a convenience: a
discovery has to start somewhere, and the object it starts from decides what the
runtime can see afterwards. Skipping arrays during that discovery — a plain list
carries no such dictionary — meant a **list subclass**, which is an array *and*
carries one, could never teach it, so its attributes went unwatched whenever it
was the first such object seen. A dict's keys, by contrast, are ordinary
enumerable JavaScript properties.

### Modules

| | |
|---|---|
| `$B.imported[name]` | module registry; `registerModule` publishes a module's namespace here so Python can `import` it |
| `$B.imported['browser.html']` | consulted to pick a DOM node's Python class from its tagName; registered by the engine itself, but only by its browser half |
| `$B.isNode` | `typeof process !== 'undefined' && process.release.name === 'node'`, decided at load. It picks which half of the engine is installed: the browser half is the one that defines `browser.html`, `browser.window` and the DOM wrappers |
| `browser.aio` | `run(coro, onsuccess, onerror)`, `iscoroutine`, `sleep` |

## Representation choices Bryntime relies on

These are what make the Python/JavaScript boundary usable at all, and each one
had to be discovered by measurement.

**Transparent to JavaScript.** A `list` *is* a JS `Array`; a `tuple` too. A `str`
is a JS string, an `int` a number (or `BigInt` beyond 2⁵³), a `bool` a boolean. A
`dict`'s string keys are exposed as JS properties. This is why a framework's
loop iterates a Python list natively and why a spread of a dict spreads.

**Opaque to JavaScript.** An instance's attributes are **not** JS properties, and
neither is a class's `__name__`: both need `$B.$getattr`. An exception carries
no `message` and no `stack`, but does carry `__traceback__`, `lineno` and `args`.
`None` is an object, so `String(None)` gives `[object Object]` unless a
`toString` is added.

**Never wrap a Brython value in a JS Proxy.** A proxied object fails Brython's own
type checks: `repr((1, 2))` raises *descriptor `__repr__` requires a 'tuple'
object but received a 'tuple'*. This is why a host holds Python values raw,
Svelte's `$state.raw` rather than a `$state` proxy, and a module publishes them
through accessors.

## Rough edges worth smoothing

Not bugs, but each cost real debugging time because the failure gave no clue.

**`$B.$import` before any module body has run** dies with
`Cannot read properties of null (reading 'frame')`: it reads `$B.frame_obj`,
which is null at that point. It brings the whole runtime down. A guarded error
naming the cause would save the next person an hour.

**Wrapping a DOM node while `browser.html` is unregistered** dies with
`Cannot read properties of undefined (reading 'Symbol(DICT)')`, from
`$B.module_getattr($B.imported['browser.html'], obj.tagName)`. The message points
nowhere near the cause, which is that the engine installed its Node half rather
than its browser one, see `$B.isNode` above.

**A `type` mismatch message can contradict itself.** A proxied tuple produces
*requires a 'tuple' object but received a 'tuple'*: accurate about the class
name, useless about the identity check that actually failed. Mentioning that the
two classes differ would make it diagnosable.
