import { useContext, useMemo, useState } from "react";
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
} from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import {
  publishReportEvent,
  REPORT_REASONS,
  ReportReason,
} from "@/utils/nostr/reporting";
import FailureModal from "@/components/utility-components/failure-modal";
import SuccessModal from "@/components/utility-components/success-modal";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { ReportsContext } from "@/utils/context/context";

function prettyReason(reason: ReportReason): string {
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}

export default function ReportModal({
  isOpen,
  onClose,
  targetType,
  pubkey,
  dTag,
  productTitle,
}: {
  isOpen: boolean;
  onClose: () => void;
  targetType: "profile" | "listing";
  pubkey: string;
  dTag?: string;
  productTitle?: string;
}) {
  const {
    signer,
    isLoggedIn,
    pubkey: currentPubkey,
  } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);
  const { addNewlyCreatedReportEvent } = useContext(ReportsContext);

  const [selectedReason, setSelectedReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [failureText, setFailureText] = useState("");

  const modalTitle = useMemo(() => {
    if (targetType === "listing") {
      return productTitle
        ? `Report Listing: ${productTitle}`
        : "Report Listing";
    }
    return "Report Seller";
  }, [targetType, productTitle]);

  const resetForm = () => {
    setSelectedReason("spam");
    setDetails("");
    setIsSubmitting(false);
  };

  const closeAndReset = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!isLoggedIn || !signer || !nostr) {
      setFailureText("Please sign in before submitting a report.");
      setShowFailureModal(true);
      return;
    }

    if (currentPubkey && currentPubkey === pubkey) {
      setFailureText("You cannot report your own profile or listing.");
      setShowFailureModal(true);
      return;
    }

    if (targetType === "listing" && !dTag) {
      setFailureText(
        "This listing cannot be reported because it has no d-tag."
      );
      setShowFailureModal(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const event = await publishReportEvent(
        nostr,
        signer,
        targetType,
        pubkey,
        selectedReason,
        details.trim() || undefined,
        dTag
      );
      if (event) {
        addNewlyCreatedReportEvent(event);
      }
      setShowSuccessModal(true);
      closeAndReset();
    } catch {
      setFailureText("Failed to submit report. Please try again.");
      setShowFailureModal(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal
        backdrop="blur"
        isOpen={isOpen}
        onClose={closeAndReset}
        classNames={{
          body: "py-6",
          backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
          header: "border-b-[1px] border-[#292f46]",
          footer: "border-t-[1px] border-[#292f46]",
          closeButton: "hover:bg-black/5 active:bg-white/10",
        }}
        scrollBehavior={"normal"}
        placement={"center"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="text-light-text dark:text-dark-text">
            {modalTitle}
          </ModalHeader>
          <ModalBody>
            <Select
              label="Reason"
              selectedKeys={[selectedReason]}
              onChange={(e) =>
                setSelectedReason(e.target.value as ReportReason)
              }
              className="text-light-text dark:text-dark-text"
              data-testid="report-reason-select"
            >
              {REPORT_REASONS.map((reason) => (
                <SelectItem key={reason} value={reason}>
                  {prettyReason(reason)}
                </SelectItem>
              ))}
            </Select>

            <Input
              label="Details (optional)"
              placeholder="Add any context for moderators..."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="text-light-text dark:text-dark-text"
              data-testid="report-details-input"
            />
          </ModalBody>
          <ModalFooter>
            <Button color="danger" variant="light" onClick={closeAndReset}>
              Cancel
            </Button>
            <Button
              className={SHOPSTRBUTTONCLASSNAMES}
              onClick={handleSubmit}
              isLoading={isSubmitting}
            >
              Submit
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <FailureModal
        bodyText={failureText}
        isOpen={showFailureModal}
        onClose={() => {
          setShowFailureModal(false);
          setFailureText("");
        }}
      />

      <SuccessModal
        bodyText="Report submitted successfully. Thank you for helping improve Shopstr."
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
      />
    </>
  );
}
