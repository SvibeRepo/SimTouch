import { MasterPresetHandler } from "./masterPresetHandler.js";
import { SimplePresetHandler } from "./simplePresetHandler.js";
import { ModulatorPresetHandler } from "./modulatorPresetHandler.js";
import { RandomizerPresetHandler } from "./randomizerPresetHandler.js";
import { askPresetName } from "./presetNameDialog.js";
import { debugManager } from "../util/debugManager.js";
import { presetFlags } from "./presetFlags.js";
import { slugPresetName } from "./presetSlug.js";
import { markLocalSplitDone } from "./presetBaseHandler.js";

export class PresetManager {
  static TYPES = {
    MASTER: "master",
    TURBULENCE: "turbulence",
    VORONOI: "voronoi",
    ORGANIC: "organic",
    PULSE: "pulse",
    INPUT: "input",
    RANDOMIZER: "randomizer",
    GRID: "grid",
  };

  constructor(uiComponents) {


    this.uiComponents = uiComponents;
    this.presetControls = {};
    this.eventListeners = {};

    // Define minimal defaults (used if storage is empty AND factory defaults are missing for type)
    const minimalTurbulenceDefaults = { Default: { controllers: {} } };
    const minimalVoronoiDefaults = { Default: { controllers: {} } };
    const minimalOrganicDefaults = { Default: { controllers: {} } };
    const minimalPulseDefaults = { None: { modulators: [] } };
    const minimalInputDefaults = { None: { modulators: [] } };
    const minimalRandomizerDefaults = { None: { paramTargets: {} }, All: { paramTargets: {} } };
    const minimalGridDefaults = {
      "WaveShare|240x240|C|341|1": { // Keep one essential default structure
        screen: { width: 240, height: 240, shape: 'circular' },
        gridSpecs: { targetCellCount: 341, gap: 1, aspectRatio: 1, scale: 1, allowCut: 3, centerOffsetX: 0, centerOffsetY: 0 },
        shadow: { shadowIntensity: 0.17, shadowThreshold: 0, blurAmount: 0.23 },
        flags: { showGridCells: true, showIndices: false, showCellCenters: false, showBoundary: false },
        colors: { gradientPreset: 'c0' }
      }
    };
    const minimalMasterDefaults = { Default: {} };

    this.handlers = {
      [PresetManager.TYPES.TURBULENCE]: new SimplePresetHandler(
        "savedTurbulencePresets",
        minimalTurbulenceDefaults,
        ["Default"],
      ),
      [PresetManager.TYPES.VORONOI]: new SimplePresetHandler(
        "savedVoronoiPresets",
        minimalVoronoiDefaults,
        ["Default", "None"],
      ),
      [PresetManager.TYPES.ORGANIC]: new SimplePresetHandler(
        "savedOrganicPresets",
        minimalOrganicDefaults,
        ["Default", "None"],
      ),
      [PresetManager.TYPES.PULSE]: new ModulatorPresetHandler(
        "savedPulsePresets",
        minimalPulseDefaults,
        ["None"],
      ),
      [PresetManager.TYPES.INPUT]: new ModulatorPresetHandler(
        "savedInputPresets",
        minimalInputDefaults,
        ["None"],
      ),
      [PresetManager.TYPES.RANDOMIZER]: new RandomizerPresetHandler(
        "savedRandomizerPresets",
        minimalRandomizerDefaults,
        ["None", "All"],
      ),
      [PresetManager.TYPES.GRID]: new SimplePresetHandler(
        "savedGridPresets",
        minimalGridDefaults,
      ),
      [PresetManager.TYPES.MASTER]: new MasterPresetHandler(
        "savedMasterPresets",
        minimalMasterDefaults,
        ["Default"],
      ),
    };

    this.handlers[PresetManager.TYPES.MASTER].setComponents(uiComponents);
    this.storeReachable = false;
  }

  async loadStore() {
    const results = await Promise.all(
      Object.values(this.handlers).map((handler) => handler.loadFiles())
    );
    this.storeReachable = results.every(Boolean);
    if (this.storeReachable) {
      markLocalSplitDone();
    } else {
      console.warn("Preset store is unreachable.");
    }
    return this.storeReachable;
  }

  get db() {
    return debugManager.get('presets');
  }

  // Event system
  on(eventName, callback) {
    if (!this.eventListeners[eventName]) {
      this.eventListeners[eventName] = [];
    }
    this.eventListeners[eventName].push(callback);
  }

  emit(eventName, ...args) {
    if (this.eventListeners[eventName]) {
      this.eventListeners[eventName].forEach(callback => callback(...args));
    }
  }

