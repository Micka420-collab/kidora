// Background location task — reports the child's position to the server even
// when the app is backgrounded. Registered at startup (imported by app/_layout).
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { childAgent } from "./api";

export const LOCATION_TASK = "kidora-location";

type LocData = { locations?: Location.LocationObject[] };

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const locs = (data as LocData)?.locations;
  const last = locs && locs[locs.length - 1];
  if (!last) return;
  try {
    await childAgent.sync({
      online: true,
      location: {
        lat: last.coords.latitude,
        lng: last.coords.longitude,
        accuracy: last.coords.accuracy ?? undefined,
      },
      events: [{ type: "location", title: "Position (arrière-plan)" }],
    });
  } catch {
    /* offline / not enrolled — ignore, retried on next update */
  }
});

/** Start background location updates (after permissions). Returns true if started. */
export async function startBackgroundLocation(): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") return false;
  // Background permission is best-effort; foreground still works without it.
  await Location.requestBackgroundPermissionsAsync().catch(() => undefined);

  const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
  if (!already) {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5 * 60 * 1000, // 5 min
      distanceInterval: 100, // or every 100 m
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: "Kidora",
        notificationBody: "Protection active",
      },
    });
  }
  return true;
}

export async function stopBackgroundLocation(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
  if (started) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}
