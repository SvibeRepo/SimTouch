import { debugManager } from '../util/debugManager.js';
import { presetFlags } from './presetFlags.js';

const SPLIT_FLAG = 'presetStoreLocalSplit';

function collectModulatorTargets(data, into) {
  if (!data || typeof data !== 'object') return;
  const lists = [];
  if (Array.isArray(data.modulators)) lists.push(data.modulators);
  if (Array.isArray(data.pulseModUi?.modulators)) lists.push(data.pulseModUi.modulators);
  if (Array.isArray(data.inputModUi?.modulators)) lists.push(data.inputModUi.modulators);
  for (const list of lists) {
    for (const mod of list) {
      if (mod && typeof mod.targetName === 'string' && mod.targetName) into.add(mod.targetName);
    }
  }
}

function omitModulatedControllers(data, targets) {
  if (!data || typeof data !== 'object' || targets.size === 0) return data;
  const copy = JSON.parse(JSON.stringify(data));
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.controllers && typeof node.controllers === 'object' && !Array.isArray(node.controllers)) {
      for (const name of targets) delete node.controllers[name];
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') walk(value);
    }
  };
  walk(copy);
  return copy;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stableValue(value[key]);
    return out;
  }
  return value;
}

/** Save and export sample a modulator target at different instants. Those values are not an edit. */
function presetDataMatches(localData, fileData) {
  const targets = new Set();
  collectModulatorTargets(localData, targets);
  collectModulatorTargets(fileData, targets);
  const local = stableValue(omitModulatedControllers(localData, targets));
  const file = stableValue(omitModulatedControllers(fileData, targets));
  return JSON.stringify(local) === JSON.stringify(file);
}

function getTypeFromStorageKey(key) {
  if (!key) return null;
  const match = key.match(/^saved([A-Z][a-zA-Z]*)Presets$/);
  return match && match[1] ? match[1].toLowerCase() : null;
}

export class PresetBaseHandler {
  constructor(storageKey, minimalDefaultPresets, protectedPresets) {
    this.storageKey = storageKey;
    this.type = getTypeFromStorageKey(storageKey);
    this.minimalDefaults = { ...minimalDefaultPresets };
    this.protectedPresets = protectedPresets || [];
    this.filePresets = {};
    this.localPresets = {};
    this.hiddenNames = new Set();
    this.presets = {};
    this.selectedPreset = null;
    this.storeReachable = false;
    this._rebuildView();
  }

  get db() {
    return debugManager.get('presets');
  }

  async loadFiles() {
    this.filePresets = {};
    this.storeReachable = false;
    const origin = presetFlags.storeOrigin;
    try {
      const listResponse = await fetch(`${origin}/presets/${this.type}/`);
      if (!listResponse.ok) {
        throw new Error(`list ${listResponse.status}`);
      }
      const filenames = await listResponse.json();
      if (!Array.isArray(filenames)) {
        throw new Error('list was not an array');
      }
      this.storeReachable = true;
      for (const filename of filenames) {
        try {
          const fileResponse = await fetch(`${origin}/presets/${this.type}/${filename}`);
          if (!fileResponse.ok) {
            console.warn(`Skipped preset file ${this.type}/${filename}: ${fileResponse.status}`);
            continue;
          }
          const body = await fileResponse.json();
          if (!body || typeof body.name !== 'string' || !('data' in body)) {
            console.warn(`Skipped unreadable preset file ${this.type}/${filename}`);
            continue;
          }
          this.filePresets[body.name] = body.data;
        } catch (error) {
          console.warn(`Skipped preset file ${this.type}/${filename}`, error);
        }
      }
    } catch (error) {
      this.storeReachable = false;
      if (this.db) console.warn(`Preset store unreachable for ${this.type}`, error);
    }
    this._loadLocal();
    this._rebuildView();
    return this.storeReachable;
  }

  _readLocalRaw() {
    if (!presetFlags.useLocalStorage || typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return parsed;
    } catch (error) {
      console.error(`Error parsing stored presets for ${this.storageKey}:`, error);
      return {};
    }
  }

