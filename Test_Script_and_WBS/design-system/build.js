// design-system/build.js
//
// Bundles the Material Web Components (mwc-entry.js) into a single self-
// contained ES module with esbuild, then vendors that bundle + theme.css into
// each app's public/vendor/ directory.
//
// This is a DEV-TIME step only — run `npm run build` here after changing the
// component set or theme. The apps themselves keep their no-build model
// (plain `node server.js` + express.static serving the committed vendor file).

import { build } from "esbuild";
import { copyFile, mkdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const apps = ["sm-apac-landing", "sm-test-script-builder", "sm-wbs-app"];
const distFile = path.join(__dirname, "dist", "material-web.js");

await build({
  entryPoints: [path.join(__dirname, "mwc-entry.js")],
  bundle: true,
  minify: true,
  format: "esm",
  outfile: distFile,
  legalComments: "none",
});
console.log("[design-system] bundled mwc-entry.js -> dist/material-web.js");

for (const app of apps) {
  const vendorDir = path.join(repoRoot, app, "public", "vendor");
  await mkdir(vendorDir, { recursive: true });
  await copyFile(distFile, path.join(vendorDir, "material-web.js"));
  await copyFile(path.join(__dirname, "theme.css"), path.join(vendorDir, "theme.css"));
  console.log(`[design-system] vendored -> ${app}/public/vendor/`);
}
console.log("[design-system] build complete.");
