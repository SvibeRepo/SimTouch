# START HERE: SimTouch Project Quick Orientation

> **Direction:** [`doc/GOALS.md`](doc/GOALS.md) is the goal list for the next steps. The phase story below is the older Phase2 orientation. When they disagree, follow `doc/GOALS.md`.

Welcome to **SimTouch** - a particle simulation engine designed for embedded haptic systems. This document provides fast context for AI assistants and new developers at the start of each session.

## 🎯 Project Purpose

SimTouch is a **dual-phase project** that creates organic, physics-driven control signals for haptic actuator arrays:

1. **Phase 1 (Complete)**: JavaScript/WebGL2 rapid prototyping environment running in a browser
2. **Phase 2 (Active)**: Native C++ implementation for ESP32-S3 autonomous operation
3. **Phase 3 (Planned)**: Integration into production haptic suit firmware (`Svibe_Firmware_Slave`)

## 📂 Critical File Locations

### Documentation (Read These First!)
- **This file** (`START_HERE.md`) - Quick orientation (5-minute read)
- `doc/ARCHITECTURE.md` - Phase2 in-tree fork (not the SimTouchCore Library API)
- `doc/SIMTOUCHCORE.md` - SimTouchCore Library versus that Phase2 fork
- `doc/GLOSSARY.md` - Domain-specific terms and abbreviations
- `doc/QUICK_REFERENCE.md` - Command cheat sheet and troubleshooting
- `doc/migration/migration-plan.md` - Comprehensive migration strategy (may be slightly outdated)
- `.cursor/rules/project-conventions.mdc` - AI agent rules (Phase2 scope, coding standards)

### Active Codebase (Phase2 - Current Work)
- **Source**: `applications/embedded/phase2/src/` - Application layer (Main.cpp, ConfigWeb.cpp, etc.)
- **Headers**: `applications/embedded/phase2/include/` - Simulation modules (SimCore.h, Boundary.h, Turbulence.h, etc.)
- **Config**: `applications/embedded/phase2/platformio.ini` - Build configurations for LilyGo & Waveshare targets
- **Web UI**: `applications/embedded/phase2/data/` - Self-hosted configuration interface (HTML/CSS/JS)

### Reference Implementations
- **JavaScript sources**: `core/javascript/` - Original algorithms (for validation & porting reference)
- **Pattern lab**: `applications/web/` - Browser host linked to `core/javascript` and `core/rust`
- **SimTouchCore Library**: `core/cpp/` - hardware-free core linked by the P4 panel. Phase2 does not build this tree.
- **Phase1 Firmware**: `applications/embedded/phase1/` - Legacy UDP slave mode (deprecated for new work)

## 🏗️ Current Architecture (Phase2)

```
┌─────────────────────────────────────────────────────────────┐
│  ESP32-S3 (Autonomous Particle Simulation)                  │
├─────────────────────────────────────────────────────────────┤
│  Main Loop (Main.cpp)                                       │
│   ├─ Touch Input → TouchForces → SimCore                   │
│   ├─ IMU Data → ImuForces → SimCore (opt-in)               │
│   ├─ SimCore.step() → Physics (60Hz fixed timestep)        │
│   │   ├─ Turbulence (noise-driven forces)                  │
│   │   ├─ Collision (spatial grid 8x8)                      │
│   │   ├─ Boundary (circular/rectangular enforcement)       │
│   │   └─ Gravity (UI or IMU-driven)                        │
│   ├─ GridModes.compute() → 338 cell values (0-255)         │
│   └─ renderGrid() → Display (circular grid, FastLED colors)│
│                                                             │
│  Configuration (ConfigWeb.cpp)                              │
│   ├─ AsyncWebServer (HTTP) → serves data/* web UI          │
│   ├─ AsyncWebSocket (/ws) → binary parameter protocol      │
│   └─ SimConfig (81 params, registry-based mapping)         │
└─────────────────────────────────────────────────────────────┘
```

## 🔑 Key Concepts

### Coordinate Space
- **Simulation**: Normalized `[0, 1]` space (all physics calculations)
- **Screen**: Pixel space (`240×240` Waveshare, `480×480` LilyGo) - conversion only at render boundary
- **Grid**: Dynamic cell-based output (typically 338 cells for suit compatibility)

### Data Flow
1. **Input** → Touch (pixels) converted to normalized coords → Forces applied to particles
2. **Simulation** → 50-200 particles in `[0,1]` space, 60Hz physics step
3. **Grid Computation** → Particles → proximity/velocity/density modes → cell values `[0-255]`
4. **Output** → Cell values → display rendering (FastLED palettes) or suit modules

### Parameter Registry
- **Indices 50-255**: SimTouch parameters (avoid 0-49, reserved for Unity/system commands)
- **WebSocket Protocol**: Binary `[paramIndex, ...valueBytes]` format
- **Registry**: `SimConfig.h` kParamRegistry array (type, range, offset metadata)

## 🎛️ Current Feature Status (Phase2)

| Feature | Status | Module |
|---------|--------|--------|
| Particle System | ✅ Working | SimCore.cpp |
| Boundary (Circle/Rect) | ✅ Working | Boundary.cpp |
| Collision Detection | ✅ Working | Collision.cpp |
| Gravity Forces | ✅ Working | GravityForces.cpp |
| Touch Forces | ✅ Working | TouchForces.cpp |
| IMU Forces | ✅ Working (opt-in) | ImuForces.cpp |
| Turbulence | ✅ Working (Perlin + patterns + warp/symmetry) | Turbulence.cpp |
| Grid Rendering | ✅ Working | GridModes.cpp, GridGeometry.cpp |
| Web Configuration | ✅ Working | ConfigWeb.cpp |
| Voronoi Field | 🚧 Scaffold Only | Voronoi.cpp |
| FLIP Fluid | 🚧 Scaffold Only | FluidFLIP.cpp |
| Organic Behaviors | 🚧 Scaffold Only | OrganicBehavior.cpp |
| Modulator (LFO) | 🚧 Scaffold Only | Modulator.cpp |

