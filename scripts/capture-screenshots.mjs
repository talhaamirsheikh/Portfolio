import { chromium } from "playwright";

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  // Test Light Mode
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.setItem("portfolio-theme", "light");
    document.documentElement.dataset.theme = "light";
    const preloader = document.querySelector(".preloader-curtain");
    if (preloader) preloader.remove();
    document.body.style.overflow = "auto";
    const about = document.querySelector("#about");
    if (about) about.scrollIntoView({ behavior: "instant" });
  });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: "scripts/about-light-actual.png" });

  // Test Dark Mode
  await page.evaluate(() => {
    localStorage.setItem("portfolio-theme", "dark");
    document.documentElement.dataset.theme = "dark";
    const about = document.querySelector("#about");
    if (about) about.scrollIntoView({ behavior: "instant" });
  });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: "scripts/about-dark-actual.png" });

  await browser.close();
}

run().catch(console.error);
