const mongoose = require('mongoose');

function getHealth(req, res) {
  res.json({
    message: 'Toyota AutoCare API is running',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
}

module.exports = { getHealth };