  createPresetControls(presetType, parentElement, options = {}) {
    if (this.db) console.log(`Creating preset controls for type: ${presetType}`, this.handlers[presetType]);
    if (!parentElement || !presetType || !this.handlers[presetType]) {
      console.error(`Cannot create preset controls: Invalid parameters`);
      return null;
    }

    const controlId = `${presetType}-${Date.now()}`;

    const container = document.createElement("div");
    container.classList.add("preset-controls-container");


    const presetSelect = document.createElement("select");
    presetSelect.classList.add("preset-select");


    // Capture presetType in a closure to ensure it's preserved
    const boundHandleSave = () => {
      this._handleSave(presetType);
    };

    const saveButton = this._createButton("Save", boundHandleSave);

    const deleteButton = this._createButton("Delete", () =>
      this._handleDelete(presetType, presetSelect)
    );

    const exportButton = this._createButton("Export", () => {
      this.downloadSelected(presetType);
    });

    const importButton = this._createButton("Import", () => {
      this._pickImportFile(presetType, () => this._updatePresetDropdown(presetType, presetSelect));
    });

    presetSelect.addEventListener("change", (e) => {
      const value = e.target.value;
      if (this.db) console.log(`Preset selector for ${presetType} changed to:`, value);
      this.loadPreset(presetType, value);
    });

    this._updatePresetDropdown(presetType, presetSelect);

    container.appendChild(saveButton);
    container.appendChild(presetSelect);
    container.appendChild(deleteButton);
    container.appendChild(exportButton);
    container.appendChild(importButton);

    if (options.title) {
      const titleElement = document.createElement("div");
      titleElement.textContent = options.title;

      if (options.insertFirst) {
        parentElement.insertBefore(titleElement, parentElement.firstChild);
        parentElement.insertBefore(container, titleElement.nextSibling);
      } else {
        parentElement.appendChild(titleElement);
        parentElement.appendChild(container);
      }
    } else {
      if (options.insertFirst) {
        parentElement.insertBefore(container, parentElement.firstChild);
      } else {
        parentElement.appendChild(container);
      }
    }

    this.presetControls[controlId] = {
      type: presetType,
      container,
      select: presetSelect,
    };

    return {
      id: controlId,
      container,
      select: presetSelect,
      saveButton,
      deleteButton,
      exportButton,
      importButton,
      update: () => this._updatePresetDropdown(presetType, presetSelect),
    };
  }

  _createButton(text, clickHandler) {
    const button = document.createElement("button");
    button.textContent = text;
    button.style.flex = "1";
    button.addEventListener("click", clickHandler);
    return button;
  }

  async _handleSave(presetType) {
    if (this.db) console.log(`Save requested for presetType: "${presetType}"`,
      `Handler:`, this.handlers[presetType] ? "exists" : "missing");

    const currentPreset = this.getSelectedPreset(presetType);
    if (this.db) console.log(`Current preset for ${presetType}:`, currentPreset);

    const defaultValue = (currentPreset && currentPreset !== "Default") ? currentPreset : "";
    const presetName = await askPresetName(`Enter ${presetType} preset name:`, defaultValue);

    if (this.db) console.log(`User entered name: "${presetName}"`);
    if (!presetName) return;

    const uiComponent = this.getUIComponent(presetType);
    if (this.db) console.log(`UI component for ${presetType}:`, uiComponent ? "found" : "missing");

    const success = this.savePreset(presetType, presetName);
    if (this.db) console.log(`Save result for ${presetType} "${presetName}": ${success}`);

    if (success) {
      this._updateAllPresetDropdowns(presetType);
      alert(`Preset "${presetName}" saved.`);
    } else if (!presetFlags.useLocalStorage) {
      alert("Save refused. Working presets are off.");
    } else {
      alert("Failed to save preset.");
    }
  }

  _handleDelete(presetType, selectElement) {
    const current = selectElement.value;

    const handler = this.getHandler(presetType);
    if (handler?.protectedPresets?.includes(current)) {
      alert(`Cannot delete protected preset: ${current}`);
      return;
    }

    if (
      confirm(`Delete preset "${current}"?`) &&
      this.deletePreset(presetType, current)
    ) {
      this._updateAllPresetDropdowns(presetType);
      alert(`Preset "${current}" deleted.`);
    }
  }

