import { type ChangeEvent, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { isAddress, parseEther } from "viem";
import { z } from "zod";
import { ScopeEditor } from "@/components/ScopeEditor";
import { ScriptPicker } from "@/components/ScriptPicker";
import {
	NeonPanel,
	PageHeader,
	StatusBanner,
} from "@/components/shared/ui-primitives";
import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { ContractScope, DeployScript } from "@/types";
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI, CHAIN } from "../config";
import { useWallet } from "../hooks/useWallet";
import { buildCreateProjectThresholdPayload } from "../lib/createProjectThresholds";
import { clearPublicClientReadCache } from "../lib/publicClient";
import { createReactHookFormZodResolver } from "../lib/reactHookFormZodResolver";

const isValidAddress = (val: string): boolean => isAddress(val);

const getErrorMessage = (error: unknown): string => {
	if (typeof error === "object" && error !== null) {
		const maybeError = error as { shortMessage?: string; message?: string };
		return (
			maybeError.shortMessage || maybeError.message || "Transaction failed"
		);
	}

	return "Transaction failed";
};

const createProjectSchema = z
	.object({
		targetContract: z
			.string()
			.min(1, "Target contract address is required")
			.refine(isValidAddress, { message: "Invalid Ethereum address" }),
		forkBlock: z.string().optional(),
		bountyPool: z
			.string()
			.min(1, "Bounty pool is required")
			.refine((val) => Number(val) > 0, {
				message: "Bounty pool must be greater than 0 ETH",
			}),
		maxPayout: z
			.string()
			.min(1, "Max payout is required")
			.refine((val) => Number(val) > 0, {
				message: "Max payout must be greater than 0 ETH",
			}),
		mode: z.enum(["0", "1"]),
		commitDeadlineHours: z
			.string()
			.min(1, "Commit deadline is required")
			.refine((val) => Number(val) > 0, {
				message: "Commit deadline must be greater than 0 hours",
			}),
		revealDeadlineHours: z
			.string()
			.min(1, "Reveal deadline is required")
			.refine((val) => Number(val) > 0, {
				message: "Reveal deadline must be greater than 0 hours",
			}),
		maxAttackerSeed: z
			.string()
			.min(1, "Max attacker seed is required")
			.refine((val) => Number(val) >= 0, {
				message: "Max attacker seed must be 0 or greater",
			}),
		maxWarpSeconds: z
			.string()
			.min(1, "Max warp seconds is required")
			.refine((val) => Number(val) >= 0, {
				message: "Max warp seconds must be 0 or greater",
			}),
		allowImpersonation: z.boolean(),
		disputeWindowHours: z
			.string()
			.min(1, "Dispute window is required")
			.refine((val) => Number(val) > 0, {
				message: "Dispute window must be greater than 0 hours",
			}),
		highThreshold: z
			.string()
			.min(1, "High threshold is required")
			.refine((val) => Number(val) > 0, {
				message: "High threshold must be greater than 0",
			}),
		mediumThreshold: z
			.string()
			.min(1, "Medium threshold is required")
			.refine((val) => Number(val) > 0, {
				message: "Medium threshold must be greater than 0",
			}),
	})
	.superRefine((data, ctx) => {
		if (Number(data.maxPayout) > Number(data.bountyPool)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Max payout cannot exceed bounty pool",
				path: ["maxPayout"],
			});
		}
		if (Number(data.revealDeadlineHours) <= Number(data.commitDeadlineHours)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Reveal deadline must be after commit deadline",
				path: ["revealDeadlineHours"],
			});
		}
		if (Number(data.mediumThreshold) >= Number(data.highThreshold)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Medium must be less than high",
				path: ["mediumThreshold"],
			});
		}
	});

type FormData = z.infer<typeof createProjectSchema>;

const defaultValues: FormData = {
	targetContract: "",
	forkBlock: "0",
	bountyPool: "",
	maxPayout: "",
	mode: "0",
	commitDeadlineHours: "168",
	revealDeadlineHours: "336",
	maxAttackerSeed: "10",
	maxWarpSeconds: "86400",
	allowImpersonation: false,
	disputeWindowHours: "48",
	highThreshold: "5",
	mediumThreshold: "2",
};

const STEPS = [
	"REPOSITORY",
	"SCRIPT",
	"SCOPE",
	"BOUNTY",
	"RULES",
	"THRESHOLDS",
	"REVIEW",
] as const;

const stepFields: Record<number, (keyof FormData)[]> = {
	0: [],
	1: [],
	2: ["targetContract"],
	3: [
		"bountyPool",
		"maxPayout",
		"mode",
		"commitDeadlineHours",
		"revealDeadlineHours",
	],
	4: [
		"maxAttackerSeed",
		"maxWarpSeconds",
		"allowImpersonation",
		"disputeWindowHours",
	],
	5: ["highThreshold", "mediumThreshold"],
	6: [],
};

