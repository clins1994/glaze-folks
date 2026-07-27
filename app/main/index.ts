// Main process entry point - Node.js backend for Glaze app
//
// The glaze CLI runtime automatically handles all framework wiring (IPC server,
// native bridge, lifecycle, signal handlers) before this file runs.
// This entry point uses only APIs.

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { app, BrowserWindow, Menu, nativeTheme, logger, initDevToolsButtonState } from "@glaze/core/backend";

import { registerHandlers } from "./handlers/index.js";
import { getPreloadPath, getWindowUrl } from "./windows/window-paths.js";
import { clearDiscovery } from "./services/discovery.js";

// Best-effort: drop the caller's discovery footprint (active topics) when the
// window closes or the app quits, so nothing outlives the session. Fire-and-
// forget — the 10-minute TTL is the guaranteed fallback if this can't complete
// (e.g. no Supabase session, or the process exits first).
let discoveryCleared = false;
function bestEffortClearDiscovery(): void {
  if (discoveryCleared) return;
  discoveryCleared = true;
  void Promise.resolve()
    .then(() => clearDiscovery())
    .catch(() => {
      // ignored — TTL cleanup covers this
    });
}

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── IPC Handlers ──────────────────────────────────────────────────────
// ipcMain is already wired to the IPC server by the runtime bootstrap.
registerHandlers();

// ── Dev-only parity harness ───────────────────────────────────────────
// The parity autotest lives in main/dev/, which is excluded from scaffolded
// apps. The build (build-backend) defines GLAZE_DEV_HARNESS="1" only when that
// directory is present, so esbuild dead-code-eliminates this block — and never
// resolves the missing module — for user apps. A no-op unless a scenario env var
// is set even in the template.
type DevHarness = {
  applyParityScenarioStartup(): void;
  runParityAutotestIfRequested(): Promise<void>;
};
type AppAiDevHarness = {
  runAppAiAutotest(): Promise<void>;
};
let devHarness: DevHarness | null = null;
let appAiDevHarness: AppAiDevHarness | null = null;
if (process.env.GLAZE_DEV_HARNESS === "1") {
  // @ts-ignore dev-only harness; present only in the template, excluded from scaffolded apps
  devHarness = (await import("./dev/parity-autotest.js")) as DevHarness;
  devHarness.applyParityScenarioStartup();
  // @ts-ignore dev-only harness; present only in the template, excluded from scaffolded apps
  appAiDevHarness = (await import("./dev/app-ai-autotest.js")) as AppAiDevHarness;
}

// ── State ─────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;

