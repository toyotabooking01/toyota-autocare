function identity(actor, fallbackRole = 'staff') {
  return { id: actor?._id || actor, role: actor?.role || fallbackRole };
}

function audit(actor, action, fallbackRole = 'staff') {
  const { id, role } = identity(actor, fallbackRole);
  return { action, performedBy: id, performedByRole: role, performedAt: new Date() };
}

module.exports = { identity, audit };
