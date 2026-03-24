import { StorefrontPolicies } from "@/utils/types/types";

export const POLICY_LABELS: Record<keyof StorefrontPolicies, string> = {
  returnPolicy: "Return & Refund Policy",
  termsOfService: "Terms of Service",
  privacyPolicy: "Privacy Policy",
  cancellationPolicy: "Cancellation Policy",
};

export const POLICY_SLUGS: Record<keyof StorefrontPolicies, string> = {
  returnPolicy: "return-policy",
  termsOfService: "terms-of-service",
  privacyPolicy: "privacy-policy",
  cancellationPolicy: "cancellation-policy",
};

export function getDefaultPolicies(shopName: string): StorefrontPolicies {
  const name = shopName || "this shop";
  return {
    returnPolicy: {
      enabled: true,
      content: `# Return & Refund Policy

**Last updated:** ${new Date().toISOString().slice(0, 10)}

## Returns

We accept returns within **30 days** of delivery. To be eligible for a return, items must be unused, in their original packaging, and in the same condition you received them.

Perishable goods (such as food, dairy, or fresh produce) cannot be returned once delivered unless they arrive damaged, spoiled, or are not as described.

## How to Request a Return

To start a return, please contact us directly through our storefront or via Nostr direct message. Include your order details and reason for the return. We will provide instructions on how to send the item back.

## Refunds

Once we receive and inspect your returned item, we will notify you of the approval or rejection of your refund.

- **Approved refunds** will be processed within **7 business days** to your original payment method (Bitcoin Lightning, Cashu, or other method used at checkout).
- **Shipping costs** are non-refundable. If you receive a refund, the cost of return shipping will be deducted unless the return is due to our error.

## Damaged or Incorrect Items

If you receive a damaged, defective, or incorrect item, please contact us immediately with photos. We will arrange a replacement or full refund at no additional cost to you.

## Exchanges

We handle exchanges on a case-by-case basis. Contact us to discuss exchange options for your order.

## Questions

If you have questions about our return policy, reach out to ${name} through our storefront contact information.`,
    },
    termsOfService: {
      enabled: true,
      content: `# Terms of Service

**Last updated:** ${new Date().toISOString().slice(0, 10)}

## 1. About ${name}

${name} operates as an independent seller on the Milk Market platform. By placing an order with ${name}, you agree to these terms.

## 2. Products & Descriptions

We strive to provide accurate descriptions, images, and pricing for all products. However, we do not warrant that product descriptions or pricing are error-free. If a product you receive is not as described, please contact us.

## 3. Orders & Payment

All payments are processed through the Milk Market platform using Bitcoin Lightning, Cashu ecash, or other accepted payment methods. Prices are displayed in the currency shown on each listing. Once a payment is confirmed on the network, it is considered final.

## 4. Shipping & Delivery

We aim to ship orders within **3-5 business days** of receiving payment confirmation. Delivery times vary by location and shipping method. ${name} is not responsible for delays caused by shipping carriers or customs.

Shipping costs and estimated delivery times are displayed at checkout. Risk of loss or damage transfers to you upon delivery to the carrier.

## 5. Product Safety & Compliance

${name} is responsible for ensuring all products comply with applicable local, state, and federal regulations. Buyers are responsible for understanding any import restrictions or regulations in their jurisdiction.

## 6. Limitation of Liability

${name} shall not be liable for any indirect, incidental, or consequential damages arising from the use of our products. Our total liability for any claim shall not exceed the amount you paid for the product in question.

## 7. Dispute Resolution

If you have a concern about an order, please contact us directly. We are committed to resolving issues fairly and promptly. As peer-to-peer transactions on the Milk Market platform, disputes are resolved directly between buyer and seller.

## 8. Changes to Terms

We may update these terms from time to time. Continued purchases from ${name} constitute acceptance of the current terms.

## 9. Contact

For questions about these terms, please reach out through our storefront contact information or via Nostr direct message.`,
    },
    privacyPolicy: {
      enabled: true,
      content: `# Privacy Policy

**Last updated:** ${new Date().toISOString().slice(0, 10)}

## Information We Collect

When you place an order with ${name}, we may collect:

- **Order information:** Items purchased, quantities, and order total
- **Shipping information:** Name and delivery address (if applicable for physical goods)
- **Communication data:** Messages sent through Nostr direct messages or the storefront contact form

## Information We Do Not Collect

- Payment card numbers or bank account details (payments are handled through Bitcoin/Lightning/Cashu)
- Government-issued ID or KYC information
- Browsing behavior or analytics tracking data

## How We Use Your Information

We use the information we collect to:

- Fulfill and ship your orders
- Communicate with you about your order status
- Respond to questions or concerns
- Improve our products and service

## Data Sharing

We do not sell, rent, or share your personal information with third parties, except as necessary to:

- Fulfill shipping (sharing delivery address with shipping carriers)
- Comply with legal obligations if required by law

## Data Retention

We retain order information for as long as needed to fulfill orders and handle any post-purchase support. Shipping information is retained only as long as necessary for delivery and any return processing.

## Nostr Protocol

Communications through the Nostr protocol are distributed across relays. Direct messages are encrypted and viewable only by the intended recipients. Public interactions may be visible on connected relays.

## Your Rights

You may request to:

- Access the personal information we hold about you
- Correct any inaccurate information
- Delete your personal information (subject to legal retention requirements)

To exercise these rights, contact ${name} through our storefront.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be reflected on this page with an updated date.

## Contact

For privacy-related questions, reach out through our storefront contact information or via Nostr direct message.`,
    },
    cancellationPolicy: {
      enabled: true,
      content: `# Cancellation Policy

**Last updated:** ${new Date().toISOString().slice(0, 10)}

## Order Cancellations

You may cancel an order within **24 hours** of placing it, provided it has not yet been shipped. To cancel, contact us immediately through our storefront or via Nostr direct message.

Once an order has been shipped, it cannot be cancelled. You may instead request a return once the item is delivered (see our Return & Refund Policy).

## Subscription Cancellations

If ${name} offers subscription-based products or services:

- You may cancel your subscription at any time
- Cancellations take effect at the end of your current billing period
- No refunds are issued for the current billing period after cancellation
- You will continue to receive any remaining deliveries or access through the end of your paid period

To cancel a subscription, contact us through our storefront or via Nostr direct message with your subscription details.

## Pre-Orders

Pre-orders may be cancelled for a full refund at any time before the item ships. Once a pre-order item ships, standard return policies apply.

## Refunds for Cancelled Orders

- **Orders cancelled before shipping:** Full refund processed within **5 business days**
- **Subscriptions cancelled mid-cycle:** No refund for the current period; service continues until the period ends
- Refunds are returned via the original payment method (Bitcoin Lightning, Cashu, or other method used)

## Contact

For cancellation requests or questions, reach out to ${name} through our storefront contact information or via Nostr direct message.`,
    },
  };
}
