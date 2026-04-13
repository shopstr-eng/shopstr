import { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { Image } from "@heroui/react";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import {
  BLACKBUTTONCLASSNAMES,
  WHITEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  return (
    <>
      <Head>
        <title>Contact Milk Market - Get in Touch</title>
        <meta
          name="description"
          content="Contact the Milk Market team for questions about our farm-fresh dairy marketplace. Reach us by email, social media, or Nostr. We're here to help farmers and buyers connect."
        />
        <link rel="canonical" href="https://milk.market/contact" />
        <meta
          property="og:title"
          content="Contact Milk Market - Get in Touch"
        />
        <meta
          property="og:description"
          content="Contact the Milk Market team for questions about our farm-fresh dairy marketplace."
        />
        <meta property="og:url" content="https://milk.market/contact" />
        <meta
          property="og:image"
          content="https://milk.market/milk-market.png"
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Contact Milk Market - Get in Touch"
        />
        <meta
          name="twitter:description"
          content="Get in touch with the Milk Market team. Questions about buying, selling, or our platform."
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "ContactPage",
              name: "Contact Milk Market",
              url: "https://milk.market/contact",
              mainEntity: {
                "@type": "Organization",
                name: "Milk Market",
                email: "freemilk@milk.market",
                url: "https://milk.market",
                contactPoint: {
                  "@type": "ContactPoint",
                  email: "freemilk@milk.market",
                  contactType: "customer service",
                  availableLanguage: "English",
                },
              },
            }),
          }}
        />
      </Head>

      <div className="min-h-screen bg-white font-sans text-black">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="mb-4">
            <button
              onClick={() => router.back()}
              className={`${WHITEBUTTONCLASSNAMES} mb-8 flex items-center gap-2`}
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </button>
          </div>

          <h1 className="mb-4 text-4xl font-black md:text-5xl">Contact Us</h1>
          <p className="mb-12 text-lg text-zinc-600">
            Have questions about Milk Market? We&apos;re here to help farmers
            and buyers connect with confidence.
          </p>

          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="mb-6 text-2xl font-black">Get in Touch</h2>

              <div className="space-y-6">
                <div className="shadow-neo rounded-lg border-2 border-black bg-white p-6">
                  <h3 className="mb-2 text-lg font-bold">Email</h3>
                  <a
                    href="mailto:freemilk@milk.market"
                    className="text-blue-700 underline"
                  >
                    freemilk@milk.market
                  </a>
                  <p className="mt-1 text-sm text-zinc-500">
                    General inquiries, partnerships, and support
                  </p>
                </div>

                <div className="shadow-neo rounded-lg border-2 border-black bg-white p-6">
                  <h3 className="mb-2 text-lg font-bold">Nostr</h3>
                  <a
                    href="https://njump.me/milkmarket@milk.market"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-700 underline"
                  >
                    <Image
                      src="/nostr-icon-black-transparent-256x256.png"
                      alt="Nostr protocol logo"
                      width={16}
                      height={16}
                    />
                    milkmarket@milk.market
                  </a>
                  <p className="mt-1 text-sm text-zinc-500">
                    Reach us on the Nostr network for encrypted messaging
                  </p>
                </div>

                <div className="shadow-neo rounded-lg border-2 border-black bg-white p-6">
                  <h3 className="mb-2 text-lg font-bold">Social Media</h3>
                  <div className="flex flex-wrap gap-4">
                    <a
                      href="https://x.com/milkmarketmedia"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-700 underline"
                    >
                      <Image
                        src="/x-logo-black.png"
                        alt="X (Twitter) logo"
                        width={16}
                        height={16}
                      />
                      X / Twitter
                    </a>
                    <a
                      href="https://www.youtube.com/@milkmarketmedia"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-700 underline"
                    >
                      <Image
                        src="/youtube-icon.png"
                        alt="YouTube logo"
                        width={16}
                        height={16}
                      />
                      YouTube
                    </a>
                    <a
                      href="https://www.instagram.com/milkmarketmedia/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-700 underline"
                    >
                      <Image
                        src="/instagram-icon.png"
                        alt="Instagram logo"
                        width={16}
                        height={16}
                      />
                      Instagram
                    </a>
                    <a
                      href="https://www.tiktok.com/@milkmarket.media"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-700 underline"
                    >
                      <Image
                        src="/tiktok-icon.png"
                        alt="TikTok logo"
                        width={16}
                        height={16}
                      />
                      TikTok
                    </a>
                  </div>
                </div>

                <div className="shadow-neo rounded-lg border-2 border-black bg-white p-6">
                  <h3 className="mb-2 text-lg font-bold">Open Source</h3>
                  <a
                    href="https://github.com/shopstr-eng/milk-market"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-700 underline"
                  >
                    <Image
                      src="/github-mark.png"
                      alt="GitHub logo"
                      width={16}
                      height={16}
                    />
                    View on GitHub
                  </a>
                  <p className="mt-1 text-sm text-zinc-500">
                    Report bugs, contribute code, or review our open-source
                    marketplace
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="mb-6 text-2xl font-black">Send a Message</h2>
              <div className="shadow-neo rounded-lg border-2 border-black bg-white p-6">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setStatus("sending");
                    setErrorMessage("");
                    try {
                      const res = await fetch("/api/contact", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name, email, subject, message }),
                      });
                      const data = await res.json();
                      if (res.ok) {
                        setStatus("sent");
                        setName("");
                        setEmail("");
                        setSubject("");
                        setMessage("");
                      } else {
                        setStatus("error");
                        setErrorMessage(data.error || "Something went wrong.");
                      }
                    } catch {
                      setStatus("error");
                      setErrorMessage("Network error. Please try again.");
                    }
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label
                      htmlFor="name"
                      className="mb-1 block text-sm font-bold"
                    >
                      Name
                    </label>
                    <input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="shadow-neo w-full rounded-lg border-2 border-black p-3 focus:outline-none"
                      style={{ backgroundColor: "#f0f0f0" }}
                      required
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="email"
                      className="mb-1 block text-sm font-bold"
                    >
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="shadow-neo w-full rounded-lg border-2 border-black p-3 focus:outline-none"
                      style={{ backgroundColor: "#f0f0f0" }}
                      required
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="subject"
                      className="mb-1 block text-sm font-bold"
                    >
                      Subject
                    </label>
                    <select
                      id="subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="shadow-neo w-full rounded-lg border-2 border-black p-3 focus:outline-none"
                      style={{ backgroundColor: "#f0f0f0" }}
                    >
                      <option value="">Select a topic</option>
                      <option value="Buying Inquiry">Buying Inquiry</option>
                      <option value="Selling / Producer Question">
                        Selling / Producer Question
                      </option>
                      <option value="Partnership">Partnership</option>
                      <option value="Technical Support">
                        Technical Support
                      </option>
                      <option value="Press / Media">Press / Media</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="message"
                      className="mb-1 block text-sm font-bold"
                    >
                      Message
                    </label>
                    <textarea
                      id="message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="How can we help?"
                      rows={5}
                      className="shadow-neo w-full rounded-lg border-2 border-black p-3 focus:outline-none"
                      style={{ backgroundColor: "#f0f0f0" }}
                      required
                    />
                  </div>

                  {status === "sent" && (
                    <div className="rounded-lg border-2 border-green-600 bg-green-50 p-3 text-center text-sm font-bold text-green-800">
                      Message sent! We&apos;ll get back to you soon.
                    </div>
                  )}

                  {status === "error" && (
                    <div className="rounded-lg border-2 border-red-600 bg-red-50 p-3 text-center text-sm font-bold text-red-800">
                      {errorMessage}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={status === "sending"}
                    className={`${BLACKBUTTONCLASSNAMES} w-full disabled:opacity-50`}
                  >
                    {status === "sending" ? "Sending..." : "Send Message"}
                  </button>
                </form>
              </div>
            </div>
          </div>

          <section className="shadow-neo mt-12 rounded-lg border-2 border-black bg-zinc-50 p-8">
            <h2 className="mb-4 text-2xl font-black">Frequently Asked</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="font-bold">Are you a farmer looking to sell?</h3>
                <p className="text-sm text-zinc-600">
                  Check out our{" "}
                  <Link
                    href="/producer-guide"
                    className="font-bold text-blue-700 underline"
                  >
                    Producer Guide
                  </Link>{" "}
                  for step-by-step instructions on listing your products.
                </p>
              </div>
              <div>
                <h3 className="font-bold">Want to browse local dairy?</h3>
                <p className="text-sm text-zinc-600">
                  Head to the{" "}
                  <Link
                    href="/marketplace"
                    className="font-bold text-blue-700 underline"
                  >
                    Marketplace
                  </Link>{" "}
                  to find farms near you.
                </p>
              </div>
              <div>
                <h3 className="font-bold">Need help with your account?</h3>
                <p className="text-sm text-zinc-600">
                  Visit our{" "}
                  <Link
                    href="/faq"
                    className="font-bold text-blue-700 underline"
                  >
                    FAQ page
                  </Link>{" "}
                  for answers to common questions.
                </p>
              </div>
              <div>
                <h3 className="font-bold">Interested in custom domains?</h3>
                <p className="text-sm text-zinc-600">
                  Sellers can request custom domains for their storefronts.
                  Email us for details.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