export function CreateProject() {
	const navigate = useNavigate();
	const {
		isConnected,
		address,
		connect,
		walletClient,
		isWrongNetwork = false,
		switchToCorrectNetwork = async () => {},
	} = useWallet({
		autoSwitchToSepolia: false,
	});

	const [activeStep, setActiveStep] = useState(0);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [txHash, setTxHash] = useState<string | null>(null);
	const [txError, setTxError] = useState<string | null>(null);

	const [repoUrl, setRepoUrl] = useState("");
	const [isScanning, setIsScanning] = useState(false);
	const [scanError, setScanError] = useState<string | null>(null);
	const [scripts, setScripts] = useState<DeployScript[]>([]);
	const [selectedScript, setSelectedScript] = useState<DeployScript | null>(
		null,
	);
	const [scopes, setScopes] = useState<ContractScope[]>([]);

	const form = useForm<FormData>({
		resolver: createReactHookFormZodResolver(createProjectSchema),
		defaultValues,
		mode: "onChange",
		shouldUnregister: false,
	});
	const primaryScopeAddress = scopes[0]?.address ?? null;

	useEffect(() => {
		form.register("targetContract");
	}, [form]);

	const bindTextInput = (field: {
		name: keyof FormData;
		value: string | undefined;
		onBlur: () => void;
		onChange: (value: string) => void;
	}) => ({
		name: field.name,
		value: field.value ?? "",
		onBlur: field.onBlur,
		onChange: (event: ChangeEvent<HTMLInputElement>) =>
			field.onChange(event.target.value),
	});

	const parseRepoUrl = (
		url: string,
	): { owner: string; repo: string } | null => {
		const match = url.trim().match(/github\.com\/([^/]+)\/([^/?]+)/i);
		if (!match) return null;
		return { owner: match[1], repo: match[2].replace(/\.git$/i, "") };
	};

	const extractContractNames = (content: string): string[] => {
		const contracts: string[] = [];
		const regex = /new\s+([A-Z][a-zA-Z0-9_]*)\s*\(/g;
		let match = regex.exec(content);
		while (match !== null) {
			if (!contracts.includes(match[1])) {
				contracts.push(match[1]);
			}
			match = regex.exec(content);
		}
		return contracts;
	};

	const handleScanRepo = async () => {
		setTxError(null);
		setScanError(null);

		const parsed = parseRepoUrl(repoUrl);
		if (!parsed) {
			setScanError(
				"Invalid GitHub repository URL. Example: https://github.com/owner/repo",
			);
			setScripts([]);
			setSelectedScript(null);
			setScopes([]);
			form.setValue("targetContract", defaultValues.targetContract);
			return;
		}

		setIsScanning(true);
		setSelectedScript(null);
		setScopes([]);
		form.setValue("targetContract", defaultValues.targetContract);

		try {
			const scriptDirResponse = await fetch(
				`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/script`,
				{
					headers: {
						Accept: "application/vnd.github+json",
						"X-GitHub-Api-Version": "2022-11-28",
					},
				},
			);

			if (!scriptDirResponse.ok) {
				throw new Error(
					`Failed to fetch script directory (${scriptDirResponse.status})`,
				);
			}

			const contents = (await scriptDirResponse.json()) as Array<{
				name: string;
				path: string;
				type: "file" | "dir";
				download_url: string | null;
			}>;

			const scriptFiles = contents.filter(
				(item) => item.type === "file" && item.name.endsWith(".s.sol"),
			);

			const scannedScripts: DeployScript[] = [];
			for (const file of scriptFiles) {
				if (!file.download_url) continue;

				const fileResponse = await fetch(file.download_url);
				if (!fileResponse.ok) continue;

				const content = await fileResponse.text();
				scannedScripts.push({
					name: file.name,
					path: file.path,
					contracts: extractContractNames(content),
				});
			}

			setScripts(scannedScripts);
			if (scannedScripts.length === 0) {
				setScanError(
					"No Foundry deployment scripts (*.s.sol) found in script/ directory",
				);
			}
		} catch (err) {
			setScripts([]);
			setScanError(
				err instanceof Error ? err.message : "Failed to scan repository",
			);
		} finally {
			setIsScanning(false);
		}
	};

	const validateStep = async (step: number): Promise<boolean> => {
		const fields = stepFields[step];
		if (fields.length === 0) return true;

		const results = await Promise.all(
			fields.map((field) => form.trigger(field)),
		);
		return results.every(Boolean);
	};

	const handleNext = async () => {
		if (activeStep === 0 && scripts.length === 0) {
			setTxError("Paste a GitHub repository URL and scan scripts first");
			return;
		}
		if (activeStep === 1 && !selectedScript) {
			setTxError("Select a deployment script");
			return;
		}
		if (activeStep === 2 && scopes.length === 0) {
			setTxError("Select at least one contract in scope");
			return;
		}
		setTxError(null);

		const isValid = await validateStep(activeStep);
		if (isValid) {
			setActiveStep((prev) => prev + 1);
		}
	};

	const handleBack = () => {
		setActiveStep((prev) => prev - 1);
	};

	const getSubmissionSnapshot = (): FormData => {
		const values = form.getValues();
		const definedValues = Object.fromEntries(
			Object.entries(values).filter(([, value]) => value !== undefined),
		) as Partial<FormData>;

		return {
			...defaultValues,
			...definedValues,
			targetContract:
				primaryScopeAddress ?? definedValues.targetContract ?? defaultValues.targetContract,
		};
	};

	const handleValidatedSubmit = async () => {
		form.clearErrors();
		setTxError(null);

		const snapshot = getSubmissionSnapshot();
		const result = await createProjectSchema.safeParseAsync(snapshot);

		if (!result.success) {
			for (const issue of result.error.issues) {
				const fieldName = issue.path[0];
				if (typeof fieldName === "string") {
					form.setError(fieldName as keyof FormData, {
						type: "manual",
						message: issue.message,
					});
				}
			}

			const firstFieldIssue = result.error.issues.find(
				(issue) => typeof issue.path[0] === "string",
			);
			if (firstFieldIssue) {
				const fieldName = firstFieldIssue.path[0] as keyof FormData;
				const issueStep = Object.entries(stepFields).find(([, fields]) =>
					fields.includes(fieldName),
				);
				if (issueStep) {
					setActiveStep(Number(issueStep[0]));
				}
			}

			setTxError("Review the highlighted fields before submitting");
			return;
		}

		await handleSubmit(result.data);
	};

	const handleSubmit = async (data: FormData) => {
		if (!isConnected || !walletClient) {
			setTxError("Wallet not connected");
			return;
		}

		const scopeStepValid = await validateStep(2);
		if (!scopeStepValid) {
			setActiveStep(2);
			return;
		}

		const targetContract = primaryScopeAddress ?? data.targetContract;
		if (!targetContract || !isValidAddress(targetContract)) {
			setTxError("Select at least one contract in scope before submitting");
			setActiveStep(2);
			return;
		}

		setIsSubmitting(true);
		setTxError(null);
		setTxHash(null);

		try {
			const now = Math.floor(Date.now() / 1000);
			const commitDeadline = BigInt(
				now + Number(data.commitDeadlineHours) * 3600,
			);
			const revealDeadline = BigInt(
				now + Number(data.revealDeadlineHours) * 3600,
			);
			const disputeWindow = BigInt(Number(data.disputeWindowHours) * 3600);
			const thresholds = buildCreateProjectThresholdPayload({
				highThreshold: data.highThreshold,
				mediumThreshold: data.mediumThreshold,
			});

			const hash = await walletClient.writeContract({
				address: BOUNTY_HUB_ADDRESS,
				abi: BOUNTY_HUB_V2_ABI,
				functionName: "registerProjectV2",
				chain: CHAIN,
				account: address,
				value: parseEther(data.bountyPool),
				args: [
					targetContract as `0x${string}`,
					parseEther(data.maxPayout),
					BigInt(data.forkBlock || 0),
					data.mode === "0" ? 0 : 1,
					commitDeadline,
					revealDeadline,
					disputeWindow,
					{
						maxAttackerSeedWei: parseEther(data.maxAttackerSeed),
						maxWarpSeconds: BigInt(data.maxWarpSeconds),
						allowImpersonation: data.allowImpersonation,
						thresholds,
					},
				],
			});
			clearPublicClientReadCache();

			setTxHash(hash);

			setTimeout(() => {
				navigate("/explorer");
			}, 3000);
		} catch (err: unknown) {
			console.error("Transaction failed:", err);
			setTxError(getErrorMessage(err));
		} finally {
			setIsSubmitting(false);
		}
	};

	const renderStepIndicator = () => (
		<div className="wizard-steps">
			{STEPS.map((step, index) => (
				<div key={step} className="wizard-step">
					<div className="flex items-center">
						<div
							className={`wizard-step-number ${index < activeStep ? "completed" : ""} ${index === activeStep ? "active" : ""}`}
						>
							{index < activeStep ? "✓" : index + 1}
						</div>
						<span
							className={`wizard-step-label ml-2 ${index === activeStep ? "active" : ""} ${index <= activeStep ? "text-[var(--color-primary)]" : "text-[var(--color-text-dim)]"}`}
						>
							{step}
						</span>
					</div>
					{index < STEPS.length - 1 && (
						<div
							className={`wizard-connector mx-3 ${index < activeStep ? "bg-[var(--color-primary)]" : "bg-[var(--color-text-dim)]"}`}
						/>
					)}
				</div>
			))}
		</div>
	);

	const renderRepositoryStep = () => (
		<div className="animate-[fadeIn_0.3s_linear]">
			<h3 className="text-[var(--color-primary)] mb-6 font-mono">
				{"// STEP_01: REPOSITORY URL"}
			</h3>
			<p className="text-[var(--color-text-dim)] mb-8">
				Paste a public GitHub repository URL and scan for Foundry deployment
				scripts.
			</p>
			<div className="flex gap-3 items-center">
				<Input
					placeholder="https://github.com/owner/repo"
					value={repoUrl}
					onChange={(e) => {
						setRepoUrl(e.target.value);
						setScanError(null);
						setTxError(null);
					}}
					className="bg-transparent border-[var(--color-bg-light)] focus:border-[var(--color-primary)]"
				/>
				<Button
					type="button"
					onClick={handleScanRepo}
					disabled={isScanning || !repoUrl.trim()}
					className="btn-cyber"
				>
					{isScanning ? "[ SCANNING... ]" : "[ SCAN ]"}
				</Button>
			</div>
			{scanError && (
				<p className="text-[var(--color-error)] mt-4 text-sm">✗ {scanError}</p>
			)}
			{scripts.length > 0 && (
				<p className="text-[var(--color-primary)] mt-4 text-sm">
					✓ Found {scripts.length} deployment script
					{scripts.length === 1 ? "" : "s"}. Click NEXT to continue.
				</p>
			)}
		</div>
	);

	const renderScriptStep = () => (
		<div className="animate-[fadeIn_0.3s_linear]">
			<h3 className="text-[var(--color-primary)] mb-6 font-mono">
				{"// STEP_02: SELECT DEPLOY SCRIPT"}
			</h3>
			<p className="text-[var(--color-text-dim)] mb-4">
				Select a Foundry deployment script to deploy your contracts.
			</p>
			<ScriptPicker
				scripts={scripts}
				isLoading={false}
				error={null}
				selectedScript={selectedScript}
				onSelect={(script) => {
					setSelectedScript(script);
					setTxError(null);
				}}
			/>
		</div>
	);

	const renderScopeStep = () => {
		const contracts =
			selectedScript?.contracts.map((name, i) => ({
				name,
				address: `0x${(i + 1).toString(16).padStart(40, "0")}` as `0x${string}`,
				verified: true,
			})) || [];

		return (
			<div className="animate-[fadeIn_0.3s_linear]">
				<h3 className="text-[var(--color-primary)] mb-6 font-mono">
					{"// STEP_03: DEFINE SCOPE"}
				</h3>
				<p className="text-[var(--color-text-dim)] mb-4">
					Select which contracts should be included in the audit scope.
				</p>
				<ScopeEditor
					contracts={contracts}
					initialScopes={scopes}
					onScopeChange={(newScopes) => {
						setScopes(newScopes);
						form.setValue(
							"targetContract",
							newScopes[0]?.address ?? defaultValues.targetContract,
							{ shouldDirty: true, shouldValidate: true },
						);
						setTxError(null);
					}}
				/>
			</div>
		);
	};

	const renderBountyStep = () => (
		<div className="animate-[fadeIn_0.3s_linear]">
			<h3 className="text-[var(--color-primary)] mb-6 font-mono">
				{"// STEP_04: BOUNTY CONFIG"}
			</h3>

			<div className="grid grid-cols-2 gap-6">
				<FormField
					control={form.control}
					name="bountyPool"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
								BOUNTY POOL (ETH) *
							</FormLabel>
							<FormControl>
								<Input
									type="number"
									step="0.001"
									placeholder="1.0"
									className="bg-transparent border-[var(--color-bg-light)] focus:border-[var(--color-primary)]"
									ref={field.ref}
									{...bindTextInput(field)}
								/>
							</FormControl>
							<FormMessage className="text-[var(--color-error)]" />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="maxPayout"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
								MAX PAYOUT PER BUG (ETH) *
							</FormLabel>
							<FormControl>
								<Input
									type="number"
									step="0.001"
									placeholder="0.5"
									className="bg-transparent border-[var(--color-bg-light)] focus:border-[var(--color-primary)]"
									ref={field.ref}
									{...bindTextInput(field)}
								/>
							</FormControl>
							<FormMessage className="text-[var(--color-error)]" />
						</FormItem>
					)}
				/>
			</div>

			<FormField
				control={form.control}
				name="mode"
				render={({ field }) => (
					<FormItem className="mt-6">
						<FormLabel className="text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
							COMPETITION MODE *
						</FormLabel>
			<Select onValueChange={field.onChange} value={field.value}>
							<FormControl>
								<SelectTrigger className="bg-transparent border-[var(--color-bg-light)] focus:border-[var(--color-primary)]">
									<SelectValue placeholder="Select mode" />
								</SelectTrigger>
							</FormControl>
							<SelectContent className="bg-[var(--color-bg)] border-[var(--color-bg-light)]">
								<SelectItem value="0">
									<div className="flex items-center gap-2">
										<span className="font-bold text-[var(--color-primary)]">
											UNIQUE
										</span>
										<span className="text-xs text-[var(--color-text-dim)]">
											First valid reveal wins
										</span>
									</div>
								</SelectItem>
								<SelectItem value="1">
									<div className="flex items-center gap-2">
										<span className="font-bold text-[var(--color-secondary)]">
											MULTI
										</span>
										<span className="text-xs text-[var(--color-text-dim)]">
											Batch verification
										</span>
									</div>
								</SelectItem>
							</SelectContent>
						</Select>
						<FormMessage className="text-[var(--color-error)]" />
					</FormItem>
				)}
			/>

			<div className="grid grid-cols-2 gap-6 mt-6">
				<FormField
					control={form.control}
					name="commitDeadlineHours"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
								COMMIT DEADLINE (HOURS) *
							</FormLabel>
							<FormControl>
								<Input
									type="number"
									placeholder="168"
									min="1"
									className="bg-transparent border-[var(--color-bg-light)] focus:border-[var(--color-primary)]"
									ref={field.ref}
									{...bindTextInput(field)}
								/>
							</FormControl>
							<FormMessage className="text-[var(--color-error)]" />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="revealDeadlineHours"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
								REVEAL DEADLINE (HOURS) *
							</FormLabel>
							<FormControl>
								<Input
									type="number"
									placeholder="336"
									min="1"
									className="bg-transparent border-[var(--color-bg-light)] focus:border-[var(--color-primary)]"
									ref={field.ref}
									{...bindTextInput(field)}
								/>
							</FormControl>
							<FormMessage className="text-[var(--color-error)]" />
						</FormItem>
					)}
				/>
			</div>
		</div>
	);

	const renderRulesStep = () => (
		<div className="animate-[fadeIn_0.3s_linear]">
			<h3 className="text-[var(--color-primary)] mb-6 font-mono">
				{"// STEP_05: VERIFICATION RULES"}
			</h3>

			<div className="max-w-[300px]">
				<FormField
					control={form.control}
					name="disputeWindowHours"
					render={({ field }) => (
						<FormItem>
							<FormLabel className="text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
								DISPUTE WINDOW (HOURS) *
							</FormLabel>
							<FormControl>
								<Input
									type="number"
									placeholder="48"
									min="1"
									className="bg-transparent border-[var(--color-bg-light)] focus:border-[var(--color-primary)]"
									ref={field.ref}
									{...bindTextInput(field)}
								/>
							</FormControl>
							<FormDescription className="text-xs text-[var(--color-text-dim)]">
								Time for project owner to dispute AI verdicts
							</FormDescription>
							<FormMessage className="text-[var(--color-error)]" />
						</FormItem>
					)}
				/>
			</div>

			<details className="mt-6 border rounded-md border-[var(--color-bg-light)] bg-[rgba(255,255,255,0.02)] p-4">
				<summary className="cursor-pointer list-none text-xs font-mono uppercase tracking-wider text-[var(--color-text-dim)]">
					[ ADVANCED SANDBOX RULES ]
				</summary>

				<div className="mt-4 grid grid-cols-2 gap-6">
					<FormField
						control={form.control}
						name="maxAttackerSeed"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
									MAX ATTACKER SEED (ETH) *
								</FormLabel>
								<FormControl>
									<Input
										type="number"
										step="0.1"
										placeholder="10"
										min="0"
										className="bg-transparent border-[var(--color-bg-light)] focus:border-[var(--color-primary)]"
										ref={field.ref}
										{...bindTextInput(field)}
									/>
								</FormControl>
								<FormDescription className="text-xs text-[var(--color-text-dim)]">
									Maximum ETH attacker can give themselves in setup
								</FormDescription>
								<FormMessage className="text-[var(--color-error)]" />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="maxWarpSeconds"
						render={({ field }) => (
							<FormItem>
								<FormLabel className="text-xs uppercase tracking-wider text-[var(--color-text-dim)]">
									MAX WARP SECONDS *
								</FormLabel>
								<FormControl>
									<Input
										type="number"
										placeholder="86400"
										min="0"
										className="bg-transparent border-[var(--color-bg-light)] focus:border-[var(--color-primary)]"
										ref={field.ref}
										{...bindTextInput(field)}
									/>
								</FormControl>
								<FormDescription className="text-xs text-[var(--color-text-dim)]">
									Maximum time the PoC can warp forward (0 = unlimited)
								</FormDescription>
								<FormMessage className="text-[var(--color-error)]" />
							</FormItem>
						)}
					/>
				</div>

				<FormField
					control={form.control}
					name="allowImpersonation"
					render={({ field }) => (
						<FormItem className="mt-6">
							<label
								className={`flex items-center gap-3 cursor-pointer p-4 border rounded-md transition-colors ${field.value ? "border-[var(--color-primary)] bg-[rgba(124,58,237,0.1)]" : "border-[var(--color-text-dim)] bg-transparent"}`}
							>
								<FormControl>
									<input
										type="checkbox"
										checked={field.value}
										onChange={(e) => field.onChange(e.target.checked)}
										className="w-4 h-4 accent-[var(--color-primary)]"
									/>
								</FormControl>
								<div>
									<span className={`cursor-pointer ${field.value ? "font-bold" : ""}`}>
										ALLOW IMPERSONATION
									</span>
									<p className="text-xs mt-1 text-[var(--color-text-dim)]">
										Allow PoC to impersonate arbitrary addresses (e.g., for governance attacks)
									</p>
								</div>
							</label>
						</FormItem>
					)}
				/>
			</details>
		</div>
	);

	const renderThresholdsStep = () => (
		<div className="animate-[fadeIn_0.3s_linear]">
			<h3 className="text-[var(--color-primary)] mb-6 font-mono">
				{"// STEP_06: SEVERITY THRESHOLDS"}
			</h3>

			<p className="mb-6 text-sm text-[var(--color-text-dim)]">
				Define the two payout bands the current owner flow exposes. The legacy
				outer bands are derived automatically for compatibility.
			</p>

			<div className="flex flex-col gap-4">
				<div className="grid items-center gap-4 p-4 border rounded-md border-[var(--color-error)] bg-[var(--color-error-dim)] grid-cols-[120px_1fr_auto]">
					<span className="font-bold text-[var(--color-error)]">HIGH</span>
					<FormField
						control={form.control}
						name="highThreshold"
						render={({ field }) => (
							<FormItem>
								<FormControl>
									<Input
										type="number"
										step="0.1"
										placeholder="5"
										min="0"
										className="bg-transparent border-[var(--color-bg-light)] focus:border-[var(--color-primary)]"
										ref={field.ref}
										{...bindTextInput(field)}
									/>
								</FormControl>
								<FormMessage className="text-[var(--color-error)] text-xs" />
							</FormItem>
						)}
					/>
					<span className="text-[var(--color-text-dim)]">ETH</span>
				</div>

				<div className="grid items-center gap-4 p-4 border rounded-md border-[var(--color-gold)] bg-[var(--color-gold-dim)] grid-cols-[120px_1fr_auto]">
					<span className="font-bold text-[var(--color-gold)]">MEDIUM</span>
					<FormField
						control={form.control}
						name="mediumThreshold"
						render={({ field }) => (
							<FormItem>
								<FormControl>
									<Input
										type="number"
										step="0.1"
										placeholder="2"
										min="0"
										className="bg-transparent border-[var(--color-bg-light)] focus:border-[var(--color-primary)]"
										ref={field.ref}
										{...bindTextInput(field)}
									/>
								</FormControl>
								<FormMessage className="text-[var(--color-error)] text-xs" />
							</FormItem>
						)}
					/>
					<span className="text-[var(--color-text-dim)]">ETH</span>
				</div>
			</div>
		</div>
	);

	const renderReviewStep = () => {
		const formData = getSubmissionSnapshot();
		const reviewTargetContract = primaryScopeAddress ?? formData.targetContract;

		return (
			<div className="animate-[fadeIn_0.3s_linear]">
				<h3 className="text-[var(--color-primary)] mb-6 font-mono">
					{"// STEP_07: REVIEW & SUBMIT"}
				</h3>

				<div className="grid gap-6 mb-8 grid-cols-2">
					<div className="p-4 border rounded-md border-[var(--color-bg-light)] bg-[rgba(255,255,255,0.02)]">
						<h4 className="mb-4 text-xs font-mono text-[var(--color-secondary)]">
							[BASICS]
						</h4>
						<div className="text-sm font-mono">
							<div className="mb-2">
								<span className="text-[var(--color-text-dim)]">TARGET: </span>
								<span className="text-[var(--color-text)]">
									{reviewTargetContract || "—"}
								</span>
							</div>
							<div className="mb-2">
								<span className="text-[var(--color-text-dim)]">SCRIPT: </span>
								<span className="text-[var(--color-text)]">
									{selectedScript?.name || "—"}
								</span>
							</div>
							<div className="mt-2">
								<span className="text-[var(--color-text-dim)]">IN_SCOPE: </span>
								<span className="text-[var(--color-text)]">
									{scopes.length > 0 ? `${scopes.length} contract${scopes.length === 1 ? "" : "s"}` : "—"}
								</span>
							</div>
							<div className="mt-2">
								<span className="text-[var(--color-text-dim)]">REPO_URL: </span>
								<span className="text-[var(--color-text)]">
									{repoUrl || "—"}
								</span>
							</div>
						</div>
					</div>

					<div className="p-4 border rounded-md border-[var(--color-bg-light)] bg-[rgba(255,255,255,0.02)]">
						<h4 className="mb-4 text-xs font-mono text-[var(--color-secondary)]">
							[BOUNTY]
						</h4>
						<div className="text-sm font-mono">
							<div className="mb-2">
								<span className="text-[var(--color-text-dim)]">POOL: </span>
								<span className="font-bold text-[var(--color-primary)]">
									{formData.bountyPool} ETH
								</span>
							</div>
							<div className="mb-2">
								<span className="text-[var(--color-text-dim)]">
									MAX_PAYOUT:{" "}
								</span>
								<span>{formData.maxPayout} ETH</span>
							</div>
							<div>
								<span className="text-[var(--color-text-dim)]">MODE: </span>
								<span
									className={`font-bold ${formData.mode === "0" ? "text-[var(--color-primary)]" : "text-[var(--color-secondary)]"}`}
								>
									{formData.mode === "0" ? "UNIQUE" : "MULTI"}
								</span>
							</div>
						</div>
					</div>

					<details className="p-4 border rounded-md border-[var(--color-bg-light)] bg-[rgba(255,255,255,0.02)]">
						<summary className="cursor-pointer list-none text-xs font-mono text-[var(--color-secondary)]">
							[ ADVANCED RULES ]
						</summary>
						<div className="mt-4 text-sm font-mono">
							<div className="mb-2">
								<span className="text-[var(--color-text-dim)]">MAX_SEED: </span>
								<span>{formData.maxAttackerSeed} ETH</span>
							</div>
							<div className="mb-2">
								<span className="text-[var(--color-text-dim)]">MAX_WARP: </span>
								<span>{formData.maxWarpSeconds}s</span>
							</div>
							<div>
								<span className="text-[var(--color-text-dim)]">IMPERSONATE: </span>
								<span className={formData.allowImpersonation ? "text-[var(--color-primary)]" : "text-[var(--color-error)]"}>
									{formData.allowImpersonation ? "YES" : "NO"}
								</span>
							</div>
						</div>
					</details>

					<div className="p-4 border rounded-md border-[var(--color-bg-light)] bg-[rgba(255,255,255,0.02)]">
						<h4 className="mb-4 text-xs font-mono text-[var(--color-secondary)]">
							[THRESHOLDS]
						</h4>
						<div className="text-sm font-mono">
							<div className="mb-1">
								<span className="text-[var(--color-error)]">HIGH: </span>
								<span>{formData.highThreshold} ETH</span>
							</div>
							<div className="mb-1">
								<span className="text-[var(--color-gold)]">MEDIUM: </span>
								<span>{formData.mediumThreshold} ETH</span>
							</div>
						</div>
					</div>
				</div>

				<div className="p-4 border rounded-md mb-8 border-[var(--color-primary)] bg-[rgba(124,58,237,0.05)]">
					<h4 className="mb-4 text-xs font-mono text-[var(--color-primary)]">
						[TIMELINE]
					</h4>
					<div className="grid gap-4 text-sm font-mono grid-cols-3">
						<div>
							<span className="text-[var(--color-text-dim)]">
								COMMIT DEADLINE:{" "}
							</span>
							<span>{formData.commitDeadlineHours}h from now</span>
						</div>
						<div>
							<span className="text-[var(--color-text-dim)]">
								REVEAL DEADLINE:{" "}
							</span>
							<span>{formData.revealDeadlineHours}h from now</span>
						</div>
						<div>
							<span className="text-[var(--color-text-dim)]">
								DISPUTE WINDOW:{" "}
							</span>
							<span>{formData.disputeWindowHours}h</span>
						</div>
					</div>
				</div>

				{!isConnected && (
					<StatusBanner
						variant="error"
						className="mb-6 text-center"
						message={
							<>
								<p className="mb-4">
									Wallet not connected. Connect your wallet to submit.
								</p>
								<Button onClick={connect} className="btn-cyber">
									CONNECT WALLET
								</Button>
							</>
						}
					/>
				)}

				{isConnected && isWrongNetwork && (
					<StatusBanner
						variant="warning"
						className="mb-6 text-center"
						message={
							<>
								<p className="mb-4">
									Switch to Sepolia before submitting this project.
								</p>
								<Button onClick={() => void switchToCorrectNetwork()} className="btn-cyber">
									SWITCH NETWORK
								</Button>
							</>
						}
					/>
				)}

				{txHash && (
					<StatusBanner
						variant="success"
						className="mb-6"
						message={
							<>
								<p className="text-sm font-mono mb-2">
									✓ TRANSACTION SUBMITTED
								</p>
								<p className="text-xs font-mono break-all">
									<span className="text-[var(--color-text-dim)]">
										TX_HASH:{" "}
									</span>
									<a
										href={`https://sepolia.etherscan.io/tx/${txHash}`}
										target="_blank"
										rel="noopener noreferrer"
										className="text-[var(--color-secondary)]"
									>
										{txHash}
									</a>
								</p>
								<p className="text-xs mt-2 text-[var(--color-text-dim)]">
									Redirecting to explorer...
								</p>
							</>
						}
					/>
				)}

				{txError && (
					<StatusBanner
						variant="error"
						className="mb-6"
						message={
							<>
								<p className="text-sm font-mono">✗ TRANSACTION FAILED</p>
								<p className="text-xs font-mono mt-2 text-[var(--color-text)]">
									{txError}
								</p>
							</>
						}
					/>
				)}

				{isConnected && (
					<div className="p-3 border rounded-md mb-6 text-xs font-mono border-[var(--color-bg-light)]">
						<span className="text-[var(--color-text-dim)]">
							SUBMITTING FROM:{" "}
						</span>
						<span className="text-[var(--color-secondary)]">{address}</span>
					</div>
				)}
			</div>
		);
	};

	const renderStepContent = (stepIndex: number) => {
		switch (stepIndex) {
			case 0:
				return renderRepositoryStep();
			case 1:
				return renderScriptStep();
			case 2:
				return renderScopeStep();
			case 3:
				return renderBountyStep();
			case 4:
				return renderRulesStep();
			case 5:
				return renderThresholdsStep();
			case 6:
				return renderReviewStep();
			default:
				return null;
		}
	};

	const renderCurrentStep = () =>
		STEPS.map((step, index) => (
			<div
				key={step}
				hidden={activeStep !== index}
				aria-hidden={activeStep !== index}
				className={activeStep === index ? "h-full" : "hidden"}
			>
				{renderStepContent(index)}
			</div>
		));

	const reviewActionLabel = !isConnected
		? "[ CONNECT WALLET TO SUBMIT ]"
		: isWrongNetwork
			? "[ SWITCH TO SEPOLIA ]"
			: "[ SUBMIT PROJECT ]";

	const reviewActionType = isConnected && !isWrongNetwork ? "submit" : "button";

	const handleReviewAction = () => {
		if (isSubmitting || txHash) {
			return;
		}

		if (!isConnected) {
			void connect();
			return;
		}

		if (isWrongNetwork) {
			void switchToCorrectNetwork();
		}
	};

	return (
		<div className="min-h-[calc(100vh-142px)] flex flex-col py-6">
			<div className="container flex-1 flex flex-col min-h-0">
				<PageHeader
					title="CREATE PROJECT"
					subtitle="> Register a new bounty project on-chain"
					className="mb-4"
				/>

				<div className="shrink-0 mb-4">{renderStepIndicator()}</div>

				<Form {...form}>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void handleValidatedSubmit();
						}}
						className="flex flex-col flex-1 min-h-0"
					>
						<NeonPanel className="flex-1 overflow-auto" contentClassName="p-4">
							{renderCurrentStep()}
						</NeonPanel>

						<div className="flex justify-between gap-4 shrink-0 mt-4">
							<Button
								type="button"
								onClick={handleBack}
								disabled={activeStep === 0 || isSubmitting}
								variant="outline"
								className={`btn-cyber ${activeStep === 0 ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
							>
								[ PREVIOUS ]
							</Button>

							{activeStep < STEPS.length - 1 ? (
								<Button
									key="wizard-next"
									type="button"
									onClick={handleNext}
									className="btn-cyber"
								>
									[ NEXT ]
								</Button>
							) : (
							<Button
								key="wizard-review-action"
								type={reviewActionType}
								onClick={reviewActionType === "button" ? handleReviewAction : undefined}
								disabled={isSubmitting || !!txHash}
								className={`btn-cyber min-w-[180px] ${isSubmitting || txHash ? "opacity-50" : ""}`}
							>
								{isSubmitting ? (
										<>
											<span className="spinner mr-2" />
											SUBMITTING...
										</>
								) : txHash ? (
									"✓ SUBMITTED"
								) : (
									reviewActionLabel
								)}
							</Button>
							)}
						</div>
					</form>
				</Form>
			</div>
		</div>
	);
}

export default CreateProject;