  _updatePresetDropdown(presetType, selectElement) {
    if (!selectElement || !this.handlers[presetType]) return;

    const options = this.getPresetOptions(presetType);

    selectElement.innerHTML = "";

    options.forEach((preset) => {
      const option = document.createElement("option");
      option.value = preset;
      option.textContent = preset;
      selectElement.appendChild(option);
    });

    const currentPreset = this.getSelectedPreset(presetType);
    if (currentPreset && options.includes(currentPreset)) {
      selectElement.value = currentPreset;
    }
  }

  _updateAllPresetDropdowns(presetType) {
    Object.values(this.presetControls)
      .filter((control) => control.type === presetType)
      .forEach((control) => {
        this._updatePresetDropdown(presetType, control.select);
      });
  }

  getHandler(type) {
    return this.handlers[type] || null;
  }

  getPresetOptions(type) {
    const handler = this.getHandler(type);
    return handler ? handler.getPresetOptions() : [];
  }

  getSelectedPreset(type) {
    const handler = this.getHandler(type);
    return handler ? handler.getSelectedPreset() : null;
  }

  getUIComponent(type) {
    switch (type) {
      case PresetManager.TYPES.PULSE:
        return this.uiComponents.pulseModUi;
      case PresetManager.TYPES.INPUT:
        return this.uiComponents.inputModUi;
      case PresetManager.TYPES.TURBULENCE:
        return this.uiComponents.turbulenceUi;
      case PresetManager.TYPES.VORONOI:
        return this.uiComponents.voronoiUi;
      case PresetManager.TYPES.ORGANIC:
        return this.uiComponents.organicUi;
      case PresetManager.TYPES.RANDOMIZER:
        return this.uiComponents.randomizerUi;
      case PresetManager.TYPES.GRID:
        return this.uiComponents.gridUi;
      case PresetManager.TYPES.MASTER:
        return this.uiComponents;
      default:
        console.warn(`PresetManager: No UI component mapped for type ${type}`);
        return null;
    }
  }

  savePreset(type, presetName) {
    const handler = this.handlers[type];
    if (!handler) return false;

    const uiComponent = this.getUIComponent(type);

    if (type === PresetManager.TYPES.MASTER) {
      return handler.savePresetFromUI(presetName);
    }
    else if (uiComponent) {
      return handler.savePresetFromUI(presetName, uiComponent);
    }

    return false;
  }

  loadPreset(type, presetName) {
    if (this.db) console.log(`Loading ${type} preset: ${presetName}`);
    const handler = this.getHandler(type);
    if (!handler) {
      console.warn(`No handler found for preset type ${type}`);
      return false;
    }

    // Emit presetSelected event before applying
    this.emit('presetSelected', presetName);

    const component = this.getUIComponent(type);
    const success = handler.applyPreset(presetName, component);

    if (success) {
      // Emit presetLoaded event after successful loading
      this.emit('presetLoaded', type, presetName);
    }

    return success;
  }

  extractMasterPresetData() {
    const data = {
      param: {},
      particle: {},
      gravity: {},
      collision: {},
      boundary: {},
      restState: {},
      turbulence: {},
      voronoi: {},
      organic: {},
      pulseModulation: null,
      inputModulation: null,
      _meta: {
        timestamp: Date.now(),
        version: "1.0",
      },
    };

    [
      "param",
      "particle",
      "gravity",
      "collision",
      "boundary",
      "restState",
      "turbulence",
      "voronoi",
      "organic",
    ].forEach((key) => {
      const uiProp = `${key}Ui`;
      if (
        this.uiComponents[uiProp] &&
        typeof this.uiComponents[uiProp].getControlTargets === "function"
      ) {
        data[key] = this.uiComponents[uiProp].getControlTargets();
      }
    });

    if (
      this.uiComponents.pulseModUi &&
      typeof this.uiComponents.pulseModUi.getModulatorsData === "function"
    ) {
      data.pulseModulation = this.uiComponents.pulseModUi.getModulatorsData();
    }

    if (
      this.uiComponents.inputModUi &&
      typeof this.uiComponents.inputModUi.getModulatorsData === "function"
    ) {
      data.inputModulation = this.uiComponents.inputModUi.getModulatorsData();
    }

    return data;
  }

  deletePreset(type, presetName) {
    const handler = this.getHandler(type);
    if (!handler) {
      console.warn(`No handler for preset type: ${type}`);
      return false;
    }
    return handler.deletePreset(presetName);
  }

  selectedPresetFile(type) {
    const handler = this.getHandler(type);
    if (!handler) return null;
    const name = handler.getSelectedPreset();
    if (!name || !Object.prototype.hasOwnProperty.call(handler.presets, name)) return null;
    return {
      name,
      data: handler.presets[name],
      filename: `${slugPresetName(name)}.json`,
    };
  }

