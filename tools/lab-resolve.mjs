// Node resolves engines/javascript to its real path, so its ../../util imports miss
// applications/web/src. Rewrite those as the browser does through the simulation junction.
import { isBuiltin } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const coreRoot = path.resolve("engines/javascript");
const simRoot = path.resolve("applications/web/src/simulation");

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith(".") || !context.parentURL || isBuiltin(specifier)) {
    return nextResolve(specifier, context);
  }
  const parentPath = fileURLToPath(context.parentURL);
  const relToCore = path.relative(coreRoot, parentPath);
  if (relToCore.startsWith("..") || path.isAbsolute(relToCore)) {
    return nextResolve(specifier, context);
  }
  const asSim = path.join(simRoot, relToCore);
  const target = path.resolve(path.dirname(asSim), specifier);
  if (fs.existsSync(target)) {
    return { url: pathToFileURL(target).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
