import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import ShopProfileForm from "@/components/settings/shop-profile-form";
import ProtectedRoute from "@/components/utility-components/protected-route";

const ShopProfilePage = () => {
  return (
    <ProtectedRoute>
      <div className="neo-settings-form relative flex min-h-screen flex-col bg-[#111] pt-24 text-white selection:bg-yellow-400 selection:text-black md:pb-20">
        <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,#000_65%,transparent_100%)] bg-[size:24px_24px]" />
        <div className="relative z-10 mx-auto h-full w-full px-4 lg:w-1/2">
          <SettingsBreadCrumbs />
          <ShopProfileForm />
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default ShopProfilePage;
