-- son24saat.com Database Schema
-- "Burası arşiv değil, an."

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- SPACES (Subdomain-based communities)
-- =====================================================
CREATE TABLE spaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(63) NOT NULL UNIQUE,  -- subdomain: "kadikoy", "abcsirketi"
    
    -- Display
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Configuration
    ttl_hours INTEGER NOT NULL DEFAULT 24,  -- Content lifetime (24, 48, 72)
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_private BOOLEAN NOT NULL DEFAULT false,  -- Future: invite-only spaces
    
    -- Moderation thresholds
    flag_threshold INTEGER NOT NULL DEFAULT 5,  -- Flags needed to gray-out
    auto_mod_enabled BOOLEAN NOT NULL DEFAULT true,
    
    -- Premium features
    tier VARCHAR(20) NOT NULL DEFAULT 'free',  -- free, premium, enterprise
    custom_domain VARCHAR(255),  -- Future: custom domain support
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for subdomain routing
CREATE INDEX idx_spaces_slug ON spaces(slug);
CREATE INDEX idx_spaces_active ON spaces(is_active) WHERE is_active = true;

-- =====================================================
-- DEVICES (Soft Identity - Anonymous Fingerprints)
-- =====================================================
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fingerprint_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 of fingerprint data
    
    -- Invisible reputation system
    reputation_score INTEGER NOT NULL DEFAULT 50,  -- 0-100, starts neutral
    total_posts INTEGER NOT NULL DEFAULT 0,
    total_flags_received INTEGER NOT NULL DEFAULT 0,
    total_flags_given INTEGER NOT NULL DEFAULT 0,
    
    -- Abuse control
    is_banned BOOLEAN NOT NULL DEFAULT false,
    ban_reason TEXT,
    ban_expires_at TIMESTAMPTZ,
    
    -- Rate limiting
    last_post_at TIMESTAMPTZ,
    posts_last_hour INTEGER NOT NULL DEFAULT 0,
    
    -- Timestamps
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_devices_fingerprint ON devices(fingerprint_hash);
CREATE INDEX idx_devices_banned ON devices(is_banned) WHERE is_banned = true;

-- =====================================================
-- POSTS (The ephemeral content)
-- =====================================================
CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE SET NULL,
    
    -- Content
    content TEXT NOT NULL,
    image_url VARCHAR(500),  -- Optional image attachment
    
    -- TTL Management (Core Feature)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,  -- Calculated: created_at + space.ttl_hours
    
    -- Visibility & Moderation
    is_visible BOOLEAN NOT NULL DEFAULT true,
    is_grayed BOOLEAN NOT NULL DEFAULT false,  -- Flagged but not hidden
    mod_action VARCHAR(20),  -- 'auto_flagged', 'community_flagged', 'mod_hidden'
    
    -- Engagement (hidden from users, affects algorithm)
    reaction_count INTEGER NOT NULL DEFAULT 0,
    reply_count INTEGER NOT NULL DEFAULT 0,
    flag_count INTEGER NOT NULL DEFAULT 0,
    
    -- Session-based author identifier (for "your posts" indicator)
    session_token VARCHAR(64)
);

-- Critical indexes for TTL cleanup
CREATE INDEX idx_posts_expires_at ON posts(expires_at);
CREATE INDEX idx_posts_space_visible ON posts(space_id, is_visible, created_at DESC);
CREATE INDEX idx_posts_cleanup ON posts(expires_at) WHERE expires_at < NOW();

-- =====================================================
-- REACTIONS (Limited, meaningful interactions)
-- =====================================================
-- Reaction types: 'agree', 'not_alone', 'exaggerated', 'crossing_line'
CREATE TABLE reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    
    reaction_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- One reaction per device per post
    UNIQUE(post_id, device_id)
);

CREATE INDEX idx_reactions_post ON reactions(post_id);

-- Reaction type enum check
ALTER TABLE reactions ADD CONSTRAINT valid_reaction_type 
    CHECK (reaction_type IN ('agree', 'not_alone', 'exaggerated', 'crossing_line'));

-- =====================================================
-- FLAGS (Community moderation)
-- =====================================================
CREATE TABLE flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    
    reason VARCHAR(50) NOT NULL,  -- 'spam', 'harassment', 'hate', 'threat', 'other'
    details TEXT,  -- Optional explanation
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- One flag per device per post
    UNIQUE(post_id, device_id)
);

CREATE INDEX idx_flags_post ON flags(post_id);

-- =====================================================
-- REPLIES (Threaded responses, same TTL as parent)
-- =====================================================
CREATE TABLE replies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE SET NULL,
    
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Inherits parent post's expires_at (deleted together)
    is_visible BOOLEAN NOT NULL DEFAULT true,
    flag_count INTEGER NOT NULL DEFAULT 0,
    
    session_token VARCHAR(64)
);

CREATE INDEX idx_replies_post ON replies(post_id, created_at);

