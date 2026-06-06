import { useMemo, useState } from "react";
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Textarea,
} from "@heroui/react";
import { REPORT_TYPES, ReportType } from "@/utils/nostr/nostr-helper-functions";

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  nudity: "Nudity",
  malware: "Malware",
  profanity: "Profanity",
  illegal: "Illegal",
  spam: "Spam",
  impersonation: "Impersonation",
  other: "Other",
};

export default function ReportEventModal({
  isOpen,
  onClose,
  targetLabel,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  targetLabel: string;
  onSubmit: (reportType: ReportType, content: string) => Promise<void>;
}) {
  const [selectedReportType, setSelectedReportType] = useState<ReportType | "">(
    ""
  );
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedKeys = useMemo(
    () => (selectedReportType ? new Set([selectedReportType]) : new Set([])),
    [selectedReportType]
  );

  const resetAndClose = () => {
    setSelectedReportType("");
    setDetails("");
    onClose();
  };

  const handleClose = () => {
    if (isSubmitting) return;
    resetAndClose();
  };

  const handleSubmit = async () => {
    if (!selectedReportType) return;

    setIsSubmitting(true);
    try {
      await onSubmit(selectedReportType, details.trim());
      resetAndClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      onClose={handleClose}
      classNames={{
        wrapper: "shadow-neo",
        base: "border-2 border-black rounded-md",
        backdrop: "bg-black/20 backdrop-blur-sm",
        header: "border-b-2 border-black bg-white rounded-t-md text-black",
        body: "py-6 bg-white text-black",
        footer: "border-t-2 border-black bg-white rounded-b-md",
        closeButton:
          "hover:bg-gray-200 active:bg-gray-300 rounded-md text-black",
      }}
      isDismissable={!isSubmitting}
      scrollBehavior="inside"
      placement="center"
      size="lg"
    >
      <ModalContent>
        <ModalHeader className="text-black">Report {targetLabel}</ModalHeader>
        <ModalBody className="text-black">
          <Select
            label="Reason"
            placeholder="Choose a report type"
            selectedKeys={selectedKeys}
            onSelectionChange={(keys) => {
              if (keys === "all") return;
              const value = Array.from(keys)[0];
              setSelectedReportType(
                typeof value === "string" ? (value as ReportType) : ""
              );
            }}
            classNames={{
              trigger:
                "bg-white text-black border-2 border-black rounded-md data-[hover=true]:bg-white data-[open=true]:bg-white",
              popoverContent: "bg-white border-2 border-black rounded-md",
              value: "text-black",
              label: "text-black font-semibold",
            }}
          >
            {REPORT_TYPES.map((reportType) => (
              <SelectItem key={reportType}>
                {REPORT_TYPE_LABELS[reportType]}
              </SelectItem>
            ))}
          </Select>
          <Textarea
            label="Details"
            placeholder="Add any context that may help moderators or relay operators."
            minRows={4}
            value={details}
            onValueChange={setDetails}
            classNames={{
              label: "text-black font-semibold",
              input: "text-black placeholder:text-gray-500",
              inputWrapper:
                "bg-white border-2 border-black rounded-md data-[hover=true]:bg-white group-data-[focus=true]:bg-white",
            }}
          />
        </ModalBody>
        <ModalFooter>
          <Button
            className="border-2 border-black bg-white font-bold text-black"
            onPress={handleClose}
            isDisabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            className="shadow-neo border-2 border-black bg-red-500 font-bold text-white"
            onPress={handleSubmit}
            isDisabled={!selectedReportType}
            isLoading={isSubmitting}
          >
            Submit Report
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
