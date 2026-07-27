// Renderer -> backend bridge for device-local PREFERENCES only.
//
// The AI conversation transcript is intentionally NOT persisted — it lives in
// renderer memory for the session and is gone when the window closes. Only small
// preferences (e.g. whether the first-use privacy disclosure was acknowledged)
// are stored, via the folks:storage:* handlers in userData.

const ipc = () => window.glazeAPI.glaze.ipc;

const STORAGE_KEYS = {
  prefs: "prefs",
} as const;

export interface FolksPrefs {
  /** Epoch ms when the user acknowledged the first-use privacy disclosure. */
  disclosureAcceptedAt: number | null;
}

export const DEFAULT_PREFS: FolksPrefs = {
  disclosureAcceptedAt: null,
};

export async function loadPrefs(): Promise<FolksPrefs> {
  const stored = await ipc().invoke<Partial<FolksPrefs> | null>("folks:storage:get", STORAGE_KEYS.prefs);
  return { ...DEFAULT_PREFS, ...(stored ?? {}) };
}

export async function savePrefs(prefs: FolksPrefs): Promise<void> {
  await ipc().invoke("folks:storage:set", STORAGE_KEYS.prefs, prefs);
}

export async function clearLocalData(): Promise<void> {
  await ipc().invoke("folks:storage:clear");
}
