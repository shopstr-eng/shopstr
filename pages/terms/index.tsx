import React, { useState } from "react";

export default function Tos() {
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});

  const tosContent = [
    {
      title: "1. Platform Nature",
      content:
        "Shopstr is a permissionless marketplace that operates on Nostr and Bitcoin protocols. We do not hold custody of funds, products, or communications, nor do we act as an intermediary between buyers and sellers. The platform provides an interface for peer-to-peer commerce without central authority.",
    },
    {
      title: "2. Relay Selection",
      content:
        "Users have complete control over which Nostr relays they connect to and consequently which products they see. Shopstr does not control the content available on various relays. Users are responsible for configuring their relay connections according to their preferences and local regulations.",
    },
    {
      title: "3. User Responsibilities",
      content:
        "Users must maintain the security of their private keys and wallets, understand that transactions are irreversible, verify seller details before purchasing, and comply with local regulations regarding commerce, imports, and taxation. Sellers are responsible for the accuracy of their listings and legal compliance of their products.",
    },
    {
      title: "4. Prohibited Items",
      content:
        "Though Shopstr has no technical ability to prevent listings, users agree not to list or sell illegal goods or services, harmful substances, counterfeit items, stolen property, or any items that violate applicable laws. The community-based nature of Nostr allows users to choose relays that align with their values.",
    },
    {
      title: "5. Transaction Risks",
      content:
        "Users acknowledge that peer-to-peer transactions carry inherent risks including but not limited to: potential for scams, misrepresented items, shipping complications, and payment processing issues. Shopstr cannot intervene in disputes between buyers and sellers.",
    },
    {
      title: "6. Listing Guidelines",
      content:
        "Listings should contain accurate descriptions, clear images, precise pricing information, and transparent shipping details. Sellers are encouraged to respond promptly to inquiries and maintain professional communication standards.",
    },
    {
      title: "7. Technical Requirements",
      content:
        "A compatible Bitcoin Lightning wallet and/or Cashu implementation is required for transactions. Nostr key pair needed for authentication and encrypted communication. Users must ensure adequate network fees for transactions and maintain reliable internet connectivity.",
    },
    {
      title: "8. Disclaimers",
      content:
        "Shopstr is not a custodial service, cannot guarantee product quality or seller reliability, cannot reverse blockchain transactions, and is not responsible for user errors or losses resulting from key mismanagement. Due to the decentralized nature of the platform, Shopstr cannot remove listings from Nostr relays.",
    },
    {
      title: "9. Dispute Resolution",
      content:
        "Any disputes must be resolved directly between buyers and sellers. We encourage users to communicate clearly and honestly. The platform's review system helps create accountability in the marketplace, but Shopstr cannot enforce resolutions or provide refunds.",
    },
    {
      title: "10. Modifications",
      content:
        "These terms may be updated periodically. Users are responsible for reviewing changes. Continued use of Shopstr constitutes acceptance of current terms.",
    },
    {
      title: "Contact",
      content:
        "Questions about these terms can be addressed through our Nostr channels or GitHub repository.",
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
            Terms of Service
          </h1>
          <p className="mb-8 text-lg text-gray-400">
            User agreement and usage guidelines for Shopstr
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
          {tosContent.map((item, index) => {
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
