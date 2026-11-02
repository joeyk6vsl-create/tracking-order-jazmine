import {
  PERMISSIONS,
  type Permission,
  type UserView,
} from '../../../../../packages/contracts/src/identity';

export function permissionsFor(user: UserView): Permission[] {
  if (user.status !== 'ACTIVE' || user.mustChangePassword) return [];
  if (user.role === 'ADMIN_PROMAX') return [...PERMISSIONS];
  if (user.department === 'ADMIN')
    return [
      'customers.manage',
      'orders.manage',
      'payments.record',
      'shipments.manage',
      'production.resolve',
    ];
  if (user.department === 'GRAPHIC') return ['production.own', 'graphic.approve'];
  return ['production.own'];
}
export function canWorkDepartment(user: UserView, department: string): boolean {
  return (
    user.status === 'ACTIVE' &&
    !user.mustChangePassword &&
    (user.role === 'ADMIN_PROMAX' || user.department === department)
  );
}
