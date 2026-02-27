import { getAddress, isAddress } from "viem";

const ADDRESS_REGEX = /0x[a-fA-F0-9]{40}/;

export function normalizeEthereumAddress(value: unknown): `0x${string}` | null {
	if (typeof value !== "string") return null;

	const trimmed = value.trim();
	if (trimmed.length === 0) return null;

	const candidate = trimmed.match(ADDRESS_REGEX)?.[0] ?? trimmed;
	if (!isAddress(candidate)) return null;

	return getAddress(candidate);
}
