const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

const dispatchEventSpy = jest
  .spyOn(window, "dispatchEvent")
  .mockImplementation(() => true);

import {
  saveAddress,
  deleteAddress,
  setDefaultAddress,
  getSavedAddresses,
} from "../saved-address-helpers";

// ------------------------------------------------------------------------------

beforeEach(() => {
  localStorageMock.clear();
  jest.clearAllMocks();
  dispatchEventSpy.mockImplementation(() => true);
});

// ---- saveAddress -------------------------------------------------------------

describe("saveAddress", () => {
  it("generates an id when none is provided", () => {
    const saved = saveAddress({
      label: "Home",
      name: "Alice",
      address: "1 Main St",
      city: "Springfield",
      state: "IL",
      zip: "62701",
      country: "US",
      isDefault: false,
    });
    expect(saved.id).toBeTruthy();
  });

  it("auto-promotes the first address to default even if isDefault is false", () => {
    saveAddress({
      label: "Home",
      name: "Alice",
      address: "1 Main St",
      city: "C",
      state: "S",
      zip: "Z",
      country: "US",
      isDefault: false,
    });
    const [addr] = getSavedAddresses();
    expect(addr!.isDefault).toBe(true);
  });

  it("strips previous defaults when saving a new default", () => {
    const first = saveAddress({
      label: "Home",
      name: "Alice",
      address: "1 St",
      city: "C",
      state: "S",
      zip: "Z",
      country: "US",
      isDefault: true,
    });
    saveAddress({
      label: "Work",
      name: "Bob",
      address: "2 St",
      city: "C",
      state: "S",
      zip: "Z",
      country: "US",
      isDefault: true,
    });
    const addresses = getSavedAddresses();
    const firstInStore = addresses.find((a) => a.id === first.id)!;
    expect(firstInStore.isDefault).toBe(false);
    expect(addresses.filter((a) => a.isDefault).length).toBe(1);
  });

  it("upserts an address when saving with an existing id", () => {
    const saved = saveAddress({
      label: "Home",
      name: "Alice",
      address: "1 St",
      city: "C",
      state: "S",
      zip: "Z",
      country: "US",
      isDefault: true,
    });
    saveAddress({ ...saved, name: "Alice Updated" });
    const addresses = getSavedAddresses();
    expect(addresses.length).toBe(1);
    expect(addresses[0]!.name).toBe("Alice Updated");
  });

  it("guarantees exactly one default after editing with isDefault:false when no other default exists", () => {
    const saved = saveAddress({
      label: "Home",
      name: "Alice",
      address: "1 St",
      city: "C",
      state: "S",
      zip: "Z",
      country: "US",
      isDefault: true,
    });
    // Edit it, explicitly passing isDefault: false (only-default guard is UI-level)
    saveAddress({ ...saved, name: "Alice Updated", isDefault: false });
    const addresses = getSavedAddresses();
    expect(addresses.filter((a) => a.isDefault).length).toBe(1);
  });

  it("preserves existing default when adding a new non-default address", () => {
    // addr1 is NOT default, addr2 IS default — default lives at index 1
    saveAddress({
      label: "Home",
      name: "Alice",
      address: "1 St",
      city: "C",
      state: "S",
      zip: "Z",
      country: "US",
      isDefault: false,
    });
    const second = saveAddress({
      label: "Work",
      name: "Bob",
      address: "2 St",
      city: "C",
      state: "S",
      zip: "Z",
      country: "US",
      isDefault: true,
    });
    // Add a third address without checking "set as default"
    saveAddress({
      label: "Gym",
      name: "Carol",
      address: "3 St",
      city: "C",
      state: "S",
      zip: "Z",
      country: "US",
      isDefault: false,
    });
    const addresses = getSavedAddresses();
    // "Work" (second) must still be the only default
    expect(addresses.find((a) => a.id === second.id)!.isDefault).toBe(true);
    expect(addresses.filter((a) => a.isDefault).length).toBe(1);
  });

  it("dispatches a storage event after saving", () => {
    saveAddress({
      label: "Home",
      name: "A",
      address: "1",
      city: "C",
      state: "S",
      zip: "Z",
      country: "US",
      isDefault: false,
    });
    expect(dispatchEventSpy).toHaveBeenCalled();
  });
});

// ---- deleteAddress -----------------------------------------------------------

describe("deleteAddress", () => {
  it("removes the address with the given id", () => {
    const addr = saveAddress({
      label: "Home",
      name: "A",
      address: "1",
      city: "C",
      state: "S",
      zip: "Z",
      country: "US",
      isDefault: false,
    });
    deleteAddress(addr.id);
    expect(getSavedAddresses().find((a) => a.id === addr.id)).toBeUndefined();
  });

  it("promotes the next address to default when the default is deleted", () => {
    const first = saveAddress({
      label: "Home",
      name: "A",
      address: "1",
      city: "C",
      state: "S",
      zip: "Z",
      country: "US",
      isDefault: true,
    });
    const second = saveAddress({
      label: "Work",
      name: "B",
      address: "2",
      city: "C",
      state: "S",
      zip: "Z",
      country: "US",
      isDefault: false,
    });
    deleteAddress(first.id);
    const remaining = getSavedAddresses();
    expect(remaining.find((a) => a.id === second.id)!.isDefault).toBe(true);
    expect(remaining.filter((a) => a.isDefault).length).toBe(1);
  });

  it("is a no-op for an unknown id", () => {
    saveAddress({
      label: "Home",
      name: "A",
      address: "1",
      city: "C",
      state: "S",
      zip: "Z",
      country: "US",
      isDefault: false,
    });
    deleteAddress("nonexistent-id");
    expect(getSavedAddresses().length).toBe(1);
  });

  it("leaves an empty list when the last address is deleted", () => {
    const addr = saveAddress({
      label: "Home",
      name: "A",
      address: "1",
      city: "C",
      state: "S",
      zip: "Z",
      country: "US",
      isDefault: true,
    });
    deleteAddress(addr.id);
    expect(getSavedAddresses().length).toBe(0);
  });
});

// ---- setDefaultAddress -------------------------------------------------------

describe("setDefaultAddress", () => {
  it("marks the given id as default and clears all others", () => {
    const a = saveAddress({
      label: "A",
      name: "Alice",
      address: "1",
      city: "C",
      state: "S",
      zip: "Z",
      country: "US",
      isDefault: true,
    });
    const b = saveAddress({
      label: "B",
      name: "Bob",
      address: "2",
      city: "C",
      state: "S",
      zip: "Z",
      country: "US",
      isDefault: false,
    });
    setDefaultAddress(b.id);
    const addresses = getSavedAddresses();
    expect(addresses.find((x) => x.id === a.id)!.isDefault).toBe(false);
    expect(addresses.find((x) => x.id === b.id)!.isDefault).toBe(true);
    expect(addresses.filter((x) => x.isDefault).length).toBe(1);
  });
});

// ---- getSavedAddresses -------------------------------------------------------

describe("getSavedAddresses", () => {
  it("returns an empty array when nothing is stored", () => {
    expect(getSavedAddresses()).toEqual([]);
  });

  it("returns an empty array when localStorage contains invalid JSON", () => {
    localStorageMock.setItem("savedAddresses", "not-json{{");
    expect(getSavedAddresses()).toEqual([]);
  });
});
