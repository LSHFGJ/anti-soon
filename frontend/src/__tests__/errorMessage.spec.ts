import { describe, expect, it } from "vitest";
import { extractErrorMessage } from "../lib/errorMessage";

describe("extractErrorMessage", () => {
	it("prefers shortMessage over other fields", () => {
		const message = extractErrorMessage({
			shortMessage: "User rejected the request",
			message: "WriteContractError: long stack",
			details: "technical details",
		});

		expect(message).toBe("User rejected the request");
	});

	it("falls back to nested cause details", () => {
		const message = extractErrorMessage({
			cause: {
				details: "execution reverted: commit window closed",
			},
		});

		expect(message).toBe("execution reverted: commit window closed");
	});

	it("uses fallback for opaque non-object values", () => {
		expect(extractErrorMessage(42, "unknown queue error")).toBe("unknown queue error");
	});
});
