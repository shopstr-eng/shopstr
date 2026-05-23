import MyListingsFeed from "@/components/my-listings/my-listings-feed";
import ProtectedRoute from "@/components/utility-components/protected-route";

export default function ShopView() {
  return (
    <ProtectedRoute>
      <div className="bg-light-bg dark:bg-dark-bg flex h-full min-h-screen flex-col pt-24">
        <MyListingsFeed />
      </div>
    </ProtectedRoute>
  );
}
