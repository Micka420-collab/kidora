// OS-integration dispatch. Everything else in the agent is platform-agnostic;
// this picks the Windows or Linux implementation at load. Both modules only
// DEFINE functions (no side effects on import), so importing the unused one is
// harmless — which keeps this synchronous (no top-level await) and means both
// files must simply be present in every package.
import * as win from "./win.js";
import * as linux from "./linux.js";

const impl = process.platform === "win32" ? win : linux;

export const startSensor = impl.startSensor;
export const killProcess = impl.killProcess;
export const lockWorkstation = impl.lockWorkstation;
export const showOverlay = impl.showOverlay;
export const hideOverlay = impl.hideOverlay;
export const notify = impl.notify;
export const getBattery = impl.getBattery;
export const getForegroundBrowserUrl = impl.getForegroundBrowserUrl;
export const captureScreen = impl.captureScreen;
export const isAdmin = impl.isAdmin;
export const updateHostsFile = impl.updateHostsFile;
export const setSystemDns = impl.setSystemDns;
export const restoreSystemDns = impl.restoreSystemDns;
export const canRedirectDns = impl.canRedirectDns;