// ── Window creation ───────────────────────────────────────────────────
async function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    logger.debug("main", "Main window already exists, skipping creation");
    return;
  }

  // A new window means a fresh discovery session — re-arm the best-effort clear.
  discoveryCleared = false;

  // Read display name from package.json
  // In production: __dirname = build/main, package.json is at ../../package.json
  const packageJsonPath = path.join(__dirname, "..", "..", "package.json");

  // Folks is one minimal, single-column surface: a private conversation with a
  // composer and inline match notices. A focused, chat-sized window — stable
  // dimensions, height within the 850px recommended maximum.
  const minWindowWidth = 460;
  const minWindowHeight = 560;
  const windowWidth = 680;
  const windowHeight = 800;
  let windowTitle = "Glaze App";

  try {
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, "utf-8"));
      windowTitle = packageJson.productName || packageJson.appConfig?.displayName || windowTitle;
    }
  } catch {
    // Use defaults
  }

  // Create main window
  const browserWindowStartTime = Date.now();
  logger.info("main", "⏱️ [COLD_START] Creating BrowserWindow", {
    timestamp: new Date().toISOString(),
  });

  mainWindow = new BrowserWindow({
    windowKey: "main", // Stable key for frame persistence
    width: windowWidth,
    height: windowHeight,
    minWidth: minWindowWidth,
    minHeight: minWindowHeight,
    title: windowTitle,
    // Opaque dark surface — no vibrancy. Inset (hidden) title bar lets the app's
    // own header act as the drag region; traffic lights stay functional and are
    // positioned to sit inside that custom top bar.
    titleBarStyle: "hidden",
    toolbarStyle: "none",
    trafficLightPosition: { x: 20, y: 20 },
    backgroundColor: "#121212",
    show: false, // Don't show until WebView is ready (prevents flickering)
    webPreferences: {
      preload: getPreloadPath(),
    },
  });

  const browserWindowEndTime = Date.now();
  logger.info("main", "⏱️ [COLD_START] BrowserWindow constructor completed", {
    timestamp: new Date().toISOString(),
    duration_ms: browserWindowEndTime - browserWindowStartTime,
  });

  // Closing the main window ends the active discovery session — clear its
  // footprint best-effort while the app (and Supabase session) is still alive.
  mainWindow.on("close", () => {
    bestEffortClearDiscovery();
  });

  // Wait for ready-to-show event before showing window (prevents flickering)
  mainWindow.once("ready-to-show", () => {
    const showStartTime = Date.now();
    logger.info("main", "⏱️ [COLD_START] ready-to-show event received, showing window", {
      timestamp: new Date().toISOString(),
    });

    mainWindow?.show();

    const showEndTime = Date.now();
    logger.info("main", "⏱️ [COLD_START] Window shown", {
      timestamp: new Date().toISOString(),
      duration_ms: showEndTime - showStartTime,
    });
  });

  // Determine URL to load (dev server preferred, fallback to build files)
  const url = await getWindowUrl("main-window.html");
  logger.info("main", "Resolved main window URL", { url });

  // Load URL - window will be shown automatically when ready-to-show fires
  const loadURLStartTime = Date.now();
  logger.info("main", "⏱️ [COLD_START] Loading URL in window", {
    timestamp: new Date().toISOString(),
    url,
  });

  await mainWindow.loadURL(url);

  const loadURLEndTime = Date.now();
  logger.info("main", "⏱️ [COLD_START] URL loaded in window (waiting for ready-to-show)", {
    timestamp: new Date().toISOString(),
    duration_ms: loadURLEndTime - loadURLStartTime,
  });
}

// ── Application menu ──────────────────────────────────────────────────
async function setupApplicationMenu() {
  await initDevToolsButtonState();
  const menu = Menu.buildFromTemplate([
    {
      label: "App",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]);
  Menu.setApplicationMenu(menu);
  logger.info("main", "Application menu configured");
}

// ── Lifecycle events ──────────────────────────────────────────────────
app.on("window-all-closed", () => {
  // On macOS, apps typically don't quit when all windows are closed
  // Uncomment to quit on all windows closed:
  // app.quit();
});

app.on("activate", (hasVisibleWindows) => {
  logger.info("main", "App activate event received", {
    hasVisibleWindows,
    mainWindowExists: !!mainWindow,
    mainWindowDestroyed: mainWindow?.isDestroyed() ?? true,
  });

  // On macOS, re-create window when dock icon clicked if no windows
  if (!hasVisibleWindows) {
    if (!mainWindow || mainWindow.isDestroyed()) {
      logger.info("main", "Creating main window due to activate event");
      createMainWindow();
    } else {
      logger.info("main", "Showing existing main window");
      mainWindow.show();
    }
  } else {
    logger.info("main", "Has visible windows, no action needed");
  }
});

app.on("before-quit", () => {
  logger.info("main", "App before-quit, cleaning up...");
  bestEffortClearDiscovery();
});

// ── App ready ─────────────────────────────────────────────────────────
const startTime = Date.now();
logger.info("main", "⏱️ [COLD_START] Waiting for app ready...", {
  timestamp: new Date().toISOString(),
});

app.whenReady().then(async () => {
  const windowCreateStartTime = Date.now();
  logger.info("main", "⏱️ [COLD_START] App ready, creating main window", {
    timestamp: new Date().toISOString(),
    wait_duration_ms: windowCreateStartTime - startTime,
  });

  await devHarness?.runParityAutotestIfRequested();
  await appAiDevHarness?.runAppAiAutotest();

  // Folks renders as an always-dark immersive world; force dark so native
  // chrome (dialogs, selects, traffic lights) matches the Living Orbit.
  nativeTheme.themeSource = "dark";

  await setupApplicationMenu();

  createMainWindow()
    .then(() => {
      const windowCreateEndTime = Date.now();
      logger.info("main", "⏱️ [COLD_START] Main window created successfully", {
        timestamp: new Date().toISOString(),
        duration_ms: windowCreateEndTime - windowCreateStartTime,
      });
    })
    .catch((error) => {
      logger.error("main", "Failed to create main window", error);
    });
});
