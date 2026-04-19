import OrdersDashboard from "@/components/messages/orders-dashboard";
import ProtectedRoute from "@/components/utility-components/protected-route";

export default function SellerOrdersView() {
  return (
    <ProtectedRoute>
      <div className="bg-light-bg dark:bg-dark-bg flex min-h-screen flex-col pt-16">
        <OrdersDashboard sellerOnly />
      </div>
    </ProtectedRoute>
  );
}
