import { describe, expect, it } from "vitest";
import { DUMMYVAULT_POC_TEMPLATES, H01_POC_TEMPLATE } from "../config";

const addressPattern = /^0x[a-fA-F0-9]{40}$/;

describe("PoC example templates", () => {
	it("uses a builder-compatible H01 template shape", () => {
		expect(H01_POC_TEMPLATE.chain).toBe("Sepolia");
		expect(H01_POC_TEMPLATE.forkBlock).toBeGreaterThan(0);
		expect(H01_POC_TEMPLATE.target).toMatch(addressPattern);
		expect(H01_POC_TEMPLATE.transactions.length).toBeGreaterThan(0);
		expect(H01_POC_TEMPLATE.transactions[0]?.to).toMatch(addressPattern);
		expect(H01_POC_TEMPLATE.transactions[0]?.data.startsWith("0x")).toBe(true);
		expect(H01_POC_TEMPLATE.impact.type).toMatch(
			/^(fundsDrained|accessEscalation|stateCorruption|other)$/,
		);
	});

	it("keeps dummy-vault templates loadable by current builder schema", () => {
		for (const entry of Object.values(DUMMYVAULT_POC_TEMPLATES)) {
			const template = entry.template as {
				target?: string;
				chain?: string;
				forkBlock?: number;
				transactions?: Array<{ to: string; data: string; value: string }>;
				impact?: { type?: string; description?: string };
			};

			expect(template.target).toMatch(addressPattern);
			expect(template.chain).toBe("Sepolia");
			expect((template.forkBlock ?? 0) > 0).toBe(true);
			expect(template.transactions && template.transactions.length > 0).toBe(true);

			const firstTx = template.transactions?.[0];
			expect(firstTx?.to).toMatch(addressPattern);
			expect(firstTx?.data.startsWith("0x")).toBe(true);
			expect(template.impact?.description?.length ?? 0).toBeGreaterThanOrEqual(10);
		}
	});
});
