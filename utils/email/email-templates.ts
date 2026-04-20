const BRAND_NAME = "Milk Market";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function esc(value: string | undefined): string {
  if (!value) return "";
  return escapeHtml(value);
}

function baseTemplate(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#000000;padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">${BRAND_NAME}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${bodyContent}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f9fafb;padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">This email was sent by ${BRAND_NAME}. You received this because an order was placed with your email address.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildProductDescriptors(params: {
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: string;
}): string {
  const descriptors: string[] = [];
  if (params.selectedSize)
    descriptors.push(`Size: ${esc(params.selectedSize)}`);
  if (params.selectedVolume)
    descriptors.push(`Volume: ${esc(params.selectedVolume)}`);
  if (params.selectedWeight)
    descriptors.push(`Weight: ${esc(params.selectedWeight)}`);
  if (params.selectedBulkOption)
    descriptors.push(`Bundle: ${esc(params.selectedBulkOption)} units`);
  if (descriptors.length === 0) return "";
  return `<tr>
        <td style="padding:16px 0;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Product Details</p>
          <p style="margin:0;color:#111827;font-size:15px;">${descriptors.join(
            " &bull; "
          )}</p>
        </td>
      </tr>`;
}

function buildDeliverySection(params: {
  shippingAddress?: string;
  pickupLocation?: string;
}): string {
  const rows: string[] = [];
  if (params.shippingAddress) {
    rows.push(`<tr>
        <td style="padding:16px 0;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Shipping Address</p>
          <p style="margin:0;color:#111827;font-size:15px;">${esc(
            params.shippingAddress
          )}</p>
        </td>
      </tr>`);
  }
  if (params.pickupLocation) {
    rows.push(`<tr>
        <td style="padding:16px 0;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Pickup Location</p>
          <p style="margin:0;color:#111827;font-size:15px;">${esc(
            params.pickupLocation
          )}</p>
        </td>
      </tr>`);
  }
  return rows.join("");
}

function formatFrequency(frequency: string): string {
  const map: Record<string, string> = {
    weekly: "Weekly",
    every_2_weeks: "Every 2 Weeks",
    monthly: "Monthly",
    every_2_months: "Every 2 Months",
    quarterly: "Quarterly",
  };
  return map[frequency] || frequency;
}

export interface OrderEmailParams {
  orderId: string;
  productTitle: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  buyerName?: string;
  shippingAddress?: string;
  pickupLocation?: string;
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: string;
  buyerContact?: string;
  subscriptionFrequency?: string;
  donationAmount?: number;
  donationPercentage?: number;
}

function formatDonationPercent(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  return rounded % 1 === 0
    ? `${rounded.toFixed(0)}%`
    : `${rounded.toFixed(1)}%`;
}

function buildDonationSection(params: OrderEmailParams): string {
  const amt = params.donationAmount ?? 0;
  const pct = params.donationPercentage ?? 0;
  return `<tr>
        <td style="padding:16px 0;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Platform Donation (${formatDonationPercent(
            pct
          )})</p>
          <p style="margin:0;color:#111827;font-size:15px;">${esc(
            String(amt)
          )} ${esc(params.currency)}</p>
        </td>
      </tr>`;
}