-- =====================================================
-- SPACE_METRICS (Analytics - Priority #3)
-- =====================================================
CREATE TABLE space_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    
    -- Daily snapshot
    metric_date DATE NOT NULL,
    
    -- Core metrics
    posts_count INTEGER NOT NULL DEFAULT 0,
    reactions_count INTEGER NOT NULL DEFAULT 0,
    replies_count INTEGER NOT NULL DEFAULT 0,
    flags_count INTEGER NOT NULL DEFAULT 0,
    unique_devices INTEGER NOT NULL DEFAULT 0,
    
    -- Derived
    avg_reactions_per_post DECIMAL(5,2),
    median_time_to_reply_minutes INTEGER,
    flags_per_1k_posts DECIMAL(5,2),
    repeat_poster_rate DECIMAL(5,2),  -- % of posts from returning devices
    
    -- Health score (0-100)
    health_score INTEGER,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(space_id, metric_date)
);

CREATE INDEX idx_metrics_space_date ON space_metrics(space_id, metric_date DESC);

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER spaces_updated_at
    BEFORE UPDATE ON spaces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-calculate expires_at on post insert
CREATE OR REPLACE FUNCTION set_post_expires_at()
RETURNS TRIGGER AS $$
DECLARE
    space_ttl INTEGER;
BEGIN
    SELECT ttl_hours INTO space_ttl FROM spaces WHERE id = NEW.space_id;
    NEW.expires_at = NEW.created_at + (space_ttl || ' hours')::INTERVAL;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_set_expires_at
    BEFORE INSERT ON posts
    FOR EACH ROW EXECUTE FUNCTION set_post_expires_at();

-- Update post reaction_count on reaction insert/delete
CREATE OR REPLACE FUNCTION update_post_reaction_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE posts SET reaction_count = reaction_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE posts SET reaction_count = reaction_count - 1 WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reactions_update_count
    AFTER INSERT OR DELETE ON reactions
    FOR EACH ROW EXECUTE FUNCTION update_post_reaction_count();

-- Update post flag_count and check threshold
CREATE OR REPLACE FUNCTION update_post_flag_count()
RETURNS TRIGGER AS $$
DECLARE
    threshold INTEGER;
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE posts SET flag_count = flag_count + 1 WHERE id = NEW.post_id;
        
        -- Check if we need to gray out the post
        SELECT s.flag_threshold INTO threshold 
        FROM spaces s 
        JOIN posts p ON p.space_id = s.id 
        WHERE p.id = NEW.post_id;
        
        UPDATE posts 
        SET is_grayed = true, mod_action = 'community_flagged'
        WHERE id = NEW.post_id 
        AND flag_count >= threshold
        AND is_grayed = false;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER flags_update_count
    AFTER INSERT ON flags
    FOR EACH ROW EXECUTE FUNCTION update_post_flag_count();

-- Update device reputation on flag received
CREATE OR REPLACE FUNCTION update_device_reputation()
RETURNS TRIGGER AS $$
BEGIN
    -- Decrease reputation when flagged
    UPDATE devices 
    SET 
        total_flags_received = total_flags_received + 1,
        reputation_score = GREATEST(0, reputation_score - 2)
    WHERE id = (SELECT device_id FROM posts WHERE id = NEW.post_id);
    
    -- Track flags given
    UPDATE devices 
    SET total_flags_given = total_flags_given + 1
    WHERE id = NEW.device_id;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER flags_update_reputation
    AFTER INSERT ON flags
    FOR EACH ROW EXECUTE FUNCTION update_device_reputation();

-- =====================================================
-- SEED DATA (Default spaces for testing)
-- =====================================================
INSERT INTO spaces (slug, display_name, description, ttl_hours) VALUES
('genel', 'Genel', 'Herkes için açık genel alan', 24),
('test', 'Test Space', 'Geliştirme ve test amaçlı', 1);

-- =====================================================
-- TTL CLEANUP FUNCTION (Called by cron)
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_expired_content()
RETURNS TABLE(deleted_posts INTEGER, deleted_replies INTEGER) AS $$
DECLARE
    posts_deleted INTEGER;
    replies_deleted INTEGER;
BEGIN
    -- Delete expired posts (cascades to reactions, flags, replies)
    WITH deleted AS (
        DELETE FROM posts 
        WHERE expires_at < NOW()
        RETURNING id
    )
    SELECT COUNT(*) INTO posts_deleted FROM deleted;
    
    -- Orphan replies are already deleted via CASCADE
    -- But we track for logging
    replies_deleted := 0;
    
    RETURN QUERY SELECT posts_deleted, replies_deleted;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON TABLE spaces IS 'Subdomain-based communities. Each subdomain = one space.';
COMMENT ON TABLE devices IS 'Anonymous device fingerprints for soft identity and abuse control.';
COMMENT ON TABLE posts IS 'Ephemeral content with TTL. Core of the platform.';
COMMENT ON COLUMN posts.expires_at IS 'Auto-calculated: created_at + space.ttl_hours. Content deleted after this.';
COMMENT ON COLUMN devices.reputation_score IS 'Hidden score 0-100. Affects spam filtering, not shown to users.';
COMMENT ON FUNCTION cleanup_expired_content IS 'Called by cron job to delete expired posts and related data.';
