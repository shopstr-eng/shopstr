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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(code, pubkey)
);

CREATE INDEX IF NOT EXISTS idx_discount_codes_pubkey ON discount_codes(pubkey);
CREATE INDEX IF NOT EXISTS idx_discount_codes_code ON discount_codes(code);

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