export function orderConfirmationEmail(params: OrderEmailParams): {
  subject: string;
  html: string;
} {
  const greeting = params.buyerName
    ? `Hi ${esc(params.buyerName)},`
    : "Hi there,";

  const deliverySection = buildDeliverySection(params);
  const descriptorsSection = buildProductDescriptors(params);

  const subscriptionSection = params.subscriptionFrequency
    ? `<tr>
        <td style="padding:16px 0;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Subscription</p>
          <p style="margin:0;color:#111827;font-size:15px;">${esc(
            formatFrequency(params.subscriptionFrequency)
          )} recurring order</p>
        </td>
      </tr>`
    : "";

  const body = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">${greeting}</h2>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">Your order has been confirmed! Here are the details:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Order ID</p>
          <p style="margin:0;color:#111827;font-size:15px;font-family:monospace;">${esc(
            params.orderId
          )}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 0;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Product</p>
          <p style="margin:0;color:#111827;font-size:15px;">${esc(
            params.productTitle
          )}</p>
        </td>
      </tr>
      ${descriptorsSection}
      <tr>
        <td style="padding:16px 0;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Amount</p>
          <p style="margin:0;color:#111827;font-size:18px;font-weight:600;">${esc(
            params.amount
          )} ${esc(params.currency)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 0;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Payment Method</p>
          <p style="margin:0;color:#111827;font-size:15px;">${esc(
            params.paymentMethod
          )}</p>
        </td>
      </tr>
      ${buildDonationSection(params)}
      ${subscriptionSection}
      ${deliverySection}
    </table>
    <p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">The seller has been notified and you'll receive updates about your order via email.</p>`;

  return {
    subject: `Order Confirmed - ${esc(params.productTitle)} (#${esc(
      params.orderId.slice(0, 8)
    )})`,
    html: baseTemplate("Order Confirmation", body),
  };
}

export function sellerNewOrderEmail(params: OrderEmailParams): {
  subject: string;
  html: string;
} {
  const buyerInfo = esc(params.buyerName || params.buyerContact || "A buyer");

  const deliverySection = buildDeliverySection(params);
  const descriptorsSection = buildProductDescriptors(params);

  const subscriptionSection = params.subscriptionFrequency
    ? `<tr>
        <td style="padding:16px 0;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Subscription</p>
          <p style="margin:0;color:#111827;font-size:15px;">${esc(
            formatFrequency(params.subscriptionFrequency)
          )} recurring order</p>
        </td>
      </tr>`
    : "";

  const buyerContactSection = params.buyerContact
    ? `<tr>
        <td style="padding:16px 0;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Buyer Contact</p>
          <p style="margin:0;color:#111827;font-size:15px;">${esc(
            params.buyerContact
          )}</p>
        </td>
      </tr>`
    : "";

  const body = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">New Order Received!</h2>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">${buyerInfo} has placed an order for your product.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Order ID</p>
          <p style="margin:0;color:#111827;font-size:15px;font-family:monospace;">${esc(
            params.orderId
          )}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 0;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Product</p>
          <p style="margin:0;color:#111827;font-size:15px;">${esc(
            params.productTitle
          )}</p>
        </td>
      </tr>
      ${descriptorsSection}
      <tr>
        <td style="padding:16px 0;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Amount</p>
          <p style="margin:0;color:#111827;font-size:18px;font-weight:600;">${esc(
            params.amount
          )} ${esc(params.currency)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 0;border-top:1px solid #e5e7eb;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Payment Method</p>
          <p style="margin:0;color:#111827;font-size:15px;">${esc(
            params.paymentMethod
          )}</p>
        </td>
      </tr>
      ${buildDonationSection(params)}
      ${subscriptionSection}
      ${deliverySection}
      ${buyerContactSection}
    </table>
    <p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">Please check your Milk Market orders dashboard for full details and to manage this order.</p>`;

  return {
    subject: `New Order - ${esc(params.productTitle)} (#${esc(
      params.orderId.slice(0, 8)
    )})`,
    html: baseTemplate("New Order", body),
  };
}

export interface SubscriptionEmailParams {
  productTitle: string;
  frequency: string;
  discountPercent: number;
  regularPrice: string;
  subscriptionPrice: string;
  currency: string;
  nextBillingDate: string;
  buyerName?: string;
  shippingAddress?: string;
  orderId?: string;
  subscriptionId?: string;
}

function buildSubscriptionDetailsSection(
  params: SubscriptionEmailParams
): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:24px 0;">
        <tr>
          <td>
            <p style="margin:0 0 12px;color:#166534;font-size:14px;font-weight:600;">Subscription Details</p>
            <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Frequency:</strong> ${esc(
              formatFrequency(params.frequency)
            )}</p>
            <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Discount:</strong> ${
              params.discountPercent
            }% off</p>
            <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Regular Price:</strong> ${esc(
              params.regularPrice
            )} ${esc(params.currency)}</p>
            <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Subscription Price:</strong> ${esc(
              params.subscriptionPrice
            )} ${esc(params.currency)}</p>
            <p style="margin:0;color:#374151;font-size:14px;"><strong>Next Billing Date:</strong> ${esc(
              params.nextBillingDate
            )}</p>
          </td>
        </tr>
      </table>`;
}

export function subscriptionConfirmationEmail(
  params: SubscriptionEmailParams
): {
  subject: string;
  html: string;
} {
  const greeting = params.buyerName
    ? `Hi ${esc(params.buyerName)},`
    : "Hi there,";

  const addressSection = params.shippingAddress
    ? `<p style="margin:16px 0 0;color:#374151;font-size:15px;line-height:1.6;"><strong>Shipping Address:</strong> ${esc(
        params.shippingAddress
      )}</p>`
    : "";

  const body = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">${greeting}</h2>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">Your subscription to <strong>${esc(
      params.productTitle
    )}</strong> has been confirmed! You're saving ${
      params.discountPercent
    }% on every order.</p>
    ${buildSubscriptionDetailsSection(params)}
    ${addressSection}
    <p style="margin:24px 0 0;color:#374151;font-size:15px;line-height:1.6;">You'll receive a reminder email before each renewal. You can manage your subscription from your orders page on Milk Market.</p>`;

  return {
    subject: `Subscription Confirmed - ${esc(params.productTitle)}`,
    html: baseTemplate("Subscription Confirmation", body),
  };
}

export function renewalReminderEmail(params: SubscriptionEmailParams): {
  subject: string;
  html: string;
} {
  const greeting = params.buyerName
    ? `Hi ${esc(params.buyerName)},`
    : "Hi there,";

  const body = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">${greeting}</h2>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">This is a reminder that your subscription to <strong>${esc(
      params.productTitle
    )}</strong> will renew on <strong>${esc(
      params.nextBillingDate
    )}</strong>.</p>
    ${buildSubscriptionDetailsSection(params)}
    <p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">If you'd like to make changes to your subscription, such as updating your shipping address or canceling, please visit your orders page on Milk Market before the renewal date.</p>`;

  return {
    subject: `Upcoming Renewal - ${esc(params.productTitle)} on ${esc(
      params.nextBillingDate
    )}`,
    html: baseTemplate("Subscription Renewal Reminder", body),
  };
}

export function addressChangeConfirmationEmail(params: {
  productTitle: string;
  newAddress: string;
  buyerName?: string;
  subscriptionId?: string;
}): { subject: string; html: string } {
  const greeting = params.buyerName
    ? `Hi ${esc(params.buyerName)},`
    : "Hi there,";

  const body = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">${greeting}</h2>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">Your shipping address for your <strong>${esc(
      params.productTitle
    )}</strong> subscription has been updated.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td style="padding:8px 0;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">New Shipping Address</p>
          <p style="margin:0;color:#111827;font-size:15px;">${esc(
            params.newAddress
          )}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">The seller has been notified of this change. Your next delivery will be shipped to the new address.</p>`;

  return {
    subject: `Address Updated - ${esc(params.productTitle)} Subscription`,
    html: baseTemplate("Address Change Confirmation", body),
  };
}

export function subscriptionCancellationEmail(params: {
  productTitle: string;
  buyerName?: string;
  endDate: string;
  subscriptionId?: string;
}): { subject: string; html: string } {
  const greeting = params.buyerName
    ? `Hi ${esc(params.buyerName)},`
    : "Hi there,";

  const body = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">${greeting}</h2>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">Your subscription to <strong>${esc(
      params.productTitle
    )}</strong> has been canceled.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0 0 8px;color:#991b1b;font-size:14px;font-weight:600;">Cancellation Details</p>
          <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Product:</strong> ${esc(
            params.productTitle
          )}</p>
          <p style="margin:0;color:#374151;font-size:14px;"><strong>Access Until:</strong> ${esc(
            params.endDate
          )}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">You will continue to receive your subscription benefits until ${esc(
      params.endDate
    )}. After that, no further charges will be made.</p>
    <p style="margin:16px 0 0;color:#374151;font-size:15px;line-height:1.6;">If you change your mind, you can resubscribe anytime from the product listing on Milk Market.</p>`;

  return {
    subject: `Subscription Canceled - ${esc(params.productTitle)}`,
    html: baseTemplate("Subscription Canceled", body),
  };
}

export function orderUpdateEmail(params: {
  orderId: string;
  productTitle: string;
  updateType: "shipping" | "status" | "message";
  message: string;
  trackingNumber?: string;
  carrier?: string;
  estimatedDelivery?: string;
}): { subject: string; html: string } {
  let updateTitle = "Order Update";
  let subjectLine = `Order Update - ${esc(params.productTitle)}`;

  if (params.updateType === "shipping") {
    updateTitle = "Shipping Update";
    subjectLine = `Shipped - ${esc(params.productTitle)} (#${esc(
      params.orderId.slice(0, 8)
    )})`;
  } else if (params.updateType === "status") {
    updateTitle = "Order Status Update";
    subjectLine = `Status Update - ${esc(params.productTitle)} (#${esc(
      params.orderId.slice(0, 8)
    )})`;
  }

  const trackingSection =
    params.trackingNumber && params.carrier
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:24px 0;">
        <tr>
          <td>
            <p style="margin:0 0 8px;color:#166534;font-size:14px;font-weight:600;">Tracking Information</p>
            <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Carrier:</strong> ${esc(
              params.carrier
            )}</p>
            <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Tracking #:</strong> ${esc(
              params.trackingNumber
            )}</p>
            ${
              params.estimatedDelivery
                ? `<p style="margin:0;color:#374151;font-size:14px;"><strong>Est. Delivery:</strong> ${esc(
                    params.estimatedDelivery
                  )}</p>`
                : ""
            }
          </td>
        </tr>
      </table>`
      : "";

  const body = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">${updateTitle}</h2>
    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Order #${esc(
      params.orderId.slice(0, 8)
    )} &bull; ${esc(params.productTitle)}</p>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">${esc(
      params.message
    )}</p>
    ${trackingSection}
    <p style="margin:24px 0 0;color:#374151;font-size:15px;line-height:1.6;">Check your Milk Market orders page for more details.</p>`;

  return {
    subject: subjectLine,
    html: baseTemplate(updateTitle, body),
  };
}

export function returnRequestEmail(params: {
  orderId: string;
  productTitle: string;
  requestType: "return" | "refund" | "exchange";
  message: string;
  buyerName?: string;
}): { subject: string; html: string } {
  const typeLabel =
    params.requestType === "return"
      ? "Return"
      : params.requestType === "refund"
        ? "Refund"
        : "Exchange";

  const buyerInfo = esc(params.buyerName || "A buyer");

  const body = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">${typeLabel} Request Received</h2>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">${buyerInfo} has requested a <strong>${typeLabel.toLowerCase()}</strong> for an order.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0 0 8px;color:#92400e;font-size:14px;font-weight:600;">${typeLabel} Details</p>
          <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Order ID:</strong> ${esc(
            params.orderId
          )}</p>
          <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Product:</strong> ${esc(
            params.productTitle
          )}</p>
          <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Type:</strong> ${typeLabel}</p>
        </td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0 0 8px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Buyer's Message</p>
          <p style="margin:0;color:#111827;font-size:15px;line-height:1.6;white-space:pre-wrap;">${esc(
            params.message
          )}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">Please respond to this request by messaging the buyer directly through ${BRAND_NAME}.</p>`;

  return {
    subject: `${typeLabel} Request - ${esc(params.productTitle)} (#${esc(
      params.orderId.slice(0, 8)
    )})`,
    html: baseTemplate(`${typeLabel} Request`, body),
  };
}