## 🔧 Hardware Targets

### Primary: LilyGo T-RGB 2.1 (Phase2 Development)
- Display: ST7701 RGB 480×480 half-circle
- Touch: LilyGo library (onboard capacitive)
- Build: `pio run -e phase2_lilygo`

### Secondary: Waveshare ESP32-S3-Touch-LCD-1.28 (Phase1/Phase3 Compatibility)
- Display: GC9A01 240×240 round
- Touch: CST816S (I2C)
- Build: `pio run -e phase2_waveshare`

### Shared Hardware
- IMU: QMI8658 (6-axis, I2C)
- WiFi: ESP32-S3 AP mode (`ParticleSimulator` SSID)
- Flash: 16MB (LittleFS for web UI)
- RAM: 320KB SRAM + 2MB PSRAM

## 🚀 Common Workflows

### First-Time Setup
1. Read `doc/migration/migration-plan.md` (comprehensive but may be slightly outdated)
2. Read `doc/ARCHITECTURE.md` (Phase2 fork) and `doc/SIMTOUCHCORE.md` (library used by P4)
3. Review `.cursor/rules/project-conventions.mdc` (coding standards, scope limitations)
4. Open `applications/embedded/phase2/` in PlatformIO

### Making Changes
1. **Simulation Logic**: Edit `include/*.h` and `src/*.cpp`
2. **Configuration**: Add params to `SimConfig.h` kParamRegistry
3. **Web UI**: Edit `data/index.html` and `data/app.js`
4. **Build**: `pio run -e phase2_lilygo` (or `phase2_waveshare`)
5. **Upload**: `pio run -t upload -e phase2_lilygo`
6. **Monitor**: `pio device monitor -b 115200`

**Note**: If `pio` command is not found, use the full path to PlatformIO:
- **Windows**: `%USERPROFILE%\.platformio\penv\Scripts\platformio.exe`
- **Linux/Mac**: Add `~/.platformio/penv/bin` to PATH or use `python -m platformio`

### Testing Web Config
1. Connect to WiFi AP: `ParticleSimulator` (password: `MagicMods`)
2. Open browser: `http://192.168.3.100`
3. WebSocket auto-connects to `/ws`
4. Parameter changes apply in real-time

### Validating Against JS Sim
1. Run JS Sim: `cd applications/web && npm run dev` → `http://localhost:8080/sim.html`
2. Set identical parameters in both JS and ESP32
3. Visually compare particle behavior and grid output
4. Use UDP path for remote control (Phase 2D feature)

## ⚠️ Critical Constraints

### Memory
- **320KB SRAM**: ~158KB used, ~162KB free
- **No dynamic allocation**: Use fixed-size arrays, `constexpr`, stack allocation
- **Particle limit**: 50-200 particles (tunable via `particleCount` param)

### Code Style (ESP32 C++)
- Use `float` not `double` (ESP32 has no FPU for double)
- Use `sqrtf`, `cosf`, `sinf`, `atan2f` (not `sqrt`, `cos`, etc.)
- Use `constexpr` for compile-time constants
- All simulation logic in normalized `[0,1]` space

### Scope Limitations
- **Library-first**: Develop simulation behavior in `core/cpp` and validate in `applications/web`
- **Phase2 fork**: `applications/embedded/phase2/` is kept as a separate copy; ordinary library work does not land there
- **Phase1**: `applications/embedded/phase1/` is the pattern-lab display slave only; do not link it to `core/cpp`

## 📊 Performance Targets

- **Simulation**: 60 FPS (60Hz fixed timestep)
- **Rendering**: 60 FPS (decoupled from sim)
- **Frame Budget**: ~10ms sim + ~15ms render + ~5ms overhead = ~30ms total (33ms available)
- **Cell Count**: 338 cells (suit module count compatibility)

## 🐛 Debugging

### Serial Output
- Baud rate: `115200` (LilyGo), `250000` (Waveshare)
- FPS stats: Printed every 1s (`sim FPS | render FPS | avg frame ms | cells`)
- Validation: Phase2A check (particles, touch, boundary) every 2.5s

### Common Issues
- **Particles stuck/escaping**: Check boundary enforcement (`Boundary.cpp`)
- **Low FPS**: Reduce `particleCount` or `collisionGridSize`
- **WebSocket disconnect**: Check WiFi connection, `192.168.3.100` reachability
- **Touch not working**: Verify touch driver init in `Graphics.cpp`, check `getTouching()`

## 📚 Next Steps for AI Agents

When starting a new chat session:

1. **Read this file first** for quick orientation
2. **Check `doc/ARCHITECTURE.md`** for the Phase2 fork, and **`doc/SIMTOUCHCORE.md`** for the library the P4 panel links
3. **Review recent git changes**: `git status` and `git log -5` for context
4. **Scan open files** in the IDE for user's current focus
5. **Ask clarifying questions** before making assumptions

## 🔗 Related Projects

- **Svibe_Firmware_Slave** (Phase 3 integration target): Production haptic suit firmware with 338 modules, LVGL UI, Unity UDP control
- **JavaScript Sim** (Phase 1 reference): Browser-based prototyping environment with WebGL2 rendering

---

**Last Updated**: 2026-02-15  
**Current Phase**: Phase 2 (Autonomous ESP32 Implementation)  
**Primary Developer**: Gaia  
**AI Model Context**: Use this as your first-read onboarding document
