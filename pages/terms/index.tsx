import { useRouter } from "next/router";
import Head from "next/head";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { WHITEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

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
    <>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
        <title>Terms of Service - Milk Market | User Agreement</title>
        <meta
          name="description"
          content="Read Milk Market's Terms of Service. Understand user responsibilities, prohibited items, transaction risks, and platform guidelines for our decentralized marketplace."
        />
        <link rel="canonical" href="https://milk.market/terms" />
        <link rel="apple-touch-icon" href="/milk-market.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/milk-market.png" />
        <meta property="og:url" content="https://milk.market/terms" />
        <meta property="og:type" content="website" />
        <meta
          property="og:title"
          content="Terms of Service - Milk Market | User Agreement"
        />
        <meta
          property="og:description"
          content="Read Milk Market's Terms of Service. Understand user responsibilities, prohibited items, transaction risks, and platform guidelines for our decentralized marketplace."
        />
        <meta property="og:image" content="/milk-market.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta property="twitter:domain" content="https://milk.market" />
        <meta property="twitter:url" content="https://milk.market/terms" />
        <meta
          name="twitter:title"
          content="Terms of Service - Milk Market | User Agreement"
        />
        <meta
          name="twitter:description"
          content="Read Milk Market's Terms of Service. Understand user responsibilities, prohibited items, transaction risks, and platform guidelines for our decentralized marketplace."
        />
        <meta name="twitter:image" content="/milk-market.png" />
        <meta
          name="keywords"
          content="terms of service, milk market, user agreement, nostr marketplace, permissionless platform, bitcoin commerce, decentralized marketplace"
        />
      </Head>
      {/* Main container with new background pattern */}
      <div className="flex min-h-screen flex-col bg-white bg-grid-pattern py-8 md:pb-20">
        {/* Centered content with a max-width for readability */}
        <div className="container mx-auto max-w-4xl px-4">
          <div className="mb-12">
            {/* Back button with new neo-brutalist style */}
            <button
              onClick={() => router.back()}
              className={`${WHITEBUTTONCLASSNAMES} mb-8 flex items-center gap-2`}
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </button>
            <h1 className="text-center text-5xl font-bold text-black">
              Terms of Service
            </h1>
            <p className="mt-4 text-center text-lg text-zinc-600">
              User agreement and usage guidelines for Milk Market
            </p>
            <p className="mt-2 text-center text-sm text-zinc-500">
              Last updated: 2025-04-25
            </p>
          </div>

          {/* Map through content and create styled cards */}
          <div className="space-y-6">
            {tosContent.map((section) => (
              <div
                key={section.title}
                // Applying the new neo-brutalist card style
                className="rounded-lg border-2 border-black bg-white p-6 shadow-neo"
              >
                <h3 className="mb-2 text-lg font-bold text-black">
                  {section.title}
                </h3>
                <p className="leading-relaxed text-zinc-700">
                  {section.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
