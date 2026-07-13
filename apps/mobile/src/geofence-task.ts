// Native OS geofencing for the child device. The OS wakes the app the instant a
// safe-zone boundary is crossed — far more responsive and battery-efficient than
// the 5-min background location poll. On a crossing we (1) push an immediate
// location ping so the SERVER computes the enter/exit transition and alerts the
// parent right away (reusing its hysteresis logic — this is not a second source
// of truth), and (2) show the child a local notification.
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { childAgent, type DeviceGeofence } from "./api";
import { notifyLocal } from "./notify";

export const GEOFENCE_TASK = "kidora-geofence";

// The region identifier carries "id::name" so the headless task (a separate JS
// context with no shared memory) can label the notification without a lookup.
const SEP = "::";
function encodeId(g: DeviceGeofence): string {
  return `${g.id}${SEP}${g.name.replace(/\r?\n/g, " ")}`;
}
function decodeId(identifier: string | undefined): { id: string; name: string } {
  const raw = identifier ?? "";
  const i = raw.indexOf(SEP);
  return i === -1 ? { id: raw, name: "une zone" } : { id: raw.slice(0, i), name: raw.slice(i + SEP.length) };
}

type GeofenceData = { eventType?: Location.GeofencingEventType; region?: Location.LocationRegion };

TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
  if (error) return;
  const { eventType, region } = (data as GeofenceData) ?? {};
  if (eventType == null || !region) return;
  const entered = eventType === Location.GeofencingEventType.Enter;
  const { name } = decodeId(region.identifier);

  // Report our position now so the server fires the transition promptly. Use the
  // region centre as a fallback if a fresh fix isn't available immediately.
  let coords: { lat: number; lng: number; accuracy?: number };
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? undefined };
  } catch {
    coords = { lat: region.latitude, lng: region.longitude };
  }

  try {
    await childAgent.sync({
      online: true,
      deliverCommands: false, // headless: don't consume parent commands (foreground sync does)
      location: coords,
      events: [{ type: "location", title: entered ? `Arrivée à « ${name} »` : `Départ de « ${name} »` }],
    });
  } catch {
    /* offline → the next foreground/background sync ping still yields the transition */
  }

  await notifyLocal(
    entered ? "Zone de sécurité" : "Zone quittée",
    entered ? `Tu es bien arrivé·e à « ${name} ».` : `Tu as quitté « ${name} ».`,
  );
});

/** Register (or refresh) the child's OS geofences. Restarts geofencing only when
 *  the set actually changed, and stops it when there are none. Best-effort. */
export async function syncGeofences(geofences: DeviceGeofence[] | undefined): Promise<void> {
  try {
    const list = (geofences ?? []).filter((g) => Number.isFinite(g.lat) && Number.isFinite(g.lng));
    const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);

    if (list.length === 0) {
      if (started) await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => undefined);
      return;
    }
    // Background location is required for geofencing to fire when the app is away.
    const bg = await Location.getBackgroundPermissionsAsync().catch(() => null);
    if (bg && bg.status !== "granted") {
      await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
    }
    const regions: Location.LocationRegion[] = list.map((g) => ({
      identifier: encodeId(g),
      latitude: g.lat,
      longitude: g.lng,
      radius: g.radius > 0 ? g.radius : 150, // metres
      notifyOnEnter: true,
      notifyOnExit: true,
    }));
    // startGeofencingAsync replaces the previous region set for this task.
    await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
  } catch {
    /* geofencing unavailable (Expo Go / no permission) → ignore, poll still runs */
  }
}

export async function stopGeofencing(): Promise<void> {
  const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
  if (started) await Location.stopGeofencingAsync(GEOFENCE_TASK).catch(() => undefined);
}
