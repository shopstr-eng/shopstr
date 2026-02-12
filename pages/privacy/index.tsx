import React, { useState } from "react";

export default function PrivacyPolicy() {
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});

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

  const toggleItem = (index: number) => {
    setExpandedItems((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="min-h-screen bg-[#050505] pt-32 pb-20 text-white">
      <div className="container mx-auto max-w-3xl px-4">
        {/* Header */}
        <div className="mb-16 flex flex-col items-center text-center">
          <h1 className="mb-6 text-3xl md:text-5xl font-black uppercase tracking-tight lg:text-6xl">
            Privacy Policy
          </h1>
          <p className="mb-8 text-lg text-gray-400">
            How Shopstr protects your privacy
          </p>

          {/* Date Pill */}
          <div className="inline-flex items-center rounded-lg border border-white/10 bg-[#111] px-4 py-2 text-sm text-gray-400">
            <span>Last updated:</span>
            <span className="ml-2 font-bold text-shopstr-yellow">
              2025-04-25
            </span>
          </div>
        </div>

        {/* Content List */}
        <div className="space-y-3">
          {policyContent.map((item, index) => {
            const isOpen = expandedItems[index];
            return (
              <div
                key={index}
                className="overflow-hidden rounded-xl border border-white/10 bg-[#111]"
              >
                <button
                  onClick={() => toggleItem(index)}
                  className="flex w-full items-center justify-between p-6 text-left transition-colors hover:bg-white/5"
                >
                  <span className="pr-8 text-lg font-bold uppercase text-white">
                    {item.title}
                  </span>
                  <div
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-gray-400"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-white/5 px-6 pb-6 pt-4 text-gray-400 leading-relaxed">
                    {item.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
