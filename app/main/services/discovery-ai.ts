/**
 * Private topic extraction — the ONLY AI in Folks.
 *
 * One Glaze AI generation per meaningful user turn returns BOTH the assistant
 * reply AND the current active topics (canonical English keys + labels). The
 * transcript is passed in memory for this single call and is NEVER persisted or
 * sent to Supabase — only the derived labels/keys leave this process (via
 * `discovery.ts` → `sync_discovery`). See PRIVACY in the product spec.
 */

import { generateObject, glaze, GlazeAIError, z } from "@glaze/core/ai";
import { acquireAppAiToken, AppAiTokenError } from "@glaze/core/backend";

/** A single conversation turn, held in renderer memory and passed per request. */
export interface TurnMessage {
  role: "user" | "assistant";
  content: string;
}

/** One derived topic: a display label + canonical English keys + confidence. */
export interface DerivedTopic {
  label: string;
  keys: string[];
  confidence: number;
}

export type TurnResult =
  | { ok: true; reply: string; topics: DerivedTopic[] }
  | { ok: false; blocked: string };

/** Cap the in-memory history we send so a long chat can't balloon a request. */
const MAX_HISTORY = 12;
// A turn MUST always settle — never leave the UI stuck on "Thinking…". If a
// generation (or a hung token mint that never rejects) exceeds this, the attempt
// returns a `timeout` block. Generous enough not to cut off a real "fast" reply.
const TURN_TIMEOUT_MS = 20_000;
// Bounded wait while re-requesting a token / host consent during recovery.
const TOKEN_RECOVERY_TIMEOUT_MS = 20_000;
// Blocked states one automatic retry can plausibly clear once a token is issued.
// `timeout` is included because the observed failure mode is a hung token mint:
// the original mint floats an unhandled rejection while a `tokenReady` arrives a
// few seconds later — so by retry time a fresh token is usually already on disk.
// Others (credits, subscription, daily limit, signed out, disabled) won't be
// fixed by re-minting, so we surface them immediately.
const RECOVERABLE = new Set(["host-unavailable", "needs-consent", "timeout"]);

const TIMEOUT = Symbol("turn-timeout");

/** Race a promise against a timeout without leaving the timer dangling. */
async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Map any generation failure to a renderer blocked-state string, or null if it's
 * a truly-unexpected error (which the caller rethrows). Handles BOTH the AI SDK's
 * GlazeAIError and the backend AppAiTokenError (token mint / host control-flow),
 * so a token-mint failure can never fall through as an unhandled rejection.
 */
function classifyBlocked(error: unknown): string | null {
  if (error instanceof GlazeAIError) return error.state;
  if (error instanceof AppAiTokenError) {
    // reason: "host-unavailable" | "denied" | "needs-subscription" | "signed-out"
    return error.reason === "denied" ? "needs-consent" : error.reason;
  }
  // Some token-mint failures surface as plain Errors ("mint-failed", etc.).
  if (error instanceof Error && /\b(mint|token|consent|host)\b/i.test(error.message)) {
    return "host-unavailable";
  }
  return null;
}

function mapTopics(rawTopics: Array<{ label?: string; keys?: string[]; confidence?: number }>): DerivedTopic[] {
  return rawTopics
    .map((t) => ({
      label: (t.label ?? "").trim(),
      keys: (t.keys ?? [])
        .map((k: string) => k.trim().toLowerCase())
        .filter((k: string) => k.length > 0)
        .slice(0, 3),
      confidence: Math.max(0, Math.min(1, t.confidence ?? 0)),
    }))
    .filter((t) => t.label.length > 0 && t.keys.length > 0)
    .slice(0, 3);
}

/**
 * One bounded generation attempt. Known blocked states (AI-SDK or token) are
 * RETURNED as a blocked TurnResult, never thrown; a timeout returns `timeout`.
 * Only a genuinely-unexpected error escapes (rethrown to the caller).
 */
