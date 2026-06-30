// Helper for deciding which Command rows to create for a remote action.
//
// A "broadcast" command (no deviceId — e.g. lock / locate / screenshot / message
// from the dashboard or mobile app) used to be stored as a single null-device
// row. The sync endpoint marks it `delivered` as soon as ANY device picks it up,
// so for a child with several enrolled devices the action only ever reached one
// of them. We instead fan a broadcast out into one row per enrolled device, so
// every device receives and acts on it.

export type CommandRow = { childId: string; deviceId: string | null; type: string; payload: string };

export function buildCommandRows(input: {
  childId: string;
  type: string;
  payload: string;
  deviceId?: string | null;
  deviceIds: string[]; // ids of the child's currently-enrolled devices
}): CommandRow[] {
  const { childId, type, payload } = input;

  // Targeted at a specific device → exactly that one.
  if (input.deviceId) return [{ childId, deviceId: input.deviceId, type, payload }];

  // Broadcast with no devices enrolled yet → keep one unassigned row so it
  // delivers to whichever device enrolls/syncs first.
  if (input.deviceIds.length === 0) return [{ childId, deviceId: null, type, payload }];

  // Broadcast → one row per enrolled device.
  return input.deviceIds.map((deviceId) => ({ childId, deviceId, type, payload }));
}
