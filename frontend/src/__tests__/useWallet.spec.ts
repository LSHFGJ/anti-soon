import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWallet } from "../hooks/useWallet";
import { setCommitRevealFlowGuardActive } from "../lib/commitRevealRecovery";

const {
	mockUseAccount,
	mockUseConnect,
	mockUseDisconnect,
	mockUseSwitchChain,
	mockUseWalletClient,
	mockUsePublicClient,
	mockUseAppKit,
} = vi.hoisted(() => ({
	mockUseAccount: vi.fn(),
	mockUseConnect: vi.fn(),
	mockUseDisconnect: vi.fn(),
	mockUseSwitchChain: vi.fn(),
	mockUseWalletClient: vi.fn(),
	mockUsePublicClient: vi.fn(),
	mockUseAppKit: vi.fn(),
}));

vi.mock("wagmi", () => ({
	useAccount: mockUseAccount,
	useConnect: mockUseConnect,
	useDisconnect: mockUseDisconnect,
	useSwitchChain: mockUseSwitchChain,
	useWalletClient: mockUseWalletClient,
	usePublicClient: mockUsePublicClient,
}));

vi.mock("@reown/appkit/react", () => ({
	useAppKit: mockUseAppKit,
}));

vi.mock("@reown/appkit/networks", () => ({
	sepolia: { id: 11155111 },
}));