export function inquiryNotificationEmail(params: {
  senderName: string;
  message: string;
  senderHasEmail: boolean;
}): { subject: string; html: string } {
  const replyNote = params.senderHasEmail
    ? `<p style="margin:16px 0 0;color:#374151;font-size:15px;line-height:1.6;">You can reply directly to this email to respond, or message them through ${BRAND_NAME}.</p>`
    : `<p style="margin:16px 0 0;color:#374151;font-size:15px;line-height:1.6;">This person does not have an email on file. To reply, please message them directly through the <strong>Inquiries</strong> chat on ${BRAND_NAME}.</p>`;

  const body = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">New Message</h2>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">You have a new inquiry from <strong>${esc(
      params.senderName
    )}</strong>.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;padding:20px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0 0 8px;color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Message</p>
          <p style="margin:0;color:#111827;font-size:15px;line-height:1.6;white-space:pre-wrap;">${esc(
            params.message
          )}</p>
        </td>
      </tr>
    </table>
    ${replyNote}`;

  return {
    subject: `New inquiry from ${esc(params.senderName)} on ${BRAND_NAME}`,
    html: baseTemplate("New Inquiry", body),
  };
}

export function popupDiscountEmail(params: {
  discountCode: string;
  discountPercentage: number;
  shopName: string;
}): { subject: string; html: string } {
  const body = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">Welcome! Here's your discount code</h2>
    <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
      Thanks for signing up! Use the code below to get <strong>${
        params.discountPercentage
      }% off</strong> your next order at <strong>${esc(
        params.shopName
      )}</strong>.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td align="center">
          <div style="display:inline-block;background-color:#f0fdf4;border:2px dashed #22c55e;border-radius:8px;padding:16px 32px;">
            <p style="margin:0 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;">Your Discount Code</p>
            <p style="margin:0;color:#111827;font-size:24px;font-weight:700;font-family:monospace;letter-spacing:0.05em;">${esc(
              params.discountCode
            )}</p>
          </div>
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
      Enter this code at checkout to apply your discount. This code expires in 90 days.
    </p>`;

  return {
    subject: `Your ${params.discountPercentage}% Off Discount Code from ${esc(
      params.shopName
    )}`,
    html: baseTemplate("Your Discount Code", body),
  };
}

