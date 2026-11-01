import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
export const digest = (value: string) =>
  bytesToHex(sha256(new TextEncoder().encode(value)));
