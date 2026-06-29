#!/usr/bin/env node
// Build both Kidora APKs via EAS (cloud) and attach them to a GitHub Release.
// Local equivalent of .github/workflows/release-apk.yml — handy on Windows.
//
// Prereqs (one-time):
//   1) npm i -g eas-cli   (or rely on npx, used below)
//   2) eas login          (Expo account)
//   3) eas init           run once per role to create the two EAS projects, OR
//      set EAS_PROJECT_ID_PARENT / EAS_PROJECT_ID_CHILD env vars
//   4) gh auth login      (GitHub CLI, to publish the release)
//
// Usage:
//   node scripts/release-apks.mjs [tag]      e.g. node scripts/release-apks.mjs mobile-v1.0.0
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tag = process.argv[2] || "mobile-v1.0.0";
const run = (cmd, opts = {}) => execSync(cmd, { stdio: ["inherit", "pipe", "inherit"], encoding: "utf8", ...opts });
const sh = (cmd) => execSync(cmd, { stdio: "inherit" });

function buildApk(profile, outName) {
  console.log(`\n▶ EAS build: ${profile} …`);
  const json = run(`npx --yes eas-cli@latest build --platform android --profile ${profile} --non-interactive --wait --json`);
  let parsed;
  try { parsed = JSON.parse(json); } catch { console.error(json); throw new Error(`eas build did not return JSON for ${profile}`); }
  const b = Array.isArray(parsed) ? parsed[0] : parsed;
  const url = b?.artifacts?.applicationArchiveUrl || b?.artifacts?.buildUrl;
  if (!url) throw new Error(`No artifact URL for ${profile}`);
  console.log(`  ↓ downloading ${outName}`);
  // Node 18+ global fetch
  return fetch(url).then(async (r) => {
    if (!r.ok) throw new Error(`download failed ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const out = join(process.cwd(), outName);
    writeFileSync(out, buf);
    console.log(`  ✓ ${outName} (${(buf.length / 1e6).toFixed(1)} MB)`);
    return out;
  });
}

(async () => {
  const parent = await buildApk("parent-apk", "kidora-parents.apk");
  const child = await buildApk("child-apk", "kidora-kids.apk");

  console.log(`\n▶ Publishing to GitHub Release ${tag}`);
  try { sh(`gh release view ${tag}`); }
  catch {
    sh(`gh release create ${tag} --title "Kidora Mobile ${tag}" --notes "Installable Android APKs — Kidora Parents & Kidora Kids. Sideload: enable 'Install unknown apps', then open the .apk."`);
  }
  sh(`gh release upload ${tag} "${parent}" "${child}" --clobber`);
  console.log(`\n✅ Done — APKs attached to release ${tag}`);
})().catch((e) => { console.error("\n❌", e.message); process.exit(1); });
