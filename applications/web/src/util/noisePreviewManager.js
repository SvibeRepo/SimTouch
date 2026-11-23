import { debugManager } from './debugManager.js';
import { eventBus } from './eventManager.js';

/** Match engines/rust/src/field.rs bilinear_sample. Preview ny is already simulation Y. */
function bilinearSampleField(grid, n, x, y) {
    if (!grid || n === 0 || grid.length < n * n) return 0;
    const nF = n;
    let fx = x * nF - 0.5;
    let fy = y * nF - 0.5;
    if (fx < 0) fx = 0;
    else if (fx > nF - 1.0001) fx = nF - 1.0001;
    if (fy < 0) fy = 0;
    else if (fy > nF - 1.0001) fy = nF - 1.0001;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, n - 1);
    const y1 = Math.min(y0 + 1, n - 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const i00 = grid[y0 * n + x0];
    const i10 = grid[y0 * n + x1];
    const i01 = grid[y1 * n + x0];
    const i11 = grid[y1 * n + x1];
    const a = i00 * (1 - tx) + i10 * tx;
    const b = i01 * (1 - tx) + i11 * tx;
    return a * (1 - ty) + b * ty;
}

const WASM_FIELD_N = 128;

export class NoisePreviewManager {

    constructor(main, previewSize, patterns) {
        this.main = main;
        this.turbulenceField = main.turbulenceField;
        this.previewSize = previewSize;
        this.patterns = patterns;
        this.patternEntries = Object.entries(patterns);

        // State
        this.selectedPattern = null;
        this.isFolderOpen = false;
        this.isParentFolderOpen = true;
        this.isVisible = false;
        this.previewElements = new Map();
        this.cleanupFunctions = new Map();
        this.lastRefreshTime = 0;
        this.animationFrameId = null;
        this.refreshingSelected = true;
        this._needsRefreshOnOpen = false;
        this._inRefreshSelectedPreview = false;
        this.refreshingDisabled = false;
        this.isTurbulenceRelevant = false;
        this.eventListeners = [];
        this.boundHandleUiChange = null;

        // Performance settings. Only the selected preview animates continuously;
        // other thumbs play while hovered (throttled) and refresh on slider release.
        this.selectedFps = 15;
        this.hoverRefreshInterval = 100;
        this.lastHoverRefreshTime = 0;
        this.hoveredPattern = null;

        this._updateRelevanceState();
        this._initializeEventListeners();
    }

    _updateRelevanceState() {
        if (!this.main || !this.main.simParams) {
            if (this.db) console.log("NoisePreviewManager: Skipping _updateRelevanceState - main or simParams missing.");
            return; // Guard against missing main/simParams
        }

        const affectPosition = this.main.simParams.turbulence.affectPosition;
        const scaleField = this.main.simParams.turbulence.scaleField;
        const affectScale = this.main.simParams.turbulence.affectScale;
        const isNoiseMode =
          this.main.simParams.rendering.cellMode === "--- NOISE ---" ||
          this.main.simParams.rendering.gridMode === "--- NOISE ---";

        // Log the state being checked
        if (this.db) console.log(`NoisePreviewManager: Checking relevance state: affectPos=${affectPosition}, scaleField=${scaleField}, affectScale=${affectScale}, isNoiseMode=${isNoiseMode}`);

        const newRelevance = affectPosition || scaleField || affectScale || isNoiseMode;

        if (newRelevance !== this.isTurbulenceRelevant) {
            const wasRelevant = this.isTurbulenceRelevant;
            this.isTurbulenceRelevant = newRelevance;
            // Log the change more clearly
            if (this.db) console.log(`NoisePreviewManager: Relevance CHANGED: ${wasRelevant} -> ${this.isTurbulenceRelevant}`);
            // Step 2: Trigger refresh state update when relevance changes
            this.updateRefreshState();
            // When modes turn off, the main rAF loop may already be idle while a
            // selected-pattern animation still runs on its own rAF. Stop those and
            // restore per-pattern static thumbs (noise2D), not the frozen WASM field.
            if (!newRelevance) {
                this.cleanupFunctions.forEach((cleanup) => {
                    try { cleanup(); } catch (e) { console.warn('Error during preview cleanup:', e); }
                });
                this.cleanupFunctions.clear();
                this.generateAllStaticPreviews();
            }
        } else {
            if (this.db) console.log(`NoisePreviewManager: Relevance unchanged (${this.isTurbulenceRelevant}).`);
        }
    }

