import { useCallback, useEffect, useMemo, useState } from "react";
import { type Address, formatEther } from "viem";
import { StatCard } from "@/components/shared/StatCard";
import {
	NeonPanel,
	PageHeader,
	StatusBanner,
} from "@/components/shared/ui-primitives";
import { Badge } from "@/components/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	formatPreviewFallbackMessage,
	shouldUsePreviewFallback,
} from "@/lib/previewFallback";
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from "../config";
import { useWallet } from "../hooks/useWallet";
import {
	type AuditorStatsTuple,
	readAllLeaderboardAuditors,
} from "../lib/leaderboardReads";
import { multicallWithRpcFallback } from "../lib/publicClient";

interface LeaderboardEntry {
	rank: number;
	address: Address;
	validCount: number;
	totalEarned: bigint;
	highCount: number;
	criticalCount: number;
	leaderboardIndex: number;
}

function RankBadge({ rank }: { rank: number }) {
	if (rank === 1) {
		return <span className="text-xl text-[var(--color-gold)]">🥇</span>;
	}
	if (rank === 2) {
		return <span className="text-xl text-[var(--color-silver)]">🥈</span>;
	}
	if (rank === 3) {
		return <span className="text-xl text-[var(--color-bronze)]">🥉</span>;
	}
	return (
		<span className="text-[var(--color-text-dim)] font-mono">#{rank}</span>
	);
}

