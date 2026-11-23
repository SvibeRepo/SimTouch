/** Filename slug for a preset name. See the preset store design. */
export function slugPresetName(name) {
  const trimmed = String(name).trim().toLowerCase();
  const slugged = trimmed
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slugged || "preset";
}

/** First claim of a slug keeps it. Later claims get -2, -3, ... */
export function uniquePresetFilename(name, used) {
  const base = slugPresetName(name);
  let filename = `${base}.json`;
  let n = 2;
  while (used.has(filename)) {
    filename = `${base}-${n}.json`;
    n += 1;
  }
  used.add(filename);
  return filename;
}