    _initializeEventListeners() {
        if (!this.main) return; // Guard

        const handleUiChange = (event) => {
            // Ensure main and event are valid before proceeding
            if (!this.main || !event || !event.paramPath) return;

            // Log the received event
            if (this.db) console.log(`NoisePreviewManager: Received uiControlChanged for ${event.paramPath}`);

            const relevantPaths = [
                'turbulence.affectPosition',
                'turbulence.scaleField',
                'turbulence.affectScale',
                "rendering.cellMode",
                "rendering.gridMode"
            ];
            if (relevantPaths.includes(event.paramPath)) {
                // Log that a relevant path was detected
                if (this.db) console.log(`NoisePreviewManager: Relevant path detected (${event.paramPath}), updating relevance state.`);
                this._updateRelevanceState();
            }
        };

        // Bind the handler to 'this' and store it
        this.boundHandleUiChange = handleUiChange.bind(this);

        eventBus.on('uiControlChanged', this.boundHandleUiChange);
        this.eventListeners.push({ event: 'uiControlChanged', handler: this.boundHandleUiChange });
    }

    updateRefreshState() {
        const shouldBeActive = this.isTurbulenceRelevant && this.isVisible && !this.refreshingDisabled;
        const isRunning = !!this.animationFrameId;

        if (shouldBeActive && !isRunning) {
            if (this.db) console.log("NoisePreviewManager: Starting refresh loop due to state update.");
            this.startRefreshLoop();
        } else if (!shouldBeActive && isRunning) {
            if (this.db) console.log("NoisePreviewManager: Stopping refresh loop due to state update.");
            this.stopRefreshLoop();
        }
    }

    toggleRefreshingDisabled() {
        const isDisabled = !this.refreshingDisabled;
        this.setRefreshingDisabled(isDisabled, true);
        return this.refreshingDisabled;
    }

    setRefreshingDisabled(disabled, userInitiated = true) {
        const intendedDisabled = disabled;
        const finalDisabled = !this.isTurbulenceRelevant || intendedDisabled;

        if (this.refreshingDisabled !== finalDisabled) {
            if (this.db && userInitiated) {
                console.log(`NoisePreviewManager: User attempt to set refreshing to ${intendedDisabled ? 'disabled' : 'enabled'}. Final state: ${finalDisabled ? 'disabled' : 'enabled'} (Relevance: ${this.isTurbulenceRelevant})`);
            } else if (this.db && this.refreshingDisabled !== finalDisabled) {
                console.log(`NoisePreviewManager: Refreshing state changed to ${finalDisabled ? 'disabled' : 'enabled'} (Relevance: ${this.isTurbulenceRelevant}, Visible: ${this.isVisible})`);
            }

            this.refreshingDisabled = finalDisabled;
            this.updateRefreshState();
            this.updateSelectedUI();

            if (this.refreshingDisabled) {
                this.generateAllStaticPreviews();
            }
        }
    }

    initialize(containerElement, folderIsOpen = false) {
        this.containerElement = containerElement;

        const previewElements = containerElement.querySelectorAll('.pattern-preview');
        previewElements.forEach((element) => {
            const pattern = element.getAttribute('data-pattern');
            if (pattern) {
                this.previewElements.set(pattern, element);

                element.addEventListener('mouseenter', () => {
                    if (pattern !== this.selectedPattern) {
                        this.hoveredPattern = pattern;
                        this.lastHoverRefreshTime = 0;
                    }
                });

                element.addEventListener('mouseleave', () => {
                    if (this.hoveredPattern === pattern) {
                        this.hoveredPattern = null;
                    }
                });
            }
        });

        this.generateAllStaticPreviews();

        this.setFolderOpen(folderIsOpen);

        this.checkParentFolderVisibility();

        this.ensureRefreshLoopStarted();
    }

