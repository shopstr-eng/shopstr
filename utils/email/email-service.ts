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
  OrderEmailParams,
  SubscriptionEmailParams,
} from "./email-templates";

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  replyTo?: string
): Promise<boolean> {
  try {
    const { client, fromEmail } = await getUncachableSendGridClient();
    const msg: any = {
      to,
      from: fromEmail,
      subject,
      html,
    };
    if (replyTo) {
      msg.replyTo = replyTo;
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
  params: OrderEmailParams
): Promise<boolean> {
  const { subject, html } = orderConfirmationEmail(params);
  return sendEmail(buyerEmail, subject, html);
}

export async function sendNewOrderToSeller(
  sellerEmail: string,
  params: OrderEmailParams
): Promise<boolean> {
  const { subject, html } = sellerNewOrderEmail(params);
  return sendEmail(sellerEmail, subject, html);
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
  }
): Promise<boolean> {
  const { subject, html } = orderUpdateEmail(params);
  return sendEmail(buyerEmail, subject, html);
}

export async function sendSubscriptionConfirmation(
  buyerEmail: string,
  params: SubscriptionEmailParams
): Promise<boolean> {
  const { subject, html } = subscriptionConfirmationEmail(params);
  return sendEmail(buyerEmail, subject, html);
}

export async function sendRenewalReminder(
  buyerEmail: string,
  params: SubscriptionEmailParams
): Promise<boolean> {
  const { subject, html } = renewalReminderEmail(params);
  return sendEmail(buyerEmail, subject, html);
}

export async function sendAddressChangeConfirmation(
  buyerEmail: string,
  params: {
    productTitle: string;
    newAddress: string;
    buyerName?: string;
    subscriptionId?: string;
  }
): Promise<boolean> {
  const { subject, html } = addressChangeConfirmationEmail(params);
  return sendEmail(buyerEmail, subject, html);
}

export async function sendSubscriptionCancellation(
  buyerEmail: string,
  params: {
    productTitle: string;
    buyerName?: string;
    endDate: string;
    subscriptionId?: string;
  }
): Promise<boolean> {
  const { subject, html } = subscriptionCancellationEmail(params);
  return sendEmail(buyerEmail, subject, html);
}

export async function sendInquiryNotification(
  recipientEmail: string,
  params: {
    senderName: string;
    message: string;
    senderHasEmail: boolean;
    senderEmail?: string;
  }
): Promise<boolean> {
  const { subject, html } = inquiryNotificationEmail({
    senderName: params.senderName,
    message: params.message,
    senderHasEmail: params.senderHasEmail,
  });
  return sendEmail(recipientEmail, subject, html, params.senderEmail);
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
  }
): Promise<boolean> {
  const { subject, html } = returnRequestEmail(params);
  return sendEmail(sellerEmail, subject, html);
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
