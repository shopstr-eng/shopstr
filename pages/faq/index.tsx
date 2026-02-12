import React, { useState } from "react";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

export default function Faq() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(
    {}
  );

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

  const toggleItem = (key: string) => {
    setExpandedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredSections = faqSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.content.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="min-h-screen bg-[#050505] pb-20 pt-32 text-white">
      <div className="container mx-auto max-w-3xl px-4">
        {/* Header */}
        <div className="mb-16 flex flex-col items-center text-center">
          <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-shopstr-yellow text-shopstr-yellow">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
          </div>
          <h1 className="mb-4 text-3xl font-black uppercase tracking-tight md:text-5xl lg:text-6xl">
            How can we <span className="text-shopstr-yellow">help?</span>
          </h1>
          <p className="mb-10 max-w-lg text-lg text-gray-400">
            Answers to common questions about using Shopstr, payments, and the
            protocol.
          </p>

          {/* Search */}
          <div className="relative w-full max-w-xl">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-gray-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <input
              type="text"
              className="w-full rounded-xl border border-white/10 bg-[#111] py-4 pl-12 pr-4 text-base text-white placeholder-gray-600 transition-colors focus:border-white/20 focus:outline-none"
              placeholder="Search for answers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-4">
          {filteredSections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              {/* Section Title Pill */}
              <div className="relative flex items-center justify-center py-10">
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10"></div>
                <div className="relative rounded-full border border-white/5 p-1">
                  <div className="rounded-full border border-white/10 bg-[#111] px-6 py-2 text-center md:px-10 md:py-3">
                    <span className="text-lg font-black uppercase tracking-tight text-white md:text-2xl">
                      {section.title}
                    </span>
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-3">
                {section.items.map((item, itemIndex) => {
                  const key = `${sectionIndex}-${itemIndex}`;
                  const isOpen = expandedItems[key];

                  return (
                    <div
                      key={itemIndex}
                      className="overflow-hidden rounded-xl border border-white/10 bg-[#111]"
                    >
                      <button
                        onClick={() => toggleItem(key)}
                        className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-white/5"
                      >
                        <span className="pr-8 font-bold text-white">
                          {item.title}
                        </span>
                        <div
                          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 duration-200 transition-transform ${
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
                        <div className="border-t border-white/5 px-5 pb-5 pt-3 text-gray-400">
                          {item.content}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-24 border-t border-white/10 pt-16 text-center">
          <h3 className="mb-8 text-sm font-bold uppercase tracking-widest text-gray-500">
            Still need help?
          </h3>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="https://discord.gg/XDPb4kXJNv"
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-[160px] items-center justify-center gap-1 rounded-xl border-1 border-white/20 bg-transparent px-6 py-3.5 text-lg font-bold uppercase text-white transition-colors hover:bg-white/10"
            >
              <span>Join Discord</span>
            </a>
            <a
              href="https://njump.me/npub15dc33fyg3cpd9r58vlqge2hh8dy6hkkrjxkhluv2xpyfreqkmsesesyv6e"
              target="_blank"
              rel="noopener noreferrer"
              className={`${NEO_BTN} flex min-w-[160px] items-center justify-center px-6 py-3`}
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