describe("useWallet auto-switch behavior", () => {
	const connectAsync = vi.fn();
	const switchChain = vi.fn();
	const disconnect = vi.fn();
	const open = vi.fn();
	const metaMaskGetProvider = vi.fn();
	const metaMaskConnector = {
		id: "metaMaskSDK",
		name: "MetaMask",
		type: "metaMask",
		rdns: ["io.metamask", "io.metamask.mobile"],
		getProvider: metaMaskGetProvider,
	};
	const injectedGetProvider = vi.fn();
	const injectedConnector = {
		id: "injected",
		name: "Browser Wallet",
		type: "injected",
		rdns: ["com.example.wallet"],
		getProvider: injectedGetProvider,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		window.localStorage.clear();
		window.sessionStorage.clear();
		connectAsync.mockReset();
		disconnect.mockReset();
		metaMaskGetProvider.mockReset();
		injectedGetProvider.mockReset();
		open.mockReset();

		mockUseAccount.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			isConnected: true,
			chain: { id: 1 },
		});
		mockUseDisconnect.mockReturnValue({ disconnect });
		mockUseConnect.mockReturnValue({ connectAsync, connectors: [] });
		mockUseSwitchChain.mockReturnValue({ switchChain, isPending: false });
		mockUseWalletClient.mockReturnValue({ data: undefined });
		mockUsePublicClient.mockReturnValue(undefined);
		mockUseAppKit.mockReturnValue({ open });
	});

	it("auto-switches to Sepolia by default on wrong network", async () => {
		renderHook(() => useWallet());

		await waitFor(() => {
			expect(switchChain).toHaveBeenCalledWith({ chainId: 11155111 });
		});
	});

	it("does not auto-switch when autoSwitchToSepolia is disabled", async () => {
		renderHook(() => useWallet({ autoSwitchToSepolia: false }));

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(switchChain).not.toHaveBeenCalled();
	});

	it("resolves Sapphire chain metadata when account chain object is unavailable", () => {
		mockUseAccount.mockReturnValue({
			address: "0x1111111111111111111111111111111111111111",
			isConnected: true,
			chain: undefined,
			chainId: 23295,
		});

		const { result } = renderHook(() =>
			useWallet({ autoSwitchToSepolia: false }),
		);

		expect(result.current.chainId).toBe(23295);
		expect(result.current.chainName).toBe("Oasis Sapphire");
	});

	it("does not repeatedly auto-switch after a rejected attempt while still on wrong network", async () => {
		let pending = false;
		switchChain.mockRejectedValueOnce(new Error("User rejected request"));
		mockUseSwitchChain.mockImplementation(() => ({
			switchChain,
			isPending: pending,
		}));

		const { rerender } = renderHook(() => useWallet());

		await waitFor(() => {
			expect(switchChain).toHaveBeenCalledTimes(1);
		});

		pending = true;
		rerender();

		pending = false;
		rerender();

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(switchChain).toHaveBeenCalledTimes(1);
	});

	it("does not retry auto-switch after transient disconnect on same wrong network", async () => {
		let accountState = {
			address: "0x1111111111111111111111111111111111111111",
			isConnected: true,
			chain: { id: 1 },
		};
		mockUseAccount.mockImplementation(() => accountState);
		switchChain.mockRejectedValueOnce(new Error("User rejected request"));

		const { rerender } = renderHook(() => useWallet());

		await waitFor(() => {
			expect(switchChain).toHaveBeenCalledTimes(1);
		});

		accountState = {
			...accountState,
			isConnected: false,
		};
		rerender();

		accountState = {
			...accountState,
			isConnected: true,
		};
		rerender();

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(switchChain).toHaveBeenCalledTimes(1);
	});

	it("clears persisted wallet cache keys when disconnecting", () => {
		window.localStorage.setItem("wagmi.store", '{"state":"connected"}');
		window.localStorage.setItem("wagmi.recentConnectorId", "injected");
		window.localStorage.setItem("wc@2:session:0.3//foo", "cached");
		window.localStorage.setItem("@appkit/connected_namespaces", '["eip155"]');
		window.localStorage.setItem(
			"anti-soon:commit-reveal-recovery:v2",
			'{"version":1}',
		);
		window.sessionStorage.setItem("WALLETCONNECT_DEEPLINK_CHOICE", "metamask");
		window.localStorage.setItem("unrelated.setting", "keep-me");

		const { result } = renderHook(() =>
			useWallet({ autoSwitchToSepolia: false }),
		);

		result.current.disconnect();

		expect(disconnect).toHaveBeenCalledTimes(1);
		expect(window.localStorage.getItem("wagmi.store")).toBeNull();
		expect(window.localStorage.getItem("wagmi.recentConnectorId")).toBeNull();
		expect(window.localStorage.getItem("wc@2:session:0.3//foo")).toBeNull();
		expect(
			window.localStorage.getItem("@appkit/connected_namespaces"),
		).toBeNull();
		expect(
			window.localStorage.getItem("anti-soon:commit-reveal-recovery:v2"),
		).toBeNull();
		expect(
			window.sessionStorage.getItem("WALLETCONNECT_DEEPLINK_CHOICE"),
		).toBeNull();
		expect(window.localStorage.getItem("unrelated.setting")).toBe("keep-me");
	});

	it("blocks disconnect when submission flow guard is active and user cancels confirm", () => {
		setCommitRevealFlowGuardActive(true);
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

		const { result } = renderHook(() =>
			useWallet({ autoSwitchToSepolia: false }),
		);
		result.current.disconnect();

		expect(confirmSpy).toHaveBeenCalledTimes(1);
		expect(disconnect).not.toHaveBeenCalled();

		confirmSpy.mockRestore();
	});

	it("blocks connect modal when submission flow guard is active and user cancels confirm", async () => {
		setCommitRevealFlowGuardActive(true);
		const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

		const { result } = renderHook(() =>
			useWallet({ autoSwitchToSepolia: false }),
		);
		await act(async () => {
			await result.current.connect();
		});

		expect(confirmSpy).toHaveBeenCalledTimes(1);
		expect(connectAsync).not.toHaveBeenCalled();
		expect(open).not.toHaveBeenCalled();

		confirmSpy.mockRestore();
	});

	it("connects to MetaMask directly when a wagmi MetaMask connector is available", async () => {
		metaMaskGetProvider.mockResolvedValue({ isMetaMask: true });
		mockUseConnect.mockReturnValue({
			connectAsync,
			connectors: [metaMaskConnector],
		});

		const { result } = renderHook(() =>
			useWallet({ autoSwitchToSepolia: false }),
		);

		await act(async () => {
			await result.current.connect();
		});

		expect(connectAsync).toHaveBeenCalledWith({ connector: metaMaskConnector });
		expect(open).not.toHaveBeenCalled();
	});

	it("falls back to the AppKit modal when explicit MetaMask identity exists but no provider is injected", async () => {
		metaMaskGetProvider.mockResolvedValue(undefined);
		mockUseConnect.mockReturnValue({
			connectAsync,
			connectors: [metaMaskConnector],
		});

		const { result } = renderHook(() =>
			useWallet({ autoSwitchToSepolia: false }),
		);

		await act(async () => {
			await result.current.connect();
		});

		expect(connectAsync).not.toHaveBeenCalled();
		expect(open).toHaveBeenCalledTimes(1);
	});

	it("falls back to the AppKit modal when no explicit MetaMask connector is available", async () => {
		injectedGetProvider.mockResolvedValue(undefined);
		mockUseConnect.mockReturnValue({
			connectAsync,
			connectors: [injectedConnector],
		});

		const { result } = renderHook(() =>
			useWallet({ autoSwitchToSepolia: false }),
		);

		await act(async () => {
			await result.current.connect();
		});

		expect(connectAsync).not.toHaveBeenCalled();
		expect(open).toHaveBeenCalledTimes(1);
	});
});
