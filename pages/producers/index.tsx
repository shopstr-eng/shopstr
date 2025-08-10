import React, { useState } from "react";
import { useRouter } from "next/router";
import {
  Card,
  CardBody,
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
} from "@heroicons/react/24/outline";
import {
  BLACKBUTTONCLASSNAMES,
  WHITEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";

const ProducerGuidePage = () => {
  const router = useRouter();
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleImageClick = (imageSrc: string) => {
    setExpandedImage(imageSrc);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setExpandedImage(null);
    setIsModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-light-bg">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            className={`mb-4 ${BLACKBUTTONCLASSNAMES}`}
            onClick={() => router.back()}
            startContent={<ArrowLeftIcon className="h-4 w-4" />}
          >
            Back
          </Button>

          <div className="text-center">
            <h1 className="mb-4 text-4xl font-bold text-light-text">
              Producer Guide
            </h1>
            <p className="text-lg text-light-text">
              Learn how to start selling your dairy products and other goods on
              Milk Market. Follow our step-by-step guide to set up your shop,
              list products, and connect with customers in your local community.
            </p>
          </div>
        </div>

        {/* Video Section */}
        <Card className="mb-12 bg-dark-fg">
          <CardBody className="p-8">
            <h2 className="mb-6 text-center text-2xl font-bold text-dark-text">
              Getting Started Video Guide
            </h2>
            <div className="relative mx-auto w-full max-w-2xl">
              <video controls className="w-full rounded-lg shadow-lg">
                <source src="/producer-demo.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </CardBody>
        </Card>

        {/* Step-by-Step Guide */}
        <div className="space-y-12">
          {/* Step 1 */}
          <Card className="bg-dark-fg">
            <CardBody className="p-8">
              <div className="grid gap-8 md:grid-cols-2">
                <div>
                  <div className="mb-4 flex items-center">
                    <div className="mr-4 flex h-10 w-10 items-center justify-center rounded-full bg-dark-bg font-bold text-dark-text">
                      1
                    </div>
                    <h3 className="text-2xl font-bold text-dark-text">
                      Create Your Account
                    </h3>
                  </div>
                  <p className="mb-4 text-dark-text">
                    Sign up for Milk Market using your Nostr identity or create
                    a new one. Your Nostr key ensures secure, private
                    communication with customers.
                  </p>
                  <ul className="list-disc space-y-2 pl-6 text-dark-text">
                    <li>Click &ldquo;Sign In&rdquo; in the top navigation</li>
                    <li>
                      Choose your preferred login method or create a new account{" "}
                      <span className="inline-flex items-center">
                        with a passphrase{" "}
                        <InformationCircleIcon
                          className="ml-1 h-4 w-4 cursor-pointer text-yellow-600 hover:text-yellow-500"
                          onClick={() => {
                            const faqSection =
                              document.getElementById("passphrase-faq");
                            if (faqSection) {
                              faqSection.scrollIntoView({ behavior: "smooth" });
                            }
                          }}
                        />
                      </span>
                    </li>
                    <li>Complete the onboarding process</li>
                    <li>
                      Set up your user profile with basic information, including{" "}
                      <span className="inline-flex items-center">
                        payment preferences{" "}
                        <InformationCircleIcon
                          className="ml-1 h-4 w-4 cursor-pointer text-yellow-600 hover:text-yellow-500"
                          onClick={() => {
                            const faqSection = document.getElementById(
                              "payment-methods-faq"
                            );
                            if (faqSection) {
                              faqSection.scrollIntoView({ behavior: "smooth" });
                            }
                          }}
                        />
                      </span>
                    </li>
                  </ul>
                </div>
                <div className="flex items-center justify-center">
                  <div className="grid w-full max-w-md grid-cols-2 gap-3">
                    <div className="relative">
                      <div className="absolute -top-6 left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 transform items-center justify-center rounded-full bg-dark-bg text-xs font-bold text-white">
                        1
                      </div>
                      <div className="h-24 w-full cursor-pointer overflow-hidden rounded-lg duration-300 transition-transform hover:scale-105 hover:shadow-lg">
                        <Image
                          src="/sign-in-modal.png"
                          alt="Sign In Modal"
                          className="h-full w-full object-cover duration-300 transition-transform hover:scale-110"
                          onClick={() => handleImageClick("/sign-in-modal.png")}
                        />
                      </div>
                    </div>
                    <div className="relative">
                      <div className="absolute -top-6 left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 transform items-center justify-center rounded-full bg-dark-bg text-xs font-bold text-white">
                        2
                      </div>
                      <div className="h-24 w-full cursor-pointer overflow-hidden rounded-lg duration-300 transition-transform hover:scale-105 hover:shadow-lg">
                        <Image
                          src="/keys-page.png"
                          alt="Keys Page"
                          className="h-full w-full object-cover duration-300 transition-transform hover:scale-110"
                          onClick={() => handleImageClick("/keys-page.png")}
                        />
                      </div>
                    </div>
                    <div className="relative mt-6">
                      <div className="absolute -top-6 left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 transform items-center justify-center rounded-full bg-dark-bg text-xs font-bold text-white">
                        3
                      </div>
                      <div className="h-24 w-full cursor-pointer overflow-hidden rounded-lg duration-300 transition-transform hover:scale-105 hover:shadow-lg">
                        <Image
                          src="/profile-page.png"
                          alt="Profile Page"
                          className="h-full w-full object-cover duration-300 transition-transform hover:scale-110"
                          onClick={() => handleImageClick("/profile-page.png")}
                        />
                      </div>
                    </div>
                    <div className="relative mt-6">
                      <div className="absolute -top-6 left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 transform items-center justify-center rounded-full bg-dark-bg text-xs font-bold text-white">
                        4
                      </div>
                      <div className="h-24 w-full cursor-pointer overflow-hidden rounded-lg duration-300 transition-transform hover:scale-105 hover:shadow-lg">
                        <Image
                          src="/shop-page.png"
                          alt="Shop Page"
                          className="h-full w-full object-cover duration-300 transition-transform hover:scale-110"
                          onClick={() => handleImageClick("/shop-page.png")}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Step 2 */}
          <Card className="bg-dark-fg">
            <CardBody className="p-8">
              <div className="grid gap-8 md:grid-cols-2">
                <div className="flex items-center justify-center">
                  <div className="grid w-full max-w-md grid-cols-2 gap-3">
                    <div className="relative">
                      <div className="absolute -top-6 left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 transform items-center justify-center rounded-full bg-dark-bg text-xs font-bold text-white">
                        1
                      </div>
                      <div className="h-24 w-full cursor-pointer overflow-hidden rounded-lg duration-300 transition-transform hover:scale-105 hover:shadow-lg">
                        <Image
                          src="/listing-password-modal.png"
                          alt="Listing Password Modal"
                          className="h-full w-full object-cover duration-300 transition-transform hover:scale-110"
                          onClick={() =>
                            handleImageClick("/listing-password-modal.png")
                          }
                        />
                      </div>
                    </div>
                    <div className="relative">
                      <div className="absolute -top-6 left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 transform items-center justify-center rounded-full bg-dark-bg text-xs font-bold text-white">
                        2
                      </div>
                      <div className="h-24 w-full cursor-pointer overflow-hidden rounded-lg duration-300 transition-transform hover:scale-105 hover:shadow-lg">
                        <Image
                          src="/product-details-form.png"
                          alt="Product Details Form"
                          className="h-full w-full object-cover duration-300 transition-transform hover:scale-110"
                          onClick={() =>
                            handleImageClick("/product-details-form.png")
                          }
                        />
                      </div>
                    </div>
                    <div className="relative mt-6">
                      <div className="absolute -top-6 left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 transform items-center justify-center rounded-full bg-dark-bg text-xs font-bold text-white">
                        3
                      </div>
                      <div className="h-24 w-full cursor-pointer overflow-hidden rounded-lg duration-300 transition-transform hover:scale-105 hover:shadow-lg">
                        <Image
                          src="/pickup-and-volume-details.png"
                          alt="Pickup and Volume Details"
                          className="h-full w-full object-cover duration-300 transition-transform hover:scale-110"
                          onClick={() =>
                            handleImageClick("/pickup-and-volume-details.png")
                          }
                        />
                      </div>
                    </div>
                    <div className="relative mt-6">
                      <div className="absolute -top-6 left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 transform items-center justify-center rounded-full bg-dark-bg text-xs font-bold text-white">
                        4
                      </div>
                      <div className="h-24 w-full cursor-pointer overflow-hidden rounded-lg duration-300 transition-transform hover:scale-105 hover:shadow-lg">
                        <Image
                          src="/list-product-with-passphrase.png"
                          alt="List Product with Passphrase"
                          className="h-full w-full object-cover duration-300 transition-transform hover:scale-110"
                          onClick={() =>
                            handleImageClick(
                              "/list-product-with-passphrase.png"
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="mb-4 flex items-center">
                    <div className="mr-4 flex h-10 w-10 items-center justify-center rounded-full bg-dark-bg font-bold text-dark-text">
                      2
                    </div>
                    <h3 className="text-2xl font-bold text-dark-text">
                      List Your First Product
                    </h3>
                  </div>
                  <p className="mb-4 text-dark-text">
                    Create detailed product listings that showcase your dairy
                    products and attract customers.
                  </p>
                  <ul className="list-disc space-y-2 pl-6 text-dark-text">
                    <li>
                      Navigate to &ldquo;My Listings&rdquo; and click &ldquo;Add
                      Product&rdquo;
                    </li>
                    <li>
                      Enter the listing passphrase{" "}
                      <span className="inline-flex items-center">
                        if this is your first product{" "}
                        <InformationCircleIcon
                          className="ml-1 h-4 w-4 cursor-pointer text-yellow-600 hover:text-yellow-500"
                          onClick={() => {
                            const faqSection = document.getElementById(
                              "listing-passphrase-faq"
                            );
                            if (faqSection) {
                              faqSection.scrollIntoView({ behavior: "smooth" });
                            }
                          }}
                        />
                      </span>
                    </li>
                    <li>Upload clear product photos</li>
                    <li>
                      Write detailed descriptions and set pricing and/or volume
                      pricing
                    </li>
                    <li>Specify delivery options</li>
                    <li>Publish your listing to the marketplace</li>
                  </ul>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Step 3 */}
          <Card className="bg-dark-fg">
            <CardBody className="p-8">
              <div className="grid gap-8 md:grid-cols-2">
                <div>
                  <div className="order-1 md:order-2">
                    <div className="mb-4 flex items-center">
                      <div className="mr-4 flex h-10 w-10 items-center justify-center rounded-full bg-dark-bg font-bold text-dark-text">
                        3
                      </div>
                      <h3 className="text-2xl font-bold text-dark-text">
                        Manage Orders & Communication
                      </h3>
                    </div>
                    <p className="mb-4 text-dark-text">
                      Handle customer inquiries and orders through our encrypted
                      messaging system.
                    </p>
                    <ul className="list-disc space-y-2 pl-6 text-dark-text">
                      <li>
                        Monitor the &ldquo;Orders&rdquo; section for new
                        messages
                      </li>
                      <li>Respond promptly to customer inquiries</li>
                      <li>Coordinate pickup/delivery details</li>
                      <li>
                        Process payments{" "}
                        <span className="inline-flex items-center">
                          according to your preferences{" "}
                          <InformationCircleIcon
                            className="ml-1 h-4 w-4 cursor-pointer text-yellow-600 hover:text-yellow-500"
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
                <div className="order-2 flex items-center justify-center md:order-1">
                  <div className="grid w-full max-w-md grid-cols-2 gap-3">
                    <div className="relative">
                      <div className="absolute -top-6 left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 transform items-center justify-center rounded-full bg-dark-bg text-xs font-bold text-white">
                        1
                      </div>
                      <div className="h-24 w-full cursor-pointer overflow-hidden rounded-lg duration-300 transition-transform hover:scale-105 hover:shadow-lg">
                        <Image
                          src="/fiat-order-chat.png"
                          alt="Fiat Order Chat"
                          className="h-full w-full object-cover duration-300 transition-transform hover:scale-110"
                          onClick={() =>
                            handleImageClick("/fiat-order-chat.png")
                          }
                        />
                      </div>
                    </div>
                    <div className="relative">
                      <div className="absolute -top-6 left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 transform items-center justify-center rounded-full bg-dark-bg text-xs font-bold text-white">
                        2
                      </div>
                      <div className="h-24 w-full cursor-pointer overflow-hidden rounded-lg duration-300 transition-transform hover:scale-105 hover:shadow-lg">
                        <Image
                          src="/bitcoin-order-chat.png"
                          alt="Bitcoin Order Chat"
                          className="h-full w-full object-cover duration-300 transition-transform hover:scale-110"
                          onClick={() =>
                            handleImageClick("/bitcoin-order-chat.png")
                          }
                        />
                      </div>
                    </div>
                    <div className="relative mt-6">
                      <div className="absolute -top-6 left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 transform items-center justify-center rounded-full bg-dark-bg text-xs font-bold text-white">
                        3
                      </div>
                      <div className="h-24 w-full cursor-pointer overflow-hidden rounded-lg duration-300 transition-transform hover:scale-105 hover:shadow-lg">
                        <Image
                          src="/bitcoin-payment-redemption-modal.png"
                          alt="Bitcoin Payment Redemption Modal"
                          className="h-full w-full object-cover duration-300 transition-transform hover:scale-110"
                          onClick={() =>
                            handleImageClick(
                              "/bitcoin-payment-redemption-modal.png"
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="relative mt-6">
                      <div className="absolute -top-6 left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 transform items-center justify-center rounded-full bg-dark-bg text-xs font-bold text-white">
                        4
                      </div>
                      <div className="h-24 w-full cursor-pointer overflow-hidden rounded-lg duration-300 transition-transform hover:scale-105 hover:shadow-lg">
                        <Image
                          src="/wallet-page.png"
                          alt="Wallet Page"
                          className="h-full w-full object-cover duration-300 transition-transform hover:scale-110"
                          onClick={() => handleImageClick("/wallet-page.png")}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Step 4 */}
          <Card className="bg-dark-fg">
            <CardBody className="p-8">
              <div className="grid gap-8 md:grid-cols-2">
                <div className="flex items-center justify-center">
                  <div className="rounded-lg bg-gray-50 p-8 text-center">
                    <h3 className="mb-2 text-3xl font-bold text-light-text">
                      More community and marketing tools coming soon!
                    </h3>
                  </div>
                </div>
                <div>
                  <div className="mb-4 flex items-center">
                    <div className="mr-4 flex h-10 w-10 items-center justify-center rounded-full bg-dark-bg font-bold text-dark-text">
                      4
                    </div>
                    <h3 className="text-2xl font-bold text-dark-text">
                      Grow Your Business
                    </h3>
                  </div>
                  <p className="mb-4 text-dark-text">
                    Build your customer base and expand your reach within the
                    Milk Market community.
                  </p>
                  <ul className="list-disc space-y-2 pl-6 text-dark-text">
                    <li>Regularly update your product listings</li>
                    <li>Engage with customers and build relationships</li>
                    <li>Share your farm story and practices</li>
                    <li>Leverage the Milk Market network</li>
                  </ul>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Producer's FAQ */}
          <Card className="mt-12 bg-dark-fg">
            <CardBody className="p-8">
              <h2 className="mb-8 text-center text-2xl font-bold text-dark-text">
                New Producer FAQ
              </h2>
              <div className="space-y-6">
                <div
                  id="passphrase-faq"
                  className="border-b border-gray-200 pb-6"
                >
                  <h3 className="mb-3 text-lg font-semibold text-dark-text">
                    What is a passphrase? What is it used for?
                  </h3>
                  <p className="text-dark-text">
                    A passphrase is just a password you create as a user to keep
                    your private key stored safely in your browser so only you
                    can access your account. It is needed for securely sending
                    messages, listing products, or saving profile and shop
                    information on Milk Market.
                  </p>
                </div>

                <div
                  id="payment-methods-faq"
                  className="border-b border-gray-200 pb-6"
                >
                  <h3 className="mb-3 text-lg font-semibold text-dark-text">
                    What payment methods do customers use?
                  </h3>
                  <p className="text-dark-text">
                    Milk Market supports Bitcoin payments through Lightning
                    Network and Cashu tokens. You can also arrange cash payments
                    directly with customers during pickup or delivery and other
                    payment options like{" "}
                    <a
                      href="https://cash.app/bitcoin"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-yellow-600 underline hover:text-yellow-500"
                    >
                      Cash App
                    </a>
                    , Venmo, PayPal, etc.
                  </p>
                </div>

                <div className="border-b border-gray-200 pb-6">
                  <h3 className="mb-3 text-lg font-semibold text-dark-text">
                    Why Bitcoin? How can I exchange it?
                  </h3>
                  <p className="text-dark-text">
                    <a
                      href="https://bitcoin.rocks/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-yellow-600 underline hover:text-yellow-500"
                    >
                      Bitcoin
                    </a>{" "}
                    is supported because it allows for complete control over
                    your funds and transactions and protects your wealth over
                    time. Payment processors like Stripe, PayPal, etc. can
                    freeze your funds, close your account, or even ban you for
                    selling products they don&apos;t deem acceptable (which raw
                    milk and dairy can easily fall under). If desired, you can
                    exchange it for cash or other currencies at your own pace
                    using tools like{" "}
                    <a
                      href="https://cash.app/bitcoin"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-yellow-600 underline hover:text-yellow-500"
                    >
                      Cash App
                    </a>{" "}
                    or{" "}
                    <a
                      href="https://strike.me/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-yellow-600 underline hover:text-yellow-500"
                    >
                      Strike
                    </a>
                    .
                  </p>
                </div>

                <div
                  id="listing-passphrase-faq"
                  className="border-b border-gray-200 pb-6"
                >
                  <h3 className="mb-3 text-lg font-semibold text-dark-text">
                    What is the listing passphrase? How do I get it?
                  </h3>
                  <p className="text-dark-text">
                    The listing passphrase is a password set by Milk Market to
                    prevent spam and ensure that trusted producers can list
                    products. You can get it by contacting Milk Market or other
                    producers in the Milk Market community.
                  </p>
                </div>

                <div
                  id="process-payments-faq"
                  className="border-b border-gray-200 pb-6"
                >
                  <h3 className="mb-3 text-lg font-semibold text-dark-text">
                    How do I process payments?
                  </h3>
                  <p className="text-dark-text">
                    If accepting Bitcoin payments, you can redeem them through
                    the chat interface and directly to the site wallet. With the
                    wallet, you can save your payments or send money to another
                    wallet like{" "}
                    <a
                      href="https://cash.app/bitcoin"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-yellow-600 underline hover:text-yellow-500"
                    >
                      Cash App
                    </a>
                    ,{" "}
                    <a
                      href="https://coinos.io/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-yellow-600 underline hover:text-yellow-500"
                    >
                      Coinos
                    </a>
                    ,{" "}
                    <a
                      href="https://www.minibits.cash/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-yellow-600 underline hover:text-yellow-500"
                    >
                      Minibits
                    </a>
                    , etc. If accepting cash, you can arrange payment during
                    pickup or delivery. With other online fiat options, payment
                    should be delivered with the order to the specified account,
                    so make sure to check your external accounts for any
                    incoming payments.
                  </p>
                </div>

                <div className="border-b border-gray-200 pb-6">
                  <h3 className="mb-3 text-lg font-semibold text-dark-text">
                    How do I handle delivery and pickup?
                  </h3>
                  <p className="text-dark-text">
                    You set your own delivery options - whether you offer farm
                    pickup, local delivery, or meet at farmers markets.
                    Coordinate specific details on your product details page or
                    through the encrypted messaging system with each customer.
                  </p>
                </div>

                <div>
                  <h3 className="mb-3 text-lg font-semibold text-dark-text">
                    Is my communication with customers private?
                  </h3>
                  <p className="text-dark-text">
                    Yes, all messages are encrypted. Only you and your customers
                    can see your conversations - no third parties have access to
                    your private communications.
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Call to Action */}
        <Card className="mt-12 bg-dark-fg">
          <CardBody className="p-8 text-center">
            <h2 className="mb-4 text-2xl font-bold text-dark-text">
              Ready to Start Selling?
            </h2>
            <p className="mb-6 text-dark-text">
              Join the growing community of producers providing fresh, local
              dairy products directly to consumers.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Button
                className={WHITEBUTTONCLASSNAMES}
                onClick={() => router.push("/marketplace")}
              >
                FREE MILK 🥛
              </Button>
              <Button
                className={WHITEBUTTONCLASSNAMES}
                onClick={() => router.push("/faq")}
              >
                View General FAQ
              </Button>
            </div>
          </CardBody>
        </Card>
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
              className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
            {expandedImage && (
              <Image
                src={expandedImage}
                alt="Expanded view"
                className="h-auto max-h-[90vh] w-full rounded-xl object-contain"
                radius="lg"
              />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default ProducerGuidePage;
