import { REPORT_TYPES, ReportType } from "@/utils/nostr/nostr-helper-functions";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import { NostrEvent } from "@/utils/types/types";

export type ReportTargetKind = "listing" | "profile" | "blob";

export type ReportModerationLevel =
  | "none"
  | "reported_by_you"
  | "trusted_warning"
  | "trusted_blur";

export interface ReportModerationSignal {
  level: ReportModerationLevel;
  reportCount: number;
  reportTypes: ReportType[];
}

export const EMPTY_REPORT_MODERATION_SIGNAL: ReportModerationSignal = {
  level: "none",
  reportCount: 0,
  reportTypes: [],
};

export interface ReportSummary {
  id: string;
  reporterPubkey: string;
  targetKind: ReportTargetKind;
  targetId: string;
  reportType: ReportType;
  isOwnReport: boolean;
  isTrustedReport: boolean;
}

const REPORT_TYPE_SET = new Set<string>(REPORT_TYPES);
const TRUSTED_BLUR_THRESHOLD = 3;

function isReportType(value: unknown): value is ReportType {
  return typeof value === "string" && REPORT_TYPE_SET.has(value);
}

function buildSignal(summaries: ReportSummary[]): ReportModerationSignal {
  const trustedOrOwnReports = summaries.filter(
    (summary) => summary.isOwnReport || summary.isTrustedReport
  );

  if (trustedOrOwnReports.length === 0) {
    return EMPTY_REPORT_MODERATION_SIGNAL;
  }

  const reportTypes = Array.from(
    new Set(trustedOrOwnReports.map((summary) => summary.reportType))
  );
  const reportCount = new Set(
    trustedOrOwnReports.map((summary) => summary.reporterPubkey)
  ).size;

  if (trustedOrOwnReports.some((summary) => summary.isOwnReport)) {
    return {
      level: "reported_by_you",
      reportCount,
      reportTypes,
    };
  }

  return {
    level:
      reportCount >= TRUSTED_BLUR_THRESHOLD
        ? "trusted_blur"
        : "trusted_warning",
    reportCount,
    reportTypes,
  };
}

export function getReportModerationLabel(
  signal: ReportModerationSignal,
  targetLabel: "listing" | "profile"
): string {
  if (signal.level === "reported_by_you") {
    return `You reported this ${targetLabel}`;
  }

  if (signal.level === "trusted_blur") {
    return `${signal.reportCount} trusted ${targetLabel} reports`;
  }

  if (signal.level === "trusted_warning") {
    return `${signal.reportCount} trusted ${targetLabel} report${
      signal.reportCount === 1 ? "" : "s"
    }`;
  }

  return "";
}

export function getDirectFollowPubkeys(
  followList: string[],
  firstDegreeFollowsLength: number
): string[] {
  return followList.slice(0, Math.max(0, firstDegreeFollowsLength));
}

export function summarizeReportEvents({
  reportEvents,
  directFollowPubkeys,
  userPubkey,
}: {
  reportEvents: NostrEvent[];
  directFollowPubkeys: string[];
  userPubkey?: string | null;
}): ReportSummary[] {
  const trustedReporterSet = new Set(directFollowPubkeys);

  return reportEvents.flatMap((event): ReportSummary[] => {
    if (!event?.id || event.kind !== 1984 || !event.pubkey) return [];

    const isOwnReport = Boolean(userPubkey && event.pubkey === userPubkey);
    const isTrustedReport = trustedReporterSet.has(event.pubkey);

    return (event.tags || []).flatMap((tag): ReportSummary[] => {
      const reportType = tag[2];
      if (
        (tag[0] !== "e" && tag[0] !== "p" && tag[0] !== "x") ||
        !tag[1] ||
        !isReportType(reportType)
      ) {
        return [];
      }

      return [
        {
          id: `${event.id}:${tag[0]}:${tag[1]}`,
          reporterPubkey: event.pubkey,
          targetKind:
            tag[0] === "e" ? "listing" : tag[0] === "p" ? "profile" : "blob",
          targetId: tag[1],
          reportType,
          isOwnReport,
          isTrustedReport,
        },
      ];
    });
  });
}

export function getListingReportSignal(
  product: ProductData,
  summaries: ReportSummary[]
): ReportModerationSignal {
  const listingSummaries = summaries.filter(
    (summary) =>
      summary.targetKind === "listing" && summary.targetId === product.id
  );

  return buildSignal(listingSummaries);
}

export function getProfileReportSignal(
  pubkey: string | undefined,
  summaries: ReportSummary[]
): ReportModerationSignal {
  if (!pubkey) return EMPTY_REPORT_MODERATION_SIGNAL;

  const profileSummaries = summaries.filter(
    (summary) => summary.targetKind === "profile" && summary.targetId === pubkey
  );

  return buildSignal(profileSummaries);
}