async function generateOnce(messages: Array<{ role: "user" | "assistant"; content: string }>): Promise<TurnResult> {
  const controller = new AbortController();
  let outcome: TurnResult | typeof TIMEOUT;
  try {
    outcome = await withTimeout(
      (async (): Promise<TurnResult> => {
        const { object } = await generateObject({
          model: glaze("fast"),
          schema: TopicSchema,
          system: SYSTEM,
          messages,
          abortSignal: controller.signal,
        });
        return { ok: true, reply: object.reply ?? "", topics: mapTopics(object.topics ?? []) };
      })(),
      TURN_TIMEOUT_MS,
    );
  } catch (error) {
    const blocked = classifyBlocked(error);
    if (blocked) return { ok: false, blocked };
    throw error;
  }
  if (outcome === TIMEOUT) {
    controller.abort(); // stop spending on a generation we've abandoned
    return { ok: false, blocked: "timeout" };
  }
  return outcome;
}

const TopicSchema = z.object({
  reply: z
    .string()
    .describe("A warm, concise plain-text reply. Never include Markdown or formatting markers."),
  topics: z
    .array(
      z.object({
        label: z
          .string()
          .describe("A specific 2–5 word English topic the user is currently discussing."),
        keys: z
          .array(z.string())
          .describe("1–3 canonical, lowercase, hyphenated English keys for this topic."),
        confidence: z.number().min(0).max(1),
      }),
    )
    .describe("1–3 current topics. Empty only if the message carries no discussable subject."),
});

const SYSTEM = [
  "You are the private companion inside Folks. You talk with one person about whatever is on their mind — be warm, concise, curious, and genuinely helpful.",
  "Reply in concise plain text only. Never use Markdown, headings, bullets, numbered lists, asterisks, or other formatting markers. Use short paragraphs when structure helps.",
  "The person's messages are private: their transcript is never stored or shared.",
  "In addition to replying, privately derive the CURRENT topics the person is actively discussing, so Folks can quietly look for another person discussing something similar.",
  "Rules for topics:",
  "- Return 1 to 3 topics, each a SPECIFIC two-to-five word English phrase (e.g. 'Japanese grammar', 'sourdough baking', 'training for a marathon'). Prefer specificity.",
  "- 'keys' are canonical, lowercase, hyphenated English slugs for the topic (e.g. 'japanese-grammar', 'japanese-honorifics'). Always English, even if the person writes in another language.",
  "- Track the CURRENT subject using recent context; when the conversation moves on, return the new topic, not old ones.",
  "- Do NOT emit generic topics on their own ('work', 'life', 'chat', 'programming').",
  "- NEVER emit identifying details, names, locations, or sensitive topics: health, sexuality, religion, politics, finances, personal crises, or precise location. If the message is only about those, return an empty topics array and still reply kindly.",
].join("\n");

/**
 * Run one companion turn: reply + derived topics. `history` is the recent
 * in-memory conversation (already including the user's latest message as the
 * final entry).
 *
 * This ALWAYS settles quickly: every attempt is timeout-bounded, and blocked AI
 * states (including token-mint / host control-flow failures) are returned, not
 * thrown, so the renderer can clear its thinking state, show a per-state message,
 * and offer a working Try again. If the first attempt is blocked by a recoverable
 * token/host issue, we ask the host for a fresh token once (which drives consent /
 * a mint) and — if that succeeds (i.e. a token was issued / tokenReady fired) —
 * retry the turn exactly once. It never hangs waiting on a mint that failed.
 */
export async function runTurn(history: TurnMessage[]): Promise<TurnResult> {
  const messages = history
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content }));

  let result = await generateOnce(messages);

  if (!result.ok && RECOVERABLE.has(result.blocked)) {
    // After a timeout, a token may already have been issued (tokenReady) while the
    // hung mint floated its rejection — so just pick up whatever token is ready.
    // After a clean host/consent block, actively re-request consent + a fresh mint.
    const acquireOpts =
      result.blocked === "timeout" ? {} : { forceRefresh: true, reconsent: true };
    // Bounded wait. Resolving true means a usable token is available (issued /
    // consent granted / already on disk); then retry the turn exactly ONCE.
    const minted = await withTimeout(
      acquireAppAiToken(acquireOpts)
        .then(() => true)
        .catch(() => false),
      TOKEN_RECOVERY_TIMEOUT_MS,
    );
    if (minted === true) {
      result = await generateOnce(messages);
    }
  }

  return result;
}
