/**
 * Secrets — encrypted, device-local storage via macOS safeStorage.
 *
 * Holds the Supabase session tokens and (later) the owner's Hermes endpoint URL
 * + API key. All values are encrypted at rest. The Hermes URL/key are never sent
 * to Supabase, a Folks community, or another member — but the owner's own
 * process uses them locally to make requests to the configured Hermes endpoint.
 */

import * as fs from "fs/promises";
import * as path from "path";

import { app, safeStorage } from "@glaze/core/backend";

async function secretsDir(): Promise<string> {
  const dir = path.join(app.getPath("userData"), "secrets");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function secretPath(name: string): Promise<string> {
  return path.join(await secretsDir(), `${encodeURIComponent(name)}.bin`);
}

export async function isSecretsAvailable(): Promise<boolean> {
  return await safeStorage.isEncryptionAvailable();
}

export async function writeSecret(name: string, value: string): Promise<void> {
  if (!(await safeStorage.isEncryptionAvailable())) {
    throw new Error("Secure storage is unavailable on this device");
  }
  const encrypted = await safeStorage.encryptString(value);
  await fs.writeFile(await secretPath(name), encrypted);
}

export async function readSecret(name: string): Promise<string | null> {
  try {
    const encrypted = await fs.readFile(await secretPath(name));
    return await safeStorage.decryptString(encrypted);
  } catch {
    return null;
  }
}

export async function deleteSecret(name: string): Promise<void> {
  try {
    await fs.unlink(await secretPath(name));
  } catch {
    // Already absent — nothing to do.
  }
}
