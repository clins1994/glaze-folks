const { mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { chromium } = require("playwright");

const baseUrl = "http://127.0.0.1:4173";
const screenshotDir = join(
  __dirname,
  "..",
  "outputs",
  "visual-prototype",
  "screenshots"
);

mkdirSync(screenshotDir, { recursive: true });

async function inspectPage(page, variant, viewportName) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  await page.goto(`${baseUrl}/?variant=${variant}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".prototype-switcher");

  const result = await page.evaluate(() => {
    const canvas = document.querySelector("#starfield");
    const context = canvas.getContext("2d");
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let litPixels = 0;
    for (let index = 3; index < pixels.length; index += 1600) {
      if (pixels[index] > 0) litPixels += 1;
    }

    const root = document.querySelector(".prototype-shell");
    const rootRect = root.getBoundingClientRect();
    const important = [
      ".brand-lockup",
      ".privacy-control",
      ".prototype-switcher",
      ".self-core",
      ".composer"
    ];
    const outside = important.flatMap((selector) =>
      [...document.querySelectorAll(selector)]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.right < 0 || rect.left > window.innerWidth || rect.bottom < 0 || rect.top > window.innerHeight;
        })
        .map(() => selector)
    );

    return {
      litPixels,
      outside,
      presenceCount: document.querySelectorAll(".presence-body").length,
      width: rootRect.width,
      height: rootRect.height,
      bodyOverflowX: document.documentElement.scrollWidth - window.innerWidth
    };
  });

  await page.screenshot({
    path: join(screenshotDir, `${variant.toLowerCase()}-${viewportName}.png`),
    fullPage: true
  });

  return { errors, result };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const report = [];
  const targets = [
    { name: "desktop", viewport: { width: 1440, height: 900 } },
    { name: "compact", viewport: { width: 760, height: 900 } }
  ];

  for (const target of targets) {
    const context = await browser.newContext({ viewport: target.viewport });
    for (const variant of ["A", "B", "C"]) {
      const page = await context.newPage();
      report.push({
        variant,
        viewport: target.name,
        ...(await inspectPage(page, variant, target.name))
      });
      await page.close();
    }
    await context.close();
  }

  const interactionContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await interactionContext.newPage();
  await page.goto(`${baseUrl}/?variant=A`, { waitUntil: "networkidle" });
  await page.addStyleTag({
    content: "*, *::before, *::after { animation: none !important; transition: none !important; }"
  });
  await page.locator("[data-presence='mina']").click({ force: true });
  await page.locator("[data-action='send-handshake']").click();
  await page.locator("[data-action='simulate-incoming']").click();
  await page.locator("[data-handshake='connect']").click();
  await page.locator("[data-action='session-mode'][data-value='demand']").click();
  await page.locator("[data-action='resource-request']").click();
  await page.waitForTimeout(1400);
  const interactionState = await page.locator(".state-strip").first().textContent();
  const resourceState = await page.locator(".resource-status").textContent();
  await page.screenshot({
    path: join(screenshotDir, "a-connected-resource-complete.png"),
    fullPage: true
  });
  await interactionContext.close();
  await browser.close();

  const failures = report.filter(
    (entry) =>
      entry.errors.length ||
      entry.result.litPixels < 1 ||
      entry.result.outside.length ||
      entry.result.presenceCount < 1 ||
      entry.result.bodyOverflowX > 2
  );

  console.log(
    JSON.stringify(
      {
        report,
        interaction: { interactionState, resourceState },
        failures
      },
      null,
      2
    )
  );

  process.exitCode = failures.length ? 1 : 0;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
