import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, ChevronDownIcon } from "@heroicons/react/24/outline";

export default function Tos() {
  const [openItems, setOpenItems] = useState<number[]>([]);

  const toggle = (i: number) =>
    setOpenItems((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    );

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
          Terms of Service
        </h1>

        <p className="text-light-text/80 dark:text-dark-text/80 mx-auto mb-10 max-w-3xl text-center">
          User agreement and usage guidelines for Shopstr
        </p>

        <div className="text-light-text/70 dark:text-dark-text/70 mb-4 text-right text-sm">
          Last updated: 2025-04-25
        </div>

        <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
          {tosContent.map((section, i) => (
            <div
              key={i}
              className={
                i < tosContent.length - 1
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