  _loadLocal() {
    this.localPresets = {};
    if (!presetFlags.useLocalStorage) return;
    const parsed = this._readLocalRaw();
    const splitDone = typeof localStorage !== 'undefined' && localStorage.getItem(SPLIT_FLAG) === '1';
    // The previous lab wrote every factory preset into localStorage on load.
    // Once, drop those mirrored names so the files stay the defaults.
    if (this.storeReachable && !splitDone) {
      let removed = false;
      for (const name of Object.keys(parsed)) {
        if (Object.prototype.hasOwnProperty.call(this.filePresets, name)) {
          removed = true;
        } else {
          this.localPresets[name] = parsed[name];
        }
      }
      if (removed) this._writeLocal();
    } else {
      this.localPresets = parsed;
    }
  }

  _writeLocal() {
    if (!presetFlags.useLocalStorage || typeof localStorage === 'undefined') return false;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.localPresets));
      return true;
    } catch (error) {
      console.error(`Failed to save presets for ${this.storageKey}:`, error);
      return false;
    }
  }

  _rebuildView() {
    const view = { ...this.filePresets };
    if (presetFlags.useLocalStorage) {
      Object.assign(view, this.localPresets);
    }
    for (const name of this.hiddenNames) {
      delete view[name];
    }
    if (Object.keys(view).length === 0) {
      this.presets = JSON.parse(JSON.stringify(this.minimalDefaults));
    } else {
      this.presets = view;
    }
    if (!this.selectedPreset || !Object.prototype.hasOwnProperty.call(this.presets, this.selectedPreset)) {
      this.selectedPreset = this.protectedPresets.find((name) => this.presets[name])
        || Object.keys(this.presets)[0]
        || null;
    }
  }

  getPreset(presetName) {
    return this.presets[presetName] || null;
  }

  savePreset(presetName, data) {
    if (!presetFlags.useLocalStorage) return false;
    const had = Object.prototype.hasOwnProperty.call(this.localPresets, presetName);
    const previous = this.localPresets[presetName];
    this.localPresets[presetName] = data;
    this.hiddenNames.delete(presetName);
    if (!this._writeLocal()) {
      if (had) this.localPresets[presetName] = previous;
      else delete this.localPresets[presetName];
      return false;
    }
    this.presets[presetName] = data;
    this.selectedPreset = presetName;
    return true;
  }

  deletePreset(presetName) {
    if (!this.presets[presetName]) {
      console.warn(`Preset "${presetName}" not found`);
      return false;
    }
    if (this.protectedPresets.includes(presetName)) {
      console.warn(`Cannot delete protected preset: ${presetName}`);
      return false;
    }

    const had = Object.prototype.hasOwnProperty.call(this.localPresets, presetName);
    const previous = this.localPresets[presetName];
    if (had) delete this.localPresets[presetName];
    if (had && !this._writeLocal()) {
      this.localPresets[presetName] = previous;
      return false;
    }

    delete this.presets[presetName];
    if (Object.prototype.hasOwnProperty.call(this.filePresets, presetName)) {
      this.hiddenNames.add(presetName);
    }
    if (this.selectedPreset === presetName) {
      this.selectedPreset = this.protectedPresets.find((name) => this.presets[name])
        || Object.keys(this.presets)[0]
        || null;
    }
    return true;
  }

  /** Replace the working map with these names. Store files stay. Protected names are skipped. */
  replaceLocal(map) {
    if (!presetFlags.useLocalStorage) return false;
    const previous = this.localPresets;
    this.localPresets = {};
    this.hiddenNames.clear();
    if (!this._writeLocal()) {
      this.localPresets = previous;
      return false;
    }
    this._rebuildView();
    for (const [name, data] of Object.entries(map)) {
      if (this.protectedPresets.includes(name)) continue;
      if (!this.savePreset(name, data)) return false;
    }
    return true;
  }

  getPresetOptions() {
    return Object.keys(this.presets);
  }

  /**
   * True when the dropdown is showing a local copy that is not the store file:
   * a name with no file, or a file whose saved data differs.
   */
  isLocalChange(presetName) {
    if (!Object.prototype.hasOwnProperty.call(this.localPresets, presetName)) return false;
    if (!Object.prototype.hasOwnProperty.call(this.filePresets, presetName)) return true;
    return !presetDataMatches(this.localPresets[presetName], this.filePresets[presetName]);
  }

  getSelectedPreset() {
    return this.selectedPreset;
  }
}

export function markLocalSplitDone() {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SPLIT_FLAG, '1');
}
