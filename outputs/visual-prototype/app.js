// PROTOTYPE: Three visual directions for semantic presence and the handshake flow.

const variants = {
  A: { name: "Living Orbit", description: "Immersive world-first composition" },
  B: { name: "Mission Control", description: "Conversation and operational clarity" },
  C: { name: "Quiet Field", description: "Calm, minimal, presence-first composition" }
};

const presences = [
  {
    id: "mina",
    name: "Mina",
    introduction: "Building a small, safer way for families to share local AI.",
    distance: 0.92,
    x: 67,
    y: 32,
    size: 58,
    tone: "teal",
    status: "Available now"
  },
  {
    id: "sol",
    name: "Sol",
    introduction: "Curious about community-owned tools and local-first software.",
    distance: 0.81,
    x: 78,
    y: 61,
    size: 42,
    tone: "saffron",
    status: "Open to a short conversation"
  },
  {
    id: "aya",
    name: "Aya",
    introduction: "Exploring translation as a bridge between neighborhood groups.",
    distance: 0.72,
    x: 49,
    y: 19,
    size: 34,
    tone: "coral",
    status: "Stay nearby"
  },
  {
    id: "noah",
    name: "Noah",
    introduction: "Maintains a shared Hermes agent for a group of friends.",
    distance: 0.63,
    x: 29,
    y: 28,
    size: 28,
    tone: "moss",
    status: "Available later"
  },
  {
    id: "ren",
    name: "Ren",
    introduction: "Learning how private agents can cooperate without sharing credentials.",
    distance: 0.55,
    x: 23,
    y: 67,
    size: 22,
    tone: "gray",
    status: "Quiet mode"
  }
];

const state = {
  variant: getVariant(),
  privacy: "selective",
  selectedPresenceId: null,
  handshake: "idle",
  connectedPresenceId: null,
  sessionMode: "human",
  soundEnabled: true,
  resourceState: "ready",
  messages: [
    {
      speaker: "ai",
      text: "Your conversation is private. I can help you think, or you can choose when another person may notice a shared direction."
    },
    {
      speaker: "user",
      text: "Let people interested in safe community AI notice me."
    },
    {
      speaker: "ai",
      text: "I made one selective signal. No transcript or prompt is visible."
    }
  ]
};

const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");

function getVariant() {
  const key = new URLSearchParams(window.location.search).get("variant")?.toUpperCase();
  return variants[key] ? key : "A";
}

function visiblePresences() {
  if (state.privacy === "private") return [];
  if (state.privacy === "selective") return presences.slice(0, 3);
  return presences;
}

function selectedPresence() {
  return presences.find((presence) => presence.id === state.selectedPresenceId) || null;
}

function connectedPresence() {
  return presences.find((presence) => presence.id === state.connectedPresenceId) || null;
}

function render() {
  const renderer = state.variant === "A" ? renderVariantA : state.variant === "B" ? renderVariantB : renderVariantC;
  app.innerHTML = `
    ${renderer()}
    ${renderPrototypeSwitcher()}
  `;
  bindEvents();
  drawStars();
  window.lucide?.createIcons({ attrs: { "stroke-width": 1.8 } });
}

function renderVariantA() {
  return `
    <section class="prototype-shell variant-a" aria-label="Living Orbit variant">
      ${renderTopBar("world")}
      <div class="immersive-world">
        <div class="world-caption">
          <span class="eyebrow">Selective signal</span>
          <strong>Safe community AI</strong>
          <span>Only this approved direction is discoverable</span>
        </div>
        ${renderOrbitLines()}
        ${renderSelfCore("large")}
        ${renderPresenceField("immersive")}
        <aside class="conversation-rail" aria-label="Private AI conversation">
          <div class="rail-heading">
            <span class="presence-dot online"></span>
            <div>
              <strong>North</strong>
              <span>Your private AI</span>
            </div>
            <button class="icon-button" type="button" title="Conversation settings" aria-label="Conversation settings" data-action="noop">
              <i data-lucide="sliders-horizontal"></i>
            </button>
          </div>
          ${renderMessages(3)}
          ${renderComposer("Ask North or change a policy")}
        </aside>
        ${renderInspector()}
        ${renderConnectedSession()}
        ${renderStateStrip()}
      </div>
    </section>
  `;
}

