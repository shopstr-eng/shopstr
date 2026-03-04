import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import {
  Button,
  Image,
  Modal,
  ModalContent,
  ModalBody,
} from "@nextui-org/react";
import {
  ArrowLeftIcon,
  XMarkIcon,
  InformationCircleIcon,
  Bars3Icon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import {
  WHITEBUTTONCLASSNAMES,
  PRIMARYBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";

const ProducerGuidePage = () => {
  const router = useRouter();
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("introduction");

  const handleImageClick = (imageSrc: string) => {
    setExpandedImage(imageSrc);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setExpandedImage(null);
    setIsModalOpen(false);
  };

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
      setActiveSection(sectionId);
      setSidebarOpen(false);
    }
  };

  const sidebarItems = [
    {
      id: "introduction",
      label: "Introduction",
      threads: [],
    },
    {
      id: "step-1",
      label: "Step 1",
      threads: [
        { id: "step-1-1", label: "1.1 Sign In Modal" },
        { id: "step-1-2", label: "1.2 Keys Page" },
        { id: "step-1-3", label: "1.3 Profile Page" },
        { id: "step-1-4", label: "1.4 Shop Page" },
      ],
    },
    {
      id: "step-2",
      label: "Step 2",
      threads: [
        { id: "step-2-1", label: "2.1 Listing Password" },
        { id: "step-2-2", label: "2.2 Product Details" },
        { id: "step-2-3", label: "2.3 Pickup Details" },
        { id: "step-2-4", label: "2.4 List Product" },
      ],
    },
    {
      id: "step-3",
      label: "Step 3",
      threads: [
        { id: "step-3-1", label: "3.1 Fiat Order Chat" },
        { id: "step-3-2", label: "3.2 Bitcoin Order Chat" },
        { id: "step-3-3", label: "3.3 Payment Redemption" },
        { id: "step-3-4", label: "3.4 Wallet Page" },
      ],
    },
    {
      id: "step-4",
      label: "Step 4",
      threads: [
        { id: "step-4-1", label: "4.1 Update Listings" },
        { id: "step-4-2", label: "4.2 Build Relationships" },
        { id: "step-4-3", label: "4.3 Share Story" },
        { id: "step-4-4", label: "4.4 Network Growth" },
      ],
    },
  ];

  const faqItems = [
    {
      id: "passphrase-faq",
      question: "What is a passphrase? What is it used for?",
      answer:
        "A passphrase is just a password you create as a user to keep your private key stored safely in your browser so only you can access your account. It is needed for securely sending messages, listing products, or saving profile and shop information on Milk Market.",
    },
    {
      id: "payment-methods-faq",
      question: "What payment methods do customers use?",
      answer: (
        <>
          Milk Market supports Bitcoin payments through Lightning Network and
          Cashu tokens. You can also arrange cash payments directly with
          customers during pickup or delivery and other payment options like{" "}
          <a
            href="https://cash.app/bitcoin"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-yellow underline hover:opacity-80"
          >
            Cash App
          </a>
          , Venmo, PayPal, etc.
        </>
      ),
    },
    {
      id: "bitcoin-faq",
      question: "Why Bitcoin? How can I exchange it?",
      answer: (
        <>
          <a
            href="https://bitcoin.rocks/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-yellow underline hover:opacity-80"
          >
            Bitcoin
          </a>{" "}
          is supported because it allows for complete control over your funds
          and transactions and protects your wealth over time. Payment
          processors like Stripe, PayPal, etc. can freeze your funds, close your
          account, or even ban you for selling products they don&apos;t deem
          acceptable (which raw milk and dairy can easily fall under). If
          desired, you can exchange it for cash or other currencies at your own
          pace using tools like{" "}
          <a
            href="https://cash.app/bitcoin"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-yellow underline hover:opacity-80"
          >
            Cash App
          </a>{" "}
          or{" "}
          <a
            href="https://strike.me/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-yellow underline hover:opacity-80"
          >
            Strike
          </a>
          .
        </>
      ),
    },
    {
      id: "listing-passphrase-faq",
      question: "What is the listing passphrase? How do I get it?",
      answer:
        "The listing passphrase is a password set by Milk Market to prevent spam and ensure that trusted producers can list products. You can get it by contacting Milk Market or other producers in the Milk Market community.",
    },
    {
      id: "process-payments-faq",
      question: "How do I process payments?",
      answer: (
        <>
          If accepting Bitcoin payments, you can redeem them through the chat
          interface and directly to the site wallet. With the wallet, you can
          save your payments or send money to another wallet like{" "}
          <a
            href="https://cash.app/bitcoin"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-yellow underline hover:opacity-80"
          >
            Cash App
          </a>
          ,{" "}
          <a
            href="https://coinos.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-yellow underline hover:opacity-80"
          >
            Coinos
          </a>
          ,{" "}
          <a
            href="https://www.minibits.cash/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-yellow underline hover:opacity-80"
          >
            Minibits
          </a>
          , etc. If accepting cash, you can arrange payment during pickup or
          delivery. With other online fiat options, payment should be delivered
          with the order to the specified account, so make sure to check your
          external accounts for any incoming payments.
        </>
      ),
    },
    {
      id: "delivery-faq",
      question: "How do I handle delivery and pickup?",
      answer:
        "You set your own delivery options - whether you offer farm pickup, local delivery, or meet at farmers markets. Coordinate specific details on your product details page or through the encrypted messaging system with each customer.",
    },
    {
      id: "privacy-faq",
      question: "Is my communication with customers private?",
      answer:
        "Yes, all messages are encrypted. Only you and your customers can see your conversations - no third parties have access to your private communications.",
    },
  ];

  return (
    <>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
        <title>
          Producer Guide - Milk Market | Start Selling Farm-Fresh Dairy Products
        </title>
        <meta
          name="description"
          content="Learn how to become a producer on Milk Market. Step-by-step guide to selling raw milk and dairy products directly to customers using the permissionless marketplace."
        />
        <link rel="canonical" href="https://milk.market/producers" />
        <link rel="apple-touch-icon" href="/milk-market.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/milk-market.png" />
        <meta property="og:url" content="https://milk.market/producers" />
        <meta property="og:type" content="website" />
        <meta
          property="og:title"
          content="Producer Guide - Milk Market | Start Selling Farm-Fresh Dairy Products"
        />
        <meta
          property="og:description"
          content="Learn how to become a producer on Milk Market. Step-by-step guide to selling raw milk and dairy products directly to customers using the permissionless marketplace."
        />
        <meta property="og:image" content="/milk-market.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta property="twitter:domain" content="https://milk.market" />
        <meta property="twitter:url" content="https://milk.market/producers" />
        <meta
          name="twitter:title"
          content="Producer Guide - Milk Market | Start Selling Farm-Fresh Dairy Products"
        />
        <meta
          name="twitter:description"
          content="Learn how to become a producer on Milk Market. Step-by-step guide to selling raw milk and dairy products directly to customers using the permissionless marketplace."
        />
        <meta name="twitter:image" content="/milk-market.png" />
        <meta
          name="keywords"
          content="milk market producer guide, sell raw dairy, sell farm-fresh dairy, bitcoin payments, nostr marketplace, dairy producer, farm to consumer, direct sales, raw milk sales"
        />
      </Head>
      <div className="min-h-screen bg-white">
        {/* Mobile Sidebar Toggle */}
        <button
          className="fixed right-4 top-4 z-50 rounded border-2 border-black bg-white p-2 shadow-neo lg:hidden"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <Bars3Icon className="h-6 w-6 text-black" />
        </button>

        {/* Sidebar */}
        <aside
          className={`fixed left-0 top-0 z-40 h-screen w-64 transform border-r-4 border-black bg-white shadow-neo transition-transform lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="h-full overflow-y-auto p-6">
            <h2 className="mb-6 text-2xl font-bold text-black">Guide</h2>
            <nav className="space-y-2">
              {sidebarItems.map((item) => (
                <div key={item.id}>
                  <button
                    onClick={() => scrollToSection(item.id)}
                    className={`w-full rounded border-2 border-black px-4 py-2 text-left font-bold transition-all hover:-translate-y-0.5 ${
                      activeSection === item.id
                        ? "bg-primary-yellow text-black shadow-neo"
                        : "bg-white text-black"
                    }`}
                  >
                    {item.label}
                  </button>
                  {item.threads.length > 0 && (
                    <div className="ml-4 mt-2 space-y-1">
                      {item.threads.map((thread) => (
                        <button
                          key={thread.id}
                          onClick={() => scrollToSection(thread.id)}
                          className={`w-full rounded px-3 py-1 text-left text-sm transition-all hover:bg-gray-100 ${
                            activeSection === thread.id
                              ? "font-bold text-primary-blue"
                              : "text-black"
                          }`}
                        >
                          {thread.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <div className="lg:ml-64">
          <div className="mx-auto max-w-5xl px-4 py-8">
            {/* Header */}
            <div id="introduction" className="mb-12">
              <Button
                className={`mb-8 ${WHITEBUTTONCLASSNAMES}`}
                onClick={() => router.push("/")}
                startContent={<ArrowLeftIcon className="h-4 w-4" />}
              >
                Home
              </Button>

              <div className="text-center">
                <h1 className="mb-4 text-5xl font-bold text-black">
                  Producer Guide
                </h1>
                <p className="mx-auto max-w-3xl text-lg text-primary-blue">
                  Learn how to start selling your raw dairy products and other
                  goods on Milk Market.
                </p>
              </div>
            </div>

            {/* Video Section */}
            <div className="mb-16 rounded-lg border-4 border-black bg-primary-blue p-6 shadow-neo">
              <h2 className="mb-4 text-center text-2xl font-bold text-white">
                Getting Started Video Guide
              </h2>
              <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-lg border-2 border-black">
                <video controls className="w-full bg-black">
                  <source src="/producer-demo.mp4" type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              </div>
            </div>

            {/* Step-by-Step Guide */}
            <div className="space-y-8">
              {/* Step 1 */}
              <div
                id="step-1"
                className="rounded-lg border-4 border-black bg-primary-blue p-6 shadow-neo"
              >
                <div className="mb-6 flex items-start gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-4 border-black bg-white text-2xl font-bold text-black shadow-neo">
                    1
                  </div>
                  <div className="flex-1">
                    <h3 className="mb-2 text-2xl font-bold text-white">
                      Create Your Account
                    </h3>
                    <p className="mb-4 text-base text-white">
                      Sign up for Milk Market using your Nostr identity or
                      create a new one. Your Nostr key ensures secure, private
                      communication with customers.
                    </p>
                    <ul className="list-disc space-y-2 pl-6 text-sm text-white">
                      <li id="step-1-1">
                        Click &ldquo;Sign In&rdquo; in the top navigation
                      </li>
                      <li id="step-1-2">
                        Choose your preferred login method or create a new
                        account{" "}
                        <span className="inline-flex items-center">
                          with a passphrase{" "}
                          <InformationCircleIcon
                            className="ml-1 h-4 w-4 cursor-pointer text-primary-yellow hover:opacity-80"
                            onClick={() => {
                              const faqSection =
                                document.getElementById("passphrase-faq");
                              if (faqSection) {
                                faqSection.scrollIntoView({
                                  behavior: "smooth",
                                });
                              }
                            }}
                          />
                        </span>
                      </li>
                      <li id="step-1-3">Complete the onboarding process</li>
                      <li id="step-1-4">
                        Set up your user profile with basic information,
                        including{" "}
                        <span className="inline-flex items-center">
                          payment preferences{" "}
                          <InformationCircleIcon
                            className="ml-1 h-4 w-4 cursor-pointer text-primary-yellow hover:opacity-80"
                            onClick={() => {
                              const faqSection = document.getElementById(
                                "payment-methods-faq"
                              );
                              if (faqSection) {
                                faqSection.scrollIntoView({
                                  behavior: "smooth",
                                });
                              }
                            }}
                          />
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Image Grid */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    {
                      src: "/sign-in-modal.png",
                      alt: "Sign In Modal",
                      step: "1.1",
                    },
                    { src: "/keys-page.png", alt: "Keys Page", step: "1.2" },
                    {
                      src: "/profile-page.png",
                      alt: "Profile Page",
                      step: "1.3",
                    },
                    { src: "/shop-page.png", alt: "Shop Page", step: "1.4" },
                  ].map((image, idx) => (
                    <div
                      key={idx}
                      className="relative cursor-pointer overflow-hidden rounded-lg border-3 border-black bg-gray-700 shadow-neo transition-transform hover:-translate-y-1"
                      onClick={() => handleImageClick(image.src)}
                    >
                      <div className="absolute left-2 top-2 z-10 rounded border-2 border-black bg-white px-2 py-0.5 text-xs font-bold text-black shadow-neo">
                        Step {image.step}
                      </div>
                      <Image
                        src={image.src}
                        alt={image.alt}
                        className="h-36 w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Step 2 */}
              <div
                id="step-2"
                className="rounded-lg border-4 border-black bg-primary-blue p-6 shadow-neo"
              >
                <div className="mb-6 flex items-start gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-4 border-black bg-white text-2xl font-bold text-black shadow-neo">
                    2
                  </div>
                  <div className="flex-1">
                    <h3 className="mb-2 text-2xl font-bold text-white">
                      List Your First Product
                    </h3>
                    <p className="mb-4 text-base text-white">
                      Create detailed product listings that showcase your dairy
                      products and attract customers.
                    </p>
                    <ul className="list-disc space-y-2 pl-6 text-sm text-white">
                      <li id="step-2-1">
                        Navigate to &ldquo;My Listings&rdquo; and click
                        &ldquo;Add Product&rdquo;
                      </li>
                      <li id="step-2-2">
                        Enter the listing passphrase{" "}
                        <span className="inline-flex items-center">
                          if this is your first product{" "}
                          <InformationCircleIcon
                            className="ml-1 h-4 w-4 cursor-pointer text-primary-yellow hover:opacity-80"
                            onClick={() => {
                              const faqSection = document.getElementById(
                                "listing-passphrase-faq"
                              );
                              if (faqSection) {
                                faqSection.scrollIntoView({
                                  behavior: "smooth",
                                });
                              }
                            }}
                          />
                        </span>
                      </li>
                      <li id="step-2-3">Upload clear product photos</li>
                      <li id="step-2-4">
                        Write detailed descriptions and set pricing and/or
                        volume pricing
                      </li>
                      <li>Specify delivery options</li>
                      <li>Publish your listing to the marketplace</li>
                    </ul>
                  </div>
                </div>

                {/* Image Grid */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    {
                      src: "/listing-password-modal.png",
                      alt: "Listing Password Modal",
                      step: "2.1",
                    },
                    {
                      src: "/product-details-form.png",
                      alt: "Product Details Form",
                      step: "2.2",
                    },
                    {
                      src: "/pickup-and-volume-details.png",
                      alt: "Pickup and Volume Details",
                      step: "2.3",
                    },
                    {
                      src: "/list-product-with-passphrase.png",
                      alt: "List Product with Passphrase",
                      step: "2.4",
                    },
                  ].map((image, idx) => (
                    <div
                      key={idx}
                      className="relative cursor-pointer overflow-hidden rounded-lg border-3 border-black bg-gray-700 shadow-neo transition-transform hover:-translate-y-1"
                      onClick={() => handleImageClick(image.src)}
                    >
                      <div className="absolute left-2 top-2 z-10 rounded border-2 border-black bg-white px-2 py-0.5 text-xs font-bold text-black shadow-neo">
                        Step {image.step}
                      </div>
                      <Image
                        src={image.src}
                        alt={image.alt}
                        className="h-36 w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Step 3 */}
              <div
                id="step-3"
                className="rounded-lg border-4 border-black bg-primary-blue p-6 shadow-neo"
              >
                <div className="mb-6 flex items-start gap-4">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-4 border-black bg-white text-2xl font-bold text-black shadow-neo">
                    3
                  </div>
                  <div className="flex-1">
                    <h3 className="mb-2 text-2xl font-bold text-white">
                      Manage Orders & Communication
                    </h3>
                    <p className="mb-4 text-base text-white">
                      Handle customer inquiries and orders through our encrypted
                      messaging system.
                    </p>
                    <ul className="list-disc space-y-2 pl-6 text-sm text-white">
                      <li id="step-3-1">
                        Monitor the &ldquo;Orders&rdquo; section for new
                        messages
                      </li>
                      <li id="step-3-2">
                        Respond promptly to customer inquiries
                      </li>
                      <li id="step-3-3">Coordinate pickup/delivery details</li>
                      <li id="step-3-4">
                        Process payments{" "}
                        <span className="inline-flex items-center">
                          according to your preferences{" "}
                          <InformationCircleIcon
                            className="ml-1 h-4 w-4 cursor-pointer text-primary-yellow hover:opacity-80"
                            onClick={() => {
                              const faqSection = document.getElementById(
                                "process-payments-faq"
                              );
                              if (faqSection) {
                                faqSection.scrollIntoView({
                                  behavior: "smooth",
                                });
                              }
                            }}
                          />
                        </span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Image Grid */}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    {
                      src: "/fiat-order-chat.png",
                      alt: "Fiat Order Chat",
                      step: "3.1",
                    },
                    {
                      src: "/bitcoin-order-chat.png",
                      alt: "Bitcoin Order Chat",
                      step: "3.2",
                    },
                    {
                      src: "/bitcoin-payment-redemption-modal.png",
                      alt: "Bitcoin Payment Redemption Modal",
                      step: "3.3",
                    },
                    {
                      src: "/wallet-page.png",
                      alt: "Wallet Page",
                      step: "3.4",
                    },
                  ].map((image, idx) => (
                    <div
                      key={idx}
                      className="relative cursor-pointer overflow-hidden rounded-lg border-3 border-black bg-gray-700 shadow-neo transition-transform hover:-translate-y-1"
                      onClick={() => handleImageClick(image.src)}
                    >
                      <div className="absolute left-2 top-2 z-10 rounded border-2 border-black bg-white px-2 py-0.5 text-xs font-bold text-black shadow-neo">
                        Step {image.step}
                      </div>
                      <Image
                        src={image.src}
                        alt={image.alt}
                        className="h-36 w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Step 4 */}
              <div
                id="step-4"
                className="rounded-lg border-4 border-black bg-primary-blue p-6 shadow-neo"
              >
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
                  <div className="flex items-start gap-4 lg:flex-1">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border-4 border-black bg-white text-2xl font-bold text-black shadow-neo">
                      4
                    </div>
                    <div className="flex-1">
                      <h3 className="mb-2 text-2xl font-bold text-white">
                        Grow Your Business
                      </h3>
                      <p className="mb-4 text-base text-white">
                        Build your customer base and expand your reach within
                        the Milk Market community.
                      </p>
                      <ul className="list-disc space-y-2 pl-6 text-sm text-white">
                        <li id="step-4-1">
                          Regularly update your product listings
                        </li>
                        <li id="step-4-2">
                          Engage with customers and build relationships
                        </li>
                        <li id="step-4-3">
                          Share your farm story and practices
                        </li>
                        <li id="step-4-4">Leverage the Milk Market network</li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex items-center justify-center lg:w-1/2">
                    <div className="w-full max-w-md rounded-lg border-4 border-black bg-white p-6 text-center shadow-neo">
                      <h3 className="text-xl font-bold text-black">
                        More community and marketing tools coming soon!
                      </h3>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* FAQ Section */}
            <div className="mt-16 rounded-lg border-4 border-black bg-[#2c3e50] p-8 shadow-neo">
              <h2 className="mb-6 text-center text-2xl font-bold text-white">
                New Producer FAQ
              </h2>
              <div className="space-y-0">
                {faqItems.map((item, index) => (
                  <div
                    key={index}
                    id={item.id}
                    className="border-b border-white/20 last:border-b-0"
                  >
                    <button
                      onClick={() => toggleFaq(index)}
                      className="flex w-full items-center justify-between py-4 text-left text-white transition-colors hover:opacity-80"
                    >
                      <h3 className="pr-4 text-base font-normal">
                        {item.question}
                      </h3>
                      <PlusIcon
                        className={`h-6 w-6 flex-shrink-0 transition-transform ${
                          openFaqIndex === index ? "rotate-45" : ""
                        }`}
                      />
                    </button>
                    {openFaqIndex === index && (
                      <div className="bg-white/10 px-4 pb-4 pt-2">
                        <p className="text-sm leading-relaxed text-white/90">
                          {item.answer}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Call to Action */}
            <div className="mt-16 rounded-lg border-4 border-black bg-primary-blue p-6 text-center shadow-neo">
              <h2 className="mb-3 text-2xl font-bold text-white">
                Ready to Start Selling?
              </h2>
              <p className="mb-6 text-base text-white">
                Join the growing community of producers providing fresh, local
                dairy products directly to consumers.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Button
                  className={PRIMARYBUTTONCLASSNAMES}
                  onClick={() => router.push("/marketplace")}
                >
                  Free Milk
                </Button>
                <Button
                  className={WHITEBUTTONCLASSNAMES}
                  onClick={() => router.push("/faq")}
                >
                  View General FAQ
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Image Expansion Modal */}
        <Modal
          isOpen={isModalOpen}
          onClose={closeModal}
          size="4xl"
          classNames={{
            base: "bg-transparent shadow-none",
            backdrop: "bg-black/80",
          }}
        >
          <ModalContent>
            <ModalBody className="relative p-0">
              <button
                onClick={closeModal}
                className="absolute right-4 top-4 z-10 rounded-full border-2 border-black bg-white p-2 text-black shadow-neo transition-colors hover:bg-gray-100"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
              {expandedImage && (
                <div className="overflow-hidden rounded-xl border-4 border-black">
                  <Image
                    src={expandedImage}
                    alt="Expanded view"
                    className="h-auto max-h-[90vh] w-full object-contain"
                  />
                </div>
              )}
            </ModalBody>
          </ModalContent>
        </Modal>
      </div>
    </>
  );
};

export default ProducerGuidePage;
