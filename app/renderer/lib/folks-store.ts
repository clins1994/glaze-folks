// Renderer -> backend bridge for device-local PREFERENCES only.
//
// The AI conversation transcript is intentionally NOT persisted — it lives in
// renderer memory for the session and is gone when the window closes.

const ipc = () => window.glazeAPI.glaze.ipc;

export async function clearLocalData(): Promise<void> {
  await ipc().invoke("folks:storage:clear");
}
