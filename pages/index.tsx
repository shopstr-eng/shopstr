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
import { FREE_FEATURES, PRO_FEATURES } from "@/components/pro/plan-features";

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
  }, [router.pathname, signerContext.isLoggedIn]);

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
            alt="Milk Market logo - local food and artisan marketplace"
            width={32}
            height={32}
            className="h-8 w-8"
            loading="eager"
          />
          <span className="text-xl font-bold">Milk Market</span>
        </div>

        <div className="hidden md:flex md:items-center md:space-x-4">
          <a
            href="#how-it-works"
            className="font-bold text-black hover:underline"
          >
            How it works
          </a>
          <a href="#compare" className="font-bold text-black hover:underline">
            Compare
          </a>
          <a href="#pricing" className="font-bold text-black hover:underline">
            Pricing
          </a>
          <button
            className={WHITEBUTTONCLASSNAMES}
            onClick={() => setIsSignInOpen(true)}
          >
            Start Selling
          </button>
          <Link href="/marketplace" className="w-auto">
            <button className={PRIMARYBUTTONCLASSNAMES}>
              Discover Products
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
              <a
                href="#how-it-works"
                className="text-lg font-bold text-black hover:underline"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                How it works
              </a>
              <a
                href="#compare"
                className="text-lg font-bold text-black hover:underline"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Compare
              </a>
              <a
                href="#pricing"
                className="text-lg font-bold text-black hover:underline"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Pricing
              </a>
              <button
                className={WHITEBUTTONCLASSNAMES}
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsSignInOpen(true);
                }}
              >
                Start Selling
              </button>
              <Link href="/marketplace" className="block">
                <button
                  className={PRIMARYBUTTONCLASSNAMES}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Discover Products
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
          />
        </div>
        <div className="pointer-events-none absolute top-[20%] right-[12%] opacity-[0.05]">
          <Image
            src="/milk-carton.png"
            alt=""
            width={100}
            height={100}
            className="h-25 w-25"
          />
        </div>
        <div className="pointer-events-none absolute bottom-[20%] left-[8%] opacity-[0.07]">
          <Image
            src="/milk-carton.png"
            alt=""
            width={90}
            height={90}
            className="h-22 w-22"
          />
        </div>
        <div className="pointer-events-none absolute right-[15%] bottom-[15%] opacity-[0.05]">
          <Image
            src="/milk-carton.png"
            alt=""
            width={70}
            height={70}
            className="h-18 w-18"
          />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <span className="shadow-neo mb-6 inline-block rounded-full border-2 border-black bg-white px-4 py-1.5 text-xs font-bold tracking-wide uppercase">
            Commerce that flows silky smooth
          </span>

          <h1 className="mb-6 text-4xl leading-tight font-black md:text-6xl">
            Sell local food online,{" "}
            <span className="relative inline-block">
              <span className="relative z-10 inline-block rounded-lg border-[3px] border-black bg-black px-4 py-2 text-white">
                without the middlemen
              </span>
              <span className="bg-primary-yellow absolute right-[-5px] bottom-[-5px] z-0 h-full w-full rounded-lg border-[3px] border-black"></span>
            </span>
          </h1>

          <p className="mx-auto mb-4 max-w-2xl text-lg text-zinc-600">
            Milk Market is the permissionless marketplace for food producers and
            local artisans. Open a storefront in minutes, set your own prices,
            and reach shoppers who want transparent, sustainable food from real
            people nearby.
          </p>

          <div className="mb-8 flex flex-wrap items-center justify-center gap-4 text-sm text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="text-green-500">&#10003;</span> 0% mandatory fees
            </span>
            <span className="flex items-center gap-1">
              <span className="text-green-500">&#10003;</span> Live in minutes
            </span>
            <span className="flex items-center gap-1">
              <span className="text-green-500">&#10003;</span> You own your
              customers
            </span>
          </div>

          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/onboarding/new-account">
              <button
                className={`${PRIMARYBUTTONCLASSNAMES} px-8 py-4 text-lg`}
              >
                List your own
              </button>
            </Link>
            <Link href="/marketplace">
              <button className={`${WHITEBUTTONCLASSNAMES} px-8 py-4 text-lg`}>
                Discover products
              </button>
            </Link>
          </div>

          <p className="mt-4 text-sm text-zinc-500">
            Discover products or list your own &mdash; free to start, no
            mandatory fees, ever.
          </p>
        </div>
      </section>

      {/* Social Proof / Trust Bar */}
      <section className="border-b-2 border-black bg-zinc-100 py-6">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-8 px-4 text-center">
          <div>
            <span className="block text-2xl font-black">0%</span>
            <span className="text-sm text-zinc-600">Mandatory Fees</span>
          </div>
          <div>
            <span className="block text-2xl font-black">100%</span>
            <span className="text-sm text-zinc-600">Direct to Maker</span>
          </div>
          <div>
            <span className="block text-2xl font-black">Minutes</span>
            <span className="text-sm text-zinc-600">To Open a Storefront</span>
          </div>
          <div>
            <span className="block text-2xl font-black">Open</span>
            <span className="text-sm text-zinc-600">
              Permissionless &amp; Decentralized
            </span>
          </div>
        </div>
      </section>

      {/* Problem -> Transformation Section */}
      <section className="relative z-10 border-b-2 border-black bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2">
            <div className="rounded-lg border-2 border-red-200 bg-red-50 p-8">
              <h3 className="mb-4 text-xl font-black text-red-700">
                Selling online today
              </h3>
              <ul className="space-y-3 text-zinc-700">
                <li className="flex items-start gap-2">
                  <span className="text-red-500">&#10007;</span>
                  Big platforms take a cut of every sale and charge monthly rent
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">&#10007;</span>
                  They own your customers, your data, and your store
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">&#10007;</span>
                  Accounts can be frozen or shut down without warning
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500">&#10007;</span>
                  Shoppers can&apos;t tell what&apos;s truly local or
                  transparent
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
                  Keep what you earn &mdash; 0% mandatory fees, ever
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">&#10003;</span>
                  You own your customers and storefront on an open network
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">&#10003;</span>
                  Permissionless &mdash; no approvals, no one can deplatform you
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">&#10003;</span>
                  Shoppers find transparent, sustainable food from real people
                  nearby
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
          />
        </div>
        <div className="pointer-events-none absolute right-[10%] bottom-[15%] opacity-[0.05]">
          <Image
            src="/milk-carton.png"
            alt=""
            width={85}
            height={85}
            className="h-21 w-21"
          />
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-black md:text-4xl">
              How It Works
            </h2>
            <p className="text-lg text-zinc-600">
              Simple for sellers. Simple for shoppers.
            </p>
          </div>

          <div className="grid gap-10 lg:grid-cols-2">
            {/* For sellers */}
            <div>
              <div className="mb-6 flex items-center gap-3">
                <span className="bg-primary-yellow rounded-md border-2 border-black px-3 py-1 text-sm font-black">
                  For Producers
                </span>
              </div>
              <div className="space-y-4">
                <div className="shadow-neo flex items-start gap-4 rounded-lg border-2 border-black bg-white p-5">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-black text-lg font-bold text-white">
                    1
                  </div>
                  <div>
                    <h3 className="mb-1 text-lg font-bold">
                      Open your storefront
                    </h3>
                    <p className="text-zinc-600">Sign up in minutes.</p>
                  </div>
                </div>
                <div className="shadow-neo flex items-start gap-4 rounded-lg border-2 border-black bg-white p-5">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-black text-lg font-bold text-white">
                    2
                  </div>
                  <div>
                    <h3 className="mb-1 text-lg font-bold">
                      List your products
                    </h3>
                    <p className="text-zinc-600">
                      Add food and goods, set your own prices, pickup, and
                      delivery.
                    </p>
                  </div>
                </div>
                <div className="shadow-neo flex items-start gap-4 rounded-lg border-2 border-black bg-white p-5">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-black text-lg font-bold text-white">
                    3
                  </div>
                  <div>
                    <h3 className="mb-1 text-lg font-bold">
                      Get paid directly
                    </h3>
                    <p className="text-zinc-600">
                      Accept cards, Bitcoin, or cash. Keep what you earn on your
                      own terms.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-6">
                <Link href="/onboarding/new-account">
                  <button className={`${PRIMARYBUTTONCLASSNAMES} w-full`}>
                    List your own
                  </button>
                </Link>
              </div>
            </div>

            {/* For buyers */}
            <div>
              <div className="mb-6 flex items-center gap-3">
                <span className="rounded-md border-2 border-black bg-white px-3 py-1 text-sm font-black">
                  For Shoppers
                </span>
              </div>
              <div className="space-y-4">
                <div className="shadow-neo flex items-start gap-4 rounded-lg border-2 border-black bg-white p-5">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-black text-lg font-bold text-white">
                    1
                  </div>
                  <div>
                    <h3 className="mb-1 text-lg font-bold">
                      Discover local producers
                    </h3>
                    <p className="text-zinc-600">
                      Browse transparent, sustainable products from people near
                      you.
                    </p>
                  </div>
                </div>
                <div className="shadow-neo flex items-start gap-4 rounded-lg border-2 border-black bg-white p-5">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-black text-lg font-bold text-white">
                    2
                  </div>
                  <div>
                    <h3 className="mb-1 text-lg font-bold">
                      Choose what you want
                    </h3>
                    <p className="text-zinc-600">
                      Shop as a guest or with a secure account &mdash; your data
                      stays private.
                    </p>
                  </div>
                </div>
                <div className="shadow-neo flex items-start gap-4 rounded-lg border-2 border-black bg-white p-5">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-black text-lg font-bold text-white">
                    3
                  </div>
                  <div>
                    <h3 className="mb-1 text-lg font-bold">
                      Pay &amp; pick up
                    </h3>
                    <p className="text-zinc-600">
                      Pay the maker directly and arrange pickup or delivery.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-6">
                <Link href="/marketplace">
                  <button className={`${WHITEBUTTONCLASSNAMES} w-full`}>
                    Discover products
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us - With Real Numbers */}
      <section className="relative z-10 border-b-2 border-black bg-zinc-50 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-black md:text-4xl">
              Why Producers and Shoppers Choose Us
            </h2>
            <p className="mx-auto max-w-2xl text-zinc-600">
              Direct-to-consumer food sales reached{" "}
              <a
                href="https://www.ers.usda.gov/data-products/charts-of-note/chart-detail?chartId=108821"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-blue-700 underline"
              >
                $17.5 billion in 2022
              </a>
              , up 25% since 2017 according to the USDA Census of Agriculture
              &mdash; reflecting surging demand for fresh, traceable food bought
              direct from local producers and artisans.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            <div className="shadow-neo rounded-lg border-2 border-black bg-white p-8 text-center">
              <span className="mb-4 block text-4xl">0%</span>
              <h3 className="mb-2 text-xl font-bold">No Mandatory Fees</h3>
              <p className="text-zinc-600">
                We never take a mandatory cut. Sellers can choose to set an
                optional donation rate to support the platform, but it&apos;s
                always their choice.
              </p>
            </div>
            <div className="shadow-neo rounded-lg border-2 border-black bg-white p-8 text-center">
              <span className="mb-4 block text-4xl">You</span>
              <h3 className="mb-2 text-xl font-bold">Own Your Store</h3>
              <p className="text-zinc-600">
                Built on Nostr, an open and decentralized network. Your
                customers and storefront are yours &mdash; no one can deplatform
                you.
              </p>
            </div>
            <div className="shadow-neo rounded-lg border-2 border-black bg-white p-8 text-center">
              <span className="mb-4 block text-4xl">100%</span>
              <h3 className="mb-2 text-xl font-bold">
                Private &amp; Transparent
              </h3>
              <p className="text-zinc-600">
                Your data stays encrypted. Shoppers see exactly who they&apos;re
                buying from and support a transparent, sustainable food system.
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

      {/* Comparison - Milk Market vs Shopify vs Barn2Door */}
      <section
        id="compare"
        className="relative z-10 border-b-2 border-black bg-white py-16"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-black md:text-4xl">
              How We Compare
            </h2>
            <p className="mx-auto max-w-2xl text-zinc-600">
              Most platforms rent you a store and take a cut. Milk Market is an
              open marketplace you actually own.
            </p>
          </div>

          <div className="shadow-neo overflow-x-auto rounded-lg border-2 border-black bg-white">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b-2 border-black">
                  <th className="p-4 text-sm font-black"></th>
                  <th className="bg-primary-yellow border-x-2 border-black p-4 text-center text-base font-black">
                    Milk Market
                  </th>
                  <th className="p-4 text-center text-base font-bold text-zinc-700">
                    Shopify
                  </th>
                  <th className="p-4 text-center text-base font-bold text-zinc-700">
                    Barn2Door
                  </th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {[
                  {
                    feature: "Mandatory platform transaction fees",
                    mm: "0%",
                    shopify: "Up to 2%¹",
                    barn: "Varies by plan",
                  },
                  {
                    feature: "Monthly subscription",
                    mm: "Free, or $21 Pro",
                    shopify: "From $39/mo",
                    barn: "Annual contract",
                  },
                  {
                    feature: "Built for local food & makers",
                    mm: true,
                    shopify: false,
                    barn: true,
                  },
                  {
                    feature: "Open & decentralized — you own your store",
                    mm: true,
                    shopify: false,
                    barn: false,
                  },
                  {
                    feature: "Accepts Bitcoin, Lightning & cash natively",
                    mm: true,
                    shopify: false,
                    barn: false,
                  },
                  {
                    feature: "Censorship-resistant — no central shutdown",
                    mm: true,
                    shopify: false,
                    barn: false,
                  },
                  {
                    feature: "Custom domain & storefront",
                    mm: "Pro",
                    shopify: true,
                    barn: true,
                  },
                  {
                    feature: "AI agent commerce (MCP)",
                    mm: true,
                    shopify: false,
                    barn: false,
                  },
                ].map((row, i) => {
                  const renderCell = (val: boolean | string) => {
                    if (val === true)
                      return (
                        <span className="text-xl text-green-600">&#10003;</span>
                      );
                    if (val === false)
                      return (
                        <span className="text-xl text-red-400">&#10007;</span>
                      );
                    return <span className="font-bold">{val}</span>;
                  };
                  return (
                    <tr
                      key={row.feature}
                      className={`border-b border-zinc-200 last:border-b-0 ${
                        i % 2 === 1 ? "bg-zinc-50" : ""
                      }`}
                    >
                      <td className="p-4 font-bold">{row.feature}</td>
                      <td className="bg-primary-yellow/20 border-x-2 border-black p-4 text-center">
                        {renderCell(row.mm)}
                      </td>
                      <td className="p-4 text-center text-zinc-700">
                        {renderCell(row.shopify)}
                      </td>
                      <td className="p-4 text-center text-zinc-700">
                        {renderCell(row.barn)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-center text-xs text-zinc-500">
            &sup1; Shopify charges an additional transaction fee when you
            don&apos;t use Shopify Payments; standard card-processing fees apply
            on all platforms. Competitor details are based on publicly listed
            pricing and features and may change.
          </p>

          <div className="mt-8 text-center">
            <Link href="/onboarding/new-account?migrate=shopify">
              <button className={PRIMARYBUTTONCLASSNAMES}>
                Migrate from Shopify
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Pricing - Free vs Pro for Sellers */}
      <section
        id="pricing"
        className="relative z-10 border-b-2 border-black bg-white py-16"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-black md:text-4xl">
              Simple Pricing for Sellers
            </h2>
            <p className="mx-auto max-w-2xl text-zinc-600">
              Start selling for free. Upgrade to Pro when you want a fully
              custom storefront and pro tools. No mandatory transaction fees,
              ever.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            {/* Free plan */}
            <div className="shadow-neo flex flex-col rounded-lg border-2 border-black bg-white p-8">
              <h3 className="text-2xl font-black">Free</h3>
              <p className="mt-2 mb-6">
                <span className="text-4xl font-black">$0</span>
                <span className="ml-1 text-zinc-600">forever</span>
              </p>
              <ul className="mb-8 space-y-3 text-zinc-700">
                {FREE_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span className="text-green-500">&#10003;</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/onboarding/new-account" className="mt-auto">
                <button className={`${WHITEBUTTONCLASSNAMES} w-full`}>
                  Start Selling Free
                </button>
              </Link>
            </div>

            {/* Pro plan */}
            <div className="shadow-neo bg-primary-yellow relative flex flex-col rounded-lg border-2 border-black p-8">
              <span className="absolute -top-3 right-6 rounded-md border-2 border-black bg-black px-3 py-1 text-xs font-bold text-white">
                MOST POPULAR
              </span>
              <h3 className="text-2xl font-black">Pro</h3>
              <p className="mt-2 mb-1">
                <span className="text-4xl font-black">$21</span>
                <span className="ml-1 text-zinc-700">/month</span>
              </p>
              <p className="mb-6 text-sm font-bold text-zinc-700">
                or $168/year &mdash; save 33%
              </p>
              <ul className="mb-8 space-y-3 text-zinc-800">
                {PRO_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span className="text-green-600">&#10003;</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link href="/onboarding/new-account?plan=pro" className="mt-auto">
                <button className={`${BLACKBUTTONCLASSNAMES} w-full`}>
                  Go Pro
                </button>
              </Link>
            </div>
          </div>

          <p className="mt-8 text-center text-sm text-zinc-500">
            Pay by card, Bitcoin (Lightning), or manual invoice. Cancel anytime.
          </p>
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
              question="What can I sell on Milk Market?"
              answer="Food producers and local artisans can sell almost anything they make - raw milk and dairy, meat and eggs, produce, baked goods, preserves, honey, herdshares, and handmade goods. You set your own prices, pickup, delivery, and payment methods."
            />
            <FAQItem
              question="How much does it cost to sell?"
              answer="Starting is free, with unlimited listings and no mandatory transaction fees, ever. Pro is $21/month (or $168/year) and adds custom domains, advanced storefront design, automated email flows, shipping labels, and AI agent (MCP) access. You can set an optional donation rate to support the platform, but that's always your choice."
            />
            <FAQItem
              question="Do I own my customers and store?"
              answer="Yes. Milk Market is built on Nostr, an open and decentralized network. Your storefront and customer relationships belong to you - not a single company. No one can freeze your account or deplatform you."
            />
            <FAQItem
              question="How do payments work?"
              answer="Buyers can pay with a card, Bitcoin (Lightning and Cashu ecash), or cash for local pickup. Sellers connect their own payout method and get paid directly - there's no middleman holding your money."
            />
            <FAQItem
              question="Is my information private?"
              answer="Yes. All your data is encrypted and private. We never sell user data or share it with third parties. The platform is built on Nostr, a decentralized protocol designed for privacy and ownership."
            />
            <FAQItem
              question="I'm already on Shopify or Barn2Door. Can I switch?"
              answer="Yes. You can migrate from Shopify in a few clicks and keep your products. Click 'Start Selling' or 'Migrate from Shopify' to bring your catalog over and open your storefront in minutes."
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
          />
        </div>
        <div className="pointer-events-none absolute right-[8%] bottom-[20%] opacity-[0.05]">
          <Image
            src="/milk-carton.png"
            alt=""
            width={80}
            height={80}
            className="h-20 w-20"
          />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-3xl font-black md:text-4xl">
              Latest from Our Channel
            </h2>
            <p className="text-lg text-zinc-600">
              Stories from local producers and the decentralized food movement
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
            Get updates on new producers, products, and the decentralized food
            movement
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
            Commerce that flows silky smooth
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-zinc-300">
            Join the movement building a transparent, sustainable, and
            decentralized food system. Discover products or list your own.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/onboarding/new-account">
              <button
                className={`${PRIMARYBUTTONCLASSNAMES} px-8 py-4 text-lg`}
              >
                List your own
              </button>
            </Link>
            <Link href="/marketplace">
              <button className={`${WHITEBUTTONCLASSNAMES} px-8 py-4 text-lg`}>
                Discover products
              </button>
            </Link>
          </div>
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
                Deal directly with local producers
              </p>
            </div>
          </div>

          <div className="border-t border-zinc-700 pt-8 text-center">
            <div className="mb-6 flex items-center justify-center space-x-2">
              <Image
                src="/milk-market.png"
                alt="Milk Market logo - decentralized local food marketplace"
                width={32}
                height={32}
                className="h-8 w-8"
              />
              <span className="text-xl font-bold">Milk Market</span>
            </div>
            <p className="mb-6 text-lg font-bold">
              Commerce that flows silky smooth. Join the movement.
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
              <Link
                href="/onboarding/new-account?migrate=shopify"
                className="text-sm hover:underline"
              >
                Migrate from Shopify
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
                  alt="Milk Market YouTube channel - local food and farming videos"
                  width={24}
                  height={24}
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
