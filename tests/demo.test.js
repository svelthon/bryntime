// The demo, run as its page runs it: the page's body, its module, then a
// reader's moves, each kind of crossing the page shows once. Held here so
// that the example the README points at cannot drift from the API it shows.
import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Under jsdom a module's URL is the page's, so the page is read from the
// repository's root, where the suite runs.
const page = readFileSync('demo/index.html', 'utf8');

// The render a change schedules runs in a microtask.
const settled = () => new Promise((resolve) => setTimeout(resolve));

const shown = () => ({
    todos: [...document.querySelectorAll('#todos li')].map((li) => [
        li.querySelector('input').checked,
        li.textContent.trim(),
        li.hidden
    ]),
    left: document.querySelector('#left').textContent,
    error: document.querySelector('#error').textContent,
    json: JSON.parse(document.querySelector('#json').textContent)
});

const click = (selector, at = 0) => document.querySelectorAll(selector)[at].click();

test('the demo shows every crossing of Bryntime on one list', async () => {
    document.body.innerHTML = page.match(/<body>([\s\S]*)<\/body>/)[1];
    await import('../demo/main.js');

    // Python's instances read as objects, a set as a Set.
    expect(shown()).toMatchObject({
        todos: [
            [true, '★ Keep the state in Python ×', false],
            [false, '☆ Render it from JavaScript ×', false]
        ],
        left: '1',
        json: [
            { title: 'Keep the state in Python', done: true, tags: ['star'] },
            { title: 'Render it from JavaScript', done: false, tags: [] }
        ]
    });

    // A box ticked: an attribute written into the instance.
    const box = document.querySelectorAll('#todos input')[1];

    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await settled();
    expect(shown().left).toBe('0');
    expect(shown().json[1].done).toBe(true);

    // A star: a member added into the Python set.
    click('#todos li button', 2);
    await settled();
    expect(shown().json[1].tags).toEqual(['star']);

    // A task added by Python, and one Python refuses, its message shown.
    const form = document.querySelector('#add');

    form.elements.task.value = 'Ship it';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settled();
    expect(shown().todos.at(-1)).toEqual([false, '☆ Ship it ×', false]);

    form.elements.task.value = '   ';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settled();
    expect(shown().error).toMatch(/ValueError: a task needs a title/);
    expect(shown().todos).toHaveLength(3);

    // A global Python rebinds, read by the render.
    click('[data-show="todo"]');
    await settled();
    expect(shown().todos.map(([, , hidden]) => hidden)).toEqual([true, true, false]);
    click('[data-show="all"]');
    await settled();

    // A task removed from JavaScript, by the list's view.
    click('#todos li button', 1);
    await settled();
    expect(shown().json.map((todo) => todo.title)).toEqual(['Render it from JavaScript', 'Ship it']);

    // `del todos[i]` in Python, then `todos = []`: the list rebound, and the
    // new one followed in its turn.
    click('#clear-done');
    await settled();
    expect(shown().json.map((todo) => todo.title)).toEqual(['Ship it']);

    click('#clear-all');
    await settled();
    expect(shown().todos).toEqual([]);

    form.elements.task.value = 'Start again';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await settled();
    expect(shown().json.map((todo) => todo.title)).toEqual(['Start again']);
    expect(shown().left).toBe('1');
});