    ensureRefreshLoopStarted() {
        this.updateVisibilityState();

        if (this.isVisible && !this.animationFrameId) {
            this.startRefreshLoop();

            if (this.selectedPattern) {
                this.refreshSelectedPreview();
            }
        }
    }

    checkParentFolderVisibility() {
        if (!this.containerElement) return;

        let element = this.containerElement;
        let isVisible = true;

        while (element && !element.classList.contains('dg')) {
            if (element.classList.contains('closed')) {
                isVisible = false;
                break;
            }

            const parent = element.parentElement;
            if (parent) {
                const folderElement = parent.closest('.folder');
                if (folderElement === element) {
                    break;
                }
                element = folderElement || parent;
            } else {
                break;
            }
        }

        const prevParentState = this.isParentFolderOpen;
        this.isParentFolderOpen = isVisible;

        this.updateVisibilityState();

        if (prevParentState !== this.isParentFolderOpen) {
            this.handleVisibilityChange();
        }
    }

    updateVisibilityState() {
        const wasVisible = this.isVisible;
        this.isVisible = this.isFolderOpen && this.isParentFolderOpen;

        if (wasVisible !== this.isVisible) {
            this.handleVisibilityChange();
        }
    }

    handleVisibilityChange() {
        this.updateRefreshState();
    }

    generateAllStaticPreviews() {
        const originalStyle = this.turbulenceField.patternStyle;

        this.patternEntries.forEach(([name, patternValue]) => {
            const element = this.previewElements.get(patternValue);
            if (element) {
                const img = element.querySelector('img');
                if (img) {
                    this.turbulenceField.patternStyle = patternValue;
                    img.src = this.generateStaticPreviewImage(
                        patternValue,
                        this.previewSize,
                        this.previewSize,
                        true
                    );
                }
            }
        });

        this.turbulenceField.patternStyle = originalStyle;
    }

