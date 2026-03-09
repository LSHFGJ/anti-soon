import { sepolia } from "@reown/appkit/networks";
import { useAppKit, useAppKitState } from "@reown/appkit/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, PublicClient, WalletClient } from "viem";
import {
	useAccount,
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

let connectRequestInFlight = false;

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
	const { loading: isAppKitLoading, open: isAppKitOpen } = useAppKitState();
	const { disconnect } = useDisconnect();
	const { switchChain, isPending: isSwitching } = useSwitchChain();
	const { data: walletClient } = useWalletClient();
	const publicClient = usePublicClient();
	const [isConnectingLocally, setIsConnectingLocally] = useState(false);
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
		if (connectRequestInFlight || isAppKitLoading || isAppKitOpen) {
			return;
		}

		if (!confirmWalletOperationInterruption("Switching wallet connection")) {
			return;
		}

		try {
			connectRequestInFlight = true;
			setIsConnectingLocally(true);
			await open({ view: "Connect" });
		} catch (error) {
			console.error("Failed to connect wallet:", error);
		} finally {
			connectRequestInFlight = false;
			setIsConnectingLocally(false);
		}
	}, [isAppKitLoading, isAppKitOpen, open]);

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
		isConnecting: isConnectingLocally || isAppKitLoading || isAppKitOpen,
		isWrongNetwork,
		walletClient,
		publicClient,
		connect,
		disconnect: disconnectAndClearState,
		switchToCorrectNetwork,
	};
}
