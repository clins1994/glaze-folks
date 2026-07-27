/**
 * LocalStore — Folks' private, device-only persistence.
 *
 * Everything persisted here lives in the app's userData directory and is never
 * networked by Folks (companion transcripts, North memory, worldview/preferences).
 * Note: messages the user sends to North are separately processed by Glaze AI
 * (hosted) — only the stored transcript stays here.
 * It is a single JSON file holding a namespaced key -> value map, loaded once
 * and cached in memory. Writes are serialized so concurrent saves cannot
 * interleave and corrupt the file.
 */

import * as fs from "fs/promises";
import * as path from "path";

import { app, logger } from "@glaze/core/backend";

type StoreShape = Record<string, unknown>;

class LocalStore {
  private cache: StoreShape | null = null;
  private filePath: string | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  private async resolvePath(): Promise<string> {
    if (!this.filePath) {
      const userDataPath = app.getPath("userData");
      await fs.mkdir(userDataPath, { recursive: true });
      this.filePath = path.join(userDataPath, "folks-store.json");
    }
    return this.filePath;
  }

  private async ensureLoaded(): Promise<StoreShape> {
    if (this.cache) return this.cache;
    try {
      const data = await fs.readFile(await this.resolvePath(), "utf-8");
      this.cache = JSON.parse(data) as StoreShape;
    } catch {
      // Missing/empty/corrupt file — start fresh.
      this.cache = {};
    }
    return this.cache;
  }

  async get<T>(key: string): Promise<T | null> {
    const store = await this.ensureLoaded();
    return (store[key] as T) ?? null;
  }

  async set(key: string, value: unknown): Promise<void> {
    const store = await this.ensureLoaded();
    if (value === null || value === undefined) {
      delete store[key];
    } else {
      store[key] = value;
    }
    await this.flush();
  }

  /** Wipe all locally-stored Folks data ("Delete local data"). */
  async clear(): Promise<void> {
    this.cache = {};
    await this.flush();
  }

  private async flush(): Promise<void> {
    const snapshot = JSON.stringify(this.cache ?? {}, null, 2);
    this.writeChain = this.writeChain.then(async () => {
      try {
        await fs.writeFile(await this.resolvePath(), snapshot);
      } catch (error) {
        logger.error("local-store", "Failed to persist Folks store", error);
      }
    });
    return this.writeChain;
  }
}

export const localStore = new LocalStore();
