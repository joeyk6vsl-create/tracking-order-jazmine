import { z } from 'zod';

export const ROLES = ['ADMIN_PROMAX', 'STAFF'] as const;
export const DEPARTMENTS = [
  'ADMIN',
  'GRAPHIC',
  'PRINTING',
  'HEAT_TRANSFER',
  'LASER',
  'SIZE_SORTING',
  'SEWING',
  'QC_PACKING',
] as const;
export const STATUSES = ['PENDING', 'ACTIVE', 'DISABLED'] as const;
export type Role = (typeof ROLES)[number];
export type Department = (typeof DEPARTMENTS)[number];
export type UserStatus = (typeof STATUSES)[number];
export interface UserView {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  department: Department;
  status: UserStatus;
  rowVersion: string;
  mustChangePassword: boolean;
  createdAt: string;
}
export const PERMISSIONS = [
  'users.manage',
  'customers.manage',
  'orders.manage',
  'payments.record',
  'payments.refund',
  'shipments.manage',
  'production.resolve',
  'production.own',
  'graphic.approve',
  'reports.view',
  'rates.manage',
  'costs.manage',
  'archive.manage',
  'backups.manage',
  'payment-qr.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const passwordSchema = z.string().min(12, 'รหัสผ่านอย่างน้อย 12 ตัวอักษร').max(128);
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,40}$/, 'ชื่อผู้ใช้ 3–40 ตัว ใช้อักษรอังกฤษ ตัวเลข จุด ขีด และขีดล่าง');
export const loginSchema = z
  .object({ username: usernameSchema, password: z.string().min(1).max(128) })
  .strict();
export const setupSchema = z
  .object({
    username: usernameSchema,
    displayName: z.string().trim().min(1).max(100),
    password: passwordSchema,
  })
  .strict();
export const createUserSchema = setupSchema.extend({
  role: z.enum(ROLES),
  department: z.enum(DEPARTMENTS),
});
export const updateUserSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100),
    role: z.enum(ROLES),
    department: z.enum(DEPARTMENTS),
    status: z.enum(STATUSES),
    rowVersion: z.string().regex(/^\d+$/),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export const resetPasswordSchema = z
  .object({
    temporaryPassword: passwordSchema,
    rowVersion: z.string().regex(/^\d+$/),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema })
  .strict();
export interface SessionView {
  recoveryMode?: boolean;
  user: UserView | null;
  permissions: Permission[];
  csrfToken: string;
  bootstrapRequired: boolean;
}
