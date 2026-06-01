import type { Proof, Wallet } from "@cashu/cashu-ts";

type WalletLike = Wallet & Record<string, any>;

export function amountToNumber(amount: unknown): number {
  if (
    amount &&
    typeof amount === "object" &&
    "toNumber" in amount &&
    typeof amount.toNumber === "function"
  ) {
    return amount.toNumber();
  }

  return Number(amount);
}

export function proofAmount(proof: Proof | { amount: unknown }): number {
  return amountToNumber(proof.amount);
}

export async function ensureMintLoaded(wallet: WalletLike): Promise<void> {
  if (typeof wallet.loadMint === "function") {
    await wallet.loadMint();
  }
}

export async function createMintQuote(
  wallet: WalletLike,
  amount: number
): Promise<any> {
  await ensureMintLoaded(wallet);
  if (typeof wallet.createMintQuoteBolt11 === "function") {
    return wallet.createMintQuoteBolt11(amount);
  }
  return (wallet as any).createMintQuote(amount);
}

export async function checkMintQuote(
  wallet: WalletLike,
  quote: string
): Promise<any> {
  await ensureMintLoaded(wallet);
  if (typeof wallet.checkMintQuoteBolt11 === "function") {
    return wallet.checkMintQuoteBolt11(quote);
  }
  return (wallet as any).checkMintQuote(quote);
}

export async function mintProofs(
  wallet: WalletLike,
  amount: number,
  quote: string
): Promise<Proof[]> {
  await ensureMintLoaded(wallet);
  if (typeof wallet.mintProofsBolt11 === "function") {
    return wallet.mintProofsBolt11(amount, quote);
  }
  return (wallet as any).mintProofs(amount, quote);
}

export async function createMeltQuote(
  wallet: WalletLike,
  invoice: string
): Promise<any> {
  await ensureMintLoaded(wallet);
  if (typeof wallet.createMeltQuoteBolt11 === "function") {
    return wallet.createMeltQuoteBolt11(invoice);
  }
  return (wallet as any).createMeltQuote(invoice);
}

export async function meltProofs(
  wallet: WalletLike,
  meltQuote: any,
  proofsToSend: Proof[]
): Promise<any> {
  await ensureMintLoaded(wallet);
  if (typeof wallet.meltProofsBolt11 === "function") {
    return wallet.meltProofsBolt11(meltQuote, proofsToSend);
  }
  return (wallet as any).meltProofs(meltQuote, proofsToSend);
}

export async function getWalletKeysets(wallet: WalletLike): Promise<any[]> {
  await ensureMintLoaded(wallet);
  if (wallet.keyChain && typeof wallet.keyChain.getKeysets === "function") {
    return wallet.keyChain.getKeysets();
  }
  if (typeof wallet.getKeySets === "function") {
    return wallet.getKeySets();
  }
  return [];
}
