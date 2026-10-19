import { basename } from 'node:path';

// A Python module a test imports: its source, run on the package's engine
// (`tests/python.js`), and each of its names exported: those its `__all__`
// lists, or else every public name it binds. A name bound in a block of the
// module counts, so every `def`, `class` and assignment is a candidate, and one
// the module does not hold once run is exported as undefined.
const publicNames = (code) => {
    const listed = code.match(/^__all__\s*=\s*\[([^\]]*)\]/m);

    if (listed) return [...listed[1].matchAll(/["'](\w+)["']/g)].map((m) => m[1]);

    const bound = [...code.matchAll(/^\s*(?:async\s+def|def|class)\s+(\w+)|^\s*(\w+)\s*(?::[^=\n]*)?=(?!=)/gm)].map((m) => m[1] ?? m[2]);

    return [...new Set(bound)].filter((name) => !name.startsWith('_'));
};

const pythonModules = {
    name: 'python-modules',
    enforce: 'pre',
    transform(code, id) {
        if (!id.endsWith('.py')) return null;

        const names = publicNames(code);
        const helper = new URL('./tests/python.js', import.meta.url).pathname;

        // Bound under names of the loader's own, so that a Python name may be
        // anything, `read` or a word JavaScript reserves.
        return [
            `import { pythonModule } from ${JSON.stringify(helper)};`,
            `const $read = pythonModule(${JSON.stringify(code)}, ${JSON.stringify(basename(id, '.py'))});`,
            ...names.map((name, at) => `const $${at} = $read(${JSON.stringify(name)}); export { $${at} as ${name} };`)
        ].join('\n');
    }
};

export default { plugins: [pythonModules] };
