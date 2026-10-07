const { test } = require('node:test');
const assert = require('node:assert/strict');
const { requireDevelopment } = require('../scripts/seed-demo');

test('demo seed refuses production, test, and unset modes', () => {
  const previous = process.env.NODE_ENV;
  try {
    for (const mode of ['production', 'test', undefined]) {
      if (mode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = mode;
      assert.throws(requireDevelopment, /Development mode is required/);
    }
    process.env.NODE_ENV = 'development';
    assert.doesNotThrow(requireDevelopment);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
