import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, ChevronDownIcon } from "@heroicons/react/24/outline";

export default function PrivacyPolicy() {
  const [openItems, setOpenItems] = useState<number[]>([]);

  const toggle = (i: number) =>
    setOpenItems((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    );

  const policyContent = [
    {
      title: "Introduction",
      content:
        "Shopstr is committed to protecting your privacy. As a permissionless marketplace, we minimize data collection and processing to ensure your privacy and security. This policy explains our approach to data handling in the context of a permissionless platform.",
    },
    {
      title: "Information We Don't Collect",
      content:
        "As a fully permissionless platform with no centralized backend, Shopstr does not collect or store: personal identification information, KYC (Know Your Customer) data, financial information, usage tracking data, or user behavior analytics. All data remains under user control through the Nostr protocol and Bitcoin network.",
    },
    {
      title: "Nostr Protocol Data",
      content:
        "Communication and listings through the Nostr protocol are distributed across your selected relays and may include: product listings and metadata, public messages and updates, encrypted direct messages (viewable only by intended recipients), and public keys associated with your Nostr identity. Users select which relays to connect to, determining what content they see and share.",
    },
    {
      title: "Bitcoin & Lightning Network Data",
      content:
        "All transactions occur on the Bitcoin network or Lightning Network and follow their respective privacy models. This may include: transaction amounts, Bitcoin/Lightning addresses or payment requests, and time-stamped records. Cashu ecash transactions provide additional privacy benefits where implemented.",
    },
    {
      title: "Website Usage",
      content:
        "Our website interface is static and does not use cookies or tracking mechanisms. Any data stored is kept locally in your browser and includes: local keys (if using in-browser storage), user preferences, relay selections, and interface settings. Shopstr has no access to this locally stored information.",
    },
    {
      title: "Third-Party Services",
      content:
        "Users may interact with: Bitcoin network and Lightning Network nodes, Nostr relays (which you select), and self-hosted infrastructure. Each third-party service has its own privacy practices. We recommend reviewing the privacy policies of any relays you connect to or payment processors you utilize.",
    },
    {
      title: "Security Measures",
      content:
        "Security is maintained through: open-source code verification (our codebase is publicly available for review), cryptographic protocols for secure communications, Bitcoin network security for transactions, and client-side security measures. Users are responsible for maintaining the security of their private keys and wallets.",
    },
    {
      title: "User Rights and Control",
      content:
        "As a permissionless platform, users maintain full control over their: private keys and funds, product listings, relay selections, communication preferences, and local data storage. You can delete local data at any time through your browser settings. Note that due to the nature of distributed systems, messages and listings published to Nostr relays may persist on those relays according to their individual data retention policies.",
    },
    {
      title: "Changes to Privacy Policy",
      content:
        "Any updates to this privacy policy will be posted on this page. As a permissionless platform, fundamental changes to data handling are unlikely as the platform operates on open protocols with minimal central coordination.",
    },
    {
      title: "Contact Information",
      content:
        "For privacy-related questions, you can reach the Shopstr team through our Nostr channels or GitHub repository.",
    },
  ];

  return (
    <div className="bg-light-bg dark:bg-dark-bg flex min-h-screen flex-col pt-24 md:pb-20">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="mb-6 flex justify-end">
          <Link href="/" passHref legacyBehavior>
            <a className="border-shopstr-purple/30 text-shopstr-purple hover:bg-shopstr-purple/10 dark:border-shopstr-yellow/30 dark:text-shopstr-yellow dark:hover:bg-shopstr-yellow/10 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors">
              <ArrowLeftIcon className="h-4 w-4" />
              Back to Home
            </a>
          </Link>
        </div>
        <h1 className="text-light-text dark:text-dark-text mb-8 text-center text-3xl font-bold">
          Privacy Policy
        </h1>

        <p className="text-light-text/80 dark:text-dark-text/80 mx-auto mb-10 max-w-3xl text-center">
          How Shopstr protects your privacy
        </p>

        <div className="text-light-text/70 dark:text-dark-text/70 mb-4 text-right text-sm">
          Last updated: 2025-04-25
        </div>

        <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
          {policyContent.map((section, i) => (
            <div
              key={i}
              className={
                i < policyContent.length - 1
                  ? "border-b border-gray-200 dark:border-gray-700"
                  : ""
              }
            >
              <button
                onClick={() => toggle(i)}
                className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/50"
              >
                <span className="text-light-text dark:text-dark-text font-medium">
                  {section.title}
                </span>
                <ChevronDownIcon
                  className={`text-light-text/60 dark:text-dark-text/60 ml-4 h-5 w-5 flex-shrink-0 transition-transform duration-200 ${
                    openItems.includes(i) ? "rotate-180" : ""
                  }`}
                />
              </button>
              {openItems.includes(i) && (
                <div className="px-5 pt-1 pb-5">
                  <p className="text-light-text/90 dark:text-dark-text/90 leading-relaxed">
                    {section.content}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
