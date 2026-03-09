import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatEther } from "viem";
import {
	buildPreviewProject,
	formatPreviewFallbackMessage,
	shouldUsePreviewFallback,
} from "@/lib/previewFallback";
import { Hero } from "../components/Hero";
import { HowItWorks } from "../components/HowItWorks";
import { AnimatedStatCard } from "../components/shared/AnimatedStatCard";
import { StatCardSkeletonGrid } from "../components/skeletons/StatCardSkeleton";
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from "../config";
import {
	pageTransition,
	slideUp,
	staggerChild,
	staggerContainer,
} from "../lib/animations";
import { readProjectsByIds } from "../lib/projectReads";
import { readContractWithRpcFallback } from "../lib/publicClient";
import type { Project } from "../types";

const AnimatedSection = ({
	children,
	delay = 0,
	className = "",
}: {
	children: React.ReactNode;
	delay?: number;
	className?: string;
}) => (
	<motion.div
		variants={slideUp}
		initial="hidden"
		whileInView="visible"
		viewport={{ once: true, margin: "-80px" }}
		transition={{ delay }}
		className={className}
	>
		{children}
	</motion.div>
);

const ProjectCard = ({
	project,
	index,
}: {
	project: Project;
	index: number;
}) => (
	<Link to={`/project/${project.id.toString()}`} className="block no-underline">
		<motion.div
			variants={staggerChild}
			className="landing-project-card"
			whileHover={{
				borderColor: "var(--color-primary-dim)",
				boxShadow: "0 10px 30px -10px var(--color-primary-dim)",
				y: -6,
			}}
			transition={{ duration: 0.2, ease: "linear" }}
		>
			<div className="landing-project-card-highlight" />

			<motion.div
				className={`landing-project-card-status ${project.active ? "active" : "reporting"}`}
				initial={{ opacity: 0, x: 20 }}
				animate={{ opacity: 1, x: 0 }}
				transition={{ delay: 0.2 + index * 0.1 }}
			>
				{project.active ? "ACTIVE" : "INACTIVE"}
			</motion.div>

			<h3 className="landing-project-card-title">
				{`PROJECT_#${project.id.toString()}`}
			</h3>

			<p className="landing-project-card-desc">
				{`Target ${project.targetContract.slice(0, 6)}...${project.targetContract.slice(-4)} on ${project.mode === 0 ? "UNIQUE" : "MULTI"} mode.`}
			</p>

			<div className="landing-project-card-footer">
				<span className="text-[var(--color-text-dim)]">BOUNTY</span>
				<motion.span
					className="landing-project-card-bounty"
					whileHover={{
						textShadow: "0 0 20px var(--color-primary-glow)",
					}}
				>
					{`${formatEther(project.bountyPool)} ETH`}
				</motion.span>
			</div>

			<div className="landing-project-card-findings">
				<span className="severity-badge low">LIVE</span>
			</div>
		</motion.div>
	</Link>
);

type LandingStats = {
	totalBounties: string;
	averageRevealTime: string;
};

function formatAverageRevealTime(averageSeconds: bigint | null): string {
	if (averageSeconds == null || averageSeconds <= 0n) {
		return "N/A";
	}

	if (averageSeconds < 3600n) {
		return `${averageSeconds / 60n}m`;
	}

	if (averageSeconds < 86400n) {
		const hours = averageSeconds / 3600n;
		const minutes = (averageSeconds % 3600n) / 60n;
		return `${hours}h ${minutes}m`;
	}

	const days = averageSeconds / 86400n;
	const hours = (averageSeconds % 86400n) / 3600n;
	return `${days}d ${hours}h`;
}

function deriveLandingStats(projects: Project[]): LandingStats {
	const now = BigInt(Math.floor(Date.now() / 1000));
	const activeProjects = projects.filter((project) => project.active);
	const revealDurations = activeProjects
		.filter((project) => project.revealDeadline > now)
		.map((project) => project.revealDeadline - now);

	const averageRevealTime =
		revealDurations.length === 0
			? null
			: revealDurations.reduce((sum, duration) => sum + duration, 0n) /
				BigInt(revealDurations.length);

	return {
		totalBounties: activeProjects.length.toString(),
		averageRevealTime: formatAverageRevealTime(averageRevealTime),
	};
}

