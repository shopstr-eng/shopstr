import { getLocalStorageJson } from "@/utils/safe-json";
import { SavedAddress } from "@/utils/types/types";

const SAVED_ADDRESSES_KEY = "savedAddresses";

const ensureSingleDefault = (
  addresses: SavedAddress[],
  preferredId?: string
): void => {
  if (addresses.length === 0) return;

  const preferred =
    preferredId !== undefined && addresses.some((a) => a.id === preferredId);
  const existingDefault = addresses.find((a) => a.isDefault)?.id;
  const fallbackId = preferred
    ? preferredId!
    : existingDefault || addresses[0]!.id;

  addresses.forEach((a) => {
    a.isDefault = a.id === fallbackId;
  });
};

export const getSavedAddresses = (): SavedAddress[] => {
  if (typeof window === "undefined") return [];
  return getLocalStorageJson<SavedAddress[]>(SAVED_ADDRESSES_KEY, [], {
    removeOnError: true,
    validate: (value): value is SavedAddress[] => Array.isArray(value),
  });
};

const persist = (addresses: SavedAddress[]): void => {
  localStorage.setItem(SAVED_ADDRESSES_KEY, JSON.stringify(addresses));
  window.dispatchEvent(new Event("storage"));
};

export const saveAddress = (
  addr: Omit<SavedAddress, "id"> & { id?: string }
): SavedAddress => {
  const addresses = getSavedAddresses();
  const toSave: SavedAddress = {
    ...addr,
    id: addr.id || crypto.randomUUID(),
  };

  if (toSave.isDefault) {
    addresses.forEach((a) => (a.isDefault = false));
  }

  const existingIndex = addresses.findIndex((a) => a.id === toSave.id);
  if (existingIndex >= 0) {
    addresses[existingIndex] = toSave;
  } else {
    addresses.push(toSave);
  }

  ensureSingleDefault(addresses, toSave.isDefault ? toSave.id : undefined);

  persist(addresses);
  return addresses.find((a) => a.id === toSave.id)!;
};

export const deleteAddress = (id: string): void => {
  let addresses = getSavedAddresses();
  const toDelete = addresses.find((a) => a.id === id);
  if (!toDelete) return;

  addresses = addresses.filter((a) => a.id !== id);
  ensureSingleDefault(addresses);
  persist(addresses);
};

export const setDefaultAddress = (id: string): void => {
  const addresses = getSavedAddresses();
  ensureSingleDefault(addresses, id);
  persist(addresses);
};
