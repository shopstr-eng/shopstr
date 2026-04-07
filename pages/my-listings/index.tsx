import MyListingsFeed from "@/components/my-listings/my-listings-feed";
import ProtectedRoute from "@/components/utility-components/protected-route";

export default function ShopView() {
  return (
    <ProtectedRoute>
      <div className="flex h-full min-h-screen flex-col bg-white pt-24">
        <MyListingsFeed />
      </div>
    </ProtectedRoute>
  );
}
