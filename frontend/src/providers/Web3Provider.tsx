import { type AppKitNetwork, sepolia } from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { resolveAppUrl, resolveReownProjectId } from "./reownConfig";

const queryClient = new QueryClient();

const projectId = resolveReownProjectId();

const metadata = {
	name: "AntiSoon",
	description: "Decentralized Vulnerability Verification Network",
	url: resolveAppUrl(),
	icons: ["https://avatars.githubusercontent.com/u/179229932"],
};

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [sepolia];

const wagmiAdapter = new WagmiAdapter({
	networks,
	projectId,
	ssr: false,
});

createAppKit({
	adapters: [wagmiAdapter],
	networks,
	projectId,
	metadata,
	allowUnsupportedChain: true,
	enableNetworkSwitch: false,
	features: {
		analytics: false,
	},
});

export function Web3Provider({ children }: { children: React.ReactNode }) {
	return (
		<WagmiProvider config={wagmiAdapter.wagmiConfig}>
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		</WagmiProvider>
	);
}
