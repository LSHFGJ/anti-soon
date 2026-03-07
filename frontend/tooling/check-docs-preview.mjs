import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");

const docsEnabledEnv = {
  ...process.env,
  VITE_ENABLE_DOCS: "true",
};

const previewHost = "127.0.0.1";
const preferredPreviewPort = 4173;
const buildCommand = ["run", "build"];

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

async function findAvailablePort(host, startPort) {
  for (let candidatePort = startPort; candidatePort < startPort + 20; candidatePort += 1) {
    const isAvailable = await new Promise((resolvePromise) => {
      const probe = createServer();
      let settled = false;

      const settle = (result) => {
        if (settled) {
          return;
        }

        settled = true;
        resolvePromise(result);
      };

      const closeProbe = (result) => {
        if (!probe.listening) {
          settle(result);
          return;
        }

        probe.close(() => settle(result));
      };

      probe.once("error", () => {
        closeProbe(false);
      });

      probe.listen(candidatePort, host, () => {
        closeProbe(true);
      });
    });

    if (isAvailable) {
      return candidatePort;
    }
  }

  throw new Error(`Could not find an available preview port starting at ${startPort}`);
}

function getPreviewCommand(previewPort) {
  return [
    "x",
    "vite",
    "preview",
    "--host",
    previewHost,
    "--port",
    String(previewPort),
    "--strictPort",
  ];
}

async function waitForPreviewServer(previewOrigin) {
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

async function verifyDocsRoutes(previewOrigin) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(`${previewOrigin}/docs`, { waitUntil: "networkidle" });
    await assertVisible(page, '[data-docs-route="page"][data-docs-page="overview"]', "/docs renders the docs overview page shell");
    await page.getByRole("heading", { name: "Docs Overview" }).waitFor({ state: "visible" });
    console.log("docs:preview-check OK - /docs resolves to the overview content page");

    await page.goto(`${previewOrigin}/docs/architecture`, { waitUntil: "networkidle" });
    await page.waitForURL(`${previewOrigin}/docs/architecture`);
    await assertVisible(page, '[data-docs-route="page"][data-docs-page="architecture"]', "/docs/architecture resolves to the architecture page shell");
    await page.getByRole("heading", { name: "Architecture" }).waitFor({ state: "visible" });

    await page.goto(`${previewOrigin}/docs/operations#runtime-topology`, { waitUntil: "networkidle" });
    await page.waitForURL(`${previewOrigin}/docs/operations#runtime-topology`);
    await assertVisible(page, '[data-docs-route="page"][data-docs-page="operations"]', "/docs/operations#runtime-topology resolves to the operations page shell");
    await assertVisible(page, "#runtime-topology", "/docs/operations#runtime-topology resolves to the runtime topology anchor");
    const operationsAnchorTop = await page
      .locator("#runtime-topology")
      .evaluate((element) => Math.round(element.getBoundingClientRect().top));
    if (operationsAnchorTop >= 180) {
      throw new Error(
        `/docs/operations#runtime-topology did not scroll to the anchor deterministically (top=${operationsAnchorTop})`,
      );
    }
    console.log(
      `docs:preview-check OK - /docs/operations#runtime-topology anchored near the viewport top (${operationsAnchorTop}px)`,
    );

    await page.goto(`${previewOrigin}/docs/getting-started`, { waitUntil: "networkidle" });
    await page.waitForURL(`${previewOrigin}/docs/getting-started`);
    await assertVisible(page, '[data-docs-route="page"][data-docs-page="getting-started"]', "/docs/getting-started resolves to the getting started page shell");
    await page.getByRole("heading", { name: "Getting Started" }).waitFor({ state: "visible" });

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

  const previewPort = await findAvailablePort(previewHost, preferredPreviewPort);
  const previewOrigin = `http://${previewHost}:${previewPort}`;
  if (previewPort !== preferredPreviewPort) {
    console.log(`docs:preview-check INFO - port ${preferredPreviewPort} was busy, using ${previewPort} instead`);
  }

  const previewServer = spawn("bun", getPreviewCommand(previewPort), {
    cwd: frontendRoot,
    env: docsEnabledEnv,
    stdio: "inherit",
  });

  previewServer.on("error", (error) => {
    console.error(`Failed to start vite preview: ${error.message}`);
  });

  try {
    await waitForPreviewServer(previewOrigin);
    await verifyDocsRoutes(previewOrigin);
  } finally {
    await stopPreviewServer(previewServer);
  }
}

await main();
