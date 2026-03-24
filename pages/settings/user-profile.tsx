import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import UserProfileForm from "@/components/settings/user-profile-form";
import StripeConnectBanner from "@/components/stripe-connect/StripeConnectBanner";

const UserProfilePage = () => {
  return (
    <div className="flex min-h-screen flex-col bg-white pt-24 md:pb-20">
      <div className="mx-auto h-full w-full px-4 lg:w-1/2 xl:w-2/5">
        <StripeConnectBanner
          returnPath="/settings/user-profile?stripe=success"
          refreshPath="/settings/user-profile?stripe=refresh"
        />
        <SettingsBreadCrumbs />
        <UserProfileForm />
      </div>
    </div>
  );
};

export default UserProfilePage;
