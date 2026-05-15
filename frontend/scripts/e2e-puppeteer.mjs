/**
 * Puppeteer smoke + optional full LLM E2E.
 *
 * Prerequisites:
 *   - UI backend on PORT (default 8001): ./scripts/start-backend.sh
 *   - Vite dev server on BASE (default http://127.0.0.1:5173): npm run dev
 *
 * Usage:
 *   npm run test:e2e
 *   E2E_RUN_LLM=1 npm run test:e2e   # also clicks Run LLM (needs vLLM reachable from backend)
 *   E2E_BASE_URL=http://127.0.0.1:4173 npm run test:e2e   # against vite preview
 */

import puppeteer from "puppeteer";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";
const RUN_LLM = process.env.E2E_RUN_LLM === "1";
const LLM_TIMEOUT_MS = Number(process.env.E2E_LLM_TIMEOUT_MS ?? "300000");

async function main() {
  const browser = await puppeteer.launch({
    headless: process.env.E2E_HEADED === "1" ? false : true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(90_000);

  console.log("Opening", BASE);
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 120_000 });

  const title = await page.$eval("h1", (el) => el.textContent ?? "");
  if (!title.includes("Readmit LLM")) {
    throw new Error(`Unexpected title: ${JSON.stringify(title)}`);
  }

  await page.waitForFunction(
    () => {
      const sel = document.querySelector('[data-testid="subject-select"]');
      if (!(sel instanceof HTMLSelectElement)) return false;
      return !sel.disabled && sel.options.length > 1;
    },
    { timeout: 90_000 },
  );

  await page.select('[data-testid="subject-select"]', "0");

  await page.waitForFunction(
    () => {
      const ta = document.querySelector('[data-testid="user-prompt"]');
      if (!(ta instanceof HTMLTextAreaElement)) return false;
      return (
        ta.value.includes("{index discharge summary}") &&
        ta.value.includes("{follow-up discharge summary}") &&
        !ta.value.includes("Admission Date:")
      );
    },
    { timeout: 30_000 },
  );

  console.log("Smoke OK: cohort loaded, row 0 selected, user prompt has placeholders only.");

  if (RUN_LLM) {
    console.log("E2E_RUN_LLM=1 — invoking Run LLM (timeout", LLM_TIMEOUT_MS, "ms)…");
    await page.click('[data-testid="run-llm"]');
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="llm-results"]') != null ||
        (document.querySelector('[data-testid="app-error"]')?.textContent?.trim()?.length ?? 0) > 0,
      { timeout: LLM_TIMEOUT_MS },
    );
    const err = await page
      .$eval('[data-testid="app-error"]', (el) => (el.textContent ?? "").trim())
      .catch(() => "");
    if (err) {
      throw new Error(`LLM / API error in UI: ${err}`);
    }
    const hasResults = (await page.$('[data-testid="llm-results"]')) != null;
    if (!hasResults) throw new Error("Expected llm-results after Run LLM");
    console.log("LLM flow OK: results panel visible.");
  }

  await browser.close();
  console.log("Puppeteer E2E passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
