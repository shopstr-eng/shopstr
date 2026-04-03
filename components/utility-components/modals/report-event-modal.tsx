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
} from "@nextui-org/react";
import {
  REPORT_TYPES,
  ReportType,
} from "@/utils/nostr/nostr-helper-functions";

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
        body: "py-6",
        backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
        header: "border-b-[1px] border-[#292f46]",
        footer: "border-t-[1px] border-[#292f46]",
        closeButton: "hover:bg-black/5 active:bg-white/10",
      }}
      isDismissable={!isSubmitting}
      scrollBehavior="inside"
      placement="center"
      size="lg"
    >
      <ModalContent>
        <ModalHeader className="text-light-text dark:text-dark-text">
          Report {targetLabel}
        </ModalHeader>
        <ModalBody className="text-light-text dark:text-dark-text">
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
          >
            {REPORT_TYPES.map((reportType) => (
              <SelectItem key={reportType} value={reportType}>
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
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={handleClose} isDisabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            color="danger"
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
