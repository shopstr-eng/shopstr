import { useEffect } from "react";
import type React from "react";
import { Button, Input, Textarea, Image } from "@nextui-org/react";
import { Community } from "@/utils/types/types";
import {
  BLUEBUTTONCLASSNAMES,
  WHITEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import { v4 as uuidv4 } from "uuid";
import { useForm, Controller } from "react-hook-form";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";

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
    <form onSubmit={handleSubmit(onSave)} className="space-y-6" noValidate>
      <div>
        <label className="mb-2 block text-sm font-bold text-black">
          Community Name <span className="text-red-500">*</span>
        </label>
        <Controller
          name="name"
          control={control}
          rules={{ required: "Community name is required" }}
          render={({ field, fieldState }) => (
            <Input
              {...field}
              classNames={{
                input: "text-black font-medium",
                inputWrapper:
                  "border-4 border-black shadow-neo bg-white rounded-md h-12",
              }}
              variant="bordered"
              placeholder="Enter community name"
              isInvalid={!!fieldState.error}
              errorMessage={fieldState.error?.message}
            />
          )}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-bold text-black">
          Description <span className="text-red-500">*</span>
        </label>
        <Controller
          name="description"
          control={control}
          rules={{ required: "Description is required" }}
          render={({ field, fieldState }) => (
            <Textarea
              {...field}
              classNames={{
                input: "text-black font-medium",
                inputWrapper:
                  "border-4 border-black shadow-neo bg-white rounded-md min-h-[120px]",
              }}
              variant="bordered"
              placeholder="Describe your community"
              isInvalid={!!fieldState.error}
              errorMessage={fieldState.error?.message}
              minRows={5}
            />
          )}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-bold text-black">
          Community Image
        </label>
        {watchImage && (
          <div className="mb-4">
            <Image
              src={watchImage}
              alt="Community image preview"
              width={200}
              className="rounded-md border-4 border-black shadow-neo"
            />
          </div>
        )}
        <FileUploaderButton
          className={WHITEBUTTONCLASSNAMES}
          imgCallbackOnUpload={(imgUrl) => setValue("image", imgUrl)}
        >
          📤 Upload Image
        </FileUploaderButton>
      </div>

      <div className="flex items-center gap-4 pt-4">
        <Button type="submit" className={BLUEBUTTONCLASSNAMES}>
          {existingCommunity ? "Save Changes" : "Create Community"}
        </Button>
        {onCancel && (
          <Button
            type="button"
            className="font-bold text-black underline-offset-4 hover:underline"
            variant="light"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
};

export default CreateCommunityForm;
