const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { generatedModules } = require('../scripts/generate-validation-cjs');

test('CommonJS validation modules match their browser-safe sources', () => {
  for (const { file, content } of generatedModules()) {
    assert.equal(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), content,
      `Regenerate ${file} with node server/scripts/generate-validation-cjs.js`);
    assert.ok(Object.keys(require(file)).length);
  }
});

test('server runtime does not synchronously require ESM files', () => {
  function inspect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', 'tests', 'scripts', '.git'].includes(entry.name)) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) inspect(file);
      else if (/\.(?:js|cjs)$/.test(file)) {
        assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\brequire\s*\(\s*['"][^'"]+\.mjs['"]\s*\)/,
          `CommonJS runtime file requires ESM: ${file}`);
      }
    }
  }
  inspect(path.resolve(__dirname, '..'));
});
