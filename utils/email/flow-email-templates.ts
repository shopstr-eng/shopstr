export type FlowType =
  | "welcome_series"
  | "abandoned_cart"
  | "post_purchase"
  | "winback"
  | "one_time";

export interface MergeTagData {
  buyer_name?: string;
  shop_name?: string;
  product_title?: string;
  order_id?: string;
  product_image?: string;
  shop_url?: string;
  [key: string]: string | undefined;
}

export interface FlowStepTemplate {
  step_order: number;
  subject: string;
  body_html: string;
  delay_hours: number;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const MERGE_TAG_DEFAULTS: Record<string, string> = {
  buyer_name: "Milk Enjoyer",
  shop_name: "Milk Market",
  product_title: "your creamy goodness",
  order_id: "",
  product_image: "",
  shop_url: "",
};

export function replaceMergeTags(template: string, data: MergeTagData): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    const value = data[key];
    if (value !== undefined && value !== "") return escapeHtml(value);
    const fallback = MERGE_TAG_DEFAULTS[key];
    if (fallback !== undefined) return escapeHtml(fallback);
    return "";
  });
}

export interface FlowEmailStorefrontStyle {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  text?: string;
  neoShadows?: boolean;
}

// Pick a readable text color (black or white) for a given hex background.
function pickContrastColor(hex: string): string {
  const m = hex.replace("#", "").match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return "#ffffff";
  let h = m[1]!;
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Relative luminance, sRGB approximation
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111827" : "#ffffff";
}