function renderVariantB() {
  return `
    <section class="prototype-shell variant-b" aria-label="Mission Control variant">
      ${renderTopBar("split")}
      <div class="control-layout">
        <section class="control-conversation" aria-label="Conversation">
          <div class="section-kicker">Private companion</div>
          <h1>Think here first.</h1>
          <p class="section-copy">North keeps your conversation local to this space until you choose otherwise.</p>
          <div class="message-stack tall">${renderMessages(4, false)}</div>
          ${renderComposer("Talk to North")}
        </section>
        <section class="control-map" aria-label="Semantic presence map">
          <header class="map-header">
            <div>
              <span class="eyebrow">Resonance field</span>
              <strong>${visiblePresences().length} nearby presences</strong>
            </div>
            <span class="preview-label">Preview world</span>
          </header>
          <div class="map-stage">
            ${renderOrbitLines()}
            ${renderSelfCore("medium")}
            ${renderPresenceField("control")}
          </div>
          ${renderStateStrip()}
        </section>
        <aside class="control-inspector" aria-label="Presence details">
          ${renderInspector(true)}
          ${renderResourceModule()}
        </aside>
      </div>
      ${renderConnectedSession()}
    </section>
  `;
}

function renderVariantC() {
  return `
    <section class="prototype-shell variant-c" aria-label="Quiet Field variant">
      <header class="quiet-header">
        <div class="brand-lockup">
          <span class="brand-mark"><span></span><span></span></span>
          <div><strong>Folks</strong><span>Quiet Field</span></div>
        </div>
        ${renderPrivacyControl()}
        <div class="quiet-actions">
          <span class="preview-label">Preview world</span>
          ${renderSoundButton()}
        </div>
      </header>
      <div class="quiet-stage">
        <div class="quiet-thought">
          <span class="eyebrow">North is listening privately</span>
          <p>“I want people to use AI together without giving away the keys.”</p>
        </div>
        <div class="horizon" aria-hidden="true"></div>
        ${renderSelfCore("quiet")}
        ${renderPresenceField("quiet")}
        <div class="quiet-prompt">
          <span>${visiblePresences().length ? "A few people are moving in a similar direction." : "You are completely private."}</span>
          <strong>${state.selectedPresenceId ? "You reached toward someone nearby." : "Stay with your thought, or reach outward when it feels right."}</strong>
        </div>
        ${renderInspector()}
        ${renderConnectedSession()}
        <div class="quiet-composer-wrap">${renderComposer("Speak to North")}</div>
        ${renderStateStrip()}
      </div>
    </section>
  `;
}

function renderTopBar(layout) {
  return `
    <header class="topbar ${layout}">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true"><span></span><span></span></span>
        <div>
          <strong>Folks</strong>
          <span>${variants[state.variant].name}</span>
        </div>
      </div>
      ${renderPrivacyControl()}
      <div class="topbar-actions">
        <span class="preview-label">Preview world</span>
        ${renderSoundButton()}
        <button class="icon-button" type="button" title="Settings" aria-label="Settings">
          <i data-lucide="settings"></i>
        </button>
      </div>
    </header>
  `;
}

