import { generateMnemonic } from "bip39";
import * as lwk from "lwk_wasm";
import CryptoJS from "crypto-js";

export const generateNewMnemonic = () => {
  return generateMnemonic();
};

export const getNetwork = () => {
  // add logic, now hardcoded
  return lwk.Network.testnet();
};

export const generateNewSigner = (mnemonic: string, network: lwk.Network) => {
  const lwkMnemonic = new lwk.Mnemonic(mnemonic);
  const signer = new lwk.Signer(lwkMnemonic, network);
  return signer;
};

export const generateLiquidDescriptor = (signer: lwk.Signer) => {
  return signer.wpkhSlip77Descriptor().toString();
};

export const encryptWalletToLocalStorageWithPassphrase = (
  passphrase: string,
  descriptor: string,
) => {
  const encryptedDescriptor = CryptoJS.AES.encrypt(
    descriptor,
    passphrase,
  ).toString();

  if (!window) {
    console.error("Local storage is only accessible through user's client.");
    return;
  }

  const localStorage = window.localStorage;
  localStorage.setItem("liquid-wallet-ct-descriptor", encryptedDescriptor);
};

export const getDecryptedDescriptorFromLocalStorage = (passphrase: string) => {
  const localStorage = window.localStorage;
  const encryptedDescriptor = localStorage.getItem(
    "liquid-wallet-ct-descriptor",
  ) || "";

  const decryptedDescriptor = CryptoJS.AES.decrypt(
    encryptedDescriptor,
    passphrase,
  ).toString(CryptoJS.enc.Utf8);

  return decryptedDescriptor;
};

export const isValidPassphraseWallet = (passphrase: string) => {
  if (!passphrase) {
    return false;
  }

  const bool =
    !!getDecryptedDescriptorFromLocalStorage(passphrase)?.startsWith("ct");
  return bool;
};

export const getAddress = (descriptor: lwk.WolletDescriptor) => {
  const wollet = new lwk.Wollet(getNetwork(), descriptor);
  return wollet.address(0);
};

export const getBalance = (descriptor: lwk.WolletDescriptor) => {
  const wollet = new lwk.Wollet(getNetwork(), descriptor);
  const balance: Map<string, string> = wollet.balance();
  return balance;
};
