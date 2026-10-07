const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../models/User');
const app = require('../app');
const engagement = require('../services/engagementService');
const { signAccessToken } = require('../services/tokenService');

test('Client notification actions are owner-scoped; Admin reminders are read-only', async () => {
  const oldSecret = process.env.JWT_SECRET;
  const oldReady = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState');
  const oldUser = User.findById;
  const oldFunctions = Object.fromEntries(['notifications', 'unreadCount', 'markRead', 'markAllRead', 'reminders']
    .map(key => [key, engagement[key]]));
  const users = ['client', 'admin', 'mechanic'].map(role => ({ _id: new mongoose.Types.ObjectId(), role,
    status: 'active', isArchived: false, emailVerified: true, authVersion: 0 }));
  const byId = new Map(users.map(user => [String(user._id), user]));
  const recordId = String(new mongoose.Types.ObjectId());
  let requestedFor; let readFor; let remindersFor;
  process.env.JWT_SECRET = 'test-only-secret-value-with-more-than-thirty-two-bytes';
  Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });
  User.findById = value => ({ select: async () => byId.get(String(value)) });
  engagement.notifications = async userId => { requestedFor = userId; return []; };
  engagement.unreadCount = async userId => { requestedFor = userId; return 0; };
  engagement.markRead = async (userId, rawId) => { readFor = userId; return { _id: rawId, isRead: true }; };
  engagement.markAllRead = async userId => { readFor = userId; return { updated: 0 }; };
  engagement.reminders = async userId => { remindersFor = userId; return []; };
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    async function request(path, user, method = 'GET') {
      return fetch(`${origin}${path}`, { method, headers: { Authorization: `Bearer ${signAccessToken(user)}` } });
    }
    assert.equal((await request('/api/notifications', users[0])).status, 200);
    assert.equal(String(requestedFor), String(users[0]._id));
    assert.equal((await request('/api/notifications/unread-count', users[0])).status, 200);
    assert.equal((await request(`/api/notifications/${recordId}/read`, users[0], 'PATCH')).status, 200);
    assert.equal(String(readFor), String(users[0]._id));
    assert.equal((await request('/api/notifications/read-all', users[0], 'PATCH')).status, 200);
    assert.equal((await request('/api/notifications', users[1])).status, 403);
    assert.equal((await request('/api/notifications', users[2])).status, 403);
    assert.equal((await request('/api/maintenance-reminders', users[0])).status, 200);
    assert.equal(String(remindersFor), String(users[0]._id));
    assert.equal((await request('/api/maintenance-reminders', users[1])).status, 200);
    assert.equal(remindersFor, undefined);
    assert.equal((await request('/api/maintenance-reminders', users[2])).status, 403);
    assert.equal((await request('/api/maintenance-reminders', users[1], 'POST')).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    User.findById = oldUser;
    for (const [key, value] of Object.entries(oldFunctions)) engagement[key] = value;
    if (oldReady) Object.defineProperty(mongoose.connection, 'readyState', oldReady);
    else delete mongoose.connection.readyState;
    if (oldSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = oldSecret;
  }
});