function renderPrivacyControl() {
  const modes = [
    ["private", "Private", "lock-keyhole"],
    ["selective", "Selective", "scan-search"],
    ["open", "Open", "radio"]
  ];
  return `
    <div class="privacy-control" role="group" aria-label="Discoverability mode">
      ${modes
        .map(
          ([value, label, icon]) => `
            <button type="button" class="${state.privacy === value ? "active" : ""}" data-action="privacy" data-value="${value}" aria-pressed="${state.privacy === value}">
              <i data-lucide="${icon}"></i>
              <span>${label}</span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderSoundButton() {
  return `
    <button class="icon-button" type="button" title="${state.soundEnabled ? "Mute presence sounds" : "Enable presence sounds"}" aria-label="${state.soundEnabled ? "Mute presence sounds" : "Enable presence sounds"}" data-action="sound">
      <i data-lucide="${state.soundEnabled ? "volume-2" : "volume-x"}"></i>
    </button>
  `;
}

function renderSelfCore(size) {
  const status = state.privacy === "private" ? "Private" : state.privacy === "selective" ? "One signal shared" : "Anonymous presence open";
  return `
    <button class="self-core ${size}" type="button" title="Your private AI: North" aria-label="Your private AI North. ${status}" data-action="self">
      <span class="self-halo" aria-hidden="true"></span>
      <span class="self-surface" aria-hidden="true"></span>
      <span class="self-label"><strong>North</strong><small>${status}</small></span>
    </button>
  `;
}

function renderPresenceField(context) {
  const people = visiblePresences();
  if (!people.length) {
    return `
      <div class="empty-presence ${context}">
        <i data-lucide="lock-keyhole"></i>
        <strong>No one can notice you</strong>
        <span>Your conversation remains completely private.</span>
      </div>
    `;
  }
  return `
    <div class="presence-field ${context}" aria-label="Nearby presences">
      ${people
        .map((presence, index) => {
          const selected = presence.id === state.selectedPresenceId;
          const connected = presence.id === state.connectedPresenceId;
          return `
            <button
              class="presence-body tone-${presence.tone} ${selected ? "selected" : ""} ${connected ? "connected" : ""}"
              type="button"
              style="--x:${presence.x}%; --y:${presence.y}%; --size:${presence.size}px; --delay:${index * -1.7}s"
              data-presence="${presence.id}"
              aria-label="Anonymous nearby presence. ${Math.round(presence.distance * 100)} percent resonance."
              title="Nearby presence"
            >
              <span class="planet-surface" aria-hidden="true"></span>
              <span class="proximity-wave" aria-hidden="true"></span>
              ${connected ? '<span class="connection-badge"><i data-lucide="link-2"></i></span>' : ""}
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderOrbitLines() {
  if (state.privacy === "private") return "";
  return `
    <div class="orbit-lines" aria-hidden="true">
      <span class="orbit orbit-one"></span>
      <span class="orbit orbit-two"></span>
      <span class="orbit orbit-three"></span>
    </div>
  `;
}

function renderMessages(limit = 3, includeStack = true) {
  const messages = state.messages.slice(-limit);
  const content = messages
    .map(
      (message) => `
        <article class="message ${message.speaker}">
          <span class="message-author">${message.speaker === "ai" ? "North" : "You"}</span>
          <p>${escapeHtml(message.text)}</p>
        </article>
      `
    )
    .join("");
  return includeStack ? `<div class="message-stack">${content}</div>` : content;
}

function renderComposer(placeholder) {
  return `
    <form class="composer" data-form="composer">
      <button class="icon-button composer-tool" type="button" title="Attach context" aria-label="Attach context">
        <i data-lucide="plus"></i>
      </button>
      <input name="message" autocomplete="off" placeholder="${placeholder}" aria-label="${placeholder}" />
      <button class="icon-button" type="button" title="Speak" aria-label="Speak">
        <i data-lucide="mic"></i>
      </button>
      <button class="send-button" type="submit" title="Send" aria-label="Send message">
        <i data-lucide="arrow-up"></i>
      </button>
    </form>
  `;
}

function renderInspector(inline = false) {
  const person = selectedPresence();
  const className = inline ? "inspector inline" : "inspector";
  if (!person) {
    return `
      <aside class="${className} empty" aria-label="No presence selected">
        <div class="inspector-symbol"><i data-lucide="mouse-pointer-2"></i></div>
        <strong>Notice someone nearby</strong>
        <p>Select a presence to see only what they chose to share.</p>
      </aside>
    `;
  }

  const isConnected = state.connectedPresenceId === person.id;
  return `
    <aside class="${className} active" aria-label="Selected presence">
      <div class="profile-heading">
        <span class="profile-planet tone-${person.tone}"></span>
        <div>
          <span class="eyebrow">${isConnected ? "Connected" : "Nearby presence"}</span>
          <strong>${isConnected ? person.name : "Someone nearby"}</strong>
        </div>
        <button class="icon-button" type="button" title="Close" aria-label="Close presence details" data-action="close-inspector">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="resonance-meter">
        <span style="width:${Math.round(person.distance * 100)}%"></span>
      </div>
      <p class="profile-intro">${isConnected || state.handshake === "incoming" ? person.introduction : "Their exact topic and private conversation remain hidden."}</p>
      <div class="profile-meta">
        <span><i data-lucide="languages"></i> Translation available</span>
        <span><i data-lucide="clock-3"></i> ${person.status}</span>
      </div>
      ${renderHandshakeActions(person, isConnected)}
    </aside>
  `;
}

function renderHandshakeActions(person, isConnected) {
  if (isConnected) {
    return `
      <div class="inspector-actions">
        <button class="primary-command" type="button" data-action="open-session"><i data-lucide="messages-square"></i> Open shared session</button>
        <button class="secondary-command" type="button" data-action="disconnect"><i data-lucide="unlink"></i> Leave orbit</button>
      </div>
    `;
  }
  if (state.handshake === "outgoing") {
    return `
      <div class="handshake-waiting">
        <span class="waiting-pulse"></span>
        <div><strong>Handshake sent</strong><small>${person.name} can connect, stay nearby, defer, or decline.</small></div>
      </div>
      <button class="secondary-command full" type="button" data-action="simulate-incoming">Preview their response</button>
    `;
  }
  if (state.handshake === "incoming") {
    return `
      <div class="handshake-copy">
        <span class="eyebrow">Introduction</span>
        <p>“I’m exploring the same direction. I’d be glad to compare notes without sharing our private AI histories.”</p>
      </div>
      <div class="response-grid">
        <button type="button" class="primary-command" data-handshake="connect"><i data-lucide="message-circle"></i> Connect now</button>
        <button type="button" class="secondary-command" data-handshake="nearby"><i data-lucide="orbit"></i> Stay nearby</button>
        <button type="button" class="secondary-command" data-handshake="later"><i data-lucide="clock-3"></i> Not now</button>
        <button type="button" class="quiet-command" data-handshake="decline">Decline</button>
      </div>
    `;
  }
  return `
    <div class="inspector-actions">
      <button class="primary-command" type="button" data-action="send-handshake"><i data-lucide="hand"></i> Send handshake</button>
      <button class="secondary-command" type="button" data-action="stay-nearby"><i data-lucide="orbit"></i> Stay nearby</button>
    </div>
  `;
}

function renderConnectedSession() {
  const person = connectedPresence();
  if (!person) return "";
  return `
    <section class="session-drawer" aria-label="Shared session with ${person.name}">
      <header>
        <div class="session-people">
          <span class="mini-avatar you">You</span>
          <span class="session-link" aria-hidden="true"></span>
          <span class="mini-avatar tone-${person.tone}">${person.name.slice(0, 1)}</span>
          <div><strong>You and ${person.name}</strong><small>Shared session</small></div>
        </div>
        <button class="icon-button" type="button" title="Close shared session" aria-label="Close shared session" data-action="close-session"><i data-lucide="x"></i></button>
      </header>
      <div class="session-mode-control" role="group" aria-label="AI participation mode">
        ${[
          ["human", "Human only", "users"],
          ["notes", "Quiet notes", "notebook-pen"],
          ["demand", "On demand", "sparkles"]
        ]
          .map(
            ([value, label, icon]) => `
              <button type="button" class="${state.sessionMode === value ? "active" : ""}" data-action="session-mode" data-value="${value}" aria-pressed="${state.sessionMode === value}">
                <i data-lucide="${icon}"></i><span>${label}</span>
              </button>
            `
          )
          .join("")}
      </div>
      <div class="session-body">
        <div class="session-message"><span>${person.name}</span><p>Nice to meet you. I think our communities are solving adjacent parts of the same problem.</p></div>
        ${state.sessionMode === "notes" ? '<div class="consent-banner"><i data-lucide="shield-check"></i><span>Waiting for both people to consent before notes begin.</span></div>' : ""}
        ${state.sessionMode === "demand" ? '<div class="consent-banner ready"><i data-lucide="sparkles"></i><span>North is available when named. No private memory is shared.</span></div>' : ""}
      </div>
      <div class="session-footer">
        <button class="secondary-command" type="button" data-action="resource-request"><i data-lucide="server-cog"></i> Request shared Hermes</button>
        <span class="resource-status ${state.resourceState}">${resourceStatusCopy()}</span>
      </div>
    </section>
  `;
}

function renderResourceModule() {
  return `
    <section class="resource-module" aria-label="Community resource">
      <div class="module-heading">
        <div><span class="eyebrow">Community resource</span><strong>Noah's Hermes</strong></div>
        <span class="resource-light ${state.resourceState}"></span>
      </div>
      <p>OpenAI-compatible agent endpoint. Credential stays on Noah's Mac.</p>
      <dl>
        <div><dt>Policy</dt><dd>Research only</dd></div>
        <div><dt>Approval</dt><dd>Above 10 min</dd></div>
        <div><dt>Cost</dt><dd>Local compute</dd></div>
      </dl>
    </section>
  `;
}

function renderStateStrip() {
  return `
    <div class="state-strip" aria-label="Prototype state">
      <span><i data-lucide="${state.privacy === "private" ? "lock-keyhole" : state.privacy === "selective" ? "scan-search" : "radio"}"></i> ${capitalize(state.privacy)}</span>
      <span>Presence ${visiblePresences().length}</span>
      <span>Handshake ${capitalize(state.handshake)}</span>
      <span>Session ${state.connectedPresenceId ? capitalize(state.sessionMode) : "None"}</span>
    </div>
  `;
}

function renderPrototypeSwitcher() {
  const keys = Object.keys(variants);
  const index = keys.indexOf(state.variant);
  const previous = keys[(index - 1 + keys.length) % keys.length];
  const next = keys[(index + 1) % keys.length];
  return `
    <nav class="prototype-switcher" aria-label="Prototype variants">
      <button type="button" aria-label="Previous variant" title="Previous variant" data-variant="${previous}"><i data-lucide="arrow-left"></i></button>
      <div><small>Throwaway prototype</small><strong>${state.variant} - ${variants[state.variant].name}</strong></div>
      <button type="button" aria-label="Next variant" title="Next variant" data-variant="${next}"><i data-lucide="arrow-right"></i></button>
    </nav>
  `;
}

function bindEvents() {
  app.querySelectorAll("[data-variant]").forEach((button) => {
    button.addEventListener("click", () => setVariant(button.dataset.variant));
  });
  app.querySelectorAll("[data-action='privacy']").forEach((button) => {
    button.addEventListener("click", () => {
      state.privacy = button.dataset.value;
      state.selectedPresenceId = null;
      state.handshake = "idle";
      if (state.privacy === "private") {
        state.connectedPresenceId = null;
        toast("Private mode enabled. No discoverability signal is active.");
      } else if (state.privacy === "selective") {
        toast("One approved signal is discoverable. Your transcript remains private.");
      } else {
        toast("Anonymous presence is open. Your transcript remains private.");
      }
      playCue(310);
      render();
    });
  });
  app.querySelectorAll("[data-presence]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedPresenceId = button.dataset.presence;
      if (state.handshake !== "outgoing" && state.handshake !== "incoming") state.handshake = "idle";
      playCue(430);
      render();
    });
  });
  app.querySelectorAll("[data-form='composer']").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = new FormData(form).get("message")?.trim();
      if (!input) return;
      state.messages.push({ speaker: "user", text: input });
      state.messages.push({
        speaker: "ai",
        text: state.privacy === "private"
          ? "I will keep this completely private."
          : "I can help with that. Your current discoverability policy has not changed."
      });
      toast("North responded without changing your sharing policy.");
      render();
    });
  });
  app.querySelectorAll("[data-action='sound']").forEach((button) => {
    button.addEventListener("click", () => {
      state.soundEnabled = !state.soundEnabled;
      if (state.soundEnabled) playCue(520);
      render();
    });
  });
  app.querySelectorAll("[data-action='close-inspector']").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedPresenceId = null;
      state.handshake = "idle";
      render();
    });
  });
  app.querySelectorAll("[data-action='send-handshake']").forEach((button) => {
    button.addEventListener("click", () => {
      state.handshake = "outgoing";
      toast("Handshake sent. No private conversation was included.");
      playCue(560);
      render();
    });
  });
  app.querySelectorAll("[data-action='simulate-incoming']").forEach((button) => {
    button.addEventListener("click", () => {
      state.handshake = "incoming";
      toast("Previewing the recipient's consent choices.");
      playCue(620);
      render();
    });
  });
  app.querySelectorAll("[data-action='stay-nearby']").forEach((button) => {
    button.addEventListener("click", () => {
      state.handshake = "nearby";
      toast("This presence will remain nearby without opening a conversation.");
      render();
    });
  });
  app.querySelectorAll("[data-handshake]").forEach((button) => {
    button.addEventListener("click", () => resolveHandshake(button.dataset.handshake));
  });
  app.querySelectorAll("[data-action='open-session']").forEach((button) => {
    button.addEventListener("click", () => {
      toast(`Shared session with ${connectedPresence()?.name} is open.`);
      render();
    });
  });
  app.querySelectorAll("[data-action='disconnect']").forEach((button) => {
    button.addEventListener("click", disconnect);
  });
  app.querySelectorAll("[data-action='close-session']").forEach((button) => {
    button.addEventListener("click", disconnect);
  });
  app.querySelectorAll("[data-action='session-mode']").forEach((button) => {
    button.addEventListener("click", () => {
      state.sessionMode = button.dataset.value;
      const copy = state.sessionMode === "human"
        ? "Human-only mode. No AI is listening or taking notes."
        : state.sessionMode === "notes"
          ? "Quiet notes requested. Both people must consent."
          : "North is available on demand and will not share private memory.";
      toast(copy);
      render();
    });
  });
  app.querySelectorAll("[data-action='resource-request']").forEach((button) => {
    button.addEventListener("click", () => {
      state.resourceState = "working";
      toast("Request sent under Noah's policy. The endpoint credential stays on Noah's Mac.");
      playCue(470);
      render();
      window.setTimeout(() => {
        state.resourceState = "complete";
        toast("Hermes completed the request. One local-compute ledger entry was added.");
        playCue(680);
        render();
      }, 1200);
    });
  });
}

