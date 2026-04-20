-- Nostr Event Caching Database Schema

-- Products table (kind 30402 - listings)
CREATE TABLE IF NOT EXISTS product_events (
    id TEXT PRIMARY KEY,
    pubkey TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    kind INTEGER NOT NULL,
    tags JSONB NOT NULL,
    content TEXT NOT NULL,
    sig TEXT NOT NULL,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT product_events_kind_check CHECK (kind = 30402)
);

CREATE INDEX IF NOT EXISTS idx_product_events_pubkey ON product_events(pubkey);
CREATE INDEX IF NOT EXISTS idx_product_events_created_at ON product_events(created_at DESC);

-- Reviews table (kind 31555)
CREATE TABLE IF NOT EXISTS review_events (
    id TEXT PRIMARY KEY,
    pubkey TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    kind INTEGER NOT NULL,
    tags JSONB NOT NULL,
    content TEXT NOT NULL,
    sig TEXT NOT NULL,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT review_events_kind_check CHECK (kind = 31555)
);

CREATE INDEX IF NOT EXISTS idx_review_events_pubkey ON review_events(pubkey);

-- Comment/reply events table (kind 1111 - NIP-22)
CREATE TABLE IF NOT EXISTS comment_events (
    id TEXT PRIMARY KEY,
    pubkey TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    kind INTEGER NOT NULL,
    tags JSONB NOT NULL,
    content TEXT NOT NULL,
    sig TEXT NOT NULL,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT comment_events_kind_check CHECK (kind = 1111)
);

CREATE INDEX IF NOT EXISTS idx_comment_events_pubkey ON comment_events(pubkey);

-- Messages table (kind 1059 - gift wrapped DM)
CREATE TABLE IF NOT EXISTS message_events (
    id TEXT PRIMARY KEY,
    pubkey TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    kind INTEGER NOT NULL,
    tags JSONB NOT NULL,
    content TEXT NOT NULL,
    sig TEXT NOT NULL,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT message_events_kind_check CHECK (kind = 1059)
);

CREATE INDEX IF NOT EXISTS idx_message_events_pubkey ON message_events(pubkey);
CREATE INDEX IF NOT EXISTS idx_message_events_created_at ON message_events(created_at DESC);

-- Profile events (kind 0 - user profile, kind 30019 - shop profile)
CREATE TABLE IF NOT EXISTS profile_events (
    id TEXT PRIMARY KEY,
    pubkey TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    kind INTEGER NOT NULL,
    tags JSONB NOT NULL,
    content TEXT NOT NULL,
    sig TEXT NOT NULL,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT profile_events_kind_check CHECK (kind IN (0, 30019))
);

CREATE INDEX IF NOT EXISTS idx_profile_events_pubkey ON profile_events(pubkey);
CREATE INDEX IF NOT EXISTS idx_profile_events_kind ON profile_events(kind);

-- Wallet events (kind 7375 - proofs, kind 7376 - spending history, kind 17375 - wallet config, kind 37375 - wallet state)
CREATE TABLE IF NOT EXISTS wallet_events (
    id TEXT PRIMARY KEY,
    pubkey TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    kind INTEGER NOT NULL,
    tags JSONB NOT NULL,
    content TEXT NOT NULL,
    sig TEXT NOT NULL,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT wallet_events_kind_check CHECK (kind IN (7375, 7376, 17375, 37375))
);

CREATE INDEX IF NOT EXISTS idx_wallet_events_pubkey ON wallet_events(pubkey);
CREATE INDEX IF NOT EXISTS idx_wallet_events_kind ON wallet_events(kind);

-- Community events (kind 34550 - community definition, kind 1111 - posts, kind 4550 - approvals)
CREATE TABLE IF NOT EXISTS community_events (
    id TEXT PRIMARY KEY,
    pubkey TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    kind INTEGER NOT NULL,
    tags JSONB NOT NULL,
    content TEXT NOT NULL,
    sig TEXT NOT NULL,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT community_events_kind_check CHECK (kind IN (34550, 1111, 4550))
);

CREATE INDEX IF NOT EXISTS idx_community_events_pubkey ON community_events(pubkey);
CREATE INDEX IF NOT EXISTS idx_community_events_kind ON community_events(kind);

