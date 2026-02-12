import React, { useEffect } from "react";
import { Button, Input, Textarea, Image } from "@nextui-org/react";
import { Community } from "@/utils/types/types";
import { v4 as uuidv4 } from "uuid";
import { useForm, Controller } from "react-hook-form";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

interface CommunityFormData {
  name: string;
  description: string;
  image: string;
  d: string;
}

interface CreateCommunityFormProps {
  existingCommunity: Community | null;
  onSave: (data: CommunityFormData) => void;
  onCancel?: () => void;
}

const CreateCommunityForm: React.FC<CreateCommunityFormProps> = ({
  existingCommunity,
  onSave,
  onCancel,
}) => {
  const { control, handleSubmit, setValue, watch } = useForm<CommunityFormData>(
    {
      defaultValues: {
        name: "",
        description: "",
        image: "",
        d: uuidv4(),
      },
    }
  );

  const watchImage = watch("image");

  useEffect(() => {
    if (existingCommunity) {
      setValue("name", existingCommunity.name);
      setValue("description", existingCommunity.description);
      setValue("image", existingCommunity.image);
      setValue("d", existingCommunity.d);
    }
  }, [existingCommunity, setValue]);

  return (
    // disable native browser validation so react-hook-form controls errors consistently
    <form onSubmit={handleSubmit(onSave)} className="space-y-4" noValidate>
      <Controller
        name="name"
        control={control}
        rules={{ required: "Community name is required" }}
        render={({ field, fieldState }) => (
          <Input
            {...field}
            label="COMMUNITY NAME"
            labelPlacement="outside"
            isRequired
            errorMessage={fieldState.error?.message}
            isInvalid={!!fieldState.error}
            variant="bordered"
            placeholder="e.g. Shopstr Power Users"
            classNames={{
              label: "text-zinc-400 font-black tracking-widest text-xs",
              inputWrapper:
                "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-12 rounded-xl transition-all",
              input: "text-white placeholder:text-zinc-600 font-bold",
            }}
          />
        )}
      />
      <Controller
        name="description"
        control={control}
        rules={{ required: "Description is required" }}
        render={({ field, fieldState }) => (
          <Textarea
            {...field}
            label="DESCRIPTION"
            labelPlacement="outside"
            isRequired
            errorMessage={fieldState.error?.message}
            isInvalid={!!fieldState.error}
            variant="bordered"
            placeholder="What is this space about?"
            classNames={{
              label: "text-zinc-400 font-black tracking-widest text-xs",
              inputWrapper:
                "border-zinc-700 bg-[#111] hover:border-zinc-500 group-data-[focus=true]:border-yellow-400 rounded-xl transition-all",
              input: "text-white placeholder:text-zinc-600",
            }}
          />
        )}
      />
      <div className="flex flex-col gap-2">
        <label className="text-xs font-black uppercase tracking-widest text-zinc-400">
          Community Image
        </label>
        {watchImage && (
          <Image
            src={watchImage}
            alt="Community image preview"
            className="mb-2 max-h-64 w-full rounded-2xl border border-zinc-800 object-cover"
          />
        )}
        <FileUploaderButton
          className={`${NEO_BTN} h-10 w-fit px-6 text-xs`}
          imgCallbackOnUpload={(imgUrl) => setValue("image", imgUrl)}
        >
          Upload Image
        </FileUploaderButton>
      </div>

      <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:gap-4">
        <Button
          type="submit"
          className={`${NEO_BTN} h-14 w-full text-sm shadow-[4px_4px_0px_0px_#ffffff] sm:flex-1`}
        >
          {existingCommunity ? "Save Changes" : "Create Community"}
        </Button>
        {onCancel && (
          <Button
            variant="light"
            onClick={onCancel}
            className="h-14 w-full rounded-xl border border-zinc-700 font-bold uppercase tracking-wider text-zinc-400 hover:border-white hover:text-white sm:w-auto sm:px-8"
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
};

export default CreateCommunityForm;
