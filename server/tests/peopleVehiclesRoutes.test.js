const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const app = require('../app');
const { signAccessToken } = require('../services/tokenService');

test('mounted routes enforce Admin-only mechanics and Client-owned vehicle access', async () => {
  const oldSecret = process.env.JWT_SECRET;
  const oldReady = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  const oldFindById = User.findById;
  const oldFind = User.find;
  const oldVehicleFind = Vehicle.find;
  const admin = { _id: new mongoose.Types.ObjectId(), role: 'admin', status: 'active', isArchived: false, emailVerified: true, authVersion: 0 };
  const client = { _id: new mongoose.Types.ObjectId(), role: 'client', status: 'active', isArchived: false, emailVerified: true, authVersion: 0 };
  const mechanic = { _id: new mongoose.Types.ObjectId(), role: 'mechanic', status: 'active', isArchived: false, emailVerified: true, authVersion: 0 };
  const users = new Map([admin, client, mechanic].map(user => [String(user._id), user]));
  process.env.JWT_SECRET = 'test-only-secret-value-with-more-than-thirty-two-bytes';
  Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
  User.findById = raw => ({ select: async () => users.get(String(raw)) });
  User.find = () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) });
  Vehicle.find = filter => ({ sort: () => ({ lean: async () => {
    assert.equal(String(filter.owner), String(client._id));
    return [];
  } }) });
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    async function status(path, user) {
      const response = await fetch(`${origin}${path}`, { headers: { Authorization: `Bearer ${signAccessToken(user)}` } });
      return response.status;
    }
    assert.equal(await status('/api/mechanics', admin), 200);
    assert.equal(await status('/api/mechanics', client), 403);
    assert.equal(await status('/api/mechanics', mechanic), 403);
    assert.equal(await status('/api/vehicles', client), 200);
    assert.equal(await status('/api/vehicles', admin), 403);
    assert.equal(await status('/api/vehicles', mechanic), 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
    User.findById = oldFindById;
    User.find = oldFind;
    Vehicle.find = oldVehicleFind;
    if (oldReady) Object.defineProperty(mongoose.connection, 'readyState', oldReady);
    else delete mongoose.connection.readyState;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});

test('customer directory applies type, status, and search filters before server pagination', async () => {
  const oldSecret = process.env.JWT_SECRET;
  const oldReady = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  const oldFindById = User.findById;
  const oldFind = User.find;
  const oldCountDocuments = User.countDocuments;
  const admin = { _id: new mongoose.Types.ObjectId(), role: 'admin', status: 'active', isArchived: false, emailVerified: true, authVersion: 0 };
  const customer = { _id: new mongoose.Types.ObjectId(), fullName: 'Daniel Client', contactEmail: 'daniel@example.com', phone: '+639171234567',
    status: 'inactive', isArchived: false, isWalkInCustomer: true };
  const assertCustomerFilter = filter => {
    assert.equal(filter.role, 'client');
    assert.equal(filter.isArchived, false);
    assert.equal(filter.isWalkInCustomer, true);
    assert.equal(filter.status, 'inactive');
    assert.ok(filter.$or.some(entry => entry.fullName));
  };
  process.env.JWT_SECRET = 'test-only-secret-value-with-more-than-thirty-two-bytes';
  Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
  User.findById = raw => ({ select: async () => String(raw) === String(admin._id) ? admin : null });
  User.countDocuments = async filter => { assertCustomerFilter(filter); return 1; };
  User.find = filter => {
    assertCustomerFilter(filter);
    const query = { select() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; },
      lean: async () => [customer] };
    return query;
  };
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/people/customers?search=Daniel&customerType=walk_in&status=inactive&page=1&limit=5`, {
      headers: { Authorization: `Bearer ${signAccessToken(admin)}` },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.totalItems, 1);
    assert.equal(body.items[0].fullName, customer.fullName);
    assert.equal(body.items[0].email, customer.contactEmail);
  } finally {
    await new Promise(resolve => server.close(resolve));
    User.findById = oldFindById;
    User.find = oldFind;
    User.countDocuments = oldCountDocuments;
    if (oldReady) Object.defineProperty(mongoose.connection, 'readyState', oldReady);
    else delete mongoose.connection.readyState;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});
