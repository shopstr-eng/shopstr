import { getUncachableSendGridClient } from "./sendgrid-client";
import {
  orderConfirmationEmail,
  sellerNewOrderEmail,
  orderUpdateEmail,
  subscriptionConfirmationEmail,
  renewalReminderEmail,
  addressChangeConfirmationEmail,
  subscriptionCancellationEmail,
  returnRequestEmail,
  inquiryNotificationEmail,
  accountRecoveryEmail,
  paymentFailedBuyerEmail,
  paymentFailedSellerEmail,
  transferFailureAlertEmail,
  customDomainAdminNotificationEmail,
  affiliatePaidEmail,
  affiliatePausedToAffiliateEmail,
  affiliatePausedToSellerEmail,
  OrderEmailParams,
  SubscriptionEmailParams,
  StorefrontBranding,
} from "./email-templates";

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  replyTo?: string,
  headers?: Record<string, string>,
  fromName?: string
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getUncachableSendGridClient();
    // Sanitize the display name to keep SendGrid happy: strip control chars
    // and newlines, cap length. Fall back to bare email if nothing usable.
    const safeFromName = fromName
      ? fromName
          .replace(/[\r\n\t\u0000-\u001F]/g, " ")
          .slice(0, 78)
          .trim()
      : "";
    const msg: any = {
      to,
      from: safeFromName ? { email: fromEmail, name: safeFromName } : fromEmail,
      subject,
      html,
    };
    if (replyTo) {
      msg.replyTo = replyTo;
    }
    if (headers && Object.keys(headers).length > 0) {
      // SendGrid honors RFC headers passed via the `headers` field. Required
      // for List-Unsubscribe / RFC 8058 one-click compliance on Gmail/Yahoo.
      msg.headers = headers;
    }
    await client.send(msg);
    return true;
  } catch (error) {
    console.error("Failed to send email:", error);
    return false;
  }
}

export async function sendOrderConfirmationToBuyer(
  buyerEmail: string,
  params: OrderEmailParams,
  branding?: StorefrontBranding | null,
  replyTo?: string
): Promise<boolean> {
  const { subject, html } = orderConfirmationEmail(params, branding);
  return sendEmail(
    buyerEmail,
    subject,
    html,
    replyTo,
    undefined,
    branding?.shopName
  );
}

export async function sendNewOrderToSeller(
  sellerEmail: string,
  params: OrderEmailParams,
  branding?: StorefrontBranding | null,
  replyTo?: string
): Promise<boolean> {
  const { subject, html } = sellerNewOrderEmail(params, branding);
  return sendEmail(
    sellerEmail,
    subject,
    html,
    replyTo,
    undefined,
    branding?.shopName
  );
}

export async function sendOrderUpdateToBuyer(
  buyerEmail: string,
  params: {
    orderId: string;
    productTitle: string;
    updateType: "shipping" | "status" | "message";
    message: string;
    trackingNumber?: string;
    carrier?: string;
    estimatedDelivery?: string;
  },
  branding?: StorefrontBranding | null
): Promise<boolean> {
  const { subject, html } = orderUpdateEmail(params, branding);
  return sendEmail(
    buyerEmail,
    subject,
    html,
    undefined,
    undefined,
    branding?.shopName
  );
}

export async function sendSubscriptionConfirmation(
  buyerEmail: string,
  params: SubscriptionEmailParams,
  branding?: StorefrontBranding | null
): Promise<boolean> {
  const { subject, html } = subscriptionConfirmationEmail(params, branding);
  return sendEmail(
    buyerEmail,
    subject,
    html,
    undefined,
    undefined,
    branding?.shopName
  );
}

export async function sendRenewalReminder(
  buyerEmail: string,
  params: SubscriptionEmailParams,
  branding?: StorefrontBranding | null
): Promise<boolean> {
  const { subject, html } = renewalReminderEmail(params, branding);
  return sendEmail(
    buyerEmail,
    subject,
    html,
    undefined,
    undefined,
    branding?.shopName
  );
}

export async function sendAddressChangeConfirmation(
  buyerEmail: string,
  params: {
    productTitle: string;
    newAddress: string;
    buyerName?: string;
    subscriptionId?: string;
  },
  branding?: StorefrontBranding | null
): Promise<boolean> {
  const { subject, html } = addressChangeConfirmationEmail(params, branding);
  return sendEmail(
    buyerEmail,
    subject,
    html,
    undefined,
    undefined,
    branding?.shopName
  );
}

export async function sendSubscriptionCancellation(
  buyerEmail: string,
  params: {
    productTitle: string;
    buyerName?: string;
    endDate: string;
    subscriptionId?: string;
  },
  branding?: StorefrontBranding | null
): Promise<boolean> {
  const { subject, html } = subscriptionCancellationEmail(params, branding);
  return sendEmail(
    buyerEmail,
    subject,
    html,
    undefined,
    undefined,
    branding?.shopName
  );
}

