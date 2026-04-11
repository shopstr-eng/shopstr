import { useState } from "react";
import { Button } from "@heroui/react";
import { MinusCircleIcon, PencilIcon } from "@heroicons/react/24/outline";
import { SavedAddress } from "@/utils/types/types";
import ConfirmationModal from "./confirmation-modal";

interface SavedAddressesListProps {
  addresses: SavedAddress[];
  onEdit: (address: SavedAddress) => void;
  onDelete: (id: string) => void;
}

export default function SavedAddressesList({
  addresses,
  onEdit,
  onDelete,
}: SavedAddressesListProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [addressToDelete, setAddressToDelete] = useState<SavedAddress | null>(
    null
  );

  const handleDeleteClick = (addr: SavedAddress) => {
    setAddressToDelete(addr);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (addressToDelete) {
      onDelete(addressToDelete.id);
      setDeleteConfirmOpen(false);
      setAddressToDelete(null);
    }
  };

  if (addresses.length === 0) {
    return (
      <p className="text-center text-gray-500 dark:text-gray-400">
        No saved addresses yet. Add one during checkout!
      </p>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {addresses.map((addr) => (
          <div
            key={addr.id}
            className="flex items-start justify-between rounded-lg border border-gray-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h4 className="text-light-text dark:text-dark-text font-semibold">
                  {addr.label}
                </h4>
                {addr.isDefault && (
                  <span className="bg-shopstr-purple dark:bg-shopstr-yellow rounded px-2 py-1 text-xs text-white dark:text-black">
                    Default
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {addr.name}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {addr.address}
                {addr.unit ? `, ${addr.unit}` : ""}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {addr.city}, {addr.state} {addr.zip}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {addr.country}
              </p>
            </div>
            <div className="ml-3 flex gap-2">
              <Button
                isIconOnly
                size="sm"
                variant="light"
                onClick={() => onEdit(addr)}
                className="text-shopstr-purple dark:text-shopstr-yellow"
              >
                <PencilIcon className="h-4 w-4" />
              </Button>
              <Button
                isIconOnly
                size="sm"
                variant="light"
                color="danger"
                onClick={() => handleDeleteClick(addr)}
              >
                <MinusCircleIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        title="Delete Address"
        message={`Are you sure you want to delete "${addressToDelete?.label}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setAddressToDelete(null);
        }}
      />
    </>
  );
}
