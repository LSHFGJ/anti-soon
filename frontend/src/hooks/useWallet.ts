import { sepolia } from "@reown/appkit/networks";
import { useAppKit } from "@reown/appkit/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, PublicClient, WalletClient } from "viem";
import {
	useAccount,
	useConnect,
	useDisconnect,
	usePublicClient,
	useSwitchChain,
	useWalletClient,
} from "wagmi";
import { normalizeEthereumAddress } from "../lib/address";
import {
	clearCommitRevealRecoveryContext,
	isCommitRevealFlowGuardActive,
} from "../lib/commitRevealRecovery";
import { toast } from "./use-toast";

const WALLET_STORAGE_KEYS = [
	"wagmi.store",
	"wagmi.recentConnectorId",
	"WALLETCONNECT_DEEPLINK_CHOICE",
];

const WALLET_STORAGE_PREFIXES = [
	"wagmi.",
	"walletconnect",
	"wc@2:",
	"reown",
	"@appkit/",
];

const CHAIN_NAME_BY_ID: Record<number, string> = {
	1: "Ethereum Mainnet",
	[sepolia.id]: "Sepolia",
	23294: "Oasis Sapphire",
	23295: "Oasis Sapphire",
};

const METAMASK_CONNECTOR_IDS = new Set(["metamask", "metamasksdk"]);
const METAMASK_CONNECTOR_RDNS = new Set(["io.metamask", "io.metamask.mobile"]);

type WalletConnectorLike = {
	id: string;
	name: string;
	type: string;
	rdns?: string | readonly string[];
	getProvider: () => Promise<unknown>;
};

function getConnectorRdns(connector: Pick<WalletConnectorLike, "rdns">): string[] {
	if (!connector.rdns) return [];
	return typeof connector.rdns === "string"
		? [connector.rdns]
		: Array.from(connector.rdns);
}

function isMetaMaskProvider(provider: unknown): provider is { isMetaMask: boolean } {
	return (
		typeof provider === "object" &&
		provider !== null &&
		"isMetaMask" in provider &&
		(provider as { isMetaMask?: boolean }).isMetaMask === true
	);
}

function isMetaMaskConnector(connector: WalletConnectorLike): boolean {
	const normalizedId = connector.id.toLowerCase();
	const normalizedName = connector.name.toLowerCase();
	const normalizedType = connector.type.toLowerCase();
	const connectorRdns = getConnectorRdns(connector);

	return (
		METAMASK_CONNECTOR_IDS.has(normalizedId) ||
		normalizedName === "metamask" ||
		normalizedType === "metamask" ||
		connectorRdns.some((rdns) => METAMASK_CONNECTOR_RDNS.has(rdns))
	);
}

async function findAvailableMetaMaskConnector<T extends WalletConnectorLike>(
	connectors: readonly T[],
): Promise<T | null> {
	const explicitMetaMaskConnector = connectors.find((connector) =>
		isMetaMaskConnector(connector),
	);
	if (explicitMetaMaskConnector) {
		return explicitMetaMaskConnector;
	}

	let injectedMetaMaskConnector: T | null = null;

	for (const connector of connectors) {
		const provider = await connector.getProvider().catch(() => undefined);
		if (!provider) continue;

		if (injectedMetaMaskConnector === null && isMetaMaskProvider(provider)) {
			injectedMetaMaskConnector = connector;
		}
	}

	return injectedMetaMaskConnector;
}

function clearPersistedWalletState() {
	if (typeof window === "undefined") return;

	for (const storage of [window.localStorage, window.sessionStorage]) {
		try {
			const staleKeys: string[] = [];
			for (let index = 0; index < storage.length; index += 1) {
				const key = storage.key(index);
				if (!key) continue;

				const lowerKey = key.toLowerCase();
				const shouldClear =
					WALLET_STORAGE_KEYS.includes(key) ||
					WALLET_STORAGE_PREFIXES.some((prefix) => lowerKey.startsWith(prefix));

				if (shouldClear) staleKeys.push(key);
			}

			for (const key of staleKeys) {
				storage.removeItem(key);
			}
		} catch {
			// Ignore storage access failures during best-effort wallet state cleanup.
		}
	}
}

