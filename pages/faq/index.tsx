import React from "react";
import { Accordion, AccordionItem } from "@nextui-org/react";

export default function FAQ() {
  const faqItems = [
    {
      title: "What is Shopstr?",
      content:
        "Shopstr is a permissionless marketplace built on Nostr that enables peer-to-peer commerce using Bitcoin. It provides a secure and private way to buy and sell items via Lightning Network and Cashu payments.",
    },
    {
      title: "What is Nostr",
      content:
        "Nostr is a protocol that allows you to take control of your digital identity and data. No one can stop you from posting whatever you want, and you can use your Nostr keys to sign into any other Nostr apps, taking your content with you.",
    },
    {
      title: "How do I start selling on Shopstr?",
      content:
        "To start selling, you'll simply need to: 1) Create a Nostr account or sign in with existing keys, 2) Set up your profile in settings, 3) List your products with descriptions and images, 4) Start receiving orders.",
    },
    {
      title: "How can I sign in with an existing Nostr account?",
      content:
        "It is recommended that you sign in using an extension (Alby, nos2x, etc.) or a bunker ( Amber, nsec.app, etc.) in order to minimize the risk of leaking your private key. It is possible to sign in by pasting your nsec and setting a passphrase to encrypt and store it in your browser, but it is not recommended as it could leak your private key.",
    },
    {
      title: "What payment methods are accepted?",
      content:
        "Shopstr currently supports Bitcoin payments through the Lightning Network and Cashu. These provide fast, low-fee transactions while maintaining privacy.",
    },
    {
      title: "How do I claim a Cashu payment?",
      content:
        "You can instantly claim a received Cashu token to the Lightning address set on your Nostr profile by clicking &apos;claim&apos; then &apos;redeem&apos; under the orders page. You can also receive the token directly into the integrated Cashu wallet and pay out to an external Lightning wallet at any time or copy and paste the token into an external Cashu wallet (Minibits, Coinos, cashu.me, etc.).",
    },
    {
      title: "How are my messages and data kept private?",
      content:
        "All messages are encrypted using Nostr's encrypted messaging protocol, specifically NIP-17. No one but the parties involved in a transaction can see what is happening. Your data is stored on your selected relays and isn't accessible by third parties.",
    },
    {
      title: "Why am I unable to view my messages?",
      content:
        "If you are unable to view order or inquiry messages, this is most likely due to not having NIP-44 encryption/decryption permissions set with you extension or bunker application. Make sure to go into settings to see if NIP-44 encryption is support and approve those permissions. If the issue persists, you are also able to view messages via apps like 0xchat, Amethyst, and Coracle as long as they support NIP-17 DMs.",
    },
    {
      title: "What types of items can I sell?",
      content:
        "Shopstr supports various categories including digital, physical, services, resale, exchange, clothing, electronics, collectibles, and more. Each listing should clearly indicate the category and any shipping requirements.",
    },
    {
      title: "How does shipping work?",
      content:
        "Sellers can offer different shipping options including free shipping, local pickup, or an added shipping cost. The shipping method and any restrictions should be clearly specified in each listing and fulfillment will be handled by the merchant themselves.",
    },
    {
      title: "Is there a rating system?",
      content:
        "Yes, Shopstr implements NIP-85 for reviews, allowing buyers to leave feedback for sellers and products, helping build trust in the marketplace. To leave a review, find the leave a review button at the bottom of an order message window. Merchants are also able to carry over their reviews to other marketplaces that support NIP-85.",
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
  ];

  return (
    <div className="flex min-h-screen flex-col bg-light-bg pt-24 dark:bg-dark-bg md:pb-20">
      <div className="container mx-auto px-4">
        <h1 className="mb-8 text-center text-3xl font-bold text-light-text dark:text-dark-text">
          Frequently Asked Questions
        </h1>
        <Accordion selectionMode="multiple" className="px-0">
          {faqItems.map((item, index) => (
            <AccordionItem
              key={index}
              title={item.title}
              className="text-light-text dark:text-dark-text"
            >
              <p className="text-light-text dark:text-dark-text">
                {item.content}
              </p>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
}
