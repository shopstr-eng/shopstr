import React from "react";
import { Accordion, AccordionItem } from "@nextui-org/react";

export default function PrivacyPolicy() {
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
    <div className="flex min-h-screen flex-col bg-light-bg pt-24 dark:bg-dark-bg md:pb-20">
      <div className="container mx-auto max-w-6xl px-4">
        <h1 className="mb-8 text-center text-3xl font-bold text-light-text dark:text-dark-text">
          Privacy Policy
        </h1>

        <p className="mx-auto mb-10 max-w-3xl text-center text-light-text/80 dark:text-dark-text/80">
          How Shopstr protects your privacy
        </p>

        <div className="mb-4 text-right text-sm text-light-text/70 dark:text-dark-text/70">
          Last updated: 2025-04-25
        </div>

        <Accordion
          selectionMode="multiple"
          className="mb-6 px-0"
          variant="bordered"
        >
          {policyContent.map((section, sectionIndex) => (
            <AccordionItem
              key={sectionIndex}
              title={
                <span className="font-medium text-light-text dark:text-dark-text">
                  {section.title}
                </span>
              }
              classNames={{
                base: "group",
                title: "text-md",
                trigger:
                  "py-5 px-3 data-[hover=true]:bg-gray-50 dark:data-[hover=true]:bg-gray-900/50 transition-all rounded-lg",
                content: "py-2 px-3 text-light-text/90 dark:text-dark-text/90",
              }}
            >
              <p className="leading-relaxed text-light-text dark:text-dark-text">
                {section.content}
              </p>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
}