const StatSection = ({
	isLoading,
	stats,
}: {
	isLoading: boolean;
	stats: LandingStats;
}) => (
	<section className="landing-stat-section">
		<div className="container">
			<AnimatePresence mode="wait">
				{isLoading ? (
					<motion.div
						key="skeleton"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
					>
						<StatCardSkeletonGrid count={4} />
					</motion.div>
				) : (
					<motion.div
						key="stats"
						variants={staggerContainer}
						initial="hidden"
						animate="visible"
						className="landing-stat-grid"
					>
						<AnimatedStatCard
							label="Total Bounties"
							value={stats.totalBounties}
							subValue="Active Projects"
							delay={0}
						/>
						<AnimatedStatCard
							label="Total Paid"
							value="0 ETH"
							subValue="In Rewards"
							delay={0.1}
						/>
						<AnimatedStatCard
							label="Auditors"
							value="0"
							subValue="Registered"
							delay={0.2}
						/>
						<AnimatedStatCard
							label="Average Time"
							value={stats.averageRevealTime}
							subValue="Until reveal deadline"
							color="var(--color-secondary)"
							delay={0.3}
						/>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	</section>
);

function useLandingProjects() {
	const [projects, setProjects] = useState<Project[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchFeaturedProjects = useCallback(async () => {
		try {
			setIsLoading(true);
			setError(null);

			const nextProjectId = (await readContractWithRpcFallback({
				address: BOUNTY_HUB_ADDRESS,
				abi: BOUNTY_HUB_V2_ABI,
				functionName: "nextProjectId",
			})) as bigint;

			if (nextProjectId === 0n) {
				setProjects([]);
				return;
			}

			const projectIds = Array.from(
				{ length: Number(nextProjectId) },
				(_, index) => BigInt(index),
			);
			const fetchedProjects: Project[] = await readProjectsByIds(projectIds);

			setProjects(fetchedProjects);
		} catch (err) {
			console.error("Failed to fetch featured projects:", err);
			if (shouldUsePreviewFallback()) {
				setProjects([
					buildPreviewProject(0n),
					buildPreviewProject(1n),
					buildPreviewProject(2n),
				]);
				setError(
					formatPreviewFallbackMessage(
						"Failed to load projects from blockchain",
					),
				);
				return;
			}

			setProjects([]);
			setError("Failed to load projects from blockchain");
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchFeaturedProjects();
	}, [fetchFeaturedProjects]);

	return {
		projects,
		isLoading,
		error,
	};
}

const FeaturedProjectsSection = ({
	projects,
	isLoading,
	error,
}: {
	projects: Project[];
	isLoading: boolean;
	error: string | null;
}) => {
	const featuredProjects = useMemo(
		() => projects.filter((project) => project.active).slice(0, 3),
		[projects],
	);

	return (
		<section className="landing-featured-section">
			<div className="container">
				<motion.div
					variants={staggerContainer}
					initial={false}
					animate="visible"
				>
					<motion.div variants={staggerChild} className="page-header">
						<h2 className="page-title">Featured Projects</h2>
						<div className="page-divider" />
						<p className="page-subtitle">
							Active bounty opportunities awaiting your findings
						</p>
					</motion.div>

					{error ? (
						<motion.p
							variants={staggerChild}
							className="text-sm font-mono text-[var(--color-warning)] mb-4"
						>
							{error}
						</motion.p>
					) : null}

					<motion.div
						variants={staggerContainer}
						className="landing-featured-grid"
					>
						{isLoading
							? ["alpha", "beta", "gamma"].map((skeletonKey) => (
									<div
										key={`featured-skeleton-${skeletonKey}`}
										className="landing-project-card animate-pulse"
										aria-hidden
									/>
								))
							: featuredProjects.map((project, idx) => (
									<ProjectCard
										key={project.id.toString()}
										project={project}
										index={idx}
									/>
								))}
					</motion.div>

					<motion.div
						variants={staggerChild}
						className="landing-featured-footer"
					>
						<Link to="/explorer" className="btn-cyber">
							View All Projects
						</Link>
					</motion.div>
				</motion.div>
			</div>
		</section>
	);
};

const CTASection = () => (
	<section className="landing-cta-section">
		<div className="landing-cta-bg" />
		<div className="container landing-cta-content">
			<motion.div
				variants={staggerContainer}
				initial="hidden"
				whileInView="visible"
				viewport={{ once: true }}
			>
				<motion.h2 variants={staggerChild} className="landing-cta-title">
					READY TO SUBMIT A POC?
				</motion.h2>

				<motion.p variants={staggerChild} className="landing-cta-desc">
					Connect your wallet and use our PoC Builder to craft, encrypt, and
					submit your vulnerability proof-of-concept. Get verified in seconds,
					not weeks.
				</motion.p>

				<motion.div variants={staggerChild}>
					<Link to="/builder" className="btn-cyber landing-cta-btn">
						<span className="opacity-70">[</span>
						<span>START BUILDING POC</span>
						<span className="opacity-70">]</span>
					</Link>
				</motion.div>

				<motion.div
					variants={staggerChild}
					className="mt-16 pt-8 border-t border-[var(--color-primary-dim)]/30 flex flex-col items-center justify-center gap-6"
				>
					<span className="text-xs font-mono text-[var(--color-text-dim)] uppercase tracking-widest">
						Powered by
					</span>
					<div className="flex flex-wrap items-center justify-center gap-10 opacity-90 transition-opacity duration-300">
						<a
							href="https://chain.link/"
							target="_blank"
							rel="noreferrer"
							aria-label="Chainlink"
							className="inline-flex h-8 w-[168px] items-center justify-center hover:opacity-100 transition-opacity"
						>
							<img
								src="/logo/chainlink-official.svg"
								alt="Chainlink"
								className="h-full w-full object-contain"
								loading="lazy"
								decoding="async"
							/>
						</a>

						<a
							href="https://tenderly.co/"
							target="_blank"
							rel="noreferrer"
							aria-label="Tenderly"
							className="inline-flex h-8 w-[168px] items-center justify-center hover:opacity-100 transition-opacity"
						>
							<img
								src="/logo/tenderly-official.svg"
								alt="Tenderly"
								className="h-full w-full object-contain"
								loading="lazy"
								decoding="async"
							/>
						</a>
					</div>
				</motion.div>
			</motion.div>
		</div>
	</section>
);

export function Landing() {
	const { projects, isLoading, error } = useLandingProjects();
	const stats = useMemo(() => deriveLandingStats(projects), [projects]);

	return (
		<motion.main
			key="page-content"
			variants={pageTransition}
			initial={false}
			animate="visible"
			exit="exit"
			className="landing-main"
		>
			<div className="cyber-grid-bg landing-cyber-grid" />

			<AnimatedSection>
				<Hero />
			</AnimatedSection>

			<StatSection isLoading={isLoading} stats={stats} />

			<FeaturedProjectsSection
				projects={projects}
				isLoading={isLoading}
				error={error}
			/>

			<AnimatedSection delay={0.1}>
				<HowItWorks />
			</AnimatedSection>

			<CTASection />

			<div className="h-0" />
		</motion.main>
	);
}

export default Landing;