export function Leaderboard() {
	const { address: connectedAddress } = useWallet({
		autoSwitchToSepolia: false,
	});
	const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchLeaderboard = useCallback(async () => {
		try {
			setIsLoading(true);
			setError(null);

			const auditors = await readAllLeaderboardAuditors();

			if (auditors.length === 0) {
				setLeaderboard([]);
				return;
			}

			const auditorStats = (await multicallWithRpcFallback({
				contracts: auditors.map((auditor) => ({
					address: BOUNTY_HUB_ADDRESS,
					abi: BOUNTY_HUB_V2_ABI,
					functionName: "getAuditorStats" as const,
					args: [auditor] as const,
				})),
				allowFailure: false,
			})) as AuditorStatsTuple[];

			const sortedLeaderboard = auditors
				.map((auditor, index) => {
					const stats = auditorStats[index];
					return {
						address: auditor,
						rank: 0,
						validCount: Number(stats[3]),
						totalEarned: stats[6],
						highCount: Number(stats[4]),
						criticalCount: Number(stats[5]),
						leaderboardIndex: Number(stats[7]),
					};
				})
				.filter((entry) => entry.totalEarned > 0n)
				.sort((left, right) => {
					if (right.totalEarned > left.totalEarned) return 1;
					if (right.totalEarned < left.totalEarned) return -1;
					return left.leaderboardIndex - right.leaderboardIndex;
				})
				.map((entry, index) => ({
					...entry,
					rank: index + 1,
				}));

			setLeaderboard(sortedLeaderboard);
		} catch (err) {
			console.error("Failed to fetch leaderboard:", err);
			if (shouldUsePreviewFallback()) {
				setLeaderboard([
					{
						rank: 1,
						address: "0x3333333333333333333333333333333333333333" as Address,
						validCount: 6,
						totalEarned: 3_200_000_000_000_000_000n,
						highCount: 4,
						criticalCount: 2,
						leaderboardIndex: 0,
					},
					{
						rank: 2,
						address: "0x4444444444444444444444444444444444444444" as Address,
						validCount: 4,
						totalEarned: 1_900_000_000_000_000_000n,
						highCount: 3,
						criticalCount: 1,
						leaderboardIndex: 1,
					},
				]);
				setError(
					formatPreviewFallbackMessage("Failed to load leaderboard data"),
				);
				return;
			}

			setError("Failed to load leaderboard data");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchLeaderboard();
	}, [fetchLeaderboard]);

	const truncateAddress = (addr: Address) =>
		`${addr.slice(0, 6)}...${addr.slice(-4)}`;

	const connectedAddressLower = useMemo(
		() => connectedAddress?.toLowerCase() ?? null,
		[connectedAddress],
	);

	const summaryStats = useMemo(() => {
		return leaderboard.reduce(
			(acc, entry) => {
				acc.totalEarned += entry.totalEarned;
				acc.totalCritical += entry.criticalCount;
				acc.totalHigh += entry.highCount;
				return acc;
			},
			{ totalEarned: 0n, totalCritical: 0, totalHigh: 0 },
		);
	}, [leaderboard]);

	const isCurrentUser = (address: Address) =>
		connectedAddressLower !== null &&
		connectedAddressLower === address.toLowerCase();

	return (
		<div className="min-h-[calc(100vh-142px)] flex flex-col py-6">
			<div className="container flex-1 flex flex-col min-h-0">
				<PageHeader
					title="LEADERBOARD"
					subtitle="> Top vulnerability hunters ranked by total earnings"
					suffix={
						<span className="text-xs font-mono text-[var(--color-text-dim)]">
							[{leaderboard.length} HUNTERS]
						</span>
					}
				/>

				{isLoading && (
					<div className="flex-1 flex items-center justify-center text-center p-8 text-[var(--color-text-dim)]">
						<div>
							<div className="spinner w-8 h-8 mx-auto mb-4" />
							<p>Aggregating bounty data...</p>
						</div>
					</div>
				)}

				{error && (
					<StatusBanner
						variant={
							error.includes("Preview mode active") ? "warning" : "error"
						}
						className="mb-4"
						message={error}
					/>
				)}

				{!isLoading && !error && leaderboard.length === 0 && (
					<div className="text-center p-16 mt-8 border border-dashed border-[var(--color-text-dim)] text-[var(--color-text-dim)]">
						<p className="font-mono">&gt; No bounty payouts recorded yet</p>
						<p className="text-sm mt-2">
							Leaderboard will populate as PoCs are verified and paid
						</p>
					</div>
				)}

				{!isLoading && !error && leaderboard.length > 0 && (
					<NeonPanel className="overflow-hidden" contentClassName="p-0">
						<Table>
							<TableHeader>
								<TableRow className="border-b border-white/5 hover:bg-transparent">
									<TableHead className="w-20 text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
										Rank
									</TableHead>
									<TableHead className="text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
										Auditor
									</TableHead>
									<TableHead className="text-center text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
										Paid
									</TableHead>
									<TableHead className="text-center text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
										High
									</TableHead>
									<TableHead className="text-center text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
										Critical
									</TableHead>
									<TableHead className="text-right text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
										Earnings
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{leaderboard.map((entry) => {
									const isYou = isCurrentUser(entry.address);

									return (
										<TableRow
											key={entry.address}
											className={`
                        border-b border-white/5 transition-all duration-200 ease-linear
                        ${isYou ? "bg-[var(--color-secondary-dim)] border-l-4 border-l-[var(--color-secondary)]" : ""}
                        hover:bg-neutral-800
                      `}
										>
											<TableCell className="font-medium">
												<RankBadge rank={entry.rank} />
											</TableCell>

											<TableCell>
												<div className="flex items-center gap-2">
													<span
														className={`font-mono text-sm ${isYou ? "text-[var(--color-secondary)]" : "text-[var(--color-text)]"}`}
													>
														{truncateAddress(entry.address)}
													</span>
													{isYou && (
														<Badge
															variant="info"
															className="text-[10px] px-1.5 py-0"
														>
															YOU
														</Badge>
													)}
												</div>
											</TableCell>

											<TableCell className="text-center">
												<span className="font-bold font-mono text-[var(--color-primary)]">
													{entry.validCount}
												</span>
											</TableCell>

											<TableCell className="text-center">
												{entry.highCount > 0 ? (
													<Badge variant="high" className="font-mono">
														{entry.highCount}
													</Badge>
												) : (
													<span className="text-[var(--color-text-dim)]">
														0
													</span>
												)}
											</TableCell>

											<TableCell className="text-center">
												{entry.criticalCount > 0 ? (
													<Badge variant="critical" className="font-mono">
														{entry.criticalCount}
													</Badge>
												) : (
													<span className="text-[var(--color-text-dim)]">
														0
													</span>
												)}
											</TableCell>

											<TableCell className="text-right">
												<span className="font-bold font-mono text-[var(--color-primary)]">
													{formatEther(entry.totalEarned)} ETH
												</span>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</NeonPanel>
				)}

				{!isLoading && !error && leaderboard.length > 0 && (
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
						<StatCard label="Total Hunters" value={leaderboard.length} />
						<StatCard
							label="Total Payouts"
							value={formatEther(summaryStats.totalEarned).slice(0, 8)}
							subValue="ETH"
						/>
						<StatCard
							label="Critical Bugs"
							value={summaryStats.totalCritical}
							color="var(--color-error)"
						/>
						<StatCard
							label="High Severity"
							value={summaryStats.totalHigh}
							color="var(--color-error)"
						/>
					</div>
				)}
			</div>
		</div>
	);
}

export default Leaderboard;