  downloadSelected(type) {
    const file = this.selectedPresetFile(type);
    if (!file) {
      alert("No preset selected.");
      return false;
    }
    const blob = new Blob([JSON.stringify({ name: file.name, data: file.data }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(link);
    }, 100);
    return true;
  }

  _pickImportFile(type, onDone) {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json";
    fileInput.style.display = "none";
    document.body.appendChild(fileInput);
    fileInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result);
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch (error) {
          alert("Failed to read file");
          return;
        }
        if (parsed && parsed._meta && parsed.presets) {
          const shouldMerge = confirm(
            "Would you like to merge with existing presets?\n\n" +
            "• Click OK to merge (keep existing presets)\n" +
            "• Click Cancel to replace working presets"
          );
          const result = this.importPresets(text, { merge: shouldMerge });
          if (result.success) {
            alert(
              `Successfully imported presets:\n` +
              `• ${result.count} preset type(s) updated\n` +
              `• Types: ${result.types.join(", ")}`
            );
          } else {
            alert(`Import failed: ${result.error || "Unknown error"}`);
          }
        } else {
          const result = this.importPresetFile(type, text);
          if (result.success) {
            alert(`Imported preset "${result.name}".`);
          } else {
            alert(`Import failed: ${result.error || "Unknown error"}`);
          }
        }
        if (onDone) onDone();
      };
      reader.onerror = () => alert("Failed to read file");
      reader.readAsText(file);
      document.body.removeChild(fileInput);
    });
    fileInput.click();
  }

  importPresetFile(type, jsonText) {
    if (!presetFlags.useLocalStorage) {
      return { success: false, error: "Import refused. Working presets are off." };
    }
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch (error) {
      return { success: false, error: "Invalid data format" };
    }
    if (!data || typeof data.name !== "string" || !("data" in data)) {
      return { success: false, error: "Invalid data format" };
    }
    const handler = this.getHandler(type);
    if (!handler) return { success: false, error: "Unknown preset type" };
    if (handler.protectedPresets.includes(data.name)) {
      return { success: false, error: `Cannot import protected preset: ${data.name}` };
    }
    if (!handler.savePreset(data.name, data.data)) {
      return { success: false, error: "Failed to save preset." };
    }
    this._updateAllPresetDropdowns(type);
    return { success: true, count: 1, types: [type], name: data.name };
  }

  importPresets(jsonData, options = { merge: false }) {
    if (!presetFlags.useLocalStorage) {
      return { success: false, error: "Import refused. Working presets are off.", count: 0 };
    }
    try {
      const data = JSON.parse(jsonData);

      if (!this._validateImportData(data)) {
        console.error("Invalid preset data format");
        return { success: false, error: "Invalid data format", count: 0 };
      }

      const presetData = data.presets || data;
      let importCount = 0;
      const importedTypes = [];

      for (const type in presetData) {
        const handler = this.handlers[type];
        if (!handler) continue;
        if (!presetData[type] || typeof presetData[type] !== "object") {
          console.warn(`Invalid preset data for type: ${type}`);
          continue;
        }
        const saved = options.merge
          ? this._mergeLocalPresets(handler, presetData[type])
          : handler.replaceLocal(presetData[type]);
        if (!saved) {
          return { success: false, error: "Failed to save preset.", count: importCount };
        }
        this._updateAllPresetDropdowns(type);
        importCount++;
        importedTypes.push(type);
      }

      return {
        success: importCount > 0,
        count: importCount,
        types: importedTypes,
      };
    } catch (error) {
      console.error("Error importing presets:", error);
      return {
        success: false,
        error: error.message,
        count: 0,
      };
    }
  }

  _mergeLocalPresets(handler, map) {
    for (const [name, data] of Object.entries(map)) {
      if (handler.protectedPresets.includes(name)) continue;
      if (!handler.savePreset(name, data)) return false;
    }
    return true;
  }

  _validateImportData(data) {
    if (data._meta) {
      return typeof data.presets === "object" && data.presets !== null;
    } else {
      return typeof data === "object" && data !== null;
    }
  }


  setVoronoiField(voronoiField) {
    const handler = this.getHandler(PresetManager.TYPES.VORONOI);
    if (handler && typeof handler.setVoronoiField === "function") {
      handler.setVoronoiField(voronoiField);
    }
  }

  setTurbulenceField(turbulenceField) {
    const handler = this.getHandler(PresetManager.TYPES.TURBULENCE);
    if (handler && typeof handler.setTurbulenceField === "function") {
      handler.setTurbulenceField(turbulenceField);
    }
  }
}