function confirmWalletOperationInterruption(operationName: string): boolean {
	if (typeof window === "undefined") return true;
	if (!isCommitRevealFlowGuardActive()) return true;

	toast.warning("SUBMISSION_IN_PROGRESS", {
		description: `${operationName} may interrupt the active submission handoff flow. Confirm in browser dialog if you still want to continue.`,
		duration: 4500,
	});

	return window.confirm(
		"A PoC submission is still being queued for workflow processing. Continue?",
	);
}

interface WalletState {
	address: Address | null;
	chainId: number | null;
	chainName: string | null;
	isConnected: boolean;
	isConnecting: boolean;
	isWrongNetwork: boolean;
	walletClient: WalletClient | undefined;
	publicClient: PublicClient | undefined;
	connect: () => Promise<void>;
	disconnect: () => void;
	switchToCorrectNetwork: () => Promise<void>;
}

interface UseWalletOptions {
	autoSwitchToSepolia?: boolean;
}

export function useWallet(options: UseWalletOptions = {}): WalletState {
	const { autoSwitchToSepolia = true } = options;
	const { address, isConnected, chain, chainId: accountChainId } = useAccount();
	const { open } = useAppKit();
	const { connectAsync, connectors } = useConnect();
	const { disconnect } = useDisconnect();
	const { switchChain, isPending: isSwitching } = useSwitchChain();
	const { data: walletClient } = useWalletClient();
	const publicClient = usePublicClient();
	const [isConnecting, setIsConnecting] = useState(false);
	const autoSwitchAttemptedChainRef = useRef<number | null>(null);

	const normalizedAddress = normalizeEthereumAddress(address);
	const resolvedChainId =
		chain?.id ?? accountChainId ?? walletClient?.chain?.id ?? null;
	const resolvedChainName =
		chain?.name ??
		walletClient?.chain?.name ??
		(resolvedChainId !== null
			? (CHAIN_NAME_BY_ID[resolvedChainId] ?? null)
			: null);

	const isWrongNetwork = isConnected && resolvedChainId !== sepolia.id;

	const switchToCorrectNetwork = useCallback(async () => {
		if (switchChain) {
			try {
				await switchChain({ chainId: sepolia.id });
			} catch (error) {
				console.error("Failed to switch network:", error);
			}
		}
	}, [switchChain]);

	const connect = useCallback(async () => {
		if (!confirmWalletOperationInterruption("Switching wallet connection")) {
			return;
		}

		try {
			setIsConnecting(true);
			const metaMaskConnector = await findAvailableMetaMaskConnector(connectors);
			if (metaMaskConnector) {
				await connectAsync({ connector: metaMaskConnector });
				return;
			}

			await open();
		} catch (error) {
			console.error("Failed to connect wallet:", error);
		} finally {
			setIsConnecting(false);
		}
	}, [connectAsync, connectors, open]);

	const disconnectAndClearState = useCallback(() => {
		if (!confirmWalletOperationInterruption("Disconnecting wallet")) {
			return;
		}

		autoSwitchAttemptedChainRef.current = null;
		disconnect();
		clearPersistedWalletState();
		clearCommitRevealRecoveryContext();
	}, [disconnect]);

	// Auto-switch to correct network when connected to wrong network
	useEffect(() => {
		if (!autoSwitchToSepolia) {
			autoSwitchAttemptedChainRef.current = null;
			return;
		}

		if (!isConnected) {
			return;
		}

		if (!isWrongNetwork) {
			autoSwitchAttemptedChainRef.current = null;
			return;
		}

		const currentChainId = resolvedChainId;
		if (currentChainId === null || isSwitching) {
			return;
		}

		if (autoSwitchAttemptedChainRef.current === currentChainId) {
			return;
		}

		autoSwitchAttemptedChainRef.current = currentChainId;
		void switchToCorrectNetwork();
	}, [
		autoSwitchToSepolia,
		isConnected,
		isWrongNetwork,
		isSwitching,
		resolvedChainId,
		switchToCorrectNetwork,
	]);

	return {
		address: normalizedAddress,
		chainId: resolvedChainId,
		chainName: resolvedChainName,
		isConnected: isConnected && normalizedAddress !== null,
		isConnecting,
		isWrongNetwork,
		walletClient,
		publicClient,
		connect,
		disconnect: disconnectAndClearState,
		switchToCorrectNetwork,
	};
}
