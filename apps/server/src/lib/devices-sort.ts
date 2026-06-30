// Display ordering for a child's devices. Pure & dependency-free so it can be
// unit-tested and reused by any route/page that lists devices.

export type DeviceSortable = {
  online: boolean;
  lastSeen: Date | string | null;
  createdAt: Date | string;
};

const ms = (d: Date | string | null | undefined): number => (d ? new Date(d).getTime() : 0);

/**
 * Order devices the way a parent expects to scan them:
 *  1. online devices first,
 *  2. then most-recently-seen,
 *  3. then oldest-created first (stable tiebreak).
 * Devices never seen (lastSeen null) sort after those that have.
 */
export function sortDevicesByActivity<T extends DeviceSortable>(devices: T[]): T[] {
  return [...devices].sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    const seen = ms(b.lastSeen) - ms(a.lastSeen);
    if (seen !== 0) return seen;
    return ms(a.createdAt) - ms(b.createdAt);
  });
}
