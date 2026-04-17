import { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { safeJsonLdString } from "@/utils/safe-json-ld";
import { ArrowLeftIcon, ChevronDownIcon } from "@heroicons/react/24/outline";

const faqSections = [
  {
    title: "General Information",
    items: [
      {
        title: "What is Shopstr?",
        content:
          "Shopstr is a permissionless marketplace built on Nostr that enables peer-to-peer commerce using Bitcoin. It provides a secure and private way to buy and sell items via the Lightning Network and Cashu token payments.",
      },
      {
        title: "What is Nostr?",
        content:
          "Nostr is a protocol that allows you to take control of your digital identity and data. No one can stop you from posting what you want, and you can use your Nostr keys to sign into any other compatible Nostr applications, taking your content with you.",
      },
    ],
  },
  {
    title: "Payments",
    items: [
      {
        title: "What payment methods are accepted?",
        content:
          "Shopstr supports Bitcoin payments through the Lightning Network, Cashu, and Nostr Wallet Connect . These methods facilitate fast, low-fee transactions while maintaining privacy.",
      },
      {
        title: "How do I claim a Cashu payment?",
        content:
          "You can instantly claim a received Cashu token to the Lightning address set on your Nostr profile by clicking the claim button then the redeem button when on the orders page. You can also receive the token directly into the integrated Cashu wallet and pay out to an external Lightning wallet at any time, or copy and paste the token into an external Cashu wallet (like Minibits, Coinos, cashu.me, etc.). Setting your profile payment preference to Lightning also automatically handles the claiming of tokens for you.",
      },
      {
        title: "What is Nostr Wallet Connect?",
        content:
          "Nostr Wallet Connect (NIP-47) is a secure protocol that lets you connect your personal Lightning wallet (like Alby or Umbrel) to Shopstr. When you check out, Shopstr will ask your wallet to pay the invoice directly, so you don't have to copy and paste. You can set this up in 'Settings' -> 'Wallet Connection'.",
      },
      {
        title: "Does Shopstr control my funds with NIP-47?",
        content:
          "No. Shopstr never sees your private keys or has control of your funds. The NWC connection only gives Shopstr permission to request payments for purchases you initiate. Depending on your wallet settings, you may need to approve each payment, or you can configure a spending budget that allows automatic payments up to a certain amount.",
      },
    ],
  },
  {
    title: "Selling",
    items: [
      {
        title: "How do I start selling on Shopstr?",
        content:
          "To start selling, you'll simply need to: 1) Create a Nostr account or sign in with existing keys, 2) Set up your profile in settings, 3) List your products with descriptions and images, 4) Start receiving orders!",
      },
      {
        title: "What types of items can I sell?",
        content:
          "Shopstr supports various product types including physical, resale, exchange, clothing, electronics, collectibles, and more. Each listing should clearly indicate the category and any shipping requirements.",
      },
      {
        title: "How does shipping work?",
        content:
          "Sellers can offer different shipping options including free shipping, local pickup, or an added shipping cost. The shipping method and any restrictions should be clearly specified in each listing and fulfillment will be handled by the merchant themselves.",
      },
      {
        title: "Does Shopstr charge fees?",
        content:
          "Shopstr has no mandatory platform fees — buyers and sellers keep the full amount of every transaction, minus only standard Bitcoin network fees. Sellers may optionally specify a donation rate on their listings to give back to the Shopstr platform on their sales; this is entirely at the seller's discretion and is never required.",
      },
    ],
  },
  {
    title: "Communities",
    items: [
      {
        title: "What are Communities?",
        content:
          "Communities are public forums hosted by sellers to interact directly with their customers. Sellers can post announcements, updates, and news about their products, and any user can reply to these announcements to ask questions or give feedback.",
      },
      {
        title: "Who can post in a community?",
        content:
          "Only the community creator and designated moderators (typically the seller) can create new top-level posts, which are called 'announcements'. This ensures the main feed stays on-topic with official updates.",
      },
      {
        title: "Who can reply to announcements?",
        content:
          "Anyone can reply to an announcement. However, all replies must be approved by a moderator before they become publicly visible. This helps maintain a safe and constructive environment.",
      },
      {
        title: "How do I create my own community?",
        content:
          "If you are a seller, you can create and manage your communities by going to 'Settings' -> 'Community Management'. From there, you can create new communities or edit your existing ones.",
      },
      {
        title: "Can I create more than one community?",
        content:
          "Yes, sellers can create and manage multiple communities. You can find all of your communities under 'Settings' -> 'Community Management'.",
      },
      {
        title: "How do I delete a community?",
        content:
          "You can delete a community you created from the 'Community Management' page in your settings. Please be aware that this action is permanent and cannot be undone.",
      },
    ],
  },
  {
    title: "Account & Privacy",
    items: [
      {
        title: "How can I sign in with an existing Nostr account?",
        content:
          "It is recommended that you sign in using an extension (Alby, nos2x, etc.) or bunker application ( Amber, nsec.app, etc.) in order to keep your private key secure. It is also possible to sign in by pasting your nsec and setting a passphrase to encrypt and store it in your browser, but it is not recommended as it could potentially leak your private key.",
      },
      {
        title: "How are my messages and data kept private?",
        content:
          "All messages are encrypted using Nostr's encrypted messaging protocol, specifically NIP-17. No one but the parties involved in a transaction can see what is happening. Your data is stored on your selected relays and isn't accessible by third parties.",
      },
      {
        title: "Why am I unable to view my messages?",
        content:
          "If you are unable to view order or inquiry messages, this is most likely due to not having NIP-44 encryption/decryption permissions set within your extension or bunker application. Make sure to go into your settings to see if NIP-44 encryption is supported and approve those permissions. If the issue persists, you are also able to view messages via apps like 0xchat, Amethyst, and other Nostr clients as long as they support NIP-17 DMs.",
      },
    ],
  },
  {
    title: "Customer Experience",
    items: [
      {
        title: "Is there a rating system?",
        content:
          "Yes, Shopstr implements NIP-85 for reviews, allowing buyers to leave feedback for sellers and their products, helping build trust in the marketplace. To leave a review, find the leave a review button at the bottom of an order message window. Merchants are also able to carry over their reviews to other marketplaces that support NIP-85.",
      },
      {
        title: "How do I contact a seller?",
        content:
          "You can contact sellers through Shopstr's encrypted messaging system. Simply navigate to a listing and click on the merchant profile to send a secure message to the seller.",
      },
      {
        title: "Am I able to return an item?",
        content:
          "You can contact sellers directly in order to request a refund and initiate a return.",
      },
    ],
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqSections.flatMap((section) =>
    section.items.map((item) => ({
      "@type": "Question",
      name: item.title,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.content,
      },
    }))
  ),
};

export default function Faq() {
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  const toggle = (key: string) =>
    setOpenItems((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <>
      <Head>
        <title>FAQ | Shopstr — Bitcoin Nostr Marketplace Help</title>
        <meta
          name="description"
          content="Answers to common questions about Shopstr — the permissionless Bitcoin marketplace on Nostr. Learn about payments, Lightning Network, selling, privacy, and more."
        />
        <link rel="canonical" href="https://shopstr.market/faq" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLdString(structuredData) }}
        />
      </Head>

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
            Frequently Asked Questions
          </h1>

          <p className="text-light-text/80 dark:text-dark-text/80 mx-auto mb-10 max-w-3xl text-center">
            Answers to common questions about using Shopstr
          </p>

          {faqSections.map((section, sectionIndex) => (
            <div key={sectionIndex} className="mb-8">
              <h2 className="text-light-text dark:text-dark-text mb-4 border-b border-gray-200 pb-2 text-xl font-semibold dark:border-gray-700">
                {section.title}
              </h2>

              <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                {section.items.map((item, itemIndex) => {
                  const key = `${sectionIndex}-${itemIndex}`;
                  const isOpen = !!openItems[key];
                  return (
                    <div
                      key={key}
                      className={
                        itemIndex < section.items.length - 1
                          ? "border-b border-gray-200 dark:border-gray-700"
                          : ""
                      }
                    >
                      <button
                        onClick={() => toggle(key)}
                        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/50"
                      >
                        <span className="text-light-text dark:text-dark-text font-medium">
                          {item.title}
                        </span>
                        <ChevronDownIcon
                          className={`text-light-text/60 dark:text-dark-text/60 ml-4 h-5 w-5 flex-shrink-0 transition-transform duration-200 ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-5 pt-1 pb-5">
                          <p className="text-light-text/90 dark:text-dark-text/90 leading-relaxed">
                            {item.content}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
