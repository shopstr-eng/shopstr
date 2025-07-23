import { useState } from "react";
import { useRouter } from "next/router";
import {
  Button,
  Image,
  Input,
  Card,
  CardBody,
  Radio,
  RadioGroup,
} from "@nextui-org/react";
import { ArrowUpRightIcon } from "@heroicons/react/24/outline";
import {
  BLACKBUTTONCLASSNAMES,
  WHITEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";

export default function StandaloneLanding() {
  const router = useRouter();
  const [contactType, setContactType] = useState<"email" | "nostr">("email");
  const [contact, setContact] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact.trim()) return;

    // Handle form submission here - connect to your preferred backend
    console.log("Signup:", { contact: contact.trim(), contactType });
    alert(`Thanks for signing up with ${contactType}: ${contact}`);
    setContact("");
  };

  const scrollToSignup = () => {
    document.getElementById("signup")?.scrollIntoView({ behavior: "smooth" });
  };

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const isValidNostrPub = (npub: string) => {
    return npub.startsWith("npub") && npub.length === 63;
  };

  const isValidContact =
    contactType === "email" ? isValidEmail(contact) : isValidNostrPub(contact);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-light-bg text-light-text">
      {/* Animated Ink Splatters Background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        {/* Splatter 1 - Multiple connected circles */}
        <div
          className="absolute left-10 top-20 animate-bounce opacity-60"
          style={{ animationDelay: "0s", animationDuration: "3s" }}
        >
          <div className="relative">
            <div className="h-12 w-12 rounded-full bg-dark-bg"></div>
            <div className="absolute -right-2 -top-1 h-6 w-8 rounded-full bg-dark-bg"></div>
            <div className="absolute -bottom-2 left-2 h-4 w-6 rounded-full bg-dark-bg"></div>
            <div className="absolute -left-1 top-3 h-3 w-3 rounded-full bg-dark-bg"></div>
          </div>
        </div>

        {/* Splatter 2 - Elongated main shape with droplets */}
        <div
          className="absolute right-20 top-40 animate-bounce opacity-60"
          style={{ animationDelay: "1s", animationDuration: "4s" }}
        >
          <div className="relative">
            <div className="h-8 w-12 rounded-full bg-dark-bg"></div>
            <div className="absolute -right-3 top-1 h-5 w-5 rounded-full bg-dark-bg"></div>
            <div className="absolute -bottom-1 left-8 h-3 w-4 rounded-full bg-dark-bg"></div>
            <div className="absolute -top-2 left-3 h-2 w-2 rounded-full bg-dark-bg"></div>
          </div>
        </div>

        {/* Splatter 3 - Large main blob with trailing droplets */}
        <div
          className="absolute bottom-60 left-1/4 animate-bounce opacity-60"
          style={{ animationDelay: "2s", animationDuration: "5s" }}
        >
          <div className="relative">
            <div className="h-16 w-20 rounded-full bg-dark-bg"></div>
            <div className="absolute -right-4 top-2 h-8 w-10 rounded-full bg-dark-bg"></div>
            <div className="absolute -bottom-3 left-12 h-6 w-8 rounded-full bg-dark-bg"></div>
            <div className="absolute -left-2 top-8 h-4 w-5 rounded-full bg-dark-bg"></div>
            <div className="absolute -top-2 right-2 h-3 w-3 rounded-full bg-dark-bg"></div>
          </div>
        </div>

        {/* Splatter 4 - Vertical drip pattern */}
        <div
          className="absolute right-10 top-1/2 animate-bounce opacity-60"
          style={{ animationDelay: "0.5s", animationDuration: "3.5s" }}
        >
          <div className="relative">
            <div className="h-10 w-10 rounded-full bg-dark-bg"></div>
            <div className="absolute -bottom-4 left-3 h-8 w-6 rounded-full bg-dark-bg"></div>
            <div className="absolute -right-2 top-2 h-5 w-7 rounded-full bg-dark-bg"></div>
            <div className="absolute -left-1 -top-1 h-3 w-4 rounded-full bg-dark-bg"></div>
          </div>
        </div>

        {/* Splatter 5 - Asymmetric cluster */}
        <div
          className="absolute bottom-40 right-1/3 animate-bounce opacity-60"
          style={{ animationDelay: "1.5s", animationDuration: "4.5s" }}
        >
          <div className="relative">
            <div className="h-14 w-16 rounded-full bg-dark-bg"></div>
            <div className="absolute -right-5 -top-2 h-9 w-11 rounded-full bg-dark-bg"></div>
            <div className="absolute -bottom-4 left-4 h-7 w-9 rounded-full bg-dark-bg"></div>
            <div className="absolute -left-3 top-6 h-4 w-6 rounded-full bg-dark-bg"></div>
            <div className="absolute right-1 top-1 h-2 w-3 rounded-full bg-dark-bg"></div>
          </div>
        </div>

        {/* Splatter 6 - Small scattered droplets */}
        <div
          className="absolute left-1/2 top-80 animate-bounce opacity-60"
          style={{ animationDelay: "3s", animationDuration: "6s" }}
        >
          <div className="relative">
            <div className="h-6 w-8 rounded-full bg-dark-bg"></div>
            <div className="absolute -bottom-1 -right-2 h-4 w-5 rounded-full bg-dark-bg"></div>
            <div className="absolute -left-2 -top-1 h-3 w-4 rounded-full bg-dark-bg"></div>
            <div className="absolute right-1 top-3 h-2 w-2 rounded-full bg-dark-bg"></div>
          </div>
        </div>

        {/* Splatter 7 - Large organic shape with satellites */}
        <div
          className="absolute bottom-20 left-20 animate-bounce opacity-60"
          style={{ animationDelay: "2.5s", animationDuration: "5.5s" }}
        >
          <div className="relative">
            <div className="h-20 w-24 rounded-full bg-dark-bg"></div>
            <div className="w-15 absolute -right-6 top-4 h-12 rounded-full bg-dark-bg"></div>
            <div className="absolute -bottom-5 left-8 h-10 w-12 rounded-full bg-dark-bg"></div>
            <div className="absolute -left-4 top-10 h-6 w-8 rounded-full bg-dark-bg"></div>
            <div className="absolute -top-3 right-2 h-4 w-5 rounded-full bg-dark-bg"></div>
            <div className="absolute bottom-2 left-16 h-3 w-4 rounded-full bg-dark-bg"></div>
          </div>
        </div>

        {/* Splatter 8 - Complex multi-directional splatter */}
        <div
          className="absolute right-1/2 top-60 animate-bounce opacity-60"
          style={{ animationDelay: "4s", animationDuration: "7s" }}
        >
          <div className="relative">
            <div className="h-12 w-14 rounded-full bg-dark-bg"></div>
            <div className="absolute -right-4 -top-2 h-8 w-10 rounded-full bg-dark-bg"></div>
            <div className="absolute -bottom-3 left-3 h-7 w-9 rounded-full bg-dark-bg"></div>
            <div className="absolute -left-3 top-4 h-5 w-6 rounded-full bg-dark-bg"></div>
            <div className="absolute bottom-1 right-1 h-3 w-4 rounded-full bg-dark-bg"></div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="relative z-20 flex items-center justify-between p-6 md:px-12">
        <div className="flex items-center space-x-2">
          <Image src="/milk-market.png" alt="Milk Market" className="h-8 w-8" />
          <span className="text-xl font-bold">Milk Market</span>
        </div>
        <Button
          onClick={scrollToSignup}
          color="default"
          variant="solid"
          className={BLACKBUTTONCLASSNAMES}
        >
          Join Now
        </Button>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 px-4 pb-32 pt-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl text-center">
          <div className="animate-fadeInUp">
            <div className="mb-8 flex justify-center space-x-4">
              <span className="animate-float text-4xl">🐄</span>
              <span
                className="animate-float text-4xl"
                style={{ animationDelay: "0.5s" }}
              >
                🥛
              </span>
              <span
                className="animate-float text-4xl"
                style={{ animationDelay: "1s" }}
              >
                🚜
              </span>
            </div>

            <h1 className="mb-8 text-5xl font-black leading-tight md:text-7xl">
              Reclaim Your Right to <br />
              <span className="inline-block -rotate-1 transform bg-dark-bg px-4 py-2 text-dark-text">
                Real Milk
              </span>
            </h1>

            <p className="mx-auto mb-6 max-w-3xl text-xl text-gray-600 md:text-2xl">
              No Gatekeepers, No Compromises
            </p>

            <div className="mx-auto mb-12 grid max-w-4xl gap-6 text-left md:grid-cols-2">
              <div className="rounded-2xl bg-gray-50 p-6">
                <span className="mb-3 block text-2xl">🚜</span>
                <h3 className="mb-2 text-lg font-semibold">For Producers</h3>
                <p className="text-gray-600">
                  Sell Directly to Your Community — Bypass Payment Bans &
                  Regulatory Harassment
                </p>
              </div>
              <div className="rounded-2xl bg-gray-50 p-6">
                <span className="mb-3 block text-2xl">🥛</span>
                <h3 className="mb-2 text-lg font-semibold">For Drinkers</h3>
                <p className="text-gray-600">
                  Find Fresh, Local Raw Milk Sources — Support Farms, Not
                  Corporations
                </p>
              </div>
            </div>

            <Button
              onClick={scrollToSignup}
              color="default"
              variant="solid"
              size="lg"
              className="transform rounded-full bg-dark-bg px-12 py-4 text-xl text-dark-text shadow-xl transition-all hover:scale-105 hover:bg-gray-800"
            >
              Join the Raw Milk Revolution →
            </Button>
          </div>
        </div>
      </section>

      {/* Value Proposition */}
      <section id="producers" className="relative z-10 bg-gray-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-bold md:text-5xl">
              Why Choose Milk Market?
            </h2>
            <p className="text-xl text-gray-600">
              Empowering both sides of the marketplace
            </p>
          </div>

          <div className="grid gap-16 lg:grid-cols-2">
            {/* For Producers */}
            <div>
              <div className="mb-8 flex items-center">
                <span className="mr-4 text-3xl">🚜</span>
                <h3 className="text-3xl font-bold">For Producers</h3>
              </div>

              <div className="space-y-6">
                <Card className="hover-lift border-gray-100 bg-light-bg">
                  <CardBody className="p-6">
                    <h4 className="mb-3 flex items-center text-xl font-semibold text-light-text">
                      <span className="mr-2">🚫</span>
                      Avoid Restrictions
                    </h4>
                    <p className="text-gray-600">
                      List products without Stripe/PayPal account freezes or
                      product takedowns.
                    </p>
                  </CardBody>
                </Card>

                <Card className="hover-lift border-gray-100 bg-light-bg">
                  <CardBody className="p-6">
                    <h4 className="mb-3 flex items-center text-xl font-semibold text-light-text">
                      <span className="mr-2">🗣️</span>
                      Choose Your Own Fees
                    </h4>
                    <p className="text-gray-600">
                      Set the donation fee-rate to support the growth of Milk
                      Market on your own terms.
                    </p>
                  </CardBody>
                </Card>

                <Card className="hover-lift border-gray-100 bg-light-bg">
                  <CardBody className="p-6">
                    <h4 className="mb-3 flex items-center text-xl font-semibold text-light-text">
                      <span className="mr-2">💰</span>
                      P2P Payments
                    </h4>
                    <p className="text-gray-600">
                      Accept Bitcoin, cash, or additional online cash options
                      with built-in payment handling.
                    </p>
                  </CardBody>
                </Card>

                <Card className="hover-lift border-gray-100 bg-light-bg">
                  <CardBody className="p-6">
                    <h4 className="mb-3 flex items-center text-xl font-semibold text-light-text">
                      <span className="mr-2">📈</span>
                      Expand Reach
                    </h4>
                    <p className="text-gray-600">
                      Tap into the global billion dollar raw milk industry.
                    </p>
                  </CardBody>
                </Card>
              </div>
            </div>

            {/* For Drinkers */}
            <div id="drinkers">
              <div className="mb-8 flex items-center">
                <span className="mr-4 text-3xl">🥛</span>
                <h3 className="text-3xl font-bold">For Drinkers</h3>
              </div>

              <div className="space-y-6">
                <Card className="hover-lift border-gray-100 bg-light-bg">
                  <CardBody className="p-6">
                    <h4 className="mb-3 flex items-center text-xl font-semibold text-light-text">
                      <span className="mr-2">🔍</span>
                      Private Sourcing
                    </h4>
                    <p className="text-gray-600">
                      Find milk farmers through our permissionless system
                      without compromising privacy.
                    </p>
                  </CardBody>
                </Card>

                <Card className="hover-lift border-gray-100 bg-light-bg">
                  <CardBody className="p-6">
                    <h4 className="mb-3 flex items-center text-xl font-semibold text-light-text">
                      <span className="mr-2">💬</span>
                      Direct Relationships
                    </h4>
                    <p className="text-gray-600">
                      Message producers through encrypted chat to build
                      meaningful connections.
                    </p>
                  </CardBody>
                </Card>

                <Card className="hover-lift border-gray-100 bg-light-bg">
                  <CardBody className="p-6">
                    <h4 className="mb-3 flex items-center text-xl font-semibold text-light-text">
                      <span className="mr-2">🕶️</span>
                      Anonymous Trading
                    </h4>
                    <p className="text-gray-600">
                      Trade freely without KYC or government overreach.
                    </p>
                  </CardBody>
                </Card>

                <Card className="hover-lift border-gray-100 bg-light-bg">
                  <CardBody className="p-6">
                    <h4 className="mb-3 flex items-center text-xl font-semibold text-light-text">
                      <span className="mr-2">🤝</span>
                      Community Power
                    </h4>
                    <p className="text-gray-600">
                      Join raw milk advocates worldwide in the food freedom
                      movement.
                    </p>
                  </CardBody>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Architecture */}
      <section id="safety" className="relative z-10 bg-light-bg py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-bold md:text-5xl">
              Privacy & Freedom
            </h2>
            <p className="text-xl text-gray-600">
              Built for true permissionless commerce
            </p>
          </div>

          <div className="grid gap-12 md:grid-cols-2">
            <Card className="border-purple-100 bg-purple-50">
              <CardBody className="p-8">
                <span className="mb-4 block text-3xl">🔒</span>
                <h3 className="mb-4 text-2xl font-bold text-light-text">
                  Privacy First
                </h3>
                <p className="mb-4 text-lg font-semibold text-light-text">
                  &ldquo;Your Data, Your Business — Zero Surveillance
                  Architecture&rdquo;
                </p>
                <ul className="space-y-3 text-gray-700">
                  <li className="flex items-start">
                    <span className="mr-2 text-purple-500">✓</span>
                    End-to-end encrypted communications
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2 text-purple-500">✓</span>
                    No KYC requirements
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2 text-purple-500">✓</span>
                    Anonymous browsing and pseudonymous trading
                  </li>
                </ul>
              </CardBody>
            </Card>

            <Card className="border-orange-100 bg-orange-50">
              <CardBody className="p-8">
                <span className="mb-4 block text-3xl">⚡</span>
                <h3 className="mb-4 text-2xl font-bold text-light-text">
                  Permissionless Network
                </h3>
                <p className="mb-4 text-lg font-semibold text-light-text">
                  &ldquo;No Gatekeepers, No Approvals — Trade Freely&rdquo;
                </p>
                <ul className="space-y-3 text-gray-700">
                  <li className="flex items-start">
                    <span className="mr-2 text-orange-500">✓</span>
                    Instant listing without approval process
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2 text-orange-500">✓</span>
                    Censorship-resistant infrastructure
                  </li>
                  <li className="flex items-start">
                    <span className="mr-2 text-orange-500">✓</span>
                    Complete user control over data
                  </li>
                </ul>
              </CardBody>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="relative z-10 bg-gray-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-bold md:text-5xl">
              How It Works
            </h2>
            <p className="text-xl text-gray-600">
              Simple steps to join the movement
            </p>
          </div>

          <div className="grid gap-16 lg:grid-cols-2">
            {/* Producers */}
            <div>
              <div className="mb-8 flex items-center">
                <span className="mr-4 text-3xl">🚜</span>
                <h3 className="text-3xl font-bold">Producers</h3>
              </div>

              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-dark-bg font-bold text-dark-text">
                    1
                  </div>
                  <div>
                    <h4 className="mb-2 text-xl font-semibold">
                      List Your Milk
                    </h4>
                    <p className="text-gray-600">
                      Upload batch details and test results to showcase your
                      quality standards.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-dark-bg font-bold text-dark-text">
                    2
                  </div>
                  <div>
                    <h4 className="mb-2 text-xl font-semibold">Set Terms</h4>
                    <p className="text-gray-600">
                      Define price, delivery type, and preferred payment
                      methods.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-dark-bg font-bold text-dark-text">
                    3
                  </div>
                  <div>
                    <h4 className="mb-2 text-xl font-semibold">
                      Grow Your Tribe
                    </h4>
                    <p className="text-gray-600">
                      Leverage our online community to expand your customer
                      base.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Drinkers */}
            <div>
              <div className="mb-8 flex items-center">
                <span className="mr-4 text-3xl">🥛</span>
                <h3 className="text-3xl font-bold">Drinkers</h3>
              </div>

              <div className="space-y-6">
                <div className="flex items-start space-x-4">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-dark-bg font-bold text-dark-text">
                    1
                  </div>
                  <div>
                    <h4 className="mb-2 text-xl font-semibold">
                      Local-first Connecions
                    </h4>
                    <p className="text-gray-600">
                      Find and shake hands with farmers in your city, state, and
                      country.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-dark-bg font-bold text-dark-text">
                    2
                  </div>
                  <div>
                    <h4 className="mb-2 text-xl font-semibold">
                      Secure Checkout
                    </h4>
                    <p className="text-gray-600">
                      Choose Bitcoin, cash, or other online cash transfers for
                      flexible payment options.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-dark-bg font-bold text-dark-text">
                    3
                  </div>
                  <div>
                    <h4 className="mb-2 text-xl font-semibold">
                      From Farm to Table
                    </h4>
                    <p className="text-gray-600">
                      Schedule pickups and deliveries directly with producers.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="relative z-10 bg-light-bg py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-8 text-4xl font-bold md:text-5xl">
            Why We Built This
          </h2>

          <Card className="border-0 bg-gray-900 text-dark-text">
            <CardBody className="p-8 md:p-12">
              <span className="mb-6 block text-6xl">🐄</span>
              <blockquote className="mb-6 text-xl font-medium leading-relaxed md:text-2xl">
                &ldquo;Seeing how ever growing agregious regulations limit our
                freedom to transact, especially when it comes to something as
                simple as milk, the need for change was apparent. This was why I
                started Shopstr, and why I now see Milk Market as the first
                stage in making a real stand. No more censorship, no more
                gatekeepers—just direct farmer-to-consumer freedom.&rdquo;
              </blockquote>
              <cite className="text-lg text-gray-300">
                — Calvadev, Founder & CEO @ Shopstr
              </cite>
            </CardBody>
          </Card>
        </div>
      </section>

      {/* Signup Form */}
      <section
        id="signup"
        className="relative z-10 bg-gradient-to-b from-gray-50 to-white py-20"
      >
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-6 text-4xl font-bold md:text-5xl">
            Join the Revolution
          </h2>
          <p className="mb-8 text-xl text-gray-600">
            Be the first to know when we launch the permissionless milk
            marketplace
          </p>

          <Card className="border-gray-200 bg-light-bg shadow-xl">
            <CardBody className="p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="text-left text-light-text">
                  <label className="mb-4 block text-base font-medium">
                    How would you like us to reach you?
                  </label>
                  <RadioGroup
                    value={contactType}
                    onValueChange={(value: string) => {
                      setContactType(value as "email" | "nostr");
                      setContact("");
                    }}
                    orientation="horizontal"
                    classNames={{
                      wrapper: "gap-6",
                    }}
                  >
                    <Radio
                      value="email"
                      classNames={{
                        label: "text-light-text",
                      }}
                    >
                      📧 Email
                    </Radio>
                    <Radio
                      value="nostr"
                      classNames={{
                        label: "text-light-text",
                      }}
                    >
                      ⚡ Nostr npub
                    </Radio>
                  </RadioGroup>
                </div>

                <div className="text-left text-light-text">
                  <label
                    htmlFor="contact"
                    className="mb-2 block text-base font-medium"
                  >
                    {contactType === "email"
                      ? "Email Address"
                      : "Nostr Public Key (npub)"}
                  </label>
                  <Input
                    id="contact"
                    type="text"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder={
                      contactType === "email" ? "your@email.com" : "npub..."
                    }
                    size="lg"
                    variant="bordered"
                    classNames={{
                      input: "text-lg",
                      inputWrapper: "border-gray-300 focus-within:border-black",
                    }}
                  />
                  {contactType === "nostr" && (
                    <p className="mt-2 text-sm text-gray-500">
                      Your Nostr public key ensures more secure communication
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  isDisabled={!isValidContact}
                  color="default"
                  variant="solid"
                  size="lg"
                  className="w-full bg-dark-bg px-6 py-3 text-lg text-dark-text"
                >
                  Join the Milk Revolution → 🥛
                </Button>
              </form>

              <div className="mt-6 text-sm text-gray-500">
                <p className="flex items-center justify-center space-x-1">
                  <span>🔒</span>
                  <span>
                    Your contact info stays private and will never be shared
                  </span>
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      </section>

      {/* Contact Section */}
      <section className="relative z-10 bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="mb-8 text-3xl font-bold md:text-4xl">Get In Touch</h2>
          <Card className="mx-auto max-w-2xl bg-light-bg shadow-lg">
            <CardBody className="p-8">
              <p className="mb-6 text-lg text-gray-700">
                Have questions about the Raw Milk Marketplace? Reach out to us:
              </p>
              <div className="space-y-4">
                <div className="flex items-center justify-center space-x-3">
                  <span className="text-2xl">📧</span>
                  <span className="font-semibold text-gray-800">Email:</span>
                  <a
                    href="mailto:milk@shopsr.store"
                    className="font-medium text-light-text underline transition-colors hover:text-gray-600"
                  >
                    milk@shopsr.store
                  </a>
                </div>
                <div className="flex items-center justify-center space-x-3">
                  <span className="text-2xl">⚡</span>
                  <span className="font-semibold text-gray-800">Nostr:</span>
                  <a
                    href="https://njump.me/shopstr@shopstrmarkets.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono font-medium text-light-text underline transition-colors hover:text-gray-600"
                  >
                    shopstr@shopstrmarkets.com
                  </a>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </section>

      {/* Final CTAs */}
      <section className="relative z-10 bg-dark-bg py-20 text-dark-text">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-bold md:text-5xl">
              Can&apos;t Wait?
            </h2>
            <p className="mb-6 text-xl text-gray-300">
              Head over to{" "}
              <a
                href="https://shopstr.store"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-dark-text underline transition-colors hover:text-gray-300"
              >
                Milk Market
              </a>{" "}
              to start listing milk before the dedicated site launches!
            </p>
            <Button
              className={WHITEBUTTONCLASSNAMES}
              onClick={() => window.open("https://shopstr.store", "_blank")}
            >
              Shop Freely →
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 bg-gray-900 py-16 text-dark-text">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Trust Signals */}
          <div className="mb-12 grid gap-8 md:grid-cols-3">
            <div className="text-center">
              <span className="mb-3 block text-3xl">🛡️</span>
              <h4 className="mb-2 text-lg font-semibold">Private</h4>
              <p className="text-gray-400">
                All Information is Encrypted and Untraceable
              </p>
            </div>

            <div className="text-center">
              <span className="mb-3 block text-3xl">🔒</span>
              <h4 className="mb-2 text-lg font-semibold">Permissionless</h4>
              <p className="text-gray-400">
                Data Hosted on Nostr and Blossom – No Central Server Can Shut Us
                Down
              </p>
            </div>

            <div className="text-center">
              <span className="mb-3 block text-3xl">🤝</span>
              <h4 className="mb-2 text-lg font-semibold">Peer to Peer</h4>
              <p className="text-gray-400">
                Purchase Directly From Your Local Farmer
              </p>
            </div>
          </div>

          {/* Anti-Censorship Pledge */}
          <Card className="mb-12 border-gray-700 bg-gray-800">
            <CardBody className="p-8">
              <h3 className="mb-6 text-center text-2xl font-bold text-dark-text">
                Anti-Censorship Pledge
              </h3>
              <p className="mb-4 text-lg font-semibold text-dark-text">
                We Will Never:
              </p>
              <ul className="space-y-2 text-gray-300">
                <li className="flex items-start">
                  <span className="mr-2 text-red-400">✗</span>
                  Share user data with regulators
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-red-400">✗</span>
                  Remove listings that deal with dairy
                </li>
                <li className="flex items-start">
                  <span className="mr-2 text-red-400">✗</span>
                  Freeze funds, transactions, or communications
                </li>
              </ul>
            </CardBody>
          </Card>

          {/* Final Message */}
          <div className="border-t border-gray-700 pt-8">
            <div className="mb-6 flex flex-col items-center justify-between md:flex-row">
              <div className="mb-4 flex items-center gap-8 md:mb-0">
                <button
                  onClick={() => router.push("/faq")}
                  className="flex items-center gap-1 text-dark-text transition-colors hover:text-gray-300"
                >
                  FAQ
                  <ArrowUpRightIcon className="h-3 w-3" />
                </button>
                <button
                  onClick={() => router.push("/terms")}
                  className="flex items-center gap-1 text-dark-text transition-colors hover:text-gray-300"
                >
                  Terms
                  <ArrowUpRightIcon className="h-3 w-3" />
                </button>
                <button
                  onClick={() => router.push("/privacy")}
                  className="flex items-center gap-1 text-dark-text transition-colors hover:text-gray-300"
                >
                  Privacy
                  <ArrowUpRightIcon className="h-3 w-3" />
                </button>
                <div className="flex h-auto items-center gap-6">
                  <a
                    href="https://github.com/shopstr-eng/milk-market"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-transform hover:scale-110"
                  >
                    <Image
                      src="/github-mark-white.png"
                      alt="GitHub"
                      width={24}
                      height={24}
                    />
                  </a>
                  <a
                    href="https://njump.me/npub15dc33fyg3cpd9r58vlqge2hh8dy6hkkrjxkhluv2xpyfreqkmsesesyv6e"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-transform hover:scale-110"
                  >
                    <Image
                      src="/nostr-icon-white-transparent-256x256.png"
                      alt="Nostr"
                      width={32}
                      height={32}
                    />
                  </a>
                  <a
                    href="https://x.com/_shopstr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-transform hover:scale-110"
                  >
                    <Image
                      src="/x-logo-white.png"
                      alt="X"
                      width={24}
                      height={24}
                    />
                  </a>
                </div>
              </div>
              <p className="text-dark-text">© 2025 Shopstr Markets Inc.</p>
            </div>
            <div className="text-center">
              <div className="mb-4 flex items-center justify-center space-x-2">
                <Image
                  src="/milk-market.png"
                  alt="Milk Market"
                  className="h-8 w-8"
                />
                <span className="text-xl font-bold">Milk Market</span>
              </div>
              <p className="mb-4 text-2xl font-bold">
                The Milk Revolution Won&apos;t Be Pasteurized. Join Us.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
