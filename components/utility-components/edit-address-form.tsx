import { useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { ModalBody, ModalFooter, Button, Input } from "@nextui-org/react";
import { SavedAddress } from "@/utils/types/types";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { getSavedAddresses } from "@/utils/nostr/nostr-helper-functions";

interface EditAddressFormProps {
  address: SavedAddress;
  onSave: (address: SavedAddress) => void;
  onClose: () => void;
}

export default function EditAddressForm({
  address,
  onSave,
  onClose,
}: EditAddressFormProps) {
  const { control, handleSubmit } = useForm<SavedAddress>({
    defaultValues: {
      ...address,
      isDefault: address.isDefault,
    },
  });

  // Check how many default addresses exist
  const allAddresses = useMemo(() => getSavedAddresses(), []);
  const defaultAddressCount = useMemo(
    () => allAddresses.filter((addr) => addr.isDefault).length,
    [allAddresses]
  );

  // If this is the only default and currently default, it cannot be unchecked
  const isOnlyDefault = address.isDefault && defaultAddressCount === 1;

  const onSubmit = (data: SavedAddress) => {
    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <ModalBody className="gap-4">
        <Controller
          name="label"
          control={control}
          rules={{ required: "Label is required" }}
          render={({ field, fieldState: { error } }) => (
            <Input
              {...field}
              label="Address Label"
              placeholder="e.g. Home, Office"
              isInvalid={!!error}
              errorMessage={error?.message}
              variant="bordered"
            />
          )}
        />

        <Controller
          name="name"
          control={control}
          rules={{ required: "Name is required" }}
          render={({ field, fieldState: { error } }) => (
            <Input
              {...field}
              label="Full Name"
              isInvalid={!!error}
              errorMessage={error?.message}
              variant="bordered"
            />
          )}
        />

        <Controller
          name="address"
          control={control}
          rules={{ required: "Address is required" }}
          render={({ field, fieldState: { error } }) => (
            <Input
              {...field}
              label="Street Address"
              isInvalid={!!error}
              errorMessage={error?.message}
              variant="bordered"
            />
          )}
        />

        <Controller
          name="unit"
          control={control}
          render={({ field }) => (
            <Input {...field} label="Apt/Suite (Optional)" variant="bordered" />
          )}
        />

        <div className="flex gap-2">
          <Controller
            name="city"
            control={control}
            rules={{ required: "City is required" }}
            render={({ field, fieldState: { error } }) => (
              <Input
                {...field}
                label="City"
                className="flex-1"
                isInvalid={!!error}
                errorMessage={error?.message}
                variant="bordered"
              />
            )}
          />
          <Controller
            name="state"
            control={control}
            rules={{ required: "State is required" }}
            render={({ field, fieldState: { error } }) => (
              <Input
                {...field}
                label="State"
                className="w-1/3"
                isInvalid={!!error}
                errorMessage={error?.message}
                variant="bordered"
              />
            )}
          />
        </div>

        <div className="flex gap-2">
          <Controller
            name="zip"
            control={control}
            rules={{ required: "Zip code is required" }}
            render={({ field, fieldState: { error } }) => (
              <Input
                {...field}
                label="Zip/Postal Code"
                className="w-1/2"
                isInvalid={!!error}
                errorMessage={error?.message}
                variant="bordered"
              />
            )}
          />
          <Controller
            name="country"
            control={control}
            rules={{ required: "Country is required" }}
            render={({ field, fieldState: { error } }) => (
              <Input
                {...field}
                label="Country"
                className="w-1/2"
                isInvalid={!!error}
                errorMessage={error?.message}
                variant="bordered"
              />
            )}
          />
        </div>

        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Controller
              name="isDefault"
              control={control}
              render={({ field: { value, onChange } }) => (
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => {
                    // Prevent unchecking if it's the only default
                    if (isOnlyDefault && !e.target.checked) {
                      return;
                    }
                    onChange(e.target.checked);
                  }}
                  disabled={isOnlyDefault}
                  className="rounded disabled:cursor-not-allowed disabled:opacity-50"
                  id="default-address"
                />
              )}
            />
            <label
              htmlFor="default-address"
              className={`text-sm ${
                isOnlyDefault ? "text-gray-500" : "cursor-pointer"
              }`}
            >
              Set as default address
            </label>
          </div>

          {isOnlyDefault && (
            <p className="ml-6 text-xs text-yellow-600 dark:text-yellow-500">
              ⚠️ This is your only default address and cannot be unset
            </p>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <Button color="danger" variant="light" onClick={onClose}>
          Cancel
        </Button>
        <Button className={SHOPSTRBUTTONCLASSNAMES} type="submit">
          Save Changes
        </Button>
      </ModalFooter>
    </form>
  );
}
