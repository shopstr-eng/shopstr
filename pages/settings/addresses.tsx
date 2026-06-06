import { useState, useEffect } from "react";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { Modal, ModalContent, ModalHeader, Button } from "@heroui/react";
import { BLACKBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import {
  deleteAddress,
  getSavedAddresses,
  saveAddress,
} from "@/utils/nostr/nostr-helper-functions";
import { SavedAddress } from "@/utils/types/types";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import SavedAddressesList from "@/components/utility-components/saved-addresses-list";
import EditAddressForm from "@/components/utility-components/edit-address-form";
import ProtectedRoute from "@/components/utility-components/protected-route";

const AddressesSettingsPage = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [editingAddress, setEditingAddress] = useState<SavedAddress | null>(
    null
  );
  const [showEditAddressModal, setShowEditAddressModal] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSavedAddresses(getSavedAddresses());
    }
    setIsLoaded(true);
  }, []);

  const handleEditAddress = (address: SavedAddress) => {
    setEditingAddress(address);
    setShowEditAddressModal(true);
  };

  const handleAddAddress = () => {
    setEditingAddress(null);
    setShowEditAddressModal(true);
  };

  const handleDeleteAddress = (id: string) => {
    deleteAddress(id);
    setSavedAddresses(getSavedAddresses());
  };

  const handleSaveEditedAddress = (address: SavedAddress) => {
    saveAddress(address);
    setSavedAddresses(getSavedAddresses());
    setShowEditAddressModal(false);
    setEditingAddress(null);
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen flex-col bg-white pt-24 pb-20">
        <div className="mx-auto w-full min-w-0 px-4 lg:w-1/2 xl:w-2/5">
          <SettingsBreadCrumbs />

          <div className="mb-6">
            <h1 className="text-3xl font-bold text-black">Saved Addresses</h1>
            <p className="mt-2 text-sm text-gray-600">
              Manage the shipping addresses you can reuse during checkout.
            </p>
          </div>

          <div className="mb-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Your Addresses</h2>
              <Button
                className={BLACKBUTTONCLASSNAMES}
                onClick={() => handleAddAddress()}
              >
                Add Address
              </Button>
            </div>

            {isLoaded && (
              <SavedAddressesList
                addresses={savedAddresses}
                onEdit={handleEditAddress}
                onDelete={handleDeleteAddress}
              />
            )}

            <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
              <InformationCircleIcon className="h-5 w-5 flex-shrink-0" />
              <p>
                These addresses are stored locally on this device and can be
                reused during checkout.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Address Modal */}
      <Modal
        backdrop="blur"
        isOpen={showEditAddressModal}
        onClose={() => {
          setShowEditAddressModal(false);
          setEditingAddress(null);
        }}
        classNames={{
          body: "py-6 bg-white",
          backdrop: "bg-black/50 backdrop-opacity-60",
          header: "border-b-3 border-black bg-white rounded-t-xl",
          footer: "border-t-3 border-black bg-white rounded-b-xl",
          base: "border-3 border-black rounded-xl",
          closeButton: "hover:bg-gray-100 active:bg-gray-200",
        }}
        scrollBehavior={"outside"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1 font-bold text-black">
            {editingAddress ? "Edit Address" : "Add Address"}
          </ModalHeader>
          <EditAddressForm
            address={editingAddress}
            onSave={handleSaveEditedAddress}
            onClose={() => {
              setShowEditAddressModal(false);
              setEditingAddress(null);
            }}
          />
        </ModalContent>
      </Modal>
    </ProtectedRoute>
  );
};

export default AddressesSettingsPage;