    generateStaticPreviewImage(patternValue, width, height, skipStyleChange = false) {
        let originalStyle;
        if (!skipStyleChange) {
            originalStyle = this.turbulenceField.patternStyle;
            this.turbulenceField.patternStyle = patternValue;
        }

        const scaleFactor = 0.7;
        const renderWidth = Math.max(24, Math.floor(width * scaleFactor));
        const renderHeight = Math.max(24, Math.floor(height * scaleFactor));

        const canvas = document.createElement('canvas');
        canvas.width = renderWidth;
        canvas.height = renderHeight;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(renderWidth, renderHeight);
        const data = imageData.data;

        const applyBlur = patternValue === this.selectedPattern;

        for (let y = 0; y < renderHeight; y++) {
            for (let x = 0; x < renderWidth; x++) {
                const nx = x / renderWidth;
                const ny = 1 - (y / renderHeight);
                const noiseValue = this.turbulenceField.noise2D(nx, ny, this.turbulenceField.time, applyBlur);

                const index = (y * renderWidth + x) * 4;
                data[index] = noiseValue * 255;
                data[index + 1] = noiseValue * 255;
                data[index + 2] = noiseValue * 255;
                data[index + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);

        if (renderWidth !== width || renderHeight !== height) {
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = width;
            finalCanvas.height = height;
            const finalCtx = finalCanvas.getContext('2d');
            finalCtx.imageSmoothingEnabled = false;
            finalCtx.drawImage(canvas, 0, 0, width, height);
            canvas.width = 1;
            canvas.height = 1;

            const dataUrl = finalCanvas.toDataURL('image/jpeg', 0.85);

            if (!skipStyleChange) {
                this.turbulenceField.patternStyle = originalStyle;
            }

            return dataUrl;
        }

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

        if (!skipStyleChange) {
            this.turbulenceField.patternStyle = originalStyle;
        }

        return dataUrl;
    }

    setSelectedPattern(pattern, forceAnimation = false) {
        if (this.selectedPattern) {
            const cleanup = this.cleanupFunctions.get(this.selectedPattern);
            if (cleanup) {
                try {
                    cleanup();
                } catch (e) {
                    console.warn('Error cleaning up animation:', e);
                }
                this.cleanupFunctions.delete(this.selectedPattern);
            }
        }

        if (this.hoveredPattern === pattern) {
            this.hoveredPattern = null;
        }

        this.selectedPattern = pattern;

        this.updateSelectedUI();

        this.updateVisibilityState();

        if (!this._inRefreshSelectedPreview) {
            this.refreshSelectedPreview(forceAnimation);
        }

        if ((this.isVisible || forceAnimation) && !this.animationFrameId) {
            this.startRefreshLoop();
        }
    }

    updateSelectedUI() {
        this.previewElements.forEach((element, pattern) => {
            const title = element.querySelector('div');
            if (title) {
                title.style.display = pattern === this.selectedPattern ? 'none' : 'block';
            }

            element.classList.remove('selected', 'disabled');
            const existingIndicator = element.querySelector('.disabled-indicator');

            if (pattern === this.selectedPattern) {
                element.classList.add('selected');
                if (this.refreshingDisabled) {
                    element.classList.add('disabled');

                    if (!existingIndicator) {
                        const indicator = document.createElement('div');
                        indicator.className = 'disabled-indicator';
                        indicator.innerHTML = '⏸';
                        element.appendChild(indicator);
                    }
                } else {
                    if (existingIndicator) {
                        existingIndicator.remove();
                    }
                }
            } else {
                if (existingIndicator) {
                    existingIndicator.remove();
                }
            }
        });
    }

    setFolderOpen(isOpen) {
        if (this.isFolderOpen === isOpen) return;

        this.isFolderOpen = isOpen;

        this.updateVisibilityState();
    }

    setParentFolderOpen(isOpen) {
        if (this.isParentFolderOpen === isOpen) return;

        this.isParentFolderOpen = isOpen;

        this.updateVisibilityState();
    }

    startRefreshLoop() {
        if (!this.isTurbulenceRelevant) {
            if (this.db) console.log("NoisePreviewManager: Start loop prevented - turbulence not relevant.");
            return;
        }

        if (this.animationFrameId) return;

        if (this.refreshingDisabled) return;

        if (this.db) console.log("NoisePreviewManager: Starting refresh loop.");

        this.lastRefreshTime = performance.now();
        this.lastHoverRefreshTime = performance.now();
        this.refreshingSelected = true;

        if (this.selectedPattern && !this._inRefreshSelectedPreview) {
            this.refreshSelectedPreview();
        }

        this.update();
    }

    stopRefreshLoop() {
        if (this.animationFrameId) {
            if (this.db) console.log("NoisePreviewManager: Stopping refresh loop.");
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        this.hoveredPattern = null;

        const originalPatternStyle = this.turbulenceField ? this.turbulenceField.patternStyle : null;

        this.cleanupFunctions.forEach(cleanup => {
            try { cleanup(); } catch (e) { console.warn("Error during preview cleanup:", e); }
        });
        this.cleanupFunctions.clear();

        if (this.turbulenceField && originalPatternStyle !== null) {
            this.turbulenceField.patternStyle = originalPatternStyle;
        }

        this.generateAllStaticPreviews();
    }

    update() {
        if (!this.isVisible || this.refreshingDisabled || !this.isTurbulenceRelevant) {
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
                if (this.db) console.log("NoisePreviewManager: Update loop stopped (invisible, disabled, or irrelevant).");
            }
            return;
        }

        const now = performance.now();
        const elapsedSinceLastFrame = now - this.lastRefreshTime;
        const elapsedSinceHoverRefresh = now - this.lastHoverRefreshTime;

        if (elapsedSinceLastFrame > (1000 / this.selectedFps)) {
            if (!this._inRefreshSelectedPreview) {
                this.refreshSelectedPreview();
            }
            this.lastRefreshTime = now;
        }

        if (this.hoveredPattern && elapsedSinceHoverRefresh > this.hoverRefreshInterval) {
            this.refreshHoveredPreview();
            this.lastHoverRefreshTime = now;
        }

        if (this.isVisible) {
            this.animationFrameId = requestAnimationFrame(() => this.update());
        } else {
            this.animationFrameId = null;
        }
    }

    refreshSelectedPreview(forceStart = false) {
        if (!this.selectedPattern) return;

        const element = this.previewElements.get(this.selectedPattern);
        if (!element) return;

        const img = element.querySelector('img');
        if (!img) return;

        const existingCleanup = this.cleanupFunctions.get(this.selectedPattern);
        if (existingCleanup) {
            try {
                existingCleanup();
            } catch (e) {
                console.warn('Error cleaning up previous animation:', e);
            }
            this.cleanupFunctions.delete(this.selectedPattern);
        }

        // Paused, or no turb mode / noise grid: do not animate from the shared
        // WASM fieldView — that buffer freezes when turbulence is idle, so every
        // clicked pattern would paint as a copy of the last live frame. Use
        // per-pattern noise2D statics instead.
        if (this.refreshingDisabled || !this.isTurbulenceRelevant) {
            img.src = this.generateStaticPreviewImage(
                this.selectedPattern,
                this.previewSize,
                this.previewSize
            );
            return;
        }

        if (this.db) console.log(`Refreshing preview for ${this.selectedPattern}, visible: ${this.isVisible}, contrast: ${this.turbulenceField.contrast.toFixed(2)}, blur: ${this.turbulenceField.blurAmount.toFixed(2)}`);

        this._inRefreshSelectedPreview = true;

        try {
            const cleanup = this.generatePreviewAnimation(
                this.previewSize,
                this.previewSize,
                this.selectedPattern,
                (dataUrl) => {
                    if (img && !img.src) {
                        img.src = this.generateStaticPreviewImage(
                            this.selectedPattern,
                            this.previewSize,
                            this.previewSize
                        );
                    }

                    if (img) {
                        img.src = dataUrl;
                    }
                }
            );

            this.cleanupFunctions.set(this.selectedPattern, cleanup);

            if ((this.isVisible || forceStart) && !this.animationFrameId) {
                this.startRefreshLoop();
            }
        } catch (err) {
            console.error('Error generating preview animation:', err);

            if (img) {
                img.src = this.generateStaticPreviewImage(
                    this.selectedPattern,
                    this.previewSize,
                    this.previewSize
                );
            }
        }

        this._inRefreshSelectedPreview = false;
    }

    generatePreviewAnimation(width, height, patternStyle, callback) {
        const originalStyle = this.turbulenceField.patternStyle;

        this.turbulenceField.patternStyle = patternStyle;

        const isClassicDrop = patternStyle.toLowerCase() === "classicdrop";

        const scaleFactor = isClassicDrop ? 0.5 : 0.7;
        const renderWidth = Math.max(32, Math.floor(width * scaleFactor));
        const renderHeight = Math.max(32, Math.floor(height * scaleFactor));

        let lastPerformanceWarning = 0;
        let performanceIssueCount = 0;
        let dynamicScaleFactor = isClassicDrop ? 0.7 : 1.0;

        const canvas = document.createElement('canvas');
        canvas.width = renderWidth;
        canvas.height = renderHeight;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(renderWidth, renderHeight);
        const data = imageData.data;

        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = width;
        finalCanvas.height = height;
        const finalCtx = finalCanvas.getContext('2d');
        finalCtx.imageSmoothingEnabled = false;

        let animationFrame;
        let lastFrameTime = 0;
        const frameInterval = isClassicDrop ?
            1000 / Math.min(this.selectedFps, 12) :
            1000 / this.selectedFps;

        const applyBlur = patternStyle === this.selectedPattern && (!isClassicDrop || this.turbulenceField.blurAmount < 0.5);

        const animate = (timestamp) => {
            if (!this.isVisible) {
                animationFrame = requestAnimationFrame(animate);
                return;
            }

            if (timestamp - lastFrameTime < frameInterval) {
                animationFrame = requestAnimationFrame(animate);
                return;
            }

            lastFrameTime = timestamp;

            const startTime = performance.now();

            const effectiveWidth = Math.max(16, Math.floor(renderWidth * dynamicScaleFactor));
            const effectiveHeight = Math.max(16, Math.floor(renderHeight * dynamicScaleFactor));

            const skipFactor = isClassicDrop ?
                Math.max(2, Math.floor(3 / dynamicScaleFactor)) :
                Math.max(1, Math.floor(2 / dynamicScaleFactor));

            const rustCore = this.main?.rustCore;
            // Blur 0 does not paint the 128² field (Classic Drop cannot afford it).
            // Sample the live pattern the same way the JavaScript tick does.
            const blur = this.turbulenceField?.blurAmount ?? 0;
            const useWasmField =
                blur > 0 &&
                this.main?.simParams?.simulation?.engine === "rust" &&
                !!rustCore?.ready;
            const field = useWasmField ? rustCore.fieldView() : null;

            for (let y = 0; y < effectiveHeight; y++) {
                for (let x = 0; x < effectiveWidth; x++) {
                    const nx = x / effectiveWidth;
                    const ny = 1 - (y / effectiveHeight);
                    const noiseValue = field
                        ? bilinearSampleField(field, WASM_FIELD_N, nx, ny)
                        : this.turbulenceField.noise2D(nx, ny, this.turbulenceField.time, applyBlur);

                    const targetX = Math.floor(x * (renderWidth / effectiveWidth));
                    const targetY = Math.floor(y * (renderHeight / effectiveHeight));
                    const index = (targetY * renderWidth + targetX) * 4;

                    data[index] = noiseValue * 255;
                    data[index + 1] = noiseValue * 255;
                    data[index + 2] = noiseValue * 255;
                    data[index + 3] = 255;

                    if ((x % skipFactor === 0) && (y % skipFactor === 0)) {
                        const currentTime = performance.now();
                        const timeThreshold = isClassicDrop ? 8 : 12;
                        if (currentTime - startTime > timeThreshold) {
                            x += skipFactor;
                        }
                    }
                }
            }

            const renderTime = performance.now() - startTime;
            const performanceThreshold = isClassicDrop ? 12 : 15;
            if (renderTime > performanceThreshold) {
                performanceIssueCount++;
                lastPerformanceWarning = timestamp;
                if (performanceIssueCount > 3 && dynamicScaleFactor > 0.5) {
                    const reductionAmount = isClassicDrop ? 0.15 : 0.1;
                    dynamicScaleFactor = Math.max(0.3, dynamicScaleFactor - reductionAmount);
                    performanceIssueCount = 0;
                }
            } else if (timestamp - lastPerformanceWarning > 2000 && dynamicScaleFactor < 1.0) {
                const increaseAmount = isClassicDrop ? 0.03 : 0.05;
                dynamicScaleFactor = Math.min(1.0, dynamicScaleFactor + increaseAmount);
                performanceIssueCount = Math.max(0, performanceIssueCount - 1);
            }

            ctx.putImageData(imageData, 0, 0);

            if (renderWidth !== width || renderHeight !== height) {
                finalCtx.clearRect(0, 0, width, height);
                finalCtx.drawImage(canvas, 0, 0, width, height);
                const jpegQuality = isClassicDrop ? 0.75 : 0.85;
                callback(finalCanvas.toDataURL('image/jpeg', jpegQuality));
            } else {
                const jpegQuality = isClassicDrop ? 0.75 : 0.85;
                callback(canvas.toDataURL('image/jpeg', jpegQuality));
            }

            animationFrame = requestAnimationFrame(animate);
        };

        animationFrame = requestAnimationFrame(animate);

        return () => {
            cancelAnimationFrame(animationFrame);
            this.turbulenceField.patternStyle = originalStyle;

            canvas.width = 1;
            canvas.height = 1;
            finalCanvas.width = 1;
            finalCanvas.height = 1;
        };
    }

    refreshHoveredPreview() {
        if (!this.hoveredPattern || this.refreshingDisabled) return;
        if (this.hoveredPattern === this.selectedPattern) return;

        const element = this.previewElements.get(this.hoveredPattern);
        if (!element) return;

        const img = element.querySelector('img');
        if (!img) return;

        img.src = this.generateStaticPreviewImage(
            this.hoveredPattern,
            this.previewSize,
            this.previewSize
        );
    }

    refreshInactivePreviews() {
        if (!this.turbulenceField || this.previewElements.size === 0) return;

        const originalStyle = this.turbulenceField.patternStyle;

        try {
            this.patternEntries.forEach(([, patternValue]) => {
                if (patternValue === this.selectedPattern) return;

                const element = this.previewElements.get(patternValue);
                if (!element) return;

                const img = element.querySelector('img');
                if (!img) return;

                this.turbulenceField.patternStyle = patternValue;
                img.src = this.generateStaticPreviewImage(
                    patternValue,
                    this.previewSize,
                    this.previewSize,
                    true
                );
            });
        } finally {
            this.turbulenceField.patternStyle = originalStyle;
        }
    }

    refreshAllPreviews(force = false) {
        if (!this.isVisible && !force) {
            this._needsRefreshOnOpen = true;
            return;
        }

        this._needsRefreshOnOpen = false;

        if (this.selectedPattern) {
            this.refreshSelectedPreview(true);
        }

        this.patternEntries.forEach(([name, patternValue]) => {
            if (patternValue !== this.selectedPattern) {
                const element = this.previewElements.get(patternValue);
                if (element) {
                    const img = element.querySelector('img');
                    if (img) {
                        img.src = this.generateStaticPreviewImage(
                            patternValue,
                            this.previewSize,
                            this.previewSize
                        );
                    }
                }
            }
        });

        if (!this.animationFrameId && this.isVisible) {
            this.startRefreshLoop();
        }
    }

    setRefreshRate(fps) {
        if (fps > 0) {
            this.selectedFps = fps;
        }
        if (this.db) console.log('setRefreshRate', fps);
    }

    isFolderOpenState() {
        return this.isFolderOpen;
    }

    dispose() {
        this.stopRefreshLoop();

        this.eventListeners.forEach(({ event, handler }) => {
            eventBus.off(event, handler);
        });
        this.eventListeners = [];
        this.boundHandleUiChange = null;

        this.previewElements.clear();
        this.cleanupFunctions.clear();
        this.containerElement = null;
        this.turbulenceField = null;
        this.main = null;
    }

    setPerformanceProfile(profile) {
        switch (profile) {
            case 'low':
                this.selectedFps = 10;
                this.hoverRefreshInterval = 200;
                break;

            case 'medium':
                this.selectedFps = 15;
                this.hoverRefreshInterval = 100;
                break;

            case 'high':
                this.selectedFps = 24;
                this.hoverRefreshInterval = 50;
                break;

            case 'ultra':
                this.selectedFps = 30;
                this.hoverRefreshInterval = 33;
                break;

            default:
                this.setPerformanceProfile('medium');
        }
        if (this.db) console.log('setPerformanceProfile', profile);
        if (this.isVisible && this.animationFrameId) {
            this.stopRefreshLoop();
            this.startRefreshLoop();
        }
    }

    get db() {
        return debugManager.get('noise');
    }
}

