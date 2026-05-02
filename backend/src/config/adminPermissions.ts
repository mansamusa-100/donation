/** Each admin dashboard area; empty array in DB = full access (legacy and default for primary admins). */
export const ADMIN_PANEL_KEYS = [
  'overview',
  'queue',
  'campaigns',
  'withdrawals',
  'users',
  'admins',
  'audit'
] as const;

export type AdminPanelKey = (typeof ADMIN_PANEL_KEYS)[number];

const KEY_SET = new Set<string>(ADMIN_PANEL_KEYS);

export function isValidAdminPanelKey(s: string): s is AdminPanelKey {
  return KEY_SET.has(s);
}

/**
 * - Non-admin: no access.
 * - Admin with `stored.length === 0` (default): all areas (full).
 * - Admin with non-empty list: only those keys.
 */
export function hasAdminPanelAccess(
  role: 'ADMIN' | 'USER',
  stored: string[] | null | undefined,
  key: AdminPanelKey
): boolean {
  if (role !== 'ADMIN') {
    return false;
  }
  if (!stored || stored.length === 0) {
    return true;
  }
  return stored.includes(key);
}

export function canManageAdmins(role: 'ADMIN' | 'USER', stored: string[] | null | undefined): boolean {
  return hasAdminPanelAccess(role, stored, 'admins');
}

export function assertCanAssignPermissions(input: string[]): void {
  if (input.length === 0) {
    return;
  }
  for (const s of input) {
    if (!isValidAdminPanelKey(s)) {
      throw new Error(`Invalid admin permission: ${s}`);
    }
  }
}

/** Full access (empty list) or at least one of the keys. */
export function hasAnyAdminPanelAccess(
  role: 'ADMIN' | 'USER',
  stored: string[] | null | undefined,
  keys: AdminPanelKey[]
): boolean {
  if (role !== 'ADMIN') {
    return false;
  }
  if (!stored || stored.length === 0) {
    return true;
  }
  return keys.some((k) => stored.includes(k));
}
