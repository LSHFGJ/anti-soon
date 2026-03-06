import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");

const docsEnabledEnv = {
  ...process.env,
  VITE_ENABLE_DOCS: "true",
};

const previewHost = "127.0.0.1";
const previewPort = 4173;
const previewOrigin = `http://${previewHost}:${previewPort}`;
const buildCommand = ["run", "build"];
const previewCommand = [
  "x",
  "vite",
  "preview",
  "--host",
  previewHost,
  "--port",
  String(previewPort),
  "--strictPort",
];

function runBunCommand(args, label) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("bun", args, {
      cwd: frontendRoot,
      env: docsEnabledEnv,
      stdio: "inherit",
    });

    child.on("error", rejectPromise);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          `${label} failed with ${signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`}`,
        ),
      );
    });
  });
}

async function waitForPreviewServer() {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(previewOrigin, { redirect: "manual" });
      if (response.ok || response.status === 404) {
        return;
      }
    } catch {
      // Preview is still starting up.
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }

  throw new Error(`Timed out waiting for vite preview at ${previewOrigin}`);
}

async function stopPreviewServer(child) {
  if (child.exitCode !== null || child.killed) {
    return;
  }

  child.kill("SIGTERM");

  const timeoutId = setTimeout(() => {
    if (child.exitCode === null) {
      child.kill("SIGKILL");
    }
  }, 5_000);

  try {
    await once(child, "exit");
  } finally {
    clearTimeout(timeoutId);
  }
}

async function assertVisible(page, selector, description) {
  await page.locator(selector).waitFor({ state: "visible" });
  console.log(`docs:preview-check OK - ${description}`);
}

async function verifyDocsRoutes() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(`${previewOrigin}/docs`, { waitUntil: "networkidle" });
    await assertVisible(page, '[data-docs-route="page"]', "/docs renders the docs page shell");
    await page.getByRole("heading", { name: "Docs Overview" }).waitFor({ state: "visible" });

    await page.goto(`${previewOrigin}/docs/`, { waitUntil: "networkidle" });
    await assertVisible(page, '[data-docs-route="page"]', "/docs/ normalizes to the overview page shell");
    await page.getByRole("heading", { name: "Docs Overview" }).waitFor({ state: "visible" });

    await page.goto(`${previewOrigin}/docs#overview`, { waitUntil: "networkidle" });
    await assertVisible(page, "#overview", "/docs#overview resolves to the overview anchor");
    const overviewTop = await page
      .locator("#overview")
      .evaluate((element) => Math.round(element.getBoundingClientRect().top));
    if (overviewTop >= 180) {
      throw new Error(`/docs#overview did not scroll to the anchor deterministically (top=${overviewTop})`);
    }
    console.log(`docs:preview-check OK - /docs#overview anchored near the viewport top (${overviewTop}px)`);

    await page.goto(`${previewOrigin}/docs/unknown`, { waitUntil: "networkidle" });
    await page.waitForURL(`${previewOrigin}/docs`);
    await assertVisible(page, '[data-docs-route="page"]', "/docs/unknown redirects back to the docs page shell");
    await page.locator('[data-docs-route="fallback"]').waitFor({ state: "detached" });
    await page.getByRole("heading", { name: "Docs Overview" }).waitFor({ state: "visible" });
    console.log("docs:preview-check OK - /docs/unknown resolves to the docs overview page");
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("docs:preview-check building docs-enabled bundle...");
  await runBunCommand(buildCommand, "docs-enabled build");

  const previewServer = spawn("bun", previewCommand, {
    cwd: frontendRoot,
    env: docsEnabledEnv,
    stdio: "inherit",
  });

  previewServer.on("error", (error) => {
    console.error(`Failed to start vite preview: ${error.message}`);
  });

  try {
    await waitForPreviewServer();
    await verifyDocsRoutes();
  } finally {
    await stopPreviewServer(previewServer);
  }
}

await main();
