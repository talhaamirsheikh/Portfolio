/* ============================================================
   Capture the /assets-render/projects-header route into the
   laptop's WebGL screen textures (desktop and mobile).

   The laptop screen "boots" into this image and crossfades into
   the live #projects DOM header, so both captures must stay
   pixel-matched to their responsive header layout. Re-run this
   whenever the header copy or the site palette changes.

   Usage: start the dev server, then `npm run capture:header`.
   ============================================================ */
import { chromium } from "playwright";

const URL =
  process.env.CAPTURE_URL ||
  "http://localhost:3000/assets-render/projects-header";
const captures = [
  {
    viewport: { width: 1440, height: 900 },
    output: "public/assets/textures/bg.jpg",
  },
  {
    viewport: { width: 390, height: 844 },
    output: "public/assets/textures/bg-mobile.jpg",
    isMobile: true,
    hasTouch: true,
  },
];

const browser = await chromium.launch();
try {
  for (const capture of captures) {
    const context = await browser.newContext({
      viewport: capture.viewport,
      deviceScaleFactor: 2,
      isMobile: capture.isMobile,
      hasTouch: capture.hasTouch,
    });
    try {
      const page = await context.newPage();
      await page.goto(URL, { waitUntil: "domcontentloaded" });
      await page.locator(".ed-heading").waitFor({ state: "visible" });
      // Wait for the editorial fonts so the capture matches the live header.
      await page.evaluate(() => document.fonts.ready);
      // Strip the Next.js dev-mode indicator badge from the texture.
      await page.evaluate(() => {
        for (const sel of [
          "nextjs-portal",
          "[data-next-badge-root]",
          "[data-next-badge]",
          "#__next-build-watcher",
          "#__next-dev-tools-indicator",
        ]) {
          document.querySelectorAll(sel).forEach((el) => el.remove());
        }
      });
      await page.addStyleTag({
        content: "nextjs-portal, [data-nextjs-dialog] { display: none !important; }",
      });
      await page.waitForTimeout(500);
      await page.screenshot({ path: capture.output, type: "jpeg", quality: 92 });
      console.log(`Captured ${capture.output} from ${URL}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
