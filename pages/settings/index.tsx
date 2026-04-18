import { useRouter } from "next/router";
import {
  BuildingStorefrontIcon,
  Cog6ToothIcon,
  UserIcon,
  UserGroupIcon,
  ArrowRightStartOnRectangleIcon,
  BanknotesIcon,
  KeyIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import { LogOut } from "@/utils/nostr/nostr-helper-functions";
import ProtectedRoute from "@/components/utility-components/protected-route";

const SettingsPage = () => {
  const router = useRouter();

  const settingsItems = [
    {
      id: "shop-profile",
      title: "Shop Profile",
      description: "Edit your shop profile",
      icon: BuildingStorefrontIcon,
      iconBg: "bg-slate-600",
      route: "/settings/shop-profile",
    },
    {
      id: "user-profile",
      title: "User Profile",
      description: "Edit your user profile",
      icon: UserIcon,
      iconBg: "bg-slate-600",
      route: "/settings/user-profile",
    },
    {
      id: "community",
      title: "Community Management",
      description: "Create and manage your seller community",
      icon: UserGroupIcon,
      iconBg: "bg-slate-600",
      route: "/settings/community",
    },
    {
      id: "preferences",
      title: "Preferences",
      description: "Change your mints, relays, media servers, and more",
      icon: Cog6ToothIcon,
      iconBg: "bg-slate-600",
      route: "/settings/preferences",
    },
    {
      id: "nostr-wallet-connect",
      title: "Nostr Wallet Connect",
      description: "Connect your NIP-47 Nostr Wallet",
      icon: BanknotesIcon,
      iconBg: "bg-slate-600",
      route: "/settings/nwc",
    },
    {
      id: "email-flows",
      title: "Email Flows",
      description: "Create automated email sequences for your customers",
      icon: EnvelopeIcon,
      iconBg: "bg-slate-600",
      route: "/settings/email-flows",
    },
    {
      id: "api-keys",
      title: "API Keys",
      description: "Manage API keys for MCP and AI agent access",
      icon: KeyIcon,
      iconBg: "bg-slate-600",
      route: "/settings/api-keys",
    },
  ];

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen flex-col bg-white pt-24 pb-20">
        <div className="mx-auto w-full px-4 lg:w-1/2 xl:w-2/5">
          <h1 className="mb-6 text-4xl font-bold text-black">Settings</h1>

          {/* Account Section */}
          <div className="mb-10">
            <h2 className="mb-3 text-xl font-bold text-black">Account</h2>
            <div className="space-y-3">
              {settingsItems.map((item) => {
                const IconComponent = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => router.push(item.route)}
                    className="group shadow-neo hover:bg-primary-yellow w-full transform cursor-pointer rounded-md border-2 border-black bg-white p-4 transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-primary-blue rounded-md border-2 border-black p-2.5">
                        <IconComponent className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-base font-bold text-black">
                          {item.title}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Log out Section */}
          <div>
            <h2 className="mb-3 text-xl font-bold text-black">Log out</h2>
            <button
              onClick={() => {
                LogOut();
                router.push("/marketplace");
              }}
              className="group shadow-neo w-full transform cursor-pointer rounded-md border-2 border-black bg-white p-4 transition-transform hover:-translate-y-0.5 hover:bg-red-100 active:translate-y-0.5"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-md border-2 border-black bg-red-500 p-2.5">
                  <ArrowRightStartOnRectangleIcon className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 text-left">
                  <h3 className="text-base font-bold text-black">Log out</h3>
                  <p className="text-sm text-gray-600">
                    Log out of Milk Market
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default SettingsPage;
