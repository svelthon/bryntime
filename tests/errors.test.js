// What Python raises, as JavaScript reads it (`errors.js`): an exception of the
// author's told from a conversion that could not be made, its message and its
// stack filled in and placed at its line, a refusal completed with where it was
// asked, and an ordinary `Error` handed to whatever runs past the last frame.
import { test, expect, describe } from 'vitest';
import { raised, pyError, thrown, relayed, refusal, refused } from '../src/bryntime.js';
import { python, runPython } from './python.js';

// The exception a call raises, as JavaScript catches it.
const caught = (call) => {
    try {
        call();
    } catch (error) {
        return error;
    }
    throw new Error('nothing raised');
};

runPython(
    `
def deeper():
    raise KeyError("inside")
`,
    'errors_other'
);

const read = python(`
import errors_other

def fails():
    raise ValueError("bad value")

def calls_other():
    return errors_other.deeper()
`);

describe('raised', () => {
    test('is true of what Python raised, and of nothing else', () => {
        expect(raised(caught(() => read('fails')()))).toBe(true);
        expect(raised(new Error('js'))).toBe(false);
        expect(raised({ message: 'like one' })).toBe(false);
        expect(raised(null)).toBe(false);
        expect(raised('text')).toBe(false);
    });
});

describe('pyError', () => {
    test("describes the exception by its class and its text, at the line of the file it was raised in", () => {
        const error = pyError(caught(() => read('fails')()), 'module.fails');

        expect(error.message).toMatch(/^ValueError: bad value \(module\.fails:\d+\)$/);
        expect(error.stack.startsWith(error.message)).toBe(true);
        expect(raised(error)).toBe(true);
    });

    test('names the deeper frame of another file where it actually broke', () => {
        const error = pyError(caught(() => read('calls_other')()), 'module.calls_other');

        expect(error.message).toMatch(/^KeyError: 'inside' \(module\.calls_other:\d+; raised in deeper\(\), .*:\d+\)$/);
    });

    test('hands back the same object, which a Python except still catches', () => {
        const original = caught(() => read('fails')());

        expect(pyError(original, 'once')).toBe(original);
        expect(pyError(original, 'twice').message).toBe(original.message);
    });

    test('leaves a JavaScript error and a value that is no exception untouched', () => {
        const js = new Error('from JavaScript');

        expect(pyError(js, 'here')).toBe(js);
        expect(js.message).toBe('from JavaScript');
        expect(pyError(null, 'here')).toBe(null);
        expect(pyError('text', 'here')).toBe('text');
    });

    test('completes a refusal with where it was asked, once', () => {
        const error = refusal('this cannot cross');

        expect(refused(error)).toBe(true);
        expect(refused(new Error('this cannot cross'))).toBe(false);
        expect(pyError(error, 'page.label').message).toMatch(/this cannot cross \(page\.label\)$/);
        expect(pyError(error, 'again').message).toMatch(/this cannot cross \(page\.label\)$/);
    });
});

describe('thrown', () => {
    test('hands over an ordinary Error, keeping nothing of the Python object', () => {
        const error = thrown(pyError(caught(() => read('fails')()), 'module.fails'));

        expect(error).toBeInstanceOf(Error);
        expect(error.message).toMatch(/^ValueError: bad value/);
        expect(Object.getOwnPropertyNames(error).sort()).toEqual(['message', 'stack']);
        expect(structuredClone(error).message).toBe(error.message);
    });

    test('passes an Error and a value that is no object as they are', () => {
        const js = new Error('js');

        expect(thrown(js)).toBe(js);
        expect(thrown('text')).toBe('text');
        expect(thrown(null)).toBe(null);
    });
});

describe('relayed', () => {
    test("a view's trap relays what Python raises under it, its message filled in, and a JavaScript error as it is", () => {
        const js = new Error('js');
        const handler = relayed(
            {
                get: () => read('fails')(),
                set: () => {
                    throw js;
                }
            },
            'view of rows'
        );
        const view = new Proxy({}, handler);

        expect(caught(() => view.anything).message).toMatch(/^ValueError: bad value \(view of rows/);
        expect(caught(() => (view.anything = 1))).toBe(js);
    });
});
