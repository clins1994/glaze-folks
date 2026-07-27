# Folks — Glaze Implementation Plan (v2, decisions locked)

## Context

Folks is a local-first macOS app (Glaze Awards submission) that turns private AI use into a path to human connection and trusted resource sharing. The vertical slice must prove ONE memorable loop across **two independently-installed copies (two real users)**:

> Private AI chat → choose Selective mode and share one approved signal → notice a real nearby presence (no transcript exposed) → mutual handshake → shared **text** session with Human-only / Quiet-notes / On-demand AI → one member requests a bounded task from another member's owner-controlled Hermes resource → deterministic policy allows/denies → transparent ledger entry (no money).

Source of truth: `folks-prd.md` + the four screenshots (in `.glaze/user-attachments/`). Visual direction is **settled**: one app rendered as **Living Orbit** (full-window immersive world), borrowing **Mission Control's inspector** for resource/policy/ledger detail and **Quiet Field's restraint** for private/onboarding states. Do not build three products or a card dashboard. This file supersedes the earlier draft (`warm-dancing-squirrel.md`); the only substantive change is the **Hermes resource connection** (now manual, not an AI-guided installer).

### Decisions locked with the user
1. **Transport — Supabase (hosted).** I choose the Auth/Realtime/DB/authorization design, subject to privacy. Design: **Supabase anonymous auth** (stable `auth.uid()` per install, session persisted locally), **Realtime** for presence/handshake/session/job events, **Postgres** tables with **Row-Level Security on every table**. Publishable anon key + project URL baked into the app; RLS is the actual protection. Backend holds the connection; renderer talks over IPC.
2. **Hermes — manual owner connection screen (no automated install).** Do **not** automate Hermes / LM Studio / local-model / home-server / Tailscale installation. Build a guided **resource-connection screen** where an owner can: enter an OpenAI-compatible **base URL + API key**; **test the connection**; **store the credential in Keychain** (`safeStorage`); **declare endpoint locality** (local / LAN / Tailscale / remote); and **expose it to the community only through the approved request policy**. The credential is **never** exposed to another member or the relay. The user will prepare one real OpenAI-compatible endpoint for the demo, so the **real `POST /v1/chat/completions` call is the demo path**. The beginner AI-guided setup assistant is explicitly **future vision, not P0** — P0 ships clear manual setup guidance, validation, and troubleshooting only.
3. **Voice — text-first.** No OpenAI Realtime / ElevenLabs / LiveKit or any paid voice dependency in the initial build. **Text completes the entire competition flow.** Preserve a clean voice-provider boundary in the capability contract for later; optionally evaluate native macOS speech recognition in a later phase.
- **Naming:** **North** = the personal companion (per screenshots). **Hermes** = the community-owned resource a member contributes.

---

## 1. Feasibility verdict

**Feasible with honest, in-app constraints:**

1. **External relay required.** Glaze exposes no hosted relay, realtime DB, sync, or account identity. All two-user features run through Supabase (outbound WSS/HTTPS from the Node backend, which *is* supported while the app is open).
2. **No background-while-quit.** No daemon runs when the app is fully quit → **"Owner must be online with Folks open"** is an explicit P0 constraint for Hermes requests. (A contributor can run headless via `activationPolicy: "accessory"` + login item, but the process must be alive.)
3. **No SDK speech-to-text, no embeddings API.** → Text-only conversation P0; matching uses coarse locally-derived topic tags, not vector similarity.
4. **Open-mode matching is coarse.** **Selective is the hero real path.** Open ships as real coarse-tag derivation if time allows, else labeled **Preview** — privacy is never weakened.
5. **Two-Mac E2E is manual.** Live inspection drives one instance; the two-user path is verified by the user across two Macs/accounts.

Nothing in the required loop is blocked.

---

## 2. Capability matrix