export function paymentFailedBuyerEmail(params: {
  invoiceId: string;
  subscriptionId?: string;
  amountDisplay?: string;
}): {
  subject: string;
  html: string;
} {
  const body = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:700;">Payment Failed</h2>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      We were unable to process your recent payment${
        params.amountDisplay
          ? ` of <strong>${esc(params.amountDisplay)}</strong>`
          : ""
      }. Please update your payment method to avoid any interruption to your order or subscription.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border-radius:8px;padding:16px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0 0 8px;color:#991b1b;font-size:14px;font-weight:600;">Details</p>
          <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Invoice:</strong> ${esc(
            params.invoiceId
          )}</p>
          ${
            params.subscriptionId
              ? `<p style="margin:0;color:#374151;font-size:14px;"><strong>Subscription:</strong> ${esc(
                  params.subscriptionId
                )}</p>`
              : ""
          }
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
      If you believe this is an error, please check with your card issuer or try a different payment method.
    </p>`;

  return {
    subject: `${BRAND_NAME} — Payment Failed`,
    html: baseTemplate("Payment Failed", body),
  };
}

export function paymentFailedSellerEmail(params: {
  invoiceId: string;
  subscriptionId?: string;
  customerEmail?: string;
  amountDisplay?: string;
}): {
  subject: string;
  html: string;
} {
  const body = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:700;">Customer Payment Failed</h2>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      A payment from ${
        params.customerEmail
          ? `<strong>${esc(params.customerEmail)}</strong>`
          : "a customer"
      }${
        params.amountDisplay
          ? ` for <strong>${esc(params.amountDisplay)}</strong>`
          : ""
      } has failed. The customer has been notified to update their payment method.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border-radius:8px;padding:16px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0 0 8px;color:#991b1b;font-size:14px;font-weight:600;">Details</p>
          <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Invoice:</strong> ${esc(
            params.invoiceId
          )}</p>
          ${
            params.subscriptionId
              ? `<p style="margin:0;color:#374151;font-size:14px;"><strong>Subscription:</strong> ${esc(
                  params.subscriptionId
                )}</p>`
              : ""
          }
        </td>
      </tr>
    </table>
    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
      No action is required from you at this time. The customer will need to resolve the payment issue on their end.
    </p>`;

  return {
    subject: `${BRAND_NAME} — Customer Payment Failed`,
    html: baseTemplate("Customer Payment Failed", body),
  };
}

