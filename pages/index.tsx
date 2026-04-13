import { useState, useContext, useEffect } from "react";
import type React from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { Image } from "@heroui/react";
import {
  Bars3Icon,
  XMarkIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import {
  BLACKBUTTONCLASSNAMES,
  PRIMARYBUTTONCLASSNAMES,
  WHITEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import SignInModal from "@/components/sign-in/SignInModal";

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b-2 border-black last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between py-4 text-left font-bold transition-colors hover:text-zinc-600"
      >
        <span>{question}</span>
        <ChevronDownIcon
          className={`h-5 w-5 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {isOpen && (
        <div className="pb-4 text-zinc-600">
          <p>{answer}</p>
        </div>
      )}
    </div>
  );
}

function YouTubeCarousel() {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/youtube-videos")
      .then((res) => res.json())
      .then((data) => {
        if (data.videos) {
          setVideos(data.videos);
        } else {
          setError(true);
        }
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-black border-t-transparent"></div>
      </div>
    );
  }

  if (error || videos.length === 0) {
    return (
      <div className="rounded-lg border-2 border-black bg-white p-8 text-center">
        <p className="text-zinc-600">
          Unable to load videos at this time. Please check our YouTube channel
          directly.
        </p>
      </div>
    );
  }

  return (
    <div className="relative max-w-[84vw] overflow-hidden">
      <div className="animate-scroll flex gap-6 will-change-transform">
        {[...videos, ...videos].map((video, index) => (
          <a
            key={`${video.id}-${index}`}
            href={`https://www.youtube.com/watch?v=${video.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group shadow-neo block w-80 flex-shrink-0 overflow-hidden rounded-lg border-2 border-black bg-white transition-all hover:-translate-y-1 active:translate-y-0 active:shadow-none"
          >
            <div className="relative aspect-video overflow-hidden">
              <Image
                src={video.thumbnail}
                alt={video.title}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="bg-opacity-0 group-hover:bg-opacity-20 absolute inset-0 flex items-center justify-center bg-black transition-all">
                <div className="rounded-full bg-red-600 p-3 opacity-0 transition-opacity group-hover:opacity-100">
                  <svg
                    className="h-6 w-6 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="p-4">
              <h3 className="mb-2 line-clamp-2 font-bold text-black">
                {video.title}
              </h3>
              <p className="line-clamp-2 text-sm text-zinc-600">
                {video.description}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export default function StandaloneLanding() {
  const router = useRouter();
  const [contactType, setContactType] = useState<"email" | "nostr">("email");
  const [contact, setContact] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSignInOpen, setIsSignInOpen] = useState(false);

  const signerContext = useContext(SignerContext);
  useEffect(() => {
    if (router.pathname === "/" && signerContext.isLoggedIn) {
      router.push("/marketplace");
    }
  }, [router.pathname, signerContext]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact.trim() || !isValidContact) return;

    setIsSubmitting(true);
    setSubmitMessage(null);

    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contact: contact.trim(),
          contactType,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSubmitMessage({
          type: "success",
          text: "Thanks for signing up! We'll keep you updated on new features and products.",
        });
        setContact("");
      } else {
        setSubmitMessage({
          type: "error",
          text: data.error || "Something went wrong! Please try again.",
        });
      }
    } catch (error) {
      setSubmitMessage({
        type: "error",
        text: "Network error! Please check your connection and try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const isValidNostrPub = (npub: string) => {
    return npub.startsWith("npub1") && npub.length === 63;
  };

  const isValidContact =
    contactType === "email" ? isValidEmail(contact) : isValidNostrPub(contact);

  const PlusPattern = () => (
    <div className="pointer-events-none absolute inset-0 opacity-[0.03]">
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern
            id="plus-pattern"
            x="0"
            y="0"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 20 0 L 20 40 M 0 20 L 40 20"
              stroke="#000000"
              strokeWidth="2"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#plus-pattern)" />
      </svg>
    </div>
  );

  return (
    <div className="w-full overflow-x-hidden bg-white font-sans text-black">
      {/* Navigation */}
      <nav className="relative z-20 mx-auto flex max-w-7xl items-center justify-between p-4 md:p-6">
        <div className="flex items-center space-x-2">
          <Image
            src="/milk-market.png"
            alt="Milk Market logo - farm-fresh dairy marketplace"
            width={32}
            height={32}
            className="h-8 w-8"
            loading="eager"
          />
          <span className="text-xl font-bold">Milk Market</span>
        </div>

        <div className="hidden md:flex md:items-center md:space-x-4">
          <button
            className={WHITEBUTTONCLASSNAMES}
            onClick={() => setIsSignInOpen(true)}
          >
            Sell Your Dairy
          </button>
          <Link href="/marketplace" className="w-auto">
            <button className={PRIMARYBUTTONCLASSNAMES}>
              Browse Marketplace
            </button>
          </Link>
        </div>

        <div className="relative md:hidden">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="z-50 rounded-md border-2 border-black bg-white p-2"
          >
            {isMobileMenuOpen ? (
              <XMarkIcon className="h-6 w-6 text-black" />
            ) : (
              <Bars3Icon className="h-6 w-6 text-black" />
            )}
          </button>
          {isMobileMenuOpen && (
            <div className="fixed inset-0 top-20 z-40 flex flex-col items-center space-y-6 bg-white pt-10">
              <button
                className={WHITEBUTTONCLASSNAMES}
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsSignInOpen(true);
                }}
              >
                Sell Your Dairy
              </button>
              <Link href="/marketplace" className="block">
                <button
                  className={PRIMARYBUTTONCLASSNAMES}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Browse Marketplace
                </button>
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section - Optimized with single CTA and outcome-first headline */}
      <section className="bg-grid-pattern relative z-10 overflow-hidden border-b-2 border-black px-4 pt-12 pb-16 sm:px-6 lg:px-8">
        <PlusPattern />

        {/* Background Milk Cartons */}
        <div className="pointer-events-none absolute top-[15%] left-[10%] opacity-[0.06]">
          <Image
            src="/milk-carton.png"
            alt=""
            width={80}
            height={80}
            className="h-20 w-20"
            loading="lazy"
          />
        </div>
        <div className="pointer-events-none absolute top-[20%] right-[12%] opacity-[0.05]">
          <Image
            src="/milk-carton.png"
            alt=""
            width={100}
            height={100}
            className="h-25 w-25"
            loading="lazy"
          />
        </div>
        <div className="pointer-events-none absolute bottom-[20%] left-[8%] opacity-[0.07]">
          <Image
            src="/milk-carton.png"
            alt=""
            width={90}
            height={90}
            className="h-22 w-22"
            loading="lazy"
          />
        </div>
        <div className="pointer-events-none absolute right-[15%] bottom-[15%] opacity-[0.05]">
          <Image
            src="/milk-carton.png"
            alt=""
            width={70}
            height={70}
            className="h-18 w-18"
            loading="lazy"
          />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <h1 className="mb-6 text-4xl leading-tight font-black md:text-6xl">
            Farm-Fresh Dairy <br />
            <span className="relative inline-block">
              <span className="relative z-10 inline-block rounded-lg border-[3px] border-black bg-black px-4 py-2 text-white">
                Direct to Your Door
              </span>
              <span className="bg-primary-yellow absolute right-[-5px] bottom-[-5px] z-0 h-full w-full rounded-lg border-[3px] border-black"></span>
            </span>
          </h1>

          <p className="mx-auto mb-4 max-w-xl text-lg text-zinc-600">
            Find local farmers selling raw milk, cheese, and dairy products. Pay
            directly. Pick up fresh or have delivered.
          </p>

          <div className="mb-8 flex flex-wrap items-center justify-center gap-4 text-sm text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="text-green-500">&#10003;</span> Local farms near
              you
            </span>
            <span className="flex items-center gap-1">
              <span className="text-green-500">&#10003;</span> No mandatory fees
            </span>
            <span className="flex items-center gap-1">
              <span className="text-green-500">&#10003;</span> Direct payments
            </span>
          </div>

          <Link href="/marketplace">
            <button className={`${PRIMARYBUTTONCLASSNAMES} px-8 py-4 text-lg`}>
              Find Local Dairy Near You
            </button>
          </Link>

          <p className="mt-4 text-sm text-zinc-500">
            Are you a farmer?{" "}
            <button
              onClick={() => setIsSignInOpen(true)}
              className="font-bold underline hover:text-black"
            >
              Start selling today
            </button>
          </p>
        </div>
      </section>

      {/* Social Proof / Trust Bar */}
      <section className="border-b-2 border-black bg-zinc-100 py-6">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-8 px-4 text-center">
          <div>
            <span className="block text-2xl font-black">2+</span>
            <span className="text-sm text-zinc-600">Local Farms</span>
          </div>
          <div>
            <span className="block text-2xl font-black">10+</span>
            <span className="text-sm text-zinc-600">Products Listed</span>
          </div>
          <div>
            <span className="block text-2xl font-black">0%</span>
            <span className="text-sm text-zinc-600">Mandatory Fees</span>
          </div>
          <div>
            <span className="block text-2xl font-black">100%</span>
            <span className="text-sm text-zinc-600">Direct to Farmer</span>
          </div>
        </div>
      </section>

      {/* Problem -> Transformation Section */}
      <section className="relative z-10 border-b-2 border-black bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2">
            <div className="rounded-lg border-2 border-red-200 bg-red-50 p-8">
              <h3 className="mb-4 text-xl font-black text-red-700">
                The Problem
              </h3>
              <ul className="space-y-3 text-zinc-700">
                <li className="flex items-start gap-2">
                  <span className="text-red-500">&#10007;</span>
                  Grocery store dairy is weeks old and highly processed
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">&#10007;</span>
                  Hard to find local farmers who sell raw dairy
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">&#10007;</span>
                  Middlemen take a cut and raise prices
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">&#10007;</span>
                  No easy way to pay farmers directly
                </li>
              </ul>
            </div>

            <div className="rounded-lg border-2 border-green-200 bg-green-50 p-8">
              <h3 className="mb-4 text-xl font-black text-green-700">
                With Milk Market
              </h3>
              <ul className="space-y-3 text-zinc-700">
                <li className="flex items-start gap-2">
                  <span className="text-green-500">&#10003;</span>
                  Get dairy straight from the farm, days fresh
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">&#10003;</span>
                  Browse local farms by location in seconds
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">&#10003;</span>
                  No mandatory fees &mdash; farmers can optionally donate to
                  support the site
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">&#10003;</span>
                  Pay with Bitcoin, cash, or digital methods
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - Simplified */}
      <section
        id="how-it-works"
        className="bg-grid-pattern relative z-10 overflow-hidden border-b-2 border-black py-16"
      >
        <PlusPattern />

        {/* Background Milk Cartons */}
        <div className="pointer-events-none absolute top-[12%] left-[8%] opacity-[0.06]">
          <Image
            src="/milk-carton.png"
            alt=""
            width={95}
            height={95}
            className="h-24 w-24"
            loading="lazy"
          />
        </div>
        <div className="pointer-events-none absolute right-[10%] bottom-[15%] opacity-[0.05]">
          <Image
            src="/milk-carton.png"
            alt=""
            width={85}
            height={85}
            className="h-21 w-21"
            loading="lazy"
          />
        </div>

        <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-black md:text-4xl">
              How It Works
            </h2>
            <p className="text-lg text-zinc-600">
              Three simple steps to farm-fresh dairy
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            <div className="shadow-neo rounded-lg border-2 border-black bg-white p-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-black text-xl font-bold text-white">
                1
              </div>
              <h3 className="mb-2 text-xl font-bold">Browse Local Farms</h3>
              <p className="text-zinc-600">
                Search by location to find dairy farmers near you
              </p>
            </div>

            <div className="shadow-neo rounded-lg border-2 border-black bg-white p-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-black text-xl font-bold text-white">
                2
              </div>
              <h3 className="mb-2 text-xl font-bold">Choose Your Dairy</h3>
              <p className="text-zinc-600">
                Select raw milk, cheese, butter, and more from their listings
              </p>
            </div>

            <div className="shadow-neo rounded-lg border-2 border-black bg-white p-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-black text-xl font-bold text-white">
                3
              </div>
              <h3 className="mb-2 text-xl font-bold">Pay & Pick Up</h3>
              <p className="text-zinc-600">
                Pay the farmer directly and arrange pickup or delivery
              </p>
            </div>
          </div>

          <div className="mt-10 text-center">
            <Link href="/marketplace">
              <button className={PRIMARYBUTTONCLASSNAMES}>
                Start Browsing
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Why Choose Us - With Real Numbers */}
      <section className="relative z-10 border-b-2 border-black bg-zinc-50 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-black md:text-4xl">
              Why Farmers and Buyers Choose Us
            </h2>
            <p className="mx-auto max-w-2xl text-zinc-600">
              Direct food sales from farms reached{" "}
              <a
                href="https://www.ers.usda.gov/data-products/charts-of-note/chart-detail?chartId=108821"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-blue-700 underline"
              >
                $17.5 billion in 2022
              </a>
              , up 25% since 2017 according to the USDA Census of Agriculture
              &mdash; reflecting surging demand for fresh, traceable food sold
              direct from local farms.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            <div className="shadow-neo rounded-lg border-2 border-black bg-white p-8 text-center">
              <span className="mb-4 block text-4xl">0%</span>
              <h3 className="mb-2 text-xl font-bold">No Mandatory Fees</h3>
              <p className="text-zinc-600">
                We never take a mandatory cut. Farmers can choose to set an
                optional donation rate to support the platform, but it&apos;s
                always their choice.
              </p>
            </div>
            <div className="shadow-neo rounded-lg border-2 border-black bg-white p-8 text-center">
              <span className="mb-4 block text-4xl">100%</span>
              <h3 className="mb-2 text-xl font-bold">Private & Secure</h3>
              <p className="text-zinc-600">
                Your data stays encrypted. No tracking, no selling your info.
              </p>
            </div>
            <div className="shadow-neo rounded-lg border-2 border-black bg-white p-8 text-center">
              <span className="mb-4 block text-4xl">24/7</span>
              <h3 className="mb-2 text-xl font-bold">Always Available</h3>
              <p className="text-zinc-600">
                Browse farms and products anytime. Connect when it works for
                you.
              </p>
            </div>
          </div>

          <blockquote className="shadow-neo mx-auto mt-10 max-w-3xl rounded-lg border-2 border-black bg-white p-6 text-center">
            <p className="mb-3 text-lg text-zinc-700 italic">
              &ldquo;The shorter the chain between raw food and fork, the
              fresher it is and the more transparent the system is.&rdquo;
            </p>
            <cite className="text-sm font-bold text-black not-italic">
              &mdash; Joel Salatin,{" "}
              <span className="font-normal italic">
                Everything I Want To Do Is Illegal
              </span>
            </cite>
          </blockquote>
        </div>
      </section>

      {/* FAQ Section - Objection Handling */}
      <section className="relative z-10 border-b-2 border-black bg-white py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center">
            <h2 className="mb-4 text-3xl font-black md:text-4xl">
              Common Questions
            </h2>
          </div>

          <div className="shadow-neo rounded-lg border-2 border-black bg-white p-6">
            <FAQItem
              question="Is raw milk legal in my state?"
              answer="Raw milk laws vary by state. Some states allow retail sales, others permit farm sales only, and some restrict it entirely. Check your local regulations. Milk Market simply connects buyers with local farmers - you arrange the transaction directly."
            />
            <FAQItem
              question="How do I pay the farmer?"
              answer="You pay the farmer directly using whatever method you both agree on - Bitcoin, cash, or other digital payment methods. There are no mandatory platform fees. Farmers may choose to set an optional donation rate to help support the site, but that's entirely up to them."
            />
            <FAQItem
              question="Is my information private?"
              answer="Yes. All your data is encrypted and private. We never share user data with third parties or regulators. Our platform is built on Nostr, a decentralized protocol that prioritizes privacy."
            />
            <FAQItem
              question="How fresh is the dairy?"
              answer="That depends on the farmer you choose. Most farms offer dairy that's just days old - far fresher than the weeks-old products you'd find at a grocery store. You can ask your farmer directly about their freshness and handling practices."
            />
            <FAQItem
              question="I'm a farmer. How do I list my products?"
              answer="It's free and takes just a few minutes. Click 'Sell Your Dairy' in the navigation, create your profile, and start adding products. You set your own prices, delivery options, and payment methods."
            />
          </div>
        </div>
      </section>

      {/* YouTube Videos Section */}
      <section className="bg-grid-pattern relative z-10 overflow-hidden border-b-2 border-black py-16">
        <PlusPattern />

        {/* Background Milk Cartons */}
        <div className="pointer-events-none absolute top-[18%] left-[12%] opacity-[0.06]">
          <Image
            src="/milk-carton.png"
            alt=""
            width={90}
            height={90}
            className="h-22 w-22"
            loading="lazy"
          />
        </div>
        <div className="pointer-events-none absolute right-[8%] bottom-[20%] opacity-[0.05]">
          <Image
            src="/milk-carton.png"
            alt=""
            width={80}
            height={80}
            className="h-20 w-20"
            loading="lazy"
          />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-black md:text-4xl">
              Latest from Our Channel
            </h2>
            <p className="text-lg text-zinc-600">
              Stories from the raw dairy community
            </p>
          </div>

          <div className="flex items-center justify-center">
            <YouTubeCarousel />
          </div>

          <div className="mt-8 text-center">
            <a
              href="https://www.youtube.com/@milkmarketmedia"
              target="_blank"
              rel="noopener noreferrer"
              className={`${WHITEBUTTONCLASSNAMES} inline-flex items-center gap-2`}
            >
              Visit Our Channel
            </a>
          </div>
        </div>
      </section>

      {/* Signup Form Section */}
      <section
        id="signup"
        className="relative z-10 overflow-hidden border-b-2 border-black bg-zinc-50 py-16"
      >
        <div className="relative z-10 mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-4 text-3xl font-black md:text-4xl">
            Stay in the Loop
          </h2>
          <p className="mb-8 text-lg text-zinc-600">
            Get updates on new farms, products, and the raw dairy movement
          </p>

          <div className="shadow-neo rounded-lg border-2 border-black bg-white p-8 text-left">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="mb-2 block text-base font-bold">
                  How would you like us to reach you?
                </label>
                <div className="flex gap-6">
                  <label className="flex cursor-pointer items-center">
                    <input
                      type="radio"
                      name="contactType"
                      value="email"
                      checked={contactType === "email"}
                      onChange={() => setContactType("email")}
                      className="mr-2 accent-black"
                    />
                    Email
                  </label>
                  <label className="flex cursor-pointer items-center">
                    <input
                      type="radio"
                      name="contactType"
                      value="nostr"
                      checked={contactType === "nostr"}
                      onChange={() => setContactType("nostr")}
                      className="mr-2 accent-black"
                    />
                    Nostr
                  </label>
                </div>
              </div>

              <div>
                <label
                  htmlFor="contact"
                  className="mb-2 block text-base font-bold"
                >
                  {contactType === "email"
                    ? "Email Address"
                    : "Nostr Public Key (npub)"}
                </label>
                <input
                  id="contact"
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder={
                    contactType === "email" ? "your@email.com" : "npub1..."
                  }
                  className="shadow-neo w-full rounded-lg border-2 border-black p-3 focus:outline-none"
                  style={{ backgroundColor: "#f0f0f0" }}
                />
              </div>

              <button
                type="submit"
                disabled={!isValidContact || isSubmitting}
                className={`${BLACKBUTTONCLASSNAMES} w-full`}
              >
                {isSubmitting ? "Submitting..." : "Get Updates"}
              </button>
            </form>

            {submitMessage && (
              <div
                className={`mt-4 rounded-lg p-4 ${
                  submitMessage.type === "success"
                    ? "border border-green-200 bg-green-100 text-green-800"
                    : "border border-red-200 bg-red-100 text-red-800"
                }`}
              >
                <p className="flex items-center space-x-2">
                  <span>
                    {submitMessage.type === "success" ? "&#10003;" : "&#10007;"}
                  </span>
                  <span>{submitMessage.text}</span>
                </p>
              </div>
            )}

            <div className="mt-6 text-center text-sm text-zinc-500">
              <p>Your contact info stays private and will never be shared</p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="relative z-10 bg-black py-16 text-white">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-6 text-3xl font-black md:text-4xl">
            Ready to Get Farm-Fresh Dairy?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-zinc-300">
            Join the movement connecting people with local dairy farmers
          </p>
          <Link href="/marketplace">
            <button className={`${PRIMARYBUTTONCLASSNAMES} px-8 py-4 text-lg`}>
              Find Local Dairy Now
            </button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 bg-gray-900 py-12 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8 grid gap-6 text-center md:grid-cols-3">
            <div>
              <h4 className="mb-2 font-bold">Private</h4>
              <p className="text-sm text-zinc-400">
                All data encrypted and secure
              </p>
            </div>
            <div>
              <h4 className="mb-2 font-bold">Permissionless</h4>
              <p className="text-sm text-zinc-400">
                No central authority controls the platform
              </p>
            </div>
            <div>
              <h4 className="mb-2 font-bold">Peer to Peer</h4>
              <p className="text-sm text-zinc-400">
                Deal directly with farmers
              </p>
            </div>
          </div>

          <div className="border-t border-zinc-700 pt-8 text-center">
            <div className="mb-6 flex items-center justify-center space-x-2">
              <Image
                src="/milk-market.png"
                alt="Milk Market logo - decentralized dairy marketplace"
                width={32}
                height={32}
                className="h-8 w-8"
                loading="lazy"
              />
              <span className="text-xl font-bold">Milk Market</span>
            </div>
            <p className="mb-6 text-lg font-bold">
              The Milk Revolution Won&apos;t Be Pasteurized. Join Us.
            </p>
            <div className="mb-6 flex flex-wrap items-center justify-center gap-6">
              <Link href="/about" className="text-sm hover:underline">
                About Us
              </Link>
              <Link href="/contact" className="text-sm hover:underline">
                Contact
              </Link>
              <Link href="/faq" className="text-sm hover:underline">
                FAQ
              </Link>
              <Link href="/terms" className="text-sm hover:underline">
                Terms
              </Link>
              <Link href="/privacy" className="text-sm hover:underline">
                Privacy
              </Link>
              <Link href="/producer-guide" className="text-sm hover:underline">
                Producer Guide
              </Link>
            </div>
            <div className="mb-6 flex flex-wrap items-center justify-center gap-6">
              <a
                href="https://github.com/shopstr-eng/milk-market"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-transform hover:scale-110"
              >
                <Image
                  src="/github-mark-white.png"
                  alt="Milk Market open source code on GitHub"
                  width={24}
                  height={24}
                  loading="lazy"
                />
              </a>
              <a
                href="https://njump.me/milkmarket@milk.market"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-transform hover:scale-110"
              >
                <Image
                  src="/nostr-icon-white-transparent-256x256.png"
                  alt="Milk Market on Nostr decentralized network"
                  width={32}
                  height={32}
                  loading="lazy"
                />
              </a>
              <a
                href="https://x.com/milkmarketmedia"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-transform hover:scale-110"
              >
                <Image
                  src="/x-logo-white.png"
                  alt="Follow Milk Market on X (Twitter)"
                  width={24}
                  height={24}
                  loading="lazy"
                />
              </a>
              <a
                href="https://www.youtube.com/@milkmarketmedia"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-transform hover:scale-110"
              >
                <Image
                  src="/youtube-icon.png"
                  alt="Milk Market YouTube channel - dairy farming videos"
                  width={24}
                  height={24}
                  loading="lazy"
                />
              </a>
              <a
                href="https://www.instagram.com/milkmarketmedia/"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-transform hover:scale-110"
              >
                <Image
                  src="/instagram-icon.png"
                  alt="Milk Market on Instagram"
                  width={24}
                  height={24}
                  loading="lazy"
                />
              </a>
              <a
                href="https://www.tiktok.com/@milkmarket.media"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-transform hover:scale-110"
              >
                <Image
                  src="/tiktok-icon.png"
                  alt="Milk Market on TikTok"
                  width={24}
                  height={24}
                  loading="lazy"
                />
              </a>
            </div>
            <p className="text-sm text-zinc-500">
              &copy; {new Date().getFullYear()} Milk Market LLC. All rights
              reserved.
            </p>
          </div>
        </div>
      </footer>

      <SignInModal
        isOpen={isSignInOpen}
        onClose={() => setIsSignInOpen(false)}
        sellerFlow
      />
    </div>
  );
}