| Capability | Source | Implementation | Data leaving the Mac | Fallback |
|---|---|---|---|---|
| Identity | External (Supabase) | Anonymous auth → stable `auth.uid()`; session + signing key persisted locally | app user id, approved public profile fields | Local-only identity; no discovery |
| Real-time presence | External (Supabase Realtime) | Backend subscribes; matches by community + Selective signal overlap | anonymous presence id, availability, coarse signal category | Empty world honestly ("no matches") |
| Shared chat | External (Supabase) | `session_messages` table + realtime; TLS in transit | messages the user deliberately sends | Human-only still works; offline banner |
| Notifications | Glaze `@glaze/core/backend#Notification` | Incoming handshake / approval request | none | In-app badge |
| Glaze AI (North) | Glaze `@glaze/core/ai` | `streamText`/`generateText` via `glaze("fast"\|"smart")`; `useGlazeAI` in renderer | prompt → Glaze proxy (each user's own credits) | Human/community features fully work without AI |
| Speech | Unavailable in SDK | — | — | Text only (P1: BYO key / native STT eval) |
| Keychain | Glaze `@glaze/core/backend#safeStorage` | Hermes URL+key, identity signing key → encrypted `.bin` in `userData` | none | Feature disabled if encryption unavailable |
| **Hermes resource connection** | **Owner input + Node backend** | **Manual base URL + API key; test call; locality label; Keychain-stored cred; exposed only via policy** | **none — cred/URL never sent to relay or members** | **"Not configured" state** |
| Local Hermes call | Node backend (owner's app) | `POST /v1/chat/completions` to owner's endpoint (real demo path) | none to relay; owner→owner's endpoint only | Labeled local fixture **only** as degraded state (never the demo, never portrayed as real) |
| Cross-device job relay | External (Supabase) | Requester writes bounded job row → owner app (subscribed) executes → writes result | bounded job envelope + minimal ledger metadata | "Owner offline — resource unavailable" |

---

## 3. System architecture

**Glaze app modules** (all local unless noted):
- **Personal Companion (North)** — private streaming chat; drafts policies. `main/services/companion.ts`.
- **Community Relay Adapter** — the one network boundary; Supabase client + realtime subscriptions streamed to renderer over IPC. `main/services/relay.ts`.
- **Identity** — anonymous auth, persisted session, stable app id, public profile. `main/services/identity.ts`.
- **Presence & Matching** — publish/clear per mode; read matches. `main/services/presence.ts`.
- **Handshake Coordinator** — state machine, expiry, cooldown, rate limit, block. `main/services/handshake.ts`.
- **Shared Session** — messages, session AI mode, retention. `main/services/session.ts`.
- **Consent Policy Engine** — deterministic structured rules; AI only drafts, never enforces. `main/services/policy.ts`.
- **Resource Router** — register/connect resource, evaluate policy, request approval, call Hermes, write ledger. `main/services/resource-router.ts` + `main/services/hermes.ts`.
- **Contribution Ledger** — usage entries, no settlement. `main/services/ledger.ts`.
- **Secrets** — `safeStorage`. `main/services/secrets.ts`. **Local Persistence** — JSON in `userData`. `main/services/storage.ts`.
- **Capability Contract** — unified provider registry (extension boundary for future voice/image/local-model providers). `main/services/capabilities/contract.ts`.
- **World Renderer** — Living Orbit canvas + panels (renderer).

**Trust boundaries & secrets — local only:** Hermes URL/key, private transcripts, North memory, structured policy source, block list, full ledger detail. **Relay receives only:** app user id, approved profile fields, presence mode, coarse match representation, approved Selective signals, handshake state, shared-session messages, community membership, bounded resource-request envelope, minimal ledger metadata. **Never:** transcripts, memory, keys, or Hermes credentials.

**Transport & auth:** WSS/HTTPS to Supabase; anonymous JWT; RLS on every table so a user reads only their own rows, their handshakes, their sessions, and their communities' shared data. Membership/ownership server-verified via RLS policies — never trust client-supplied role claims.

**Handshake sequence:** A inserts handshake(state=outgoing) → realtime notifies B → B native notification → B updates state=connected → realtime notifies A → A inserts shared_session → B sees session opened.

**Permitted Hermes request:** Requester inserts `resource_request` (bounded job) → realtime notifies owner (must be online) → owner evaluates deterministic policy → if approval required, native notification → approve → owner calls `POST /v1/chat/completions` with Keychain cred to its local/Tailscale URL → owner writes result + ledger metadata (no secret, no URL) → realtime returns result to requester.

---

## 4. Privacy proof

- **Private:** nothing published — no presence row, heartbeat, signal, or semantic representation. User is undiscoverable.
- **Selective:** only user-approved signal text + coarse category + scope/expiry. Underlying conversation never sent.
- **Open (if shipped real):** ≤N coarse topic tags derived locally via Glaze AI, short TTL, deleted on Open→Private. No prompts/transcripts/responses/files/names/topic labels. Otherwise labeled **Preview**.
- **Hermes:** the owner's base URL + API key live only in Keychain and are used only by the owner's own backend. The relay and requester see only the bounded request, the result, and minimal ledger metadata — never the endpoint or credential.
- **Retention/deletion:** Open tags TTL'd; handshakes expire; session retention visible/configurable; request payloads deleted after completion unless policy permits; "Delete local data" wipes local store; logs never contain secrets or transcript text.
- **Why the relay/another user can't reconstruct a conversation:** the relay only receives explicitly-approved data (a Selective signal, a deliberately-sent message) or coarse TTL'd tags. Transcripts, prompts, memory, and keys are never transmitted.

---

## 5. Data model & state machines

**Supabase tables (RLS on all):** `users`, `communities`, `memberships`, `signals`, `presence`, `handshakes`, `shared_sessions`, `session_messages`, `resources`, `resource_requests`, `ledger_entries`. `resources` stores only **non-secret** metadata (display name, locality label, community, owner id, availability) — the URL/key never leave the owner's Keychain.
**Local-only (userData/Keychain):** private transcripts + North memory, structured policies + NL source, **Hermes base URL + API key**, block list, worldview/preferences, full ledger detail.

Entity fields follow the PRD (UserProfile, PresencePolicy, Signal, Presence, Handshake, SharedSession, Community, ResourceNode, ResourceRequest, LedgerEntry, Worldview).

**Handshake states:** `idle → outgoing/incoming → connected | nearby | deferred(cooldown) | declined | blocked | expired(timeout)`. No transcript ever auto-attached; optional reviewed intro; per-sender/recipient rate limits; decline/block need no reason; block survives restart.

**Resource request states:** `submitted → policy_evaluated → (auto_allowed | needs_approval → approved | denied | capped) → executing → completed | failed | canceled(revoked)`. Revocation blocks new work and cancels queued work when safe.

**Policy (deterministic JSON):** allowed communities/members/roles, allowed & disallowed tool categories, per-request token/duration/cost cap, per-member and community limits, availability hours, owner reserve, approval thresholds, allowed input data classes, result-retention flag, pause/revoke. AI may draft; owner reviews structured fields before activation; enforcement is pure code.

---

## 6. Screen & interaction map

- **Living Orbit (main):** full-window dark field (`#111315`), North as central sphere, real/Preview presences as planetary bodies, distance = relevance; top bar with Folks mark, Private/Selective/Open segmented control, Preview-world toggle, sound + settings; composer reachable without covering the world.
- **Private companion (North):** Quiet Field restraint; streaming text.
- **Presence inspector + handshake:** focused side panel/sheet — Connect now / Stay nearby / Not now / Decline; mute; block.
- **Shared session:** message thread + Human only / Quiet notes / On demand switch; recording/AI/retention indicators; leave/report/block.
- **Community resource & policy inspector (Mission Control):** resource card, structured policy fields, approval prompts, health/availability.
- **Contribution ledger:** contributor, requester, resource, times, usage, estimated cost + confidence, local-vs-paid, decision, outcome. No money.
- **Onboarding + Hermes resource-connection screen (manual, P0):** North-framed but manual. Fields: **base URL**, **API key**, **model** (optional), **locality** (local / LAN / Tailscale / remote); a **Test connection** button that makes a real minimal call and shows clear success/failure + troubleshooting hints; on success, store credential in **Keychain**, register non-secret resource metadata, and open the **policy** editor to expose it to the community. Copy makes clear the credential stays on this Mac.
- **Settings / privacy / permissions / degraded states:** privacy modes, delete-local-data, revoke, keys, and honest AI-denied / credits-exhausted / offline / resource-unavailable / owner-offline / disconnected / empty-world states.
- **Accessibility:** list view mirroring world state; reduced-motion honored; full keyboard nav.

Palette: near-black `#111315`, warm white `#F5F1E8`, mineral teal `#3AAFA1`, coral `#F26B5E`, saffron `#E5B94B`, moss `#789262`, cool gray `#A7ADB4`. Native sans for UI; restrained display face for brand only; no viewport-scaled fonts; zero letter-spacing. Sparse sound cues, master toggle, reduced-motion respected.

---

## 7. Phased build

**Window:** framed main window, `backgroundColor: "#111315"`, hidden/inset traffic lights with a custom draggable top bar, generous default (~1360×880) — finalize via `glaze-window-sizing`. Opaque cosmic canvas (no vibrancy/CSS blur). Canvas/SVG orbit with `requestAnimationFrame`, gated by `prefers-reduced-motion`.

- **Phase 0 — Spikes (riskiest first).** Supabase anonymous auth + realtime round-trip **between two installs from the Node backend** (confirm `@supabase/supabase-js` realtime works in the Glaze backend WS environment); Glaze AI streaming; `safeStorage` survives restart; a real `POST /v1/chat/completions` to a local endpoint. *Accept:* two installs exchange a realtime row; North streams; a secret survives restart; a live completion returns.
- **Phase 1 — Shell + world + local + North.** Living Orbit, local persistence, private streaming companion, privacy segmented control, Preview world, **capability contract** landed. *Accept:* private chat streams; Private mode emits nothing (verified); Preview clearly labeled.
- **Phase 2 — Identity, presence, handshake, shared text.** Anonymous identity + persisted session, Selective signal publish + preview, matching, handshake state machine + notifications, shared session + modes. *Accept:* two real users complete Selective→presence→handshake→shared text; Human-only works with AI denied. *Fallback:* Open→Preview.
- **Phase 3 — Community, Hermes connection, policy, ledger.** One community; **manual Hermes resource-connection screen** (URL/key/test/Keychain/locality); deterministic policy editor; resource router + **real Hermes call**; ledger. *Accept:* one permitted + one denied request behave correctly; credential stays in Keychain and never appears in relay rows or logs; ledger entry created without secrets. *Degraded states:* "owner offline," "not configured," labeled fixture (never the demo).
- **Phase 4 — Polish, a11y, Store assets, demo mode.** Reduced motion, keyboard nav, list view, degraded-state copy, 16:9 screenshots, Preview demo. *Accept:* full readiness gate passes.

Capability contract lands in Phase 1; both providers (Glaze-native text, community Hermes) implement it so voice/image/local-model providers slot in later without rewriting companion, router, policy, or ledger.

---

## 8. Test plan

- **Unit (deterministic):** policy engine (allow/deny/cap/approval, limits, hours, revoke); handshake transitions (legal, out-of-order, expiry, cooldown, block); resource-request transitions.
- **Two-Mac E2E (manual, user-run):** match+handshake+chat; connect a real Hermes endpoint + one permitted request; owner denies; credit exhaustion with chat continuing; Open→Private disappearance; block survives restart.
- **Privacy:** Private emits no rows/heartbeat; shared messages carry no private-chat transcript; relay rows and logs contain no Hermes URL/key/secrets.
- **AI:** permission-denied and `insufficient-credits`/`daily-limit-reached` handled per `GlazeAIError`; non-AI features keep working.
- **Secrets:** Hermes cred only in Keychain; absent from logs, relay rows, and `resources` metadata.
- **Accessibility:** reduced-motion, keyboard nav, list view mirrors world.

---

## 9. Competition delivery

- **60-sec demo:** private North chat → Selective "safe community AI" confirm → presence drifts closer → handshake accepted → Human-only then "bring North in on demand" → bounded Hermes task streams back from a real endpoint → ledger → brand card.
- **Screenshots:** 6, 16:9, matching PRD Store order; Living Orbit first.
- **Disclosure:** names the Supabase relay + exactly what it stores (ids, approved signals, handshake state, shared messages, bounded job envelopes, minimal ledger metadata); states each user spends their own Glaze credits; **Hermes credential stays in Keychain and is never transmitted**; Preview clearly labeled.

---

## Critical files

- `package.json` — add `@supabase/supabase-js` (pin a policy-compliant version if the latest is blocked by install age policy); declare `glaze.capabilities.ai` (`grades: ["fast","smart"]`, honest `purpose`, `mode: "optional"`).
- `main/index.ts` — window + lifecycle. `renderer/preload.ts` — expose app IPC + `Notification` wiring.
- `main/services/{relay,identity,presence,handshake,session,companion,policy,resource-router,hermes,ledger,secrets,storage}.ts` + `main/services/capabilities/contract.ts`.
- `main/handlers/*.ts` — IPC surface. Supabase schema + RLS: `main/db/schema.sql` (applied once to the Supabase project).
- `renderer/main/{home-view,router}.tsx`; `renderer/components/{orbit,companion,presence,session,resource,onboarding,settings}/*`.

Reuse Glaze SDK: `@glaze/core/ai` (`glaze`, `generateText`, `streamText`), `@glaze/core/hooks#useGlazeAI`, `@glaze/core/backend#{safeStorage,Notification,app}`, `BrowserWindow`. Invoke skills at build time: `glaze-ai`, `glaze-window-sizing`, `glaze-browser-window-recipes`, `glaze-component-patterns`, `glaze-external-api`, `glaze-data-storage`, `glaze-ipc-communication`, `glaze-theming`.

---

## Remaining blockers & external dependencies

1. **Supabase project must be provisioned before Phase 2 can run or be tested** (highest-priority external dependency). Needed from the user: create a free Supabase project and provide the **project URL** + **publishable (anon) key**; grant me the ability to apply `main/db/schema.sql` (tables + RLS) once (via the SQL editor or a provided service path). Until this exists, Phases 0–1 (local-only: world, North, persistence, capability contract) proceed fully; Phases 2–3 network features are blocked from real testing.
2. **Realtime-in-backend spike (Phase 0) is the top technical risk.** `@supabase/supabase-js` realtime uses WebSockets under Node; must confirm it runs in the Glaze backend runtime. Mitigation: if the SDK client misbehaves, fall back to a thin direct WSS + REST client against Supabase's realtime/REST endpoints. Not expected to block, but validated first.
3. **npm install-age policy** may block the newest `@supabase/supabase-js`. Mitigation: pin an older compliant version in `package.json` (never weaken the managed `.npmrc`).
4. **Real Hermes endpoint at demo time** — user-confirmed they will prepare one OpenAI-compatible endpoint; URL/key entered at runtime and stored in Keychain. No build blocker.
5. **Two-user flows verified manually** across two Macs/accounts (live inspection drives one instance only). No build blocker; affects verification only.
6. **Baking a publishable anon key into a distributed app** is acceptable because RLS is the real protection; called out in the submission disclosure.

---

## Verification (readiness gate)

Build succeeds with no unresolved Glaze errors; `npm run type-check && npm run lint` clean. Then confirm end-to-end (two Macs where noted):
1. Two real users complete Selective signal → presence → handshake → shared text.
2. Human-only chat works with Glaze AI denied.
3. Private mode shows no network leakage of conversation content.
4. One permitted and one denied Hermes request behave correctly against a real endpoint.
5. Hermes URL + key remain only in the owner's Keychain — absent from relay rows, `resources` metadata, and logs.
6. AI denial, exhausted credits, offline relay, owner offline, resource not configured, revocation, blocking, deletion all have functional states.
7. Reduced motion and keyboard navigation work; list view mirrors the world.
8. Preview presences unmistakably labeled; never mixed with live.
9. Store screenshots are 16:9 and tell the 60-second story.

---

## Honest limitations (stated in-app and in submission)

1. Requires the Supabase relay (free tier; publishable anon key baked in, RLS-protected).
2. Hermes requests require the **owner online with Folks open** (no background-while-quit).
3. **Text-only** conversation in P0; realtime voice is P1 (BYO key / native STT eval). Text completes the full flow.
4. **Selective** is the real hero matching path; **Open** ships real-coarse or labeled **Preview** — privacy never weakened.
5. No embeddings API → coarse tag matching, not vector similarity.
6. Hermes is connected **manually** (URL + key + test); the AI-guided beginner setup assistant is future vision, not P0.
