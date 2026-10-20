// A page with no framework: the state is a Python module's, the DOM
// JavaScript's, and Bryntime crosses between them. Served as it is, from the
// repository's root (`python3 -m http.server`), at /demo/.
import { bind, withNamespace, viewOf, track, plainData, pyExport } from '../src/bryntime.js';
// The engine's other half, which compiles the Python below in the page. A
// site compiles ahead of time and ships without it.
import 'bryvend/compiler';

const SOURCE = `
class Todo:
    def __init__(self, title):
        if not title.strip():
            raise ValueError("a task needs a title")
        self.title = title.strip()
        self.done = False
        self.tags = set()


todos = [Todo("Keep the state in Python"), Todo("Render it from JavaScript")]
todos[0].done = True
todos[0].tags.add("star")
show = "all"


def add(title):
    todos.append(Todo(title))


def only(kind):
    global show
    show = kind


def clear_done():
    for index in reversed(range(len(todos))):
        if todos[index].done:
            del todos[index]


def clear_all():
    global todos
    todos = []


def remaining():
    return sum(1 for todo in todos if not todo.done)
`;

// One render for any number of changes made together.
let due = false;
const schedule = () => {
    if (due) return;
    due = true;
    queueMicrotask(() => {
        due = false;
        render();
    });
};

// What a framework does for a module, by hand: each global it renders is a
// cell the namespace reads and writes through an accessor (`bind`). Rebinding
// the name, `todos = []`, writes the cell; a change inside what it holds,
// `todos.append(…)` or a write from JavaScript, is told by `track`.
const cells = {};
const proto = Object.create(null);

for (const name of ['todos', 'show']) {
    const changed = () => schedule();

    bind(
        proto,
        name,
        () => cells[name],
        (value) => {
            cells[name] = value;
            track(value, changed);
            schedule();
        },
        () => cells[name]
    );
}

const module = Object.create(proto);

module.$proxy = true;
module.__name__ = 'todos';

const $B = globalThis.__BRYTHON__;

// The module's body, run in that namespace rather than in one of Brython's.
withNamespace('todos', module, () => (0, eval)($B.python_to_js(SOURCE, 'todos')));

// Python functions JavaScript calls, their arguments and results crossing.
const [add, only, clearDone, clearAll, remaining] = ['add', 'only', 'clear_done', 'clear_all', 'remaining'].map((name) =>
    pyExport(module[name])
);

function render() {
    // The Python list read as an Array, each task as an object and its tags as
    // a Set: live, not copied.
    const list = viewOf(cells.todos);
    const items = list.map((todo, index) => {
        const item = document.createElement('li');
        const box = document.createElement('input');
        const star = document.createElement('button');
        const remove = document.createElement('button');

        item.hidden = cells.show !== 'all' && todo.done !== (cells.show === 'done');
        box.type = 'checkbox';
        box.checked = todo.done;
        // Written into the Python instance, as `todo.done = …` would.
        box.onchange = () => (todo.done = box.checked);
        star.textContent = todo.tags.has('star') ? '★' : '☆';
        // Into the Python set, as `todo.tags.add(…)` and `discard(…)`.
        star.onclick = () => (todo.tags.has('star') ? todo.tags.delete('star') : todo.tags.add('star'));
        remove.textContent = '×';
        // Out of the Python list, as `del todos[index]`.
        remove.onclick = () => list.splice(index, 1);
        item.append(box, star, ` ${todo.title} `, remove);
        return item;
    });

    document.querySelector('#todos').replaceChildren(...items);
    document.querySelector('#left').textContent = remaining();
    document.querySelector('#json').textContent = JSON.stringify(
        plainData(cells.todos),
        (key, value) => (value instanceof Set ? [...value] : value),
        2
    );
}

render();

// The module, shown as written, coloured by the tokenizer of Python the
// engine carries: no highlighting library, and no drift from the grammar.
const escape = (text) => text.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
const KEYWORDS = new Set('False None True and as class def del for global if in is not raise return self'.split(' '));
const BUILTINS = new Set('len range reversed set str sum ValueError'.split(' '));

function coloured(code) {
    const starts = [];
    let offset = 0;
    for (const line of code.split('\n')) {
        starts.push(offset);
        offset += line.length + 1;
    }

    let html = '';
    let cursor = 0;
    let previous = null;

    try {
        for (const token of $B.tokenizer(`${code}\n`, '<demo>', 'file')) {
            if (token.type === 0 || token.type === 68) continue;

            const from = starts[token.lineno - 1] + token.col_offset;
            const to = Math.min(starts[token.end_lineno - 1] + token.end_col_offset, code.length);
            if (from >= code.length) break;
            if (from < cursor) continue;

            const text = code.slice(from, to);
            const cls =
                token.type === 3
                    ? 'str'
                    : token.type === 2
                      ? 'num'
                      : token.type !== 1
                        ? null
                        : KEYWORDS.has(text)
                          ? 'kw'
                          : previous === 'def' || previous === 'class'
                            ? 'fn'
                            : BUILTINS.has(text)
                              ? 'bi'
                              : null;

            html += escape(code.slice(cursor, from)) + (cls ? `<span class="${cls}">${escape(text)}</span>` : escape(text));
            cursor = to;
            if (token.string.trim()) previous = token.string;
        }
    } catch {
        return escape(code);
    }

    return html + escape(code.slice(cursor));
}

document.querySelector('#python').innerHTML = coloured(SOURCE.trim());

for (const button of document.querySelectorAll('[data-show]')) {
    button.onclick = () => only(button.dataset.show);
}

document.querySelector('#clear-done').onclick = () => clearDone();
document.querySelector('#clear-all').onclick = () => clearAll();

document.querySelector('#add').onsubmit = (event) => {
    event.preventDefault();

    const error = document.querySelector('#error');

    try {
        add(event.target.elements.task.value);
        error.textContent = '';
        event.target.reset();
    } catch (raised) {
        // What Python raised, with its message.
        error.textContent = raised.message;
    }
};
