import { existsSync, lstatSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const simRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const linkPath = join(simRoot, "src", "simulation");
const target = join(simRoot, "..", "..", "engines", "javascript");

if (existsSync(linkPath)) {
  const stat = lstatSync(linkPath);
  if (stat.isSymbolicLink()) process.exit(0);
  console.error(
    `${linkPath} is a real directory. Move it to engines/javascript before creating the junction.`
  );
  process.exit(1);
}

symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");