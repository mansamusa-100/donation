/** Canonical email form for storage and lookups. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
