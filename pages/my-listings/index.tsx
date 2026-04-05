import MyListingsFeed from "@/components/my-listings/my-listings-feed";
import SignInModal from "@/components/sign-in/SignInModal";
import { useAuthGuard } from "@/components/hooks/use-auth-guard";

export default function ShopView() {
  const { isLoggedIn, isOpen, handleClose } = useAuthGuard();

  if (!isLoggedIn) {
    return <SignInModal isOpen={isOpen} onClose={handleClose} />;
  }

  return (
    <div className="flex h-full min-h-screen flex-col bg-light-bg pt-24 dark:bg-dark-bg">
      <MyListingsFeed />
    </div>
  );
}
