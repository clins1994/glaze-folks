# Folks Visual Prototype

## Question

What should semantic presence, privacy modes, and the mutual handshake feel like before the functional Glaze app is built?

## Assumption

This is the UI branch of a throwaway prototype. It does not implement identity, networking, Glaze AI, semantic matching, or Hermes routing. All people are clearly part of a Preview world.

## Run

```bash
npm run prototype
```

Open `http://127.0.0.1:4173/?variant=A`.

Variants:

- `?variant=A`: Living Orbit, an immersive world-first composition.
- `?variant=B`: Mission Control, a denser conversation and operations composition.
- `?variant=C`: Quiet Field, a calm presence-first composition.

Use the bottom switcher or the left and right arrow keys to move between variants. The query parameter is reload-stable.

## Prototype Interactions

- Switch among Private, Selective, and Open.
- Select a nearby presence.
- Send a handshake.
- Preview the recipient response.
- Connect now, stay nearby, defer, or decline.
- Change a connected session among Human only, Quiet notes, and On demand.
- Request the sample Hermes resource and watch the owner-policy story complete.
- Type in the companion composer.
- Toggle gentle sound cues.

## Design Recommendation

Use **A: Living Orbit** as the product's primary experience. It makes semantic presence and mutual connection feel like the product itself rather than a layer added to a chat client.

Borrow the resource and policy inspector from **B: Mission Control** when the user opens a community resource. Borrow the emotional restraint and generous private space from **C: Quiet Field** for onboarding and focused companion conversation. These should become states within one coherent app, not three navigation destinations.

Keep all variants until Glaze has reproduced and validated the combined direction; they remain useful visual references.

## Validation

The prototype was exercised at 1440 x 900 and a compact 760-pixel layout. All three variants passed:

- no console or page errors;
- no horizontal overflow;
- no important controls outside the viewport;
- nonblank animated canvas;
- three visible sample presences in Selective mode.

The end-to-end simulated interaction also passed:

1. Select Mina.
2. Send a handshake.
3. Preview Mina's acceptance.
4. Connect.
5. Switch to AI on demand.
6. Request the shared Hermes resource.
7. Confirm a completed local-compute ledger state.
