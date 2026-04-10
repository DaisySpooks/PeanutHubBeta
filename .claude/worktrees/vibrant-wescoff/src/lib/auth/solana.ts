import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";

export function assertValidWalletAddress(walletAddress: string) {
  try {
    return new PublicKey(walletAddress);
  } catch {
    throw new Error("Invalid wallet address.");
  }
}

export function verifyWalletSignature(params: {
  walletAddress: string;
  message: string;
  signature: Uint8Array;
}) {
  const publicKey = assertValidWalletAddress(params.walletAddress);
  const messageBytes = new TextEncoder().encode(params.message);

  return nacl.sign.detached.verify(messageBytes, params.signature, publicKey.toBytes());
}
