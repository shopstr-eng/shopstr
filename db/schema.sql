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