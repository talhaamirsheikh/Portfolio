import { chromium } from "playwright";

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });

  await page.evaluate(() => {
    const preloader = document.querySelector(".preloader-curtain");
    if (preloader) preloader.remove();
    document.body.style.overflow = "auto";
  });

  async function captureTheme(theme) {
    await page.evaluate(async (t) => {
      if (t === "light") {
        document.documentElement.setAttribute("data-theme", "light");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
      
      const about = document.querySelector("#about");
      if (about) about.scrollIntoView({ behavior: "instant" });
    }, theme);

    // Wait for the full typewriter + delay to expand
    // Let's force trigger the typewriter by ensuring IntersectionObserver or setting state if needed
    await page.waitForTimeout(6000);

    const isExpanded = await page.evaluate(() => {
      const termBody = document.querySelector(".term-body");
      return termBody?.classList.contains("is-expanded");
    });

    console.log(`Theme ${theme} isExpanded: ${isExpanded}`);

    const metrics = await page.evaluate(() => {
      const el = document.querySelector(".term-shell");
      const r = el?.getBoundingClientRect();
      const wrap = document.querySelector(".about-terminal-wrap")?.getBoundingClientRect();
      const text = document.querySelector(".about-split-text")?.getBoundingClientRect();
      const bio = document.querySelector(".about-bio")?.getBoundingClientRect();
      const container = document.querySelector(".about-split-container")?.getBoundingClientRect();
      const body = document.querySelector(".term-body")?.getBoundingClientRect();
      const output = document.querySelector(".term-output")?.getBoundingClientRect();

      return {
        containerHeight: container?.height,
        textHeight: text?.height,
        bioHeight: bio?.height,
        wrapHeight: wrap?.height,
        shellHeight: r?.height,
        bodyHeight: body?.height,
        outputHeight: output?.height,
        wrapTop: wrap?.top,
        textTop: text?.top,
      };
    });

    console.log(`Theme ${theme} metrics:`, metrics);
    await page.screenshot({ path: `scripts/full-${theme}.png` });
  }

  await captureTheme("light");
  await captureTheme("dark");

  await browser.close();
}

run().catch(console.error);
