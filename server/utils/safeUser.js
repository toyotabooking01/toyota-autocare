function safeUser(user) {
  const legacyName = (user.fullName || '').trim().split(/\s+/);
  return {
    id: String(user._id), fullName: user.fullName, email: user.email, phone: user.phone,
    firstName: user.firstName || legacyName[0] || '',
    lastName: user.lastName || legacyName.slice(1).join(' '),
    createdAt: user.createdAt,
    ...(user.role === 'client' ? { address: user.address || '' } : {}),
    role: user.role, emailVerified: user.emailVerified, status: user.status,
    mustChangePassword: Boolean(user.mustChangePassword),
    ...(user.role === 'mechanic' ? {
      employeeId: user.employeeId, specialization: user.specialization, availability: user.availability,
    } : {}),
    ...(user.role === 'staff' ? { staffId: user.staffId || '' } : {}),
  };
}
module.exports = safeUser;
