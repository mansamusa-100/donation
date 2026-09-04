/** Donations that still count toward raised totals, walls, and fees. */
export const ACTIVE_DONATION_WHERE = { reversedAt: null } as const;

export function recentActiveDonationsInclude(take: number) {
  return {
    where: ACTIVE_DONATION_WHERE,
    orderBy: { createdAt: 'desc' as const },
    take
  };
}
