# Preset store

**Status:** implemented 2026-11-22.

**Scope:** lab presets in `applications/web`. The spline pattern is a later design. This store gives it a folder and nothing else.

`presetManager.js` keeps its name in this pass. Renaming it to `preset_manager.js` is a later pass.

## Layout

```
applications/web/store/
  presets/
    master/
    pulse/
    input/
    turbulence/
    voronoi/
    organic/
    grid/
    randomizer/
  splines/
```

`splines/` is empty. Nothing in this design reads or writes it.

One JSON file per preset:

```json
{
  "name": "Vex",
  "data": {}
}
```

`name` is the dropdown label. `data` is the object stored under that name today (`controllers`, `modulators`, grid specs, or a master snapshot). The filename is a slug of `name`.

Slug rules, applied in order:

1. Trim whitespace.
2. Lowercase.
3. Replace every run of characters outside `a-z` and `0-9` with one hyphen.
4. Trim hyphens from both ends.
5. An empty result becomes `preset`.
6. If that filename is already used by another name in the same folder, append `-2`, then `-3`, and so on.

`Vex` is `vex.json`. `WaveShare | C | 240x240 | 338` is `waveshare-c-240x240-338.json`. ` Joystick` and `Joystick` share a slug, so the second file written in that folder gets `joystick-2.json`.

The folder name is the type key. There is no rename: `master`, `pulse`, `input`, `turbulence`, `voronoi`, `organic`, `grid`, `randomizer`.

## What a default is

A default preset is a file in `store/presets/`. `defaultPresets.js` is not a source.

The current module is split once into those files, using the slug rules above, walking names in the order they appear in the module and writing only into an empty store. The first name to claim a slug keeps it. The lab then stops importing the module, and the module is removed. That split is not a command the lab runs, and it is not repeated after the files exist.

## Working copies

The dropdown is the mix of both stores. `store/presets/` and `localStorage` are both read. Neither replaces the other.

On first load, `localStorage` is empty, so the presets on offer are the files in `store/presets/`. Loading those files does not copy them into `localStorage`.

A new preset is written only to `localStorage`. The file tree is unchanged.

Saving a preset that already exists as a file writes that name to `localStorage`. The dropdown then shows the `localStorage` copy for that name. The file stays as it was until someone exports and copies a new file over it.

`presetManager.js` has `useLocalStorage`, default `true`. With it false, the dropdown is the files alone and a save is refused. The lab never writes `store/`. Publishing a default is still export, then copy the file into the matching folder.

## Load

The lab reads the store over HTTP. `npm run dev` serves `applications/web/store` on `127.0.0.1:8081`.

- `GET /presets/<folder>/` returns a JSON array of the `*.json` filenames in that folder.
- `GET /presets/<folder>/<file>.json` returns the file.
- The folder must be one of the eight names above. The file must be a single slug plus `.json`.
- Paths stay inside `applications/web/store`. Other methods are rejected.
- The lab page on port 8080 is unchanged. This serve does not replace it. Responses allow that origin so the page can fetch them.

For each type the handler builds the dropdown as follows.

1. Fetch the file list and each file. Unreadable files are skipped and reported. The rest still load.
2. If `useLocalStorage` is true, add the `localStorage` names. A name in both places shows the `localStorage` copy. A name that exists only as a file still appears. Loading does not write those files into `localStorage`.
3. If `useLocalStorage` is false, the dropdown is the files alone. `localStorage` is not read.
4. If the result is empty, use the small built-in default already constructed in `presetManager.js`.

If the store serve is down and `useLocalStorage` is true, the working map loads and the lab reports that the store is unreachable. Defaults that were never saved locally are absent for that session. If the serve is down and the bool is false, the built-in default is used and the same report is shown.

There is no refresh that copies files back over a working copy. A file you replaced in the project shows up in a browser that does not already have that name saved locally.

## Save, delete, export, import

**Save.** With `useLocalStorage` true, save writes that one preset to `localStorage` and updates the dropdown. A new name lives only there. A name that already has a file is overridden in the dropdown by this copy. The file is not modified. If `localStorage` throws, the save fails and the name is not added. With the bool false, save is refused and the files stay unchanged.

**Delete.** Protected names stay refused: `Default` for master and turbulence, `Default` and `None` for voronoi and organic, `None` for pulse and input, `None` and `All` for randomizer. Delete removes a name from the working map only. It does not remove a file. The name leaves the dropdown for this page view. A name that still has a file returns on the next load.

**Export.** The export action downloads the preset selected on that panel, and no other preset. The body is `{ "name", "data" }`. The download filename is the slug plus `.json`. The master panel's existing Export button does this for the selected master preset, and it no longer writes every type. Each other preset panel exports its own selected preset the same way, so the file can be copied into that type's folder.

**Import.** With `useLocalStorage` true, a `{ "name", "data" }` file dropped on a panel is saved into that type's working map. An older bundle that still has `_meta.presets` imports through the existing multi-type path into the working maps. With the bool false, import is refused. Import does not write the store.

## Out of scope

- The spline pattern, SVG loading, and any read of `store/splines/`.
- Renaming `presetManager.js`.
- Writing the store from the lab, from a save button, or from export.
- Engine, suit, and `engines/cpp` changes.

## Check

- An empty browser with the store serve up shows the files in each folder, and `localStorage` stays empty.
- Saving a new name survives a refresh, appears beside the file presets, and leaves `store/presets/` unchanged.
- Saving a name that already has a file writes `localStorage` only. After refresh the dropdown shows that copy, and the file is unchanged.
- Export of Vex downloads only Vex, with `"name": "Vex"` and filename `vex.json`.
- Copying that file into `store/presets/turbulence/` makes it appear in a browser that has no local Vex.
- A browser that already saved Vex locally still shows the local copy after the file is replaced.
- `useLocalStorage` false shows the files and refuses a save.
- With the serve down and the bool true, local names load and a store-unreachable notice is shown.
- A broken JSON file is skipped. The other files in that folder load.
- Delete of a local-only name sticks. Delete of a name that has a file does not remove the file, and the name returns on reload.
- Protected deletes are refused.
- `WaveShare | C | 240x240 | 338` is stored as `waveshare-c-240x240-338.json` and the dropdown still shows the original name.