function resolveHandshake(outcome) {
  const person = selectedPresence();
  if (!person) return;
  if (outcome === "connect") {
    state.handshake = "connected";
    state.connectedPresenceId = person.id;
    toast(`You and ${person.name} entered a shared orbit. AI is off by default.`);
    playCue(700);
  } else if (outcome === "nearby") {
    state.handshake = "nearby";
    toast(`${person.name} will remain nearby. No conversation opened.`);
  } else if (outcome === "later") {
    state.handshake = "deferred";
    toast("Not now was sent without exposing a reason.");
  } else {
    state.handshake = "declined";
    state.selectedPresenceId = null;
    toast("The handshake ended. No reason was shared.");
  }
  render();
}

function disconnect() {
  state.connectedPresenceId = null;
  state.handshake = "nearby";
  state.sessionMode = "human";
  state.resourceState = "ready";
  toast("The shared session ended. The connection remains nearby.");
  render();
}

function setVariant(key) {
  state.variant = key;
  const url = new URL(window.location.href);
  url.searchParams.set("variant", key);
  window.history.replaceState({}, "", url);
  render();
}

function toast(message) {
  toastRegion.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;
  window.clearTimeout(toastRegion._timer);
  toastRegion._timer = window.setTimeout(() => {
    toastRegion.innerHTML = "";
  }, 3200);
}

