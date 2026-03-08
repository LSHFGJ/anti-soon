import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAppUrl } from "../providers/reownConfig";

describe("Web3Provider appkit config", () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		vi.unstubAllEnvs();
	});

	it("disables auto network-switch prompts for temporary non-sepolia flows", async () => {
		const createAppKit = vi.fn();
		const metaMaskConnector = { id: "io.metamask" };
		const injected = vi.fn(() => metaMaskConnector);
		const WagmiAdapter = vi.fn(
			class {
				wagmiConfig = {};
			},
		);

		vi.doMock("@tanstack/react-query", () => ({
			QueryClient: class {},
			QueryClientProvider: ({ children }: { children: unknown }) => children,
		}));

		vi.doMock("wagmi", () => ({
			WagmiProvider: ({ children }: { children: unknown }) => children,
		}));

		vi.doMock("@wagmi/connectors", () => ({
			injected,
		}));

		vi.doMock("@reown/appkit/networks", () => ({
			sepolia: { id: 11155111, name: "Sepolia" },
		}));

		vi.doMock("@reown/appkit-adapter-wagmi", () => ({
			WagmiAdapter,
		}));

		vi.doMock("@reown/appkit/react", () => ({
			createAppKit,
		}));

		await import("../providers/Web3Provider");

		expect(injected).toHaveBeenCalledWith({ target: "metaMask" });
		expect(WagmiAdapter).toHaveBeenCalledWith(
			expect.objectContaining({
				connectors: [metaMaskConnector],
			}),
		);

		expect(createAppKit).toHaveBeenCalledWith(
			expect.objectContaining({
				allowUnsupportedChain: true,
				enableNetworkSwitch: false,
			}),
		);
	});

	it("uses runtime-safe Reown metadata and project configuration", async () => {
		const createAppKit = vi.fn();
		const metaMaskConnector = { id: "io.metamask" };
		const injected = vi.fn(() => metaMaskConnector);
		const WagmiAdapter = vi.fn(
			class {
				wagmiConfig = {};
			},
		);

		const originalProjectId = import.meta.env.VITE_REOWN_PROJECT_ID;
		const originalAppUrl = import.meta.env.VITE_PUBLIC_APP_URL;
		const runtimeConfig = globalThis as typeof globalThis & {
			__ANTI_SOON_REOWN_PROJECT_ID__?: string;
			__ANTI_SOON_PUBLIC_APP_URL__?: string;
		};
		const originalRuntimeProjectId =
			runtimeConfig.__ANTI_SOON_REOWN_PROJECT_ID__;
		const originalRuntimeAppUrl = runtimeConfig.__ANTI_SOON_PUBLIC_APP_URL__;
		Object.assign(import.meta.env, {
			VITE_REOWN_PROJECT_ID: "test-project-id",
			VITE_PUBLIC_APP_URL: window.location.origin,
		});
		runtimeConfig.__ANTI_SOON_REOWN_PROJECT_ID__ = "test-project-id";
		runtimeConfig.__ANTI_SOON_PUBLIC_APP_URL__ = window.location.origin;

		try {
			vi.doMock("@tanstack/react-query", () => ({
				QueryClient: class {},
				QueryClientProvider: ({ children }: { children: unknown }) => children,
			}));

			vi.doMock("wagmi", () => ({
				WagmiProvider: ({ children }: { children: unknown }) => children,
			}));

			vi.doMock("@wagmi/connectors", () => ({
				injected,
			}));

			vi.doMock("@reown/appkit/networks", () => ({
				sepolia: { id: 11155111, name: "Sepolia" },
			}));

			vi.doMock("@reown/appkit-adapter-wagmi", () => ({
				WagmiAdapter,
			}));

			vi.doMock("@reown/appkit/react", () => ({
				createAppKit,
			}));

			await import("../providers/Web3Provider");

			expect(WagmiAdapter).toHaveBeenCalledWith(
				expect.objectContaining({
					projectId: "test-project-id",
				}),
			);

			expect(createAppKit).toHaveBeenCalledWith(
				expect.objectContaining({
					projectId: "test-project-id",
					metadata: expect.objectContaining({
						url: window.location.origin,
					}),
				}),
			);
		} finally {
			Object.assign(import.meta.env, {
				VITE_REOWN_PROJECT_ID: originalProjectId,
				VITE_PUBLIC_APP_URL: originalAppUrl,
			});
			runtimeConfig.__ANTI_SOON_REOWN_PROJECT_ID__ = originalRuntimeProjectId;
			runtimeConfig.__ANTI_SOON_PUBLIC_APP_URL__ = originalRuntimeAppUrl;
		}
	});

	it("warns and prefers the browser origin when app url config drifts", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		try {
			const resolvedAppUrl = resolveAppUrl({
				env: { VITE_PUBLIC_APP_URL: "https://antisoon.com" },
				runtimeConfig: {},
				originSource: {
					location: { origin: "http://localhost" },
				},
				logger: console,
			});

			expect(resolvedAppUrl).toBe("http://localhost");
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					"VITE_PUBLIC_APP_URL origin does not match current browser origin",
				),
			);
		} finally {
			warnSpy.mockRestore();
		}
	});
});
