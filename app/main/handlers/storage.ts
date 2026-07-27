/**
 * Storage IPC — the renderer's only door to device-local persistence.
 *
 * The renderer reads/writes private data (conversation, worldview, preferences)
 * through these channels; the data itself stays in userData via localStore.
 */

import { ipcMain, logger } from "@glaze/core/backend";

import { localStore } from "../services/local-store.js";

export function registerStorageHandlers(): void {
  ipcMain.handle("folks:storage:get", async (_event, key: string) => {
    return await localStore.get(key);
  });

  ipcMain.handle("folks:storage:set", async (_event, key: string, value: unknown) => {
    await localStore.set(key, value);
  });

  ipcMain.handle("folks:storage:clear", async () => {
    await localStore.clear();
    logger.info("storage", "Local Folks data cleared");
  });
}
