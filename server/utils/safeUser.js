function safeUser(user) {
  return {
    id: String(user._id), fullName: user.fullName, email: user.email, phone: user.phone,
    role: user.role, emailVerified: user.emailVerified, status: user.status,
    ...(user.role === 'mechanic' ? {
      employeeId: user.employeeId, specialization: user.specialization, availability: user.availability,
    } : {}),
  };
}
module.exports = safeUser;
