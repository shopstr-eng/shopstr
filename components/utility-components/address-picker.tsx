import { useEffect, useState } from "react";
import {
  Button,
  Card,
  CardBody,
  Input,
  RadioGroup,
  Radio,
  Chip,
} from "@nextui-org/react";
import { TrashIcon, StarIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarIconSolid } from "@heroicons/react/24/solid";
import { SavedAddress } from "@/utils/types/types";
import {
  deleteAddress,
  getSavedAddresses,
  saveAddress,
  setDefaultAddress,
} from "@/utils/nostr/nostr-helper-functions";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

interface AddressPickerProps {
  onSelect: (addr: SavedAddress) => void;
  onAddressesChange?: () => void;
  forceExpanded?: boolean;
  autoSelect?: boolean;
  compact?: boolean;
  allowInlineAdd?: boolean;
  selectable?: boolean;
}

const EMPTY_ADDRESS_FORM: Omit<SavedAddress, "id" | "isDefault"> = {
  label: "",
  name: "",
  address: "",
  unit: "",
  city: "",
  state: "",
  zip: "",
  country: "",
};

export default function AddressPicker({
  onSelect,
  onAddressesChange,
  forceExpanded,
  autoSelect = true,
  compact = false,
  allowInlineAdd = true,
  selectable = true,
}: AddressPickerProps) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [viewingId, setViewingId] = useState<string>("");
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [newAddr, setNewAddr] = useState<Omit<SavedAddress, "id" | "isDefault">>(
    EMPTY_ADDRESS_FORM
  );

  const loadAddresses = () => {
    const loaded = getSavedAddresses();
    setAddresses(loaded);
    return loaded;
  };

  const resetEditor = () => {
    setIsAddingNew(false);
    setNewAddr(EMPTY_ADDRESS_FORM);
  };

  useEffect(() => {
    const loaded = loadAddresses();
    if (autoSelect && loaded.length > 0) {
      const defaultAddr = loaded.find((addr) => addr.isDefault) || loaded[0];
      if (defaultAddr && defaultAddr.id !== selectedId) {
        setSelectedId(defaultAddr.id);
        onSelect(defaultAddr);
      }
    }
  }, []);

  const handleSelectionChange = (id: string) => {
    setSelectedId(id);
    const selectedAddress = addresses.find((addr) => addr.id === id);
    if (selectedAddress) {
      onSelect(selectedAddress);
    }
  };

  const handleSetDefault = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDefaultAddress(id);
    loadAddresses();
    onAddressesChange?.();
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteAddress(id);
    const updated = loadAddresses();

    if (updated.length === 0) {
      setSelectedId("");
      setViewingId("");
      onAddressesChange?.();
      return;
    }

    if (selectedId === id) {
      const nextAddress = updated.find((addr) => addr.isDefault) || updated[0];
      if (nextAddress) {
        setSelectedId(nextAddress.id);
      }
    }

    if (viewingId === id) {
      setViewingId("");
    }

    onAddressesChange?.();
  };

  const handleSaveNew = () => {
    if (
      !newAddr.label.trim() ||
      !newAddr.name.trim() ||
      !newAddr.address.trim() ||
      !newAddr.city.trim() ||
      !newAddr.zip.trim() ||
      !newAddr.country.trim()
    ) {
      alert("Please fill out all required fields.");
      return;
    }

    const saved = saveAddress({
      ...newAddr,
      isDefault: false,
    });

    loadAddresses();
    setSelectedId(saved.id);
    onSelect(saved);
    resetEditor();
    onAddressesChange?.();
  };

  const renderAddressDetails = (addr: SavedAddress) => (
    <div className="space-y-1 text-sm text-default-500">
      <p className="font-semibold text-foreground">{addr.name}</p>
      <p>
        {addr.address}
        {addr.unit ? `, ${addr.unit}` : ""}
      </p>
      <p>
        {addr.city}, {addr.state} {addr.zip}
      </p>
      <p>{addr.country}</p>
    </div>
  );

  const renderEditor = () => {
    if (!isAddingNew) {
      return null;
    }

    return (
      <Card className="mt-2 border-2 border-dashed border-gray-300 shadow-none dark:border-zinc-700">
        <CardBody className="gap-3 p-4">
          <h3 className="mb-1 font-bold">Add New Address</h3>
          <Input
            size="sm"
            label="Address Label"
            placeholder="e.g. Home, Office"
            value={newAddr.label}
            onValueChange={(val) => setNewAddr({ ...newAddr, label: val })}
            isRequired
          />
          <Input
            size="sm"
            label="Full Name"
            value={newAddr.name}
            onValueChange={(val) => setNewAddr({ ...newAddr, name: val })}
            isRequired
          />
          <Input
            size="sm"
            label="Street Address"
            value={newAddr.address}
            onValueChange={(val) => setNewAddr({ ...newAddr, address: val })}
            isRequired
          />
          <Input
            size="sm"
            label="Apt/Suite"
            value={newAddr.unit}
            onValueChange={(val) => setNewAddr({ ...newAddr, unit: val })}
          />
          <div className="flex gap-2">
            <Input
              size="sm"
              label="City"
              className="flex-1"
              value={newAddr.city}
              onValueChange={(val) => setNewAddr({ ...newAddr, city: val })}
              isRequired
            />
            <Input
              size="sm"
              label="State"
              className="w-1/3"
              value={newAddr.state}
              onValueChange={(val) => setNewAddr({ ...newAddr, state: val })}
            />
          </div>
          <div className="flex gap-2">
            <Input
              size="sm"
              label="Zip/Postal"
              className="w-1/2"
              value={newAddr.zip}
              onValueChange={(val) => setNewAddr({ ...newAddr, zip: val })}
              isRequired
            />
            <Input
              size="sm"
              label="Country"
              className="w-1/2"
              value={newAddr.country}
              onValueChange={(val) => setNewAddr({ ...newAddr, country: val })}
              isRequired
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="flat" onClick={resetEditor}>
              Cancel
            </Button>
            <Button
              size="sm"
              className={SHOPSTRBUTTONCLASSNAMES}
              onClick={handleSaveNew}
            >
              Save & Use
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  };

  const renderCompactAddresses = () => (
    <div className="flex flex-col gap-3">
      {addresses.map((addr) => (
        <Card
          key={addr.id}
          className={`border ${
            selectedId === addr.id
              ? "border-shopstr-purple bg-gray-50 dark:border-shopstr-yellow dark:bg-zinc-800"
              : "border-default-200 dark:border-zinc-800"
          }`}
        >
          <CardBody className="p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <button
                type="button"
                className="flex-1 text-left"
                onClick={() => handleSelectionChange(addr.id)}
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span>{addr.label}</span>
                  {addr.isDefault && (
                    <Chip size="sm" color="primary" variant="flat">
                      Default
                    </Chip>
                  )}
                </div>
                <p className="mt-1 text-sm text-default-500">{addr.name}</p>
              </button>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="flat"
                  onClick={(e) => {
                    e.stopPropagation();
                    setViewingId((currentId) =>
                      currentId === addr.id ? "" : addr.id
                    );
                  }}
                >
                  {viewingId === addr.id ? "Hide" : "View"}
                </Button>
              </div>
            </div>

            {viewingId === addr.id && (
              <div className="mt-3 rounded-large bg-default-100/40 p-3 dark:bg-zinc-900/70">
                {renderAddressDetails(addr)}
              </div>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );

  const renderFullAddresses = () => {
    const cards = (
      <div className="flex flex-col gap-3">
        {addresses.map((addr) => (
          <Card
            key={addr.id}
            isPressable={selectable}
            onPress={
              selectable ? () => handleSelectionChange(addr.id) : undefined
            }
            className={`border-2 ${
              selectable && selectedId === addr.id
                ? "border-shopstr-purple bg-gray-50 dark:border-shopstr-yellow dark:bg-zinc-800"
                : "border-default-200 dark:border-zinc-800"
            }`}
          >
            <CardBody className="p-3">
              <div className="flex items-start justify-between">
                <div className="mb-1 flex items-center gap-2 text-sm font-bold">
                  {selectable ? (
                    <Radio value={addr.id} className="mr-1">
                      {addr.label}
                    </Radio>
                  ) : (
                    <span>{addr.label}</span>
                  )}
                  {addr.isDefault && (
                    <Chip size="sm" color="primary" variant="flat">
                      Default
                    </Chip>
                  )}
                </div>
                <div
                  className="flex gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onClick={(e) => handleSetDefault(addr.id, e)}
                    title="Set as default"
                  >
                    {addr.isDefault ? (
                      <StarIconSolid className="h-4 w-4 text-shopstr-purple dark:text-shopstr-yellow" />
                    ) : (
                      <StarIcon className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="danger"
                    onClick={(e) => handleDelete(addr.id, e)}
                    title="Delete address"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div
                className={`${selectable ? "pl-8" : ""} text-sm text-default-500`}
              >
                {renderAddressDetails(addr)}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    );

    if (!selectable) {
      return cards;
    }

    return (
      <RadioGroup value={selectedId} onValueChange={handleSelectionChange}>
        {cards}
      </RadioGroup>
    );
  };

  if (addresses.length === 0 && !isAddingNew && !forceExpanded) {
    return null;
  }

  const renderContent = () => (
    <div className="flex flex-col gap-4 p-2">
      {addresses.length > 0 &&
        (compact ? renderCompactAddresses() : renderFullAddresses())}

      {allowInlineAdd && !compact && !isAddingNew && (
        <Button
          size="sm"
          variant="light"
          className="w-full font-semibold text-shopstr-purple dark:text-shopstr-yellow"
          onClick={() => setIsAddingNew(true)}
        >
          + Add another address
        </Button>
      )}

      {renderEditor()}
    </div>
  );

  if (forceExpanded) {
    return renderContent();
  }

  return (
    <div className="w-full py-2">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-large border border-gray-200 bg-content1 px-4 py-4 text-left shadow-sm dark:border-zinc-800"
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span className="flex items-center gap-3 font-semibold text-md">
          <StarIcon className="h-5 w-5 text-shopstr-purple dark:text-shopstr-yellow" />
          <span>Use a saved address</span>
        </span>
        <span
          className={`text-default-500 transition-transform ${
            isExpanded ? "rotate-90" : ""
          }`}
        >
          ›
        </span>
      </button>

      {isExpanded ? <div className="mt-3">{renderContent()}</div> : null}
    </div>
  );
}
