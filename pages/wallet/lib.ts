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

export const getAddress = (descriptor: lwk.WolletDescriptor, index?: number) => {
  const wollet = new lwk.Wollet(getNetwork(), descriptor);
  return wollet.address(index);
};

export const getBalance = (descriptor: lwk.WolletDescriptor) => {
  const doIt = async () => {
    const wollet = new lwk.Wollet(getNetwork(), descriptor);
    const esploraClient = new lwk.EsploraClient(getNetwork(), "https://waterfalls.liquidwebwallet.org/liquidtestnet/api", true);
    const update = await esploraClient.fullScan(wollet);

    if (update instanceof lwk.Update) {
      const walletStatus = wollet.status();
      wollet.applyUpdate(update);
      const balance = wollet.balance();
      const transactions = wollet.transactions();
      return {
        balance,
        transactions
      }
    }
  }

  return doIt();
};

export const isValidDescriptor = (descriptorInput: string) => {
  try {
    new lwk.WolletDescriptor(descriptorInput);
    return true;
  } catch(_) {
    return false;
  }
}

export function mapBalance(map: any) {
  map.forEach((value: bigint, key: any) => {
      map.set(key, mapAssetPrecision(key, value))
  })
  return map
}

/// returns the Ticker if the asset id maps to featured ones
export function mapAssetTicker(assetHex: string) {
  return _mapAssetHex(assetHex)[0]
}

/// returns the asset value with the precision associated with the given asset hex if exist or 0 precision
export function mapAssetPrecision(assetHex: string, value: bigint) {
  const precision = _mapAssetHex(assetHex)[1]
  return formatPrecision(value, Number(precision))
}

export function formatPrecision(value: bigint, precision: number) {
  const prec = new lwk.Precision(precision)
  return prec.satsToString(value)
}

export function parsePrecision(assetHex: string, value: bigint) {
  const valueStr = value.toString()
  const precision = _mapAssetHex(assetHex)[1]
  const prec = new lwk.Precision(Number(precision))
  return prec.stringToSats(valueStr)
}

function _mapAssetHex(assetHex: string) {
  switch (assetHex) {
      case "6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d": return ["L-BTC", 8]
      case "fee": return ["fee", 8]
      case "144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49": return ["tL-BTC", 8]

      case "ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2": return ["USDt", 8]
      case "0e99c1a6da379d1f4151fb9df90449d40d0608f6cb33a5bcbfc8c265f42bab0a": return ["LCAD", 8]
      case "18729918ab4bca843656f08d4dd877bed6641fbd596a0a963abbf199cfeb3cec": return ["EURx", 8]
      case "78557eb89ea8439dc1a519f4eb0267c86b261068648a0f84a5c6b55ca39b66f1": return ["B-JDE", 0]
      case "11f91cb5edd5d0822997ad81f068ed35002daec33986da173461a8427ac857e1": return ["BMN1", 2]
      case "52d77159096eed69c73862a30b0d4012b88cedf92d518f98bc5fc8d34b6c27c9": return ["EXOeu", 0]
      case "9c11715c79783d7ba09ecece1e82c652eccbb8d019aec50cf913f540310724a6": return ["EXOus", 0]
      case "38fca2d939696061a8f76d4e6b5eecd54e3b4221c846f24a6b279e79952850a5": return ["TEST", 3] // testnet

      case "26ac924263ba547b706251635550a8649545ee5c074fe5db8d7140557baaf32e": return ["MEX", 8]

      default: return [assetHex, 0]
  }
}