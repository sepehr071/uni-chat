export function canCreateCompany(user) {
  return user?.role === 'admin' || user?.role === 'manager'
}