function flowBaseTemplate(
  title: string,
  bodyContent: string,
  shopName: string,
  style?: FlowEmailStorefrontStyle
): string {
  const headerBg = style?.secondary || "#000000";
  const headerText = style?.background
    ? pickContrastColor(headerBg)
    : "#ffffff";
  const cardBg = style?.background || "#ffffff";
  const bodyText = style?.text || "#374151";
  const pageBg = "#f4f4f5";
  const footerBg = style?.background ? cardBg : "#f9fafb";
  const footerText = style?.text ? `${style.text}99` : "#9ca3af";
  const accentBorder = style?.accent || "#e5e7eb";
  const cardShadow =
    style?.neoShadows && style?.secondary
      ? `box-shadow:6px 6px 0 ${style.secondary};border:2px solid ${style.secondary};`
      : `box-shadow:0 2px 8px rgba(0,0,0,0.08);`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:${pageBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${bodyText};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${pageBg};padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:${cardBg};border-radius:8px;overflow:hidden;${cardShadow}">
          <tr>
            <td style="background-color:${headerBg};padding:24px 32px;text-align:center;">
              <h1 style="margin:0;color:${headerText};font-size:24px;font-weight:700;">${escapeHtml(
                shopName
              )}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:${bodyText};">
              ${bodyContent}
            </td>
          </tr>
          <tr>
            <td style="background-color:${footerBg};padding:20px 32px;text-align:center;border-top:1px solid ${accentBorder};">
              <p style="margin:0;color:${footerText};font-size:12px;">You received this email from ${escapeHtml(
                shopName
              )}. Sent via Milk Market.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Recolor the default-template CTA buttons (black bg / white text) to the
// seller's storefront colors. Only touches the exact inline styles we ship in
// the defaults — sellers' custom colors in their edited body are left alone.
function applyStorefrontButtonColors(
  html: string,
  style: FlowEmailStorefrontStyle
): string {
  if (!style.primary && !style.secondary) return html;
  const btnBg = style.primary || style.secondary || "#000000";
  const btnText = pickContrastColor(btnBg);
  return html
    .replace(
      /background-color:#000000;border-radius:6px;padding:12px 24px;/g,
      `background-color:${btnBg};border-radius:6px;padding:12px 24px;`
    )
    .replace(
      /color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;/g,
      `color:${btnText};text-decoration:none;font-size:15px;font-weight:600;`
    );
}

export function renderFlowEmail(
  subject: string,
  bodyHtml: string,
  data: MergeTagData,
  style?: FlowEmailStorefrontStyle
): { subject: string; html: string } {
  const renderedSubject = replaceMergeTags(subject, data);
  let renderedBody = replaceMergeTags(bodyHtml, data);
  const shopName = data.shop_name || "Milk Market";

  if (style) {
    renderedBody = applyStorefrontButtonColors(renderedBody, style);
  }

  return {
    subject: renderedSubject,
    html: flowBaseTemplate(renderedSubject, renderedBody, shopName, style),
  };
}

const WELCOME_SERIES_DEFAULTS: FlowStepTemplate[] = [
  {
    step_order: 1,
    subject: "Welcome to {{shop_name}}!",
    body_html: `<h2 style="margin:0 0 16px;color:#111827;font-size:20px;">Hi {{buyer_name}},</h2>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Welcome to {{shop_name}}! We're thrilled to have you as a customer.</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">We take pride in offering high-quality products and an exceptional shopping experience. If you ever have questions, don't hesitate to reach out.</p>
<p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">Happy shopping!</p>`,
    delay_hours: 0,
  },
  {
    step_order: 2,
    subject: "Check out what's popular at {{shop_name}}",
    body_html: `<h2 style="margin:0 0 16px;color:#111827;font-size:20px;">Hi {{buyer_name}},</h2>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">We wanted to share some of our most popular products with you. Our customers love these picks, and we think you will too!</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Browse our full selection and find your next favorite item.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background-color:#000000;border-radius:6px;padding:12px 24px;">
      <a href="{{shop_url}}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">Visit Our Shop</a>
    </td>
  </tr>
</table>`,
    delay_hours: 48,
  },
  {
    step_order: 3,
    subject: "Join the {{shop_name}} community",
    body_html: `<h2 style="margin:0 0 16px;color:#111827;font-size:20px;">Hi {{buyer_name}},</h2>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Did you know {{shop_name}} has a community of like-minded shoppers? Join us to get early access to new products, exclusive deals, and connect with other customers.</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">We'd love to see you there!</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background-color:#000000;border-radius:6px;padding:12px 24px;">
      <a href="{{shop_url}}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">Join Our Community</a>
    </td>
  </tr>
</table>`,
    delay_hours: 120,
  },
];

const ABANDONED_CART_DEFAULTS: FlowStepTemplate[] = [
  {
    step_order: 1,
    subject: "You left something behind at {{shop_name}}",
    body_html: `<h2 style="margin:0 0 16px;color:#111827;font-size:20px;">Hi {{buyer_name}},</h2>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">It looks like you were interested in <strong>{{product_title}}</strong> but didn't complete your purchase. No worries — your item is still waiting for you!</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background-color:#000000;border-radius:6px;padding:12px 24px;">
      <a href="{{shop_url}}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">Complete Your Purchase</a>
    </td>
  </tr>
</table>`,
    delay_hours: 2,
  },
  {
    step_order: 2,
    subject: "Last chance — {{product_title}} is selling fast!",
    body_html: `<h2 style="margin:0 0 16px;color:#111827;font-size:20px;">Hi {{buyer_name}},</h2>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Just a friendly reminder that <strong>{{product_title}}</strong> is still in your cart. These items are popular and tend to sell out quickly.</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Don't miss out — grab yours before it's gone!</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background-color:#000000;border-radius:6px;padding:12px 24px;">
      <a href="{{shop_url}}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">Shop Now</a>
    </td>
  </tr>
</table>`,
    delay_hours: 24,
  },
];

const POST_PURCHASE_DEFAULTS: FlowStepTemplate[] = [
  {
    step_order: 1,
    subject: "Thank you for your order from {{shop_name}}!",
    body_html: `<h2 style="margin:0 0 16px;color:#111827;font-size:20px;">Hi {{buyer_name}},</h2>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Thank you for purchasing <strong>{{product_title}}</strong>! We hope you love it.</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Here are a few tips to get the most out of your purchase:</p>
<ul style="margin:0 0 16px;padding-left:20px;color:#374151;font-size:15px;line-height:1.8;">
  <li>Check your order status anytime from your orders page</li>
  <li>Reach out to the seller directly if you have any questions</li>
  <li>Follow {{shop_name}} to stay updated on new products</li>
</ul>
<p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">Enjoy!</p>`,
    delay_hours: 1,
  },
  {
    step_order: 2,
    subject: "How was your experience with {{shop_name}}?",
    body_html: `<h2 style="margin:0 0 16px;color:#111827;font-size:20px;">Hi {{buyer_name}},</h2>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">We hope you're enjoying <strong>{{product_title}}</strong>! Your feedback means a lot to us and helps other shoppers make informed decisions.</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Would you take a moment to leave a review? It only takes a minute and helps support {{shop_name}}.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background-color:#000000;border-radius:6px;padding:12px 24px;">
      <a href="{{shop_url}}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">Leave a Review</a>
    </td>
  </tr>
</table>`,
    delay_hours: 168,
  },
];

const WINBACK_DEFAULTS: FlowStepTemplate[] = [
  {
    step_order: 1,
    subject: "We miss you at {{shop_name}}!",
    body_html: `<h2 style="margin:0 0 16px;color:#111827;font-size:20px;">Hi {{buyer_name}},</h2>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">It's been a while since your last visit to {{shop_name}}, and we wanted to let you know we've been adding some great new products.</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Come back and see what's new — we think you'll find something you love!</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background-color:#000000;border-radius:6px;padding:12px 24px;">
      <a href="{{shop_url}}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">See What's New</a>
    </td>
  </tr>
</table>`,
    delay_hours: 0,
  },
  {
    step_order: 2,
    subject: "A special offer just for you from {{shop_name}}",
    body_html: `<h2 style="margin:0 0 16px;color:#111827;font-size:20px;">Hi {{buyer_name}},</h2>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">We really value you as a customer and would love to welcome you back to {{shop_name}}.</p>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">As a thank you for being part of our community, we'd like to offer you something special on your next order. Visit our shop to see the latest offerings!</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background-color:#000000;border-radius:6px;padding:12px 24px;">
      <a href="{{shop_url}}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">Claim Your Offer</a>
    </td>
  </tr>
</table>`,
    delay_hours: 168,
  },
];

const ONE_TIME_DEFAULTS: FlowStepTemplate[] = [
  {
    step_order: 1,
    subject: "A message from {{shop_name}}",
    body_html: `<h2 style="margin:0 0 16px;color:#111827;font-size:20px;">Hi {{buyer_name}},</h2>
<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Write your message here. This is a one-time email you can send to your contacts whenever you like.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background-color:#000000;border-radius:6px;padding:12px 24px;">
      <a href="{{shop_url}}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">Visit Our Shop</a>
    </td>
  </tr>
</table>`,
    delay_hours: 0,
  },
];

const DEFAULT_TEMPLATES: Record<FlowType, FlowStepTemplate[]> = {
  welcome_series: WELCOME_SERIES_DEFAULTS,
  abandoned_cart: ABANDONED_CART_DEFAULTS,
  post_purchase: POST_PURCHASE_DEFAULTS,
  winback: WINBACK_DEFAULTS,
  one_time: ONE_TIME_DEFAULTS,
};

export function getDefaultFlowSteps(flowType: FlowType): FlowStepTemplate[] {
  return DEFAULT_TEMPLATES[flowType].map((step) => ({ ...step }));
}
