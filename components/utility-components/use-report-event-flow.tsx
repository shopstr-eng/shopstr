import { useContext, useState } from "react";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { ReportsContext } from "@/utils/context/context";
import ReportEventModal from "./modals/report-event-modal";
import SuccessModal from "./success-modal";
import {
  publishReportEvent,
  ReportType,
} from "@/utils/nostr/nostr-helper-functions";

export default function useReportEventFlow({
  targetLabel,
  reportedPubkey,
  reportedEventId,
  onRequireLogin,
}: {
  targetLabel: string;
  reportedPubkey?: string;
  reportedEventId?: string;
  onRequireLogin: () => void;
}) {
  const reportsContext = useContext(ReportsContext);
  const { nostr } = useContext(NostrContext);
  const { isLoggedIn, signer } = useContext(SignerContext);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const openReportFlow = () => {
    if (isLoggedIn) {
      setShowReportModal(true);
    } else {
      onRequireLogin();
    }
  };

  const handleSubmitReport = async (
    reportType: ReportType,
    content: string
  ) => {
    if (!reportedPubkey || !nostr || !signer) {
      throw new Error("Missing report target, nostr manager, or signer");
    }

    const signedEvent = await publishReportEvent(nostr, signer, {
      content,
      reportType,
      reportedPubkey,
      reportedEventId,
    });

    if (signedEvent) {
      reportsContext.addReportEvent(signedEvent);
    }

    setShowSuccessModal(true);
  };

  return {
    openReportFlow,
    reportFlowUi: (
      <>
        <ReportEventModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          targetLabel={targetLabel}
          onSubmit={handleSubmitReport}
        />
        <SuccessModal
          bodyText="Your report has been published."
          isOpen={showSuccessModal}
          onClose={() => setShowSuccessModal(false)}
        />
      </>
    ),
  };
}