-- Relay/config events (kind 10002 - relays, kind 10063 - blossom servers, kind 30405 - cart/saved)
CREATE TABLE IF NOT EXISTS config_events (
    id TEXT PRIMARY KEY,
    pubkey TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    kind INTEGER NOT NULL,
    tags JSONB NOT NULL,
    content TEXT NOT NULL,
    sig TEXT NOT NULL,
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT config_events_kind_check CHECK (kind IN (10002, 10063, 30405))
);

CREATE INDEX IF NOT EXISTS idx_config_events_pubkey ON config_events(pubkey);
CREATE INDEX IF NOT EXISTS idx_config_events_kind ON config_events(kind);

-- Discount codes table
CREATE TABLE IF NOT EXISTS discount_codes (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL,
    pubkey TEXT NOT NULL,
    discount_percentage DECIMAL(5,2) NOT NULL CHECK (discount_percentage > 0 AND discount_percentage <= 100),
    expiration BIGINT,
    max_uses INTEGER DEFAULT NULL,
    times_used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(code, pubkey)
);

CREATE INDEX IF NOT EXISTS idx_discount_codes_pubkey ON discount_codes(pubkey);
CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code);

-- Failed relay publish tracking table
CREATE TABLE IF NOT EXISTS failed_relay_publishes (
    event_id TEXT PRIMARY KEY,
    event_data TEXT,
    relays TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    retry_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_failed_relay_publishes_created_at ON failed_relay_publishes(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_failed_relay_publishes_retry_count ON failed_relay_publishes(retry_count);

-- Signups table
CREATE TABLE IF NOT EXISTS signups (
  id SERIAL PRIMARY KEY,
  contact VARCHAR(255) NOT NULL UNIQUE,
  contact_type VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_auth (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  pubkey VARCHAR(64) NOT NULL,
  encrypted_nsec TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS oauth_auth (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  provider_user_id VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  pubkey VARCHAR(64) NOT NULL,
  encrypted_nsec TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_user_id)
);

-- Notification emails for buyers and sellers
CREATE TABLE IF NOT EXISTS notification_emails (
    id SERIAL PRIMARY KEY,
    pubkey TEXT,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('buyer', 'seller')),
    order_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_emails_pubkey ON notification_emails(pubkey);
CREATE INDEX IF NOT EXISTS idx_notification_emails_order_id ON notification_emails(order_id);
CREATE INDEX IF NOT EXISTS idx_notification_emails_role ON notification_emails(role);

-- MCP API Keys table
CREATE TABLE IF NOT EXISTS mcp_api_keys (
    id SERIAL PRIMARY KEY,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    pubkey TEXT NOT NULL,
    permissions TEXT NOT NULL DEFAULT 'read' CHECK (permissions IN ('read', 'read_write')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_key_hash ON mcp_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_pubkey ON mcp_api_keys(pubkey);

-- MCP Orders table
CREATE TABLE IF NOT EXISTS mcp_orders (
    id SERIAL PRIMARY KEY,
    order_id TEXT NOT NULL UNIQUE,
    api_key_id INTEGER REFERENCES mcp_api_keys(id),
    buyer_pubkey TEXT NOT NULL,
    seller_pubkey TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_title TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    amount_total NUMERIC(12,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    buyer_email TEXT,
    shipping_address JSONB,
    payment_intent_id TEXT,
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'paid', 'failed', 'refunded')),
    order_status TEXT NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mcp_orders_order_id ON mcp_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_mcp_orders_buyer_pubkey ON mcp_orders(buyer_pubkey);
CREATE INDEX IF NOT EXISTS idx_mcp_orders_seller_pubkey ON mcp_orders(seller_pubkey);
CREATE INDEX IF NOT EXISTS idx_mcp_orders_api_key_id ON mcp_orders(api_key_id);

-- Subscriptions table for recurring product subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    stripe_subscription_id TEXT NOT NULL UNIQUE,
    stripe_customer_id TEXT NOT NULL,
    buyer_pubkey TEXT,
    buyer_email TEXT NOT NULL,
    seller_pubkey TEXT NOT NULL,
    product_event_id TEXT NOT NULL,
    product_title TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    variant_info JSONB,
    frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'every_2_weeks', 'monthly', 'every_2_months', 'quarterly')),
    discount_percent DECIMAL(5,2) NOT NULL CHECK (discount_percent >= 0 AND discount_percent <= 100),
    base_price NUMERIC(12,2) NOT NULL,
    subscription_price NUMERIC(12,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    shipping_address JSONB,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'canceled')),
    next_billing_date TIMESTAMP,
    next_shipping_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_buyer_pubkey ON subscriptions(buyer_pubkey);
CREATE INDEX IF NOT EXISTS idx_subscriptions_buyer_email ON subscriptions(buyer_email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_seller_pubkey ON subscriptions(seller_pubkey);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Subscription notifications table
CREATE TABLE IF NOT EXISTS subscription_notifications (
    id SERIAL PRIMARY KEY,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('renewal_reminder', 'address_change', 'cancellation')),
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    method TEXT NOT NULL CHECK (method IN ('email', 'nostr', 'both'))
);

CREATE INDEX IF NOT EXISTS idx_subscription_notifications_subscription_id ON subscription_notifications(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_notifications_type ON subscription_notifications(type);

-- Email flow definitions
CREATE TABLE IF NOT EXISTS email_flows (
    id SERIAL PRIMARY KEY,
    seller_pubkey TEXT NOT NULL,
    name TEXT NOT NULL,
    flow_type TEXT NOT NULL CHECK (flow_type IN ('welcome_series', 'abandoned_cart', 'post_purchase', 'winback')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_flows_seller_pubkey ON email_flows(seller_pubkey);
CREATE INDEX IF NOT EXISTS idx_email_flows_flow_type ON email_flows(flow_type);
CREATE INDEX IF NOT EXISTS idx_email_flows_status ON email_flows(status);

-- Individual steps in an email flow
CREATE TABLE IF NOT EXISTS email_flow_steps (
    id SERIAL PRIMARY KEY,
    flow_id INTEGER NOT NULL REFERENCES email_flows(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    delay_hours INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_flow_steps_flow_id ON email_flow_steps(flow_id);

-- Tracks who is enrolled in an email flow
CREATE TABLE IF NOT EXISTS email_flow_enrollments (
    id SERIAL PRIMARY KEY,
    flow_id INTEGER NOT NULL REFERENCES email_flows(id) ON DELETE CASCADE,
    recipient_email TEXT NOT NULL,
    recipient_pubkey TEXT,
    enrollment_data JSONB,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_flow_enrollments_flow_id ON email_flow_enrollments(flow_id);
CREATE INDEX IF NOT EXISTS idx_email_flow_enrollments_recipient_email ON email_flow_enrollments(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_flow_enrollments_status ON email_flow_enrollments(status);

-- Tracks which steps have been sent for each enrollment
CREATE TABLE IF NOT EXISTS email_flow_executions (
    id SERIAL PRIMARY KEY,
    enrollment_id INTEGER NOT NULL REFERENCES email_flow_enrollments(id) ON DELETE CASCADE,
    step_id INTEGER NOT NULL REFERENCES email_flow_steps(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    scheduled_for TIMESTAMP NOT NULL,
    sent_at TIMESTAMP,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_flow_executions_enrollment_id ON email_flow_executions(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_email_flow_executions_step_id ON email_flow_executions(step_id);
CREATE INDEX IF NOT EXISTS idx_email_flow_executions_status ON email_flow_executions(status);
CREATE INDEX IF NOT EXISTS idx_email_flow_executions_scheduled_for ON email_flow_executions(scheduled_for);

-- Cart activity reports for abandoned cart flow triggers
CREATE TABLE IF NOT EXISTS cart_reports (
    id SERIAL PRIMARY KEY,
    seller_pubkey TEXT NOT NULL,
    buyer_email TEXT NOT NULL,
    buyer_pubkey TEXT,
    cart_items JSONB NOT NULL,
    reported_at TIMESTAMP NOT NULL DEFAULT NOW(),
    enrolled BOOLEAN DEFAULT FALSE,
    UNIQUE(seller_pubkey, buyer_email)
);

CREATE INDEX IF NOT EXISTS idx_cart_reports_reported_at ON cart_reports(reported_at);
CREATE INDEX IF NOT EXISTS idx_cart_reports_enrolled ON cart_reports(enrolled);

-- Shop slug registry for storefront URLs
CREATE TABLE IF NOT EXISTS shop_slugs (
    id SERIAL PRIMARY KEY,
    pubkey TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shop_slugs_slug ON shop_slugs(slug);
CREATE INDEX IF NOT EXISTS idx_shop_slugs_pubkey ON shop_slugs(pubkey);

-- Custom domain mappings for seller storefronts
CREATE TABLE IF NOT EXISTS custom_domains (
    id SERIAL PRIMARY KEY,
    pubkey TEXT NOT NULL UNIQUE,
    domain TEXT NOT NULL UNIQUE,
    shop_slug TEXT NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_domains_domain ON custom_domains(domain);
CREATE INDEX IF NOT EXISTS idx_custom_domains_pubkey ON custom_domains(pubkey);

-- Email popup captures for storefront discount popups
CREATE TABLE IF NOT EXISTS popup_email_captures (
    id SERIAL PRIMARY KEY,
    seller_pubkey TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    discount_code TEXT NOT NULL,
    discount_percentage DECIMAL(5,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(seller_pubkey, email)
);

CREATE INDEX IF NOT EXISTS idx_popup_email_captures_seller ON popup_email_captures(seller_pubkey);
CREATE INDEX IF NOT EXISTS idx_popup_email_captures_email ON popup_email_captures(email);

-- Account recovery: universal table for all auth types (email, oauth, nsec)
CREATE TABLE IF NOT EXISTS account_recovery (
    id SERIAL PRIMARY KEY,
    pubkey VARCHAR(64) NOT NULL,
    email VARCHAR(255) NOT NULL,
    recovery_key_hash VARCHAR(255) NOT NULL,
    recovery_encrypted_nsec TEXT NOT NULL,
    auth_type VARCHAR(20) NOT NULL CHECK (auth_type IN ('email', 'oauth', 'nsec')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(pubkey)
);

CREATE INDEX IF NOT EXISTS idx_account_recovery_email ON account_recovery(email);
CREATE INDEX IF NOT EXISTS idx_account_recovery_pubkey ON account_recovery(pubkey);

-- Recovery tokens for email-based verification
CREATE TABLE IF NOT EXISTS account_recovery_tokens (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recovery_tokens_token ON account_recovery_tokens(token);
CREATE INDEX IF NOT EXISTS idx_recovery_tokens_email ON account_recovery_tokens(email);

-- Centralized inventory tracking
CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    product_id TEXT NOT NULL,
    seller_pubkey TEXT NOT NULL,
    variant_key TEXT NOT NULL DEFAULT '_default',
    quantity INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'system' CHECK (source IN ('system', 'seller_override', 'nostr_sync')),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, variant_key)
);

CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_seller_pubkey ON inventory(seller_pubkey);

-- Inventory change log for auditing
CREATE TABLE IF NOT EXISTS inventory_log (
    id SERIAL PRIMARY KEY,
    product_id TEXT NOT NULL,
    variant_key TEXT NOT NULL DEFAULT '_default',
    change_amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    order_id TEXT,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_log_product_id ON inventory_log(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_log_order_id ON inventory_log(order_id);

-- ============================================================================
-- Affiliate program: seller-managed referral codes/links with configurable
-- buyer discounts, affiliate rebates, payout schedules, and connected payout
-- destinations (lightning address or Stripe Connect account). When no payout
-- destination is set, balances accrue for out-of-band manual settlement.
-- ============================================================================

-- Affiliate identity. Created by the seller, optionally claimed by the
-- affiliate via a unique invite token to set their own payout method.
CREATE TABLE IF NOT EXISTS affiliates (
    id SERIAL PRIMARY KEY,
    seller_pubkey TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    -- Affiliate's own platform pubkey (only set when they claim the invite
    -- and sign in). Used to gate the self-service page after claim.
    affiliate_pubkey TEXT,
    -- Single-use-ish opaque token used in the affiliate self-service URL.
    invite_token TEXT NOT NULL UNIQUE,
    invite_claimed_at TIMESTAMP,
    -- Payout destinations (either, both, or neither may be set).
    lightning_address TEXT,
    stripe_account_id TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Defaults for the failure-tracking columns added below in the migration
-- block. Listed inline as well so freshly-created databases get them on the
-- first CREATE TABLE pass.
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS payouts_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS payout_failure_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS last_payout_failure_at TIMESTAMP;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS last_payout_failure_reason TEXT;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS stripe_onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE;

-- Lightweight click-through tracking for affiliate links. One row per page
-- impression where ?ref=CODE was present. Keeps just enough metadata to
-- compute conversion rate; intentionally no IP, no user-agent fingerprint.
CREATE TABLE IF NOT EXISTS affiliate_clicks (
    id BIGSERIAL PRIMARY KEY,
    seller_pubkey TEXT NOT NULL,
    code TEXT NOT NULL,
    landing_path TEXT,
    referer_host TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_seller_code
  ON affiliate_clicks(seller_pubkey, code);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_created_at
  ON affiliate_clicks(created_at);

CREATE INDEX IF NOT EXISTS idx_affiliates_seller_pubkey ON affiliates(seller_pubkey);
CREATE INDEX IF NOT EXISTS idx_affiliates_invite_token ON affiliates(invite_token);
CREATE INDEX IF NOT EXISTS idx_affiliates_affiliate_pubkey ON affiliates(affiliate_pubkey);

-- Referral codes/links bound to an affiliate. A single affiliate can own
-- many codes (e.g. for different campaigns).
CREATE TABLE IF NOT EXISTS affiliate_codes (
    id SERIAL PRIMARY KEY,
    affiliate_id INTEGER NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
    seller_pubkey TEXT NOT NULL,
    code TEXT NOT NULL,
    -- Affiliate rebate (commission) applied to the seller's net subtotal.
    rebate_type TEXT NOT NULL CHECK (rebate_type IN ('percent', 'fixed')),
    rebate_value NUMERIC(12,2) NOT NULL CHECK (rebate_value >= 0),
    -- Buyer discount applied at checkout.
    buyer_discount_type TEXT NOT NULL DEFAULT 'percent' CHECK (buyer_discount_type IN ('percent', 'fixed')),
    buyer_discount_value NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (buyer_discount_value >= 0),
    -- Currency hint for fixed-amount values (uses seller's primary currency
    -- when null; sats are also supported for bitcoin orders).
    currency TEXT,
    -- Payout cadence for accrued affiliate rebates. Real-time payouts were
    -- removed to make refund clawbacks deterministic — everything accrues and
    -- is settled in batch by the cron at the configured cadence.
    payout_schedule TEXT NOT NULL DEFAULT 'monthly' CHECK (payout_schedule IN ('weekly', 'biweekly', 'monthly')),
    expiration BIGINT,
    max_uses INTEGER,
    times_used INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(seller_pubkey, code)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_codes_seller_pubkey ON affiliate_codes(seller_pubkey);
CREATE INDEX IF NOT EXISTS idx_affiliate_codes_affiliate_id ON affiliate_codes(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_codes_code ON affiliate_codes(code);

-- One row per attributed sale. The rebate is captured at order time and
-- moves through the lifecycle pending -> payable -> paid (or skipped on
-- refund/cancel).
CREATE TABLE IF NOT EXISTS affiliate_referrals (
    id SERIAL PRIMARY KEY,
    affiliate_id INTEGER NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
    code_id INTEGER NOT NULL REFERENCES affiliate_codes(id) ON DELETE CASCADE,
    seller_pubkey TEXT NOT NULL,
    order_id TEXT NOT NULL,
    payment_rail TEXT NOT NULL CHECK (payment_rail IN ('stripe', 'bitcoin')),
    -- Order subtotal in smallest units of `currency` (cents for fiat, sats
    -- for sats). The rebate amount is precomputed using the code config.
    gross_subtotal_smallest NUMERIC(20,0) NOT NULL,
    buyer_discount_smallest NUMERIC(20,0) NOT NULL DEFAULT 0,
    rebate_smallest NUMERIC(20,0) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL,
    -- Payout state machine.
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'payable', 'paid', 'cancelled', 'refunded')),
    -- Set when this referral has been paid out by the scheduled cron job.
    payout_id INTEGER,
    -- Reserved column kept for back-compat. Real-time payouts were removed.
    realtime_transfer_ref TEXT,
    -- Refund/clawback bookkeeping. When the order is refunded after the
    -- referral has already been paid out, we mark the original 'paid'
    -- referral as 'refunded' and record the refunded amount + Stripe ref.
    refunded_smallest NUMERIC(20,0) NOT NULL DEFAULT 0,
    refund_event_ref TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(order_id, code_id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_affiliate_id ON affiliate_referrals(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_seller_pubkey ON affiliate_referrals(seller_pubkey);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_status ON affiliate_referrals(status);
CREATE INDEX IF NOT EXISTS idx_affiliate_referrals_order_id ON affiliate_referrals(order_id);

-- Aggregated payout records. A payout groups one or more referrals into
-- a single settlement (real-time, scheduled, or marked-as-paid manually).
CREATE TABLE IF NOT EXISTS affiliate_payouts (
    id SERIAL PRIMARY KEY,
    affiliate_id INTEGER NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
    seller_pubkey TEXT NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('stripe', 'lightning', 'manual')),
    amount_smallest NUMERIC(20,0) NOT NULL,
    currency TEXT NOT NULL,
    -- External reference: stripe transfer id, LN payment hash, or free-form
    -- note for manual payouts.
    external_ref TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'failed')),
    paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_affiliate_id ON affiliate_payouts(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_seller_pubkey ON affiliate_payouts(seller_pubkey);

-- ============================================================================
-- Affiliate program migration: tighten payout schedule to weekly/biweekly/
-- monthly (real-time rebates removed), add 'refunded' status + clawback
-- columns. Idempotent so existing databases can be re-applied safely.
-- ============================================================================
DO $aff_migrate$
BEGIN
  -- Map deprecated schedules onto the new defaults.
  EXECUTE 'UPDATE affiliate_codes SET payout_schedule = ''monthly'' WHERE payout_schedule IN (''every_sale'', ''daily'')';
  -- Replace the old CHECK constraint.
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'affiliate_codes_payout_schedule_check'
  ) THEN
    ALTER TABLE affiliate_codes DROP CONSTRAINT affiliate_codes_payout_schedule_check;
  END IF;
  ALTER TABLE affiliate_codes
    ADD CONSTRAINT affiliate_codes_payout_schedule_check
    CHECK (payout_schedule IN ('weekly', 'biweekly', 'monthly'));
  ALTER TABLE affiliate_codes ALTER COLUMN payout_schedule SET DEFAULT 'monthly';

  -- Refund/clawback columns on referrals.
  ALTER TABLE affiliate_referrals
    ADD COLUMN IF NOT EXISTS refunded_smallest NUMERIC(20,0) NOT NULL DEFAULT 0;
  ALTER TABLE affiliate_referrals
    ADD COLUMN IF NOT EXISTS refund_event_ref TEXT;
  -- Allow 'refunded' status.
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'affiliate_referrals_status_check'
  ) THEN
    ALTER TABLE affiliate_referrals DROP CONSTRAINT affiliate_referrals_status_check;
  END IF;
  ALTER TABLE affiliate_referrals
    ADD CONSTRAINT affiliate_referrals_status_check
    CHECK (status IN ('pending', 'payable', 'paid', 'cancelled', 'refunded'));

  -- Payout enable/disable flag + failure tracking on affiliates.
  ALTER TABLE affiliates
    ADD COLUMN IF NOT EXISTS payouts_enabled BOOLEAN NOT NULL DEFAULT TRUE;
  ALTER TABLE affiliates
    ADD COLUMN IF NOT EXISTS payout_failure_count INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE affiliates
    ADD COLUMN IF NOT EXISTS last_payout_failure_at TIMESTAMP;
  ALTER TABLE affiliates
    ADD COLUMN IF NOT EXISTS last_payout_failure_reason TEXT;

  -- Case-insensitive uniqueness for affiliate codes scoped per seller. The
  -- existing UNIQUE(seller_pubkey, code) is case-sensitive; this functional
  -- index closes the gap so 'SAVE10' and 'save10' can't both exist.
  CREATE UNIQUE INDEX IF NOT EXISTS uniq_affiliate_codes_seller_upper_code
    ON affiliate_codes (seller_pubkey, UPPER(code));
END
$aff_migrate$;