export function transferFailureAlertEmail(params: {
  subscriptionId: string;
  invoiceId: string;
  failures: Array<{
    sellerPubkey: string;
    amountCents: number;
    error: string;
  }>;
}): {
  subject: string;
  html: string;
} {
  const failureRows = params.failures
    .map(
      (f) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:13px;font-family:monospace;">${esc(
          f.sellerPubkey.substring(0, 12)
        )}...</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:13px;">$${(
          f.amountCents / 100
        ).toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#991b1b;font-size:13px;">${esc(
          f.error
        )}</td>
      </tr>`
    )
    .join("");

  const body = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:700;">Seller Transfer Failure Alert</h2>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      One or more seller transfers failed during subscription renewal processing. Manual intervention may be required.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border-radius:8px;padding:16px;margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0 0 4px;color:#374151;font-size:14px;"><strong>Subscription:</strong> ${esc(
            params.subscriptionId
          )}</p>
          <p style="margin:0;color:#374151;font-size:14px;"><strong>Invoice:</strong> ${esc(
            params.invoiceId
          )}</p>
        </td>
      </tr>
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr style="background-color:#f9fafb;">
        <th style="padding:8px 12px;text-align:left;color:#6b7280;font-size:12px;text-transform:uppercase;">Seller</th>
        <th style="padding:8px 12px;text-align:left;color:#6b7280;font-size:12px;text-transform:uppercase;">Amount</th>
        <th style="padding:8px 12px;text-align:left;color:#6b7280;font-size:12px;text-transform:uppercase;">Error</th>
      </tr>
      ${failureRows}
    </table>
    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
      Please review these failures in the Stripe dashboard and process the transfers manually if needed.
    </p>`;

  return {
    subject: `${BRAND_NAME} — Seller Transfer Failure Alert`,
    html: baseTemplate("Transfer Failure Alert", body),
  };
}