function resourceStatusCopy() {
  if (state.resourceState === "working") return "Hermes is working...";
  if (state.resourceState === "complete") return "Completed - local compute";
  return "No request in progress";
}

function playCue(frequency) {
  if (!state.soundEnabled) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.3);
  } catch {
    // Sound is an optional prototype detail.
  }
}

function drawStars() {
  const canvas = document.querySelector("#starfield");
  const context = canvas.getContext("2d");
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);

  const count = Math.min(210, Math.round((width * height) / 7200));
  for (let index = 0; index < count; index += 1) {
    const seed = (index * 9301 + 49297) % 233280;
    const x = (seed / 233280) * width;
    const y = (((seed * 37) % 233280) / 233280) * height;
    const size = index % 17 === 0 ? 1.4 : index % 5 === 0 ? 0.8 : 0.45;
    const alpha = index % 13 === 0 ? 0.65 : 0.2 + ((seed % 50) / 250);
    context.beginPath();
    context.fillStyle = `rgba(245, 241, 232, ${alpha})`;
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
  }
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.addEventListener("resize", drawStars);
window.addEventListener("keydown", (event) => {
  const tag = document.activeElement?.tagName;
  if (["INPUT", "TEXTAREA"].includes(tag) || document.activeElement?.isContentEditable) return;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const keys = Object.keys(variants);
  const current = keys.indexOf(state.variant);
  const direction = event.key === "ArrowRight" ? 1 : -1;
  setVariant(keys[(current + direction + keys.length) % keys.length]);
});
window.addEventListener("popstate", () => {
  state.variant = getVariant();
  render();
});

render();
