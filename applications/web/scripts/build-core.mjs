import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const simRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cargoBin = join(homedir(), ".cargo", "bin");
const pathSep = process.platform === "win32" ? ";" : ":";
const wasmPackName = process.platform === "win32" ? "wasm-pack.exe" : "wasm-pack";
const rustupName = process.platform === "win32" ? "rustup.exe" : "rustup";
const wasmPack = join(cargoBin, wasmPackName);
const rustup = join(cargoBin, rustupName);

function whichOnPath(name, pathEnv) {
  const exts =
    process.platform === "win32"
      ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";").filter(Boolean)
      : [""];
  for (const dir of (pathEnv || "").split(pathSep)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, name + (name.includes(".") ? "" : ext));
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function findLlvmMingwBin(pathEnv) {
  const clang = whichOnPath("clang", pathEnv);
  if (clang) return dirname(clang);

  const wingetRoot = join(
    process.env.LOCALAPPDATA || "",
    "Microsoft",
    "WinGet",
    "Packages"
  );
  if (!existsSync(wingetRoot)) return null;

  for (const entry of readdirSync(wingetRoot)) {
    if (!entry.startsWith("MartinStorsjo.LLVM-MinGW")) continue;
    const pkg = join(wingetRoot, entry);
    for (const child of readdirSync(pkg)) {
      const bin = join(pkg, child, "bin");
      if (existsSync(join(bin, "clang.exe")) || existsSync(join(bin, "clang"))) {
        return bin;
      }
    }
  }
  return null;
}

if (!existsSync(wasmPack)) {
  console.error(
    "wasm-pack not found. Install with: cargo install wasm-pack\n" +
      `Expected at: ${wasmPack}`
  );
  process.exit(1);
}

const env = { ...process.env };
env.PATH = `${cargoBin}${pathSep}${env.PATH ?? ""}`;

const hasMsvcLinker = Boolean(whichOnPath("link", env.PATH));
if (process.platform === "win32" && !hasMsvcLinker) {
  const llvmBin = findLlvmMingwBin(env.PATH);
  if (llvmBin) {
    env.PATH = `${llvmBin}${pathSep}${env.PATH}`;
  }

  const gnullvm = "stable-x86_64-pc-windows-gnullvm";
  if (existsSync(rustup)) {
    const listed = spawnSync(rustup, ["toolchain", "list"], {
      encoding: "utf8",
      env,
    });
    if ((listed.stdout || "").includes("gnullvm")) {
      env.RUSTUP_TOOLCHAIN = gnullvm;
      console.log(
        `[build:core] MSVC link.exe not found; using ${gnullvm}`
      );
      spawnSync(
        rustup,
        ["target", "add", "wasm32-unknown-unknown", "--toolchain", gnullvm],
        { stdio: "inherit", env }
      );
    } else {
      console.warn(
        "[build:core] MSVC link.exe not found and gnullvm toolchain is missing."
      );
    }
  }
}

const repoRoot = join(simRoot, "..", "..");
const crateDir = join(repoRoot, "core", "rust");
const outDir = join(simRoot, "src", "simcore", "pkg");

const args = [
  "build",
  "--target",
  "web",
  "--out-dir",
  outDir,
  "--out-name",
  "sim_core",
];

const result = spawnSync(wasmPack, args, {
  cwd: crateDir,
  env,
  stdio: "inherit",
  shell: false,
});

process.exit(result.status ?? 1);
