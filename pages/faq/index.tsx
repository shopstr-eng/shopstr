import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { safeJsonLdString } from "@/utils/safe-json-ld";
import { WHITEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

export default function Faq() {
  const router = useRouter();
  const faqSections = [
    {
      title: "General Information",
      items: [
        {
          title: "What is Milk Market?",
          content:
            "Milk Market is a permissionless marketplace built on Nostr that enables peer-to-peer commerce using Bitcoin. It provides a secure and private way to buy and sell items via the Lightning Network and Cashu token payments.",
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
            "Milk Market supports Bitcoin payments through the Lightning Network, Cashu, and Nostr Wallet Connect, as well as credit and debit card payments via Stripe and other fiat options such as Cash App, Venmo, and PayPal. Buyers and sellers can also arrange cash payments directly during pickup or delivery.",
        },
        {
          title: "How do I claim a Cashu payment?",
          content:
            "You can instantly claim a received Cashu token to the Lightning address set on your Nostr profile by clicking the claim button then the redeem button when on the orders page. You can also receive the token directly into the integrated Cashu wallet and pay out to an external Lightning wallet at any time, or copy and paste the token into an external Cashu wallet (like Minibits, Coinos, cashu.me, etc.). Setting your profile payment preference to Lightning also automatically handles the claiming of tokens for you.",
        },
        {
          title: "What is Nostr Wallet Connect?",
          content:
            "Nostr Wallet Connect (NIP-47) is a secure protocol that lets you connect your personal Lightning wallet (like Alby or Umbrel) to Milk Market. When you check out, Milk Market will ask your wallet to pay the invoice directly, so you don't have to copy and paste. You can set this up in 'Settings' -> 'Wallet Connection'.",
        },
        {
          title: "Does Milk Market control my funds with NIP-47?",
          content:
            "No. Milk Market never sees your private keys or has control of your funds. The NWC connection only gives Milk Market permission to request payments for purchases you initiate. Depending on your wallet settings, you may need to approve each payment, or you can configure a spending budget that allows automatic payments up to a certain amount.",
        },
      ],
    },
    {
      title: "Selling",
      items: [
        {
          title: "How do I start selling on Milk Market?",
          content:
            "To start selling, you'll simply need to: 1) Sign in with your email, Google account, or existing Nostr keys, 2) Set up your profile in settings, 3) List your products with descriptions and images, 4) Start receiving orders!",
        },
        {
          title: "What types of items can I sell?",
          content:
            "Milk Market supports various product types related to raw milk and dairy. Each listing should clearly indicate the category and any shipping requirements.",
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
          title: "How do I create an account or sign in?",
          content:
            "Milk Market offers multiple ways to sign in. You can sign in with your email address or Google account for a familiar experience — no Nostr knowledge required. If you already have a Nostr account, you can sign in using a browser extension (Alby, nos2x, etc.) or bunker application (Amber, nsec.app, etc.) to keep your private key secure. It is also possible to sign in by pasting your nsec and setting a passphrase, but this is not recommended as it could potentially leak your private key.",
        },
        {
          title: "How are my messages and data kept private?",
          content:
            "All messages are encrypted using Nostr's encrypted messaging protocol, specifically NIP-17. No one but the parties involved in a transaction can see what is happening. Email notifications are also delivered alongside Nostr DMs so you never miss an important update, even if you're not actively using the app. Your data is stored on your selected relays and isn't accessible by third parties.",
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
            "Yes, Milk Market implements NIP-85 for reviews, allowing buyers to leave feedback for sellers and their products, helping build trust in the marketplace. To leave a review, find the leave a review button at the bottom of an order message window. Merchants are also able to carry over their reviews to other marketplaces that support NIP-85.",
        },
        {
          title: "How do I contact a seller?",
          content:
            "You can contact sellers through Milk Market's encrypted messaging system. Simply navigate to a listing and click on the merchant profile to send a secure message. Messages are sent as encrypted Nostr DMs, and email notifications are also delivered so the seller is alerted even if they're offline. If you signed in with email or Google, all of this works seamlessly without needing a separate Nostr client.",
        },
        {
          title: "Am I able to return an item?",
          content:
            "You can contact sellers directly in order to request a refund and initiate a return.",
        },
      ],
    },
  ];

  // State to manage which accordion item is open
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  // A counter to give each FAQ item a unique index across all sections
  let globalItemIndex = 0;

  return (
    <>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
        <title>FAQ - Milk Market | Frequently Asked Questions</title>
        <meta
          name="description"
          content="Get answers to common questions about Milk Market, the permissionless marketplace for raw dairy products. Learn about payments, selling, account setup, and privacy features."
        />
        <link rel="canonical" href="https://milk.market/faq" />
        <link rel="apple-touch-icon" href="/milk-market.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/milk-market.png" />
        <meta property="og:url" content="https://milk.market/faq" />
        <meta property="og:type" content="website" />
        <meta
          property="og:title"
          content="FAQ - Milk Market | Frequently Asked Questions"
        />
        <meta
          property="og:description"
          content="Get answers to common questions about Milk Market, the permissionless marketplace for raw dairy products. Learn about payments, selling, account setup, and privacy features."
        />
        <meta property="og:image" content="/milk-market.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta property="twitter:domain" content="https://milk.market" />
        <meta property="twitter:url" content="https://milk.market/faq" />
        <meta
          name="twitter:title"
          content="FAQ - Milk Market | Frequently Asked Questions"
        />
        <meta
          name="twitter:description"
          content="Get answers to common questions about Milk Market, the permissionless marketplace for raw dairy products. Learn about payments, selling, account setup, and privacy features."
        />
        <meta name="twitter:image" content="/milk-market.png" />
        <meta
          name="keywords"
          content="milk market, FAQ, raw dairy, farm-fresh dairy, nostr marketplace, bitcoin payments, lightning network, cashu, peer-to-peer commerce"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLdString({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              name: "Milk Market FAQ",
              url: "https://milk.market/faq",
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
            }),
          }}
        />
      </Head>
      {/* Main container with new background pattern */}
      <div className="bg-grid-pattern flex min-h-screen flex-col bg-white py-8 md:pb-20">
        {/* Centered content with a smaller max-width for the FAQ layout */}
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
              Frequently Asked Questions
            </h1>
            <p className="mt-4 text-center text-lg text-zinc-600">
              Answers to common questions about using Milk Market
            </p>
          </div>

          {faqSections.map((section) => (
            <div key={section.title} className="mb-12">
              <h2 className="mb-6 text-2xl font-bold text-black">
                {section.title}
              </h2>
              <div className="space-y-4">
                {/* Map through items and create accordion */}
                {section.items.map((item) => {
                  const currentIndex = globalItemIndex++;
                  const isOpen = openIndex === currentIndex;
                  return (
                    <div
                      key={item.title}
                      className="shadow-neo rounded-lg border-2 border-black bg-white"
                    >
                      <button
                        onClick={() => handleToggle(currentIndex)}
                        className="flex w-full items-center justify-between p-4 font-bold text-black"
                      >
                        <span>{item.title}</span>
                        <span className="text-2xl">{isOpen ? "-" : "+"}</span>
                      </button>
                      {/* Content area that slides open/closed */}
                      <div
                        className={`overflow-hidden transition-all duration-300 ease-in-out ${
                          isOpen ? "max-h-screen" : "max-h-0"
                        }`}
                      >
                        <div className="border-t-2 border-black p-4 text-zinc-700">
                          {item.content}
                        </div>
                      </div>
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