// ---------------------------------------------------------------------------
// Affiliate program emails
// ---------------------------------------------------------------------------

function formatPayoutAmount(amountSmallest: number, currency: string): string {
  const c = currency.toLowerCase();
  if (c === "sats") return `${amountSmallest.toLocaleString()} sats`;
  // Treat everything else as a fiat ISO code with cents.
  const major = (amountSmallest / 100).toFixed(2);
  return `${major} ${currency.toUpperCase()}`;
}

function unsubscribeFooter(unsubscribeUrl?: string | null): string {
  if (!unsubscribeUrl) return "";
  return `
    <p style="margin:16px 0 0;color:#9ca3af;font-size:12px;line-height:1.5;">
      Don't want these emails?
      <a href="${esc(unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;">Unsubscribe in one click</a>.
    </p>`;
}

export function affiliatePaidEmail(params: {
  affiliateName: string;
  amountSmallest: number;
  currency: string;
  method: "stripe" | "lightning" | "manual";
  externalRef?: string | null;
  unsubscribeUrl?: string | null;
}): { subject: string; html: string; headers?: Record<string, string> } {
  const amount = formatPayoutAmount(params.amountSmallest, params.currency);
  const methodLabel =
    params.method === "stripe"
      ? "Stripe Connect"
      : params.method === "lightning"
        ? "Lightning"
        : "manual settlement";
  const ref = params.externalRef
    ? `<p style="margin:0 0 8px;color:#6b7280;font-size:13px;">Reference: <code>${esc(params.externalRef)}</code></p>`
    : "";
  const body = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:700;">You just got paid</h2>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      Hi ${esc(params.affiliateName)}, an affiliate payout of
      <strong>${esc(amount)}</strong> was just sent to you via ${esc(methodLabel)}.
    </p>
    ${ref}
    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
      Funds typically appear in your account within 1–2 business days for
      Stripe, or instantly for Lightning. Reach out to the seller if you
      don't see them.
    </p>
    ${unsubscribeFooter(params.unsubscribeUrl)}`;
  return {
    subject: `${BRAND_NAME} — Affiliate payout sent (${amount})`,
    html: baseTemplate("Affiliate payout sent", body),
    headers: params.unsubscribeUrl
      ? {
          "List-Unsubscribe": `<${params.unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : undefined,
  };
}

