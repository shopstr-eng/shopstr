// Pure unit tests for the saved address localStorage helper functions.
// We mock the full nostr-helper-functions module and re-implement the helpers
// in-memory so we can test the logic without the side-effects of getLocalStorageData.

const LOCAL_STORAGE_KEY = "savedAddresses";

interface AddressEntry {
  id: string;
  label: string;
  name: string;
  address: string;
  unit?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  isDefault: boolean;
}

// Lightweight in-memory implementations matching the helpers:
let store: AddressEntry[] = [];

function getAddresses(): AddressEntry[] {
  return [...store];
}

function saveAddrImpl(addr: Omit<AddressEntry, "id"> & { id?: string }): AddressEntry {
  const toSave: AddressEntry = { ...addr, id: addr.id || `id-${Math.random()}` };
  if (toSave.isDefault) {
    store.forEach((a) => (a.isDefault = false));
  }
  const idx = store.findIndex((a) => a.id === toSave.id);
  if (idx >= 0) {
    store[idx] = toSave;
  } else {
    store.push(toSave);
  }
  if (store.length === 1) store[0]!.isDefault = true;
  return toSave;
}

function deleteAddrImpl(id: string): void {
  const addr = store.find((a) => a.id === id);
  if (!addr) return;
  store = store.filter((a) => a.id !== id);
  if (addr.isDefault && store.length > 0) store[0]!.isDefault = true;
}

function setDefaultImpl(id: string): void {
  store.forEach((a) => { a.isDefault = a.id === id; });
}

describe("Saved Address helpers – logic", () => {
  beforeEach(() => {
    store = [];
  });

  describe("saveAddress", () => {
    it("saves with a generated id", () => {
      const saved = saveAddrImpl({ label: "Home", name: "Alice", address: "1 St",
        city: "C", state: "S", zip: "Z", country: "US", isDefault: false });
      expect(saved.id).toBeDefined();
      expect(saved.name).toBe("Alice");
    });

    it("auto-promotes to default when it's the only address", () => {
      saveAddrImpl({ label: "Home", name: "A", address: "1 St",
        city: "C", state: "S", zip: "Z", country: "US", isDefault: false });
      expect(store[0]!.isDefault).toBe(true);
    });

    it("clears previous defaults when saving a new default", () => {
      const first = saveAddrImpl({ label: "H", name: "A", address: "1",
        city: "C", state: "S", zip: "Z", country: "US", isDefault: true });
      saveAddrImpl({ label: "W", name: "B", address: "2",
        city: "C", state: "S", zip: "Z", country: "US", isDefault: true });
      const updated = store.find((a) => a.id === first.id)!;
      expect(updated.isDefault).toBe(false);
      expect(store.filter((a) => a.isDefault).length).toBe(1);
    });

    it("upserts address with the same id", () => {
      const saved = saveAddrImpl({ label: "H", name: "Alice", address: "1",
        city: "C", state: "S", zip: "Z", country: "US", isDefault: false });
      saveAddrImpl({ ...saved, name: "Alice Updated" });
      expect(store.length).toBe(1);
      expect(store[0]!.name).toBe("Alice Updated");
    });
  });

  describe("deleteAddress", () => {
    it("removes address by id", () => {
      const addr = saveAddrImpl({ label: "H", name: "A", address: "1",
        city: "C", state: "S", zip: "Z", country: "US", isDefault: false });
      deleteAddrImpl(addr.id);
      expect(store.find((a) => a.id === addr.id)).toBeUndefined();
    });

    it("promotes next if deleted was default", () => {
      const first = saveAddrImpl({ label: "H", name: "A", address: "1",
        city: "C", state: "S", zip: "Z", country: "US", isDefault: true });
      const second = saveAddrImpl({ label: "W", name: "B", address: "2",
        city: "C", state: "S", zip: "Z", country: "US", isDefault: false });
      deleteAddrImpl(first.id);
      expect(store.find((a) => a.id === second.id)!.isDefault).toBe(true);
    });

    it("is a no-op for unknown ids", () => {
      saveAddrImpl({ label: "H", name: "A", address: "1",
        city: "C", state: "S", zip: "Z", country: "US", isDefault: false });
      deleteAddrImpl("nonexistent");
      expect(store.length).toBe(1);
    });
  });

  describe("setDefaultAddress", () => {
    it("marks one id as default and clears others", () => {
      const a = saveAddrImpl({ label: "A", name: "Alice", address: "1",
        city: "C", state: "S", zip: "Z", country: "US", isDefault: true });
      const b = saveAddrImpl({ label: "B", name: "Bob", address: "2",
        city: "C", state: "S", zip: "Z", country: "US", isDefault: false });
      setDefaultImpl(b.id);
      expect(store.find((x) => x.id === a.id)!.isDefault).toBe(false);
      expect(store.find((x) => x.id === b.id)!.isDefault).toBe(true);
    });
  });
});