export async function sendInquiryNotification(
  recipientEmail: string,
  params: {
    senderName: string;
    message: string;
    senderHasEmail: boolean;
    senderEmail?: string;
  },
  branding?: StorefrontBranding | null
): Promise<boolean> {
  const { subject, html } = inquiryNotificationEmail(
    {
      senderName: params.senderName,
      message: params.message,
      senderHasEmail: params.senderHasEmail,
    },
    branding
  );
  return sendEmail(
    recipientEmail,
    subject,
    html,
    params.senderEmail,
    undefined,
    branding?.shopName
  );
}

export async function sendRecoveryEmail(
  recipientEmail: string,
  recoveryLink: string
): Promise<boolean> {
  const { subject, html } = accountRecoveryEmail({ recoveryLink });
  return sendEmail(recipientEmail, subject, html);
}

export async function sendReturnRequestToSeller(
  sellerEmail: string,
  params: {
    orderId: string;
    productTitle: string;
    requestType: "return" | "refund" | "exchange";
    message: string;
    buyerName?: string;
  },
  branding?: StorefrontBranding | null
): Promise<boolean> {
  const { subject, html } = returnRequestEmail(params, branding);
  return sendEmail(
    sellerEmail,
    subject,
    html,
    undefined,
    undefined,
    branding?.shopName
  );
}

export async function sendPaymentFailedToBuyer(
  buyerEmail: string,
  params: {
    invoiceId: string;
    subscriptionId?: string;
    amountDisplay?: string;
  }
): Promise<boolean> {
  const { subject, html } = paymentFailedBuyerEmail(params);
  return sendEmail(buyerEmail, subject, html);
}

export async function sendPaymentFailedToSeller(
  sellerEmail: string,
  params: {
    invoiceId: string;
    subscriptionId?: string;
    customerEmail?: string;
    amountDisplay?: string;
  }
): Promise<boolean> {
  const { subject, html } = paymentFailedSellerEmail(params);
  return sendEmail(sellerEmail, subject, html);
}

export async function sendAffiliatePaidEmail(
  affiliateEmail: string,
  params: {
    affiliateName: string;
    amountSmallest: number;
    currency: string;
    method: "stripe" | "lightning" | "manual";
    externalRef?: string | null;
    unsubscribeUrl?: string | null;
  }
): Promise<boolean> {
  const { subject, html, headers } = affiliatePaidEmail(params);
  return sendEmail(affiliateEmail, subject, html, undefined, headers);
}

export async function sendAffiliatePausedToAffiliate(
  affiliateEmail: string,
  params: {
    affiliateName: string;
    reason: string;
    unsubscribeUrl?: string | null;
  }
): Promise<boolean> {
  const { subject, html, headers } = affiliatePausedToAffiliateEmail(params);
  return sendEmail(affiliateEmail, subject, html, undefined, headers);
}

export async function sendAffiliatePausedToSeller(
  sellerEmail: string,
  params: {
    affiliateName: string;
    reason: string;
    failureCount: number;
  }
): Promise<boolean> {
  const { subject, html } = affiliatePausedToSellerEmail(params);
  return sendEmail(sellerEmail, subject, html);
}

export async function sendCustomDomainAdminNotification(
  adminEmail: string | undefined,
  params: {
    domain: string;
    domainType: "subdomain" | "apex";
    shopSlug: string;
    sellerPubkey: string;
    verificationToken: string;
  }
): Promise<boolean> {
  const { subject, html } = customDomainAdminNotificationEmail(params);
  // Resolve recipient: explicit env > SendGrid verified from_email (which is
  // the operator's own mailbox by definition). This guarantees the notice
  // lands somewhere the operator actually owns even when DOMAINS_ADMIN_EMAIL
  // hasn't been configured.
  let recipient = (adminEmail || "").trim();
  try {
    if (!recipient) {
      const { fromEmail } = await getUncachableSendGridClient();
      recipient = (fromEmail || "").trim();
    }
  } catch (err) {
    console.error(
      "[custom-domain] Failed to resolve admin email recipient:",
      err
    );
    return false;
  }
  if (!recipient) {
    console.error(
      "[custom-domain] No admin email recipient available (set DOMAINS_ADMIN_EMAIL or configure SendGrid from_email)"
    );
    return false;
  }
  const ok = await sendEmail(recipient, subject, html);
  if (!ok) {
    console.error(
      `[custom-domain] sendEmail returned false for admin notification to ${recipient} (domain=${params.domain})`
    );
  } else {
    console.log(
      `[custom-domain] Sent admin notification to ${recipient} for domain ${params.domain}`
    );
  }
  return ok;
}

export async function sendTransferFailureAlert(
  adminEmail: string,
  params: {
    subscriptionId: string;
    invoiceId: string;
    failures: Array<{
      sellerPubkey: string;
      amountCents: number;
      error: string;
    }>;
  }
): Promise<boolean> {
  const { subject, html } = transferFailureAlertEmail(params);
  return sendEmail(adminEmail, subject, html);
}