export function affiliatePausedToAffiliateEmail(params: {
  affiliateName: string;
  reason: string;
  unsubscribeUrl?: string | null;
}): { subject: string; html: string; headers?: Record<string, string> } {
  const body = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:700;">Your payouts have been paused</h2>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      Hi ${esc(params.affiliateName)}, automated payouts on your affiliate
      account have been paused after several consecutive failures.
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      Last error reported: <em>${esc(params.reason)}</em>
    </p>
    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
      Please open your affiliate self-service link and double-check your
      Lightning address or Stripe Connect account, then reach out to the
      seller to re-enable payouts.
    </p>
    ${unsubscribeFooter(params.unsubscribeUrl)}`;
  return {
    subject: `${BRAND_NAME} — Affiliate payouts paused`,
    html: baseTemplate("Affiliate payouts paused", body),
    headers: params.unsubscribeUrl
      ? {
          "List-Unsubscribe": `<${params.unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : undefined,
  };
}

export function affiliatePausedToSellerEmail(params: {
  affiliateName: string;
  reason: string;
  failureCount: number;
}): { subject: string; html: string } {
  const body = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:700;">Affiliate payouts paused</h2>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      Automated payouts to your affiliate <strong>${esc(params.affiliateName)}</strong>
      have been paused after ${params.failureCount} consecutive failed
      attempts.
    </p>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      Last error: <em>${esc(params.reason)}</em>
    </p>
    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
      Open the Affiliates tab in your dashboard to investigate and
      re-enable payouts once the underlying issue is resolved.
    </p>`;
  return {
    subject: `${BRAND_NAME} — Affiliate payouts paused (${esc(params.affiliateName)})`,
    html: baseTemplate("Affiliate payouts paused", body),
  };
}

export function accountRecoveryEmail(params: { recoveryLink: string }): {
  subject: string;
  html: string;
} {
  const body = `
    <h2 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:700;">Account Recovery Request</h2>
    <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
      We received a request to recover your ${BRAND_NAME} account. Click the button below to continue with the recovery process.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td style="background-color:#000000;border-radius:6px;padding:12px 24px;">
          <a href="${esc(
            params.recoveryLink
          )}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;display:inline-block;">
            Recover My Account
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.5;">
      This link will expire in 1 hour. If you did not request this, you can safely ignore this email.
    </p>
    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
      You will need your recovery key to complete the process. If you have lost your recovery key, account recovery is not possible.
    </p>`;

  return {
    subject: `${BRAND_NAME} — Account Recovery`,
    html: baseTemplate("Account Recovery", body),
  };
}
