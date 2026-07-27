/**
 * Identity + relay-status IPC.
 *
 * The renderer uses these to reflect whether the community relay is available
 * and to drive the anonymous-first identity, "Protect your identity", and
 * protected-user sign-in/recovery flows. All inputs are validated here before
 * they reach Supabase.
 */

import { ipcMain, logger } from "@glaze/core/backend";

import { isSupabaseConfigured } from "../config/supabase.js";
import {
  confirmIdentityProtection,
  confirmSignIn,
  ensureIdentity,
  getIdentity,
  requestIdentityProtection,
  requestSignInCode,
  setDisplayName,
  signOutClean,
} from "../services/identity.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertEmail(value: unknown): string {
  if (typeof value !== "string" || value.length > 254 || !EMAIL_RE.test(value.trim())) {
    throw new Error("Please enter a valid email address");
  }
  return value.trim();
}

function assertCode(value: unknown): string {
  if (typeof value !== "string" || !/^\d{6,8}$/.test(value.trim())) {
    throw new Error("Enter the 6-digit code from your email");
  }
  return value.trim();
}

export function registerIdentityHandlers(): void {
  ipcMain.handle("folks:relay:status", async () => ({ configured: isSupabaseConfigured() }));

  ipcMain.handle("folks:identity:ensure", async () => await ensureIdentity());
  ipcMain.handle("folks:identity:get", async () => await getIdentity());

  ipcMain.handle("folks:identity:protect", async (_event, email: unknown) => {
    await requestIdentityProtection(assertEmail(email));
  });
  ipcMain.handle("folks:identity:confirmProtect", async (_event, email: unknown, token: unknown) => {
    return await confirmIdentityProtection(assertEmail(email), assertCode(token));
  });

  ipcMain.handle("folks:identity:requestSignIn", async (_event, email: unknown) => {
    await requestSignInCode(assertEmail(email));
  });
  ipcMain.handle("folks:identity:confirmSignIn", async (_event, email: unknown, token: unknown) => {
    return await confirmSignIn(assertEmail(email), assertCode(token));
  });

  ipcMain.handle("folks:identity:signOut", async (_event, communityId: unknown) => {
    const activeCommunityId = typeof communityId === "string" && UUID_RE.test(communityId) ? communityId : null;
    await signOutClean(activeCommunityId);
  });

  ipcMain.handle("folks:identity:setDisplayName", async (_event, name: unknown) => {
    if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 60) {
      throw new Error("Display name must be between 1 and 60 characters");
    }
    await setDisplayName(name.trim());
  });

  logger.info("handlers", "✓ Folks identity handlers registered");
}
