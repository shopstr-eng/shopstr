import React from "react";
import { useRouter } from "next/router";
import { Accordion, AccordionItem, Button } from "@nextui-org/react";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { BLACKBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

export default function Tos() {
  const router = useRouter();
  const tosContent = [
    {
      title: "1. Platform Nature",
      content:
        "Milk Market is a permissionless marketplace that operates on Nostr and Bitcoin protocols. We do not hold custody of funds, products, or communications, nor do we act as an intermediary between buyers and sellers. The platform provides an interface for peer-to-peer commerce without central authority.",
    },
    {
      title: "2. Relay Selection",
      content:
        "Users have complete control over which Nostr relays they connect to and consequently which products they see. Milk Market does not control the content available on various relays. Users are responsible for configuring their relay connections according to their preferences and local regulations.",
    },
    {
      title: "3. User Responsibilities",
      content:
        "Users must maintain the security of their private keys and wallets, understand that transactions are irreversible, verify seller details before purchasing, and comply with local regulations regarding commerce, imports, and taxation. Sellers are responsible for the accuracy of their listings and legal compliance of their products.",
    },
    {
      title: "4. Prohibited Items",
      content:
        "Though Milk Market has no technical ability to prevent listings, users agree not to list or sell illegal goods or services, harmful substances, counterfeit items, stolen property, or any items that violate applicable laws. The community-based nature of Nostr allows users to choose relays that align with their values.",
    },
    {
      title: "5. Transaction Risks",
      content:
        "Users acknowledge that peer-to-peer transactions carry inherent risks including but not limited to: potential for scams, misrepresented items, shipping complications, and payment processing issues. Milk Market cannot intervene in disputes between buyers and sellers.",
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
        "Milk Market is not a custodial service, cannot guarantee product quality or seller reliability, cannot reverse blockchain transactions, and is not responsible for user errors or losses resulting from key mismanagement. Due to the decentralized nature of the platform, Milk Market cannot remove listings from Nostr relays.",
    },
    {
      title: "9. Dispute Resolution",
      content:
        "Any disputes must be resolved directly between buyers and sellers. We encourage users to communicate clearly and honestly. The platform's review system helps create accountability in the marketplace, but Milk Market cannot enforce resolutions or provide refunds.",
    },
    {
      title: "10. Modifications",
      content:
        "These terms may be updated periodically. Users are responsible for reviewing changes. Continued use of Milk Market constitutes acceptance of current terms.",
    },
    {
      title: "Contact",
      content:
        "Questions about these terms can be addressed through our Nostr channels or GitHub repository.",
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-light-bg py-8 md:pb-20">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="mb-8">
          <Button
            className={`mb-4 ${BLACKBUTTONCLASSNAMES}`}
            onClick={() => router.back()}
            startContent={<ArrowLeftIcon className="h-4 w-4" />}
          >
            Back
          </Button>
          <h1 className="text-center text-3xl font-bold text-light-text">
            Terms of Service
          </h1>
        </div>

        <p className="mx-auto mb-10 max-w-3xl text-center text-light-text/80">
          User agreement and usage guidelines for Milk Market
        </p>

        <div className="mb-4 text-right text-sm text-light-text/70">
          Last updated: 2025-04-25
        </div>

        <Accordion
          selectionMode="multiple"
          className="mb-6 px-0"
          variant="bordered"
        >
          {tosContent.map((section, sectionIndex) => (
            <AccordionItem
              key={sectionIndex}
              title={
                <span className="font-medium text-light-text">
                  {section.title}
                </span>
              }
              classNames={{
                base: "group",
                title: "text-md",
                trigger:
                  "py-5 px-3 data-[hover=true]:bg-gray-50 transition-all rounded-lg",
                content: "py-2 px-3 text-light-text/90",
              }}
            >
              <p className="leading-relaxed text-light-text">
                {section.content}
              </p>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
}
