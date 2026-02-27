import { describe, expect, it } from "vitest";
import { normalizeEthereumAddress } from "../lib/address";

describe("normalizeEthereumAddress", () => {
	it("normalizes a raw ethereum address", () => {
		expect(
			normalizeEthereumAddress("0x1111111111111111111111111111111111111111"),
		).toBe("0x1111111111111111111111111111111111111111");
	});

	it("extracts address from CAIP-like strings", () => {
		expect(
			normalizeEthereumAddress(
				"eip155:11155111:0x2222222222222222222222222222222222222222",
			),
		).toBe("0x2222222222222222222222222222222222222222");
	});

	it("returns null for malformed input", () => {
		expect(normalizeEthereumAddress("wallet:abc")).toBeNull();
		expect(normalizeEthereumAddress(123)).toBeNull();
	});
});
