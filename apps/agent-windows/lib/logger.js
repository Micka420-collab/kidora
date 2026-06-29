// Minimal timestamped logger.
const COLORS = { info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m", ok: "\x1b[32m", dim: "\x1b[90m" };
const RESET = "\x1b[0m";

function stamp() {
  return new Date().toLocaleTimeString("fr-FR");
}

export const log = {
  info: (...a) => console.log(`${COLORS.dim}${stamp()}${RESET} ${COLORS.info}ℹ${RESET}`, ...a),
  ok: (...a) => console.log(`${COLORS.dim}${stamp()}${RESET} ${COLORS.ok}✓${RESET}`, ...a),
  warn: (...a) => console.log(`${COLORS.dim}${stamp()}${RESET} ${COLORS.warn}⚠${RESET}`, ...a),
  error: (...a) => console.log(`${COLORS.dim}${stamp()}${RESET} ${COLORS.error}✗${RESET}`, ...a),
  event: (...a) => console.log(`${COLORS.dim}${stamp()}${RESET} ${COLORS.dim}·${RESET}`, ...a),
};
