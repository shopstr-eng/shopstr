import React, { useEffect } from "react";
import { Button, Input, Textarea, Image } from "@nextui-org/react";
import { Community } from "@/utils/types/types";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
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
    <form onSubmit={handleSubmit(onSave)} className="space-y-4" noValidate>
      <Controller
        name="name"
        control={control}
        rules={{ required: "Community name is required" }}
        render={({ field, fieldState }) => (
          <Input
            {...field}
            label="Community Name"
            isRequired
            errorMessage={fieldState.error?.message}
            isInvalid={!!fieldState.error}
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
            label="Description"
            isRequired
            errorMessage={fieldState.error?.message}
            isInvalid={!!fieldState.error}
          />
        )}
      />
      <div className="flex flex-col gap-2">
        <label className="text-sm">Community Image</label>
        {watchImage && (
          <Image
            src={watchImage}
            alt="Community image preview"
            width={200}
            className="rounded-lg"
          />
        )}
        <FileUploaderButton
          className={`${SHOPSTRBUTTONCLASSNAMES} w-fit`}
          imgCallbackOnUpload={(imgUrl) => setValue("image", imgUrl)}
        >
          Upload Image
        </FileUploaderButton>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" className={SHOPSTRBUTTONCLASSNAMES}>
          {existingCommunity ? "Save Changes" : "Create Community"}
        </Button>
        {onCancel && (
          <Button variant="light" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
};

export default CreateCommunityForm;
