const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

// Isolated worker process: production-like configuration without real secrets.
Object.assign(process.env, {
  VERCEL: '1', NODE_ENV: 'production', CLIENT_ORIGIN: 'https://frontend.example.invalid',
  MONGO_URI: 'mongodb://127.0.0.1/test-only-not-connected',
  JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  OTP_HASH_SECRET: crypto.randomBytes(32).toString('hex'), JWT_EXPIRES_IN: '1h', OTP_EXPIRY_MINUTES: '5',
});

test('direct Vercel Express entry waits for MongoDB; login and dependency status semantics', async t => {
  let ready = 0;
  const descriptor = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, get: () => ready });
  t.after(() => {
    if (descriptor) Object.defineProperty(mongoose.connection, 'readyState', descriptor);
    else delete mongoose.connection.readyState;
  });
  let connects = 0;
  let fail = false;
  let queries = 0;
  t.mock.method(mongoose, 'connect', async uri => {
    assert.equal(uri, process.env.MONGO_URI);
    connects += 1;
    await new Promise(resolve => setImmediate(resolve));
    if (fail) throw new Error('private connection details');
    ready = 1;
  });
  const User = require('../models/User');
  const password = 'Production-like test password 42!';
  const user = new User({ fullName: 'Test Mechanic', email: 'mechanic@example.invalid', role: 'mechanic',
    employeeId: 'TEST-MECH', password: await bcrypt.hash(password, 4), emailVerified: true, status: 'active' });
  t.mock.method(User, 'findOne', filter => {
    assert.equal(ready, 1, 'no query before connection');
    queries += 1;
    return { select: async () => filter.email === user.email ? user : null };
  });
  // Import app.js directly, exactly the entrypoint that bypassed index.js.
  const app = require('../app');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = (body = { email: user.email, password }) => fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await fetch(base)).status, 200);
  assert.equal(connects, 0, 'health is liveness only');
  assert.equal((await fetch(`${base}/api/auth/login`, { method: 'OPTIONS', headers: {
    Origin: process.env.CLIENT_ORIGIN, 'Access-Control-Request-Method': 'POST',
  } })).status, 204);
  assert.equal(connects, 0, 'preflight does not need database');

  const responses = await Promise.all([login(), login()]);
  assert.equal(connects, 1, 'concurrent cold requests share initialization');
  for (const response of responses) {
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(require('../services/tokenService').verifyAccessToken(body.accessToken).role, 'mechanic');
    assert.equal(body.user.password, undefined);
  }
  assert.equal((await login({ email: user.email, password: 'wrong' })).status, 401);
  assert.equal((await login({ email: 'missing@example.invalid', password })).status, 401);
  assert.equal((await login({ email: 'invalid', password })).status, 400);
  user.status = 'inactive';
  assert.equal((await login()).status, 403);
  user.status = 'active';
  user.isArchived = true;
  assert.equal((await login()).status, 403);
  user.isArchived = false;

  const secret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'short';
  const before = queries;
  assert.equal((await login()).status, 503);
  assert.equal(queries, before);
  process.env.JWT_SECRET = secret;
  const otp = process.env.OTP_HASH_SECRET;
  delete process.env.OTP_HASH_SECRET;
  assert.equal((await login()).status, 503, 'production initialization validates OTP config too');
  process.env.OTP_HASH_SECRET = otp;

  ready = 0;
  fail = true;
  const unavailable = await login();
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { message: 'Authentication is temporarily unavailable.' });
  fail = false;
  assert.equal((await login()).status, 200, 'failed connections can retry');
  assert.equal(connects, 3, 'reconnect after disconnect and retry after failure');
});
