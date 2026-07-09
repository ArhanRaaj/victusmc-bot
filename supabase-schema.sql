-- ============================================
-- VictusMC Discord Bot — Supabase Schema
-- Run this in your new Supabase project's SQL Editor
-- ============================================

-- 1. Linked Accounts (Discord <-> VictusMC)
CREATE TABLE IF NOT EXISTS discord_linked_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    discord_id TEXT NOT NULL UNIQUE,
    discord_username TEXT NOT NULL,
    discord_avatar TEXT,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_discord_linked_accounts_user_id ON discord_linked_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_discord_linked_accounts_discord_id ON discord_linked_accounts(discord_id);

-- 2. Link Tokens (for account linking)
CREATE TABLE IF NOT EXISTS discord_link_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_id TEXT NOT NULL,
    discord_username TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_discord_link_tokens_token ON discord_link_tokens(token);

-- 3. Bot Settings (per guild)
CREATE TABLE IF NOT EXISTS bot_settings (
    guild_id TEXT PRIMARY KEY,
    linked_role_id TEXT,
    log_channel_id TEXT,
    ai_channel_id TEXT,
    ticket_panel_channel_id TEXT,
    ticket_parent_category_id TEXT,
    ticket_archive_channel_id TEXT,
    ticket_staff_role_ids TEXT[] DEFAULT '{}',
    ticket_admin_role_ids TEXT[] DEFAULT '{}',
    ticket_allow_user_close BOOLEAN DEFAULT true,
    ticket_allow_user_reopen BOOLEAN DEFAULT true,
    prefix TEXT DEFAULT '!',
    suggestion_channel_id TEXT,
    announcement_channels TEXT[] DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. User Profiles (shared with VictusMC website)
CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    email TEXT,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    is_admin BOOLEAN DEFAULT false,
    avatar_url TEXT,
    credits NUMERIC DEFAULT 0,
    total_cp NUMERIC DEFAULT 0,
    total_xp NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id TEXT,
    admin_email TEXT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_id ON audit_logs(target_id);

-- 6. Ticket Categories
CREATE TABLE IF NOT EXISTS ticket_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '🗂️',
    description TEXT,
    priority_default TEXT DEFAULT 'medium',
    staff_roles TEXT[] DEFAULT '{}',
    custom_questions JSONB DEFAULT '[]',
    position INT DEFAULT 0,
    enabled BOOLEAN DEFAULT true,
    discord_category_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_categories_guild_id ON ticket_categories(guild_id);

-- 7. Tickets
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number INT NOT NULL,
    guild_id TEXT NOT NULL,
    channel_id TEXT,
    user_id TEXT,
    discord_id TEXT NOT NULL,
    category_id UUID REFERENCES ticket_categories(id),
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    email TEXT,
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'open',
    claimed_by TEXT,
    claimed_by_name TEXT,
    linked_server_id TEXT,
    linked_invoice_id TEXT,
    custom_answers JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tickets_guild_id ON tickets(guild_id);
CREATE INDEX IF NOT EXISTS idx_tickets_discord_id ON tickets(discord_id);
CREATE INDEX IF NOT EXISTS idx_tickets_channel_id ON tickets(channel_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);

-- 8. Ticket Messages
CREATE TABLE IF NOT EXISTS ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    author_discord_id TEXT NOT NULL,
    author_username TEXT,
    author_is_staff BOOLEAN DEFAULT false,
    content TEXT NOT NULL,
    attachments TEXT[] DEFAULT '{}',
    bridged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_bridged_at ON ticket_messages(bridged_at);

-- 9. User Preferences (DM opt-ins)
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_id TEXT NOT NULL UNIQUE,
    user_id TEXT,
    dm_maintenance BOOLEAN DEFAULT true,
    dm_billing BOOLEAN DEFAULT true,
    dm_security BOOLEAN DEFAULT true,
    dm_promotions BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Discord Announcements
CREATE TABLE IF NOT EXISTS discord_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type TEXT DEFAULT 'info',
    target TEXT DEFAULT 'channel',
    dm_category TEXT,
    channel_id TEXT,
    thumbnail_url TEXT,
    image_url TEXT,
    footer_text TEXT,
    ping_everyone BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'draft',
    scheduled_at TIMESTAMPTZ,
    sent_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    created_by TEXT NOT NULL,
    created_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_discord_announcements_guild_id ON discord_announcements(guild_id);

-- 11. Discord DM Queue (admin DMs)
CREATE TABLE IF NOT EXISTS discord_dm_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    admin_email TEXT,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_discord_dm_queue_status ON discord_dm_queue(status);

-- 12. Custom Embeds / Layouts / Settings (generic key-value store)
CREATE TABLE IF NOT EXISTS custom_embeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    title TEXT,
    description TEXT,
    thumbnail_url TEXT,
    image_url TEXT,
    footer_text TEXT,
    footer_icon_url TEXT,
    color TEXT,
    author_name TEXT,
    author_icon_url TEXT,
    author_url TEXT,
    buttons JSONB DEFAULT '[]',
    select_menu JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(guild_id, name)
);
CREATE INDEX IF NOT EXISTS idx_custom_embeds_guild_id ON custom_embeds(guild_id);

-- 13. Embed Settings (guild defaults)
CREATE TABLE IF NOT EXISTS embed_settings (
    guild_id TEXT PRIMARY KEY,
    default_color TEXT,
    default_footer TEXT,
    default_author TEXT,
    default_thumbnail TEXT,
    allowed_roles TEXT[] DEFAULT '{}',
    allowed_channels TEXT[] DEFAULT '{}',
    logging_channel_id TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. Suggestions
CREATE TABLE IF NOT EXISTS suggestions (
    id SERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    user_id TEXT NOT NULL,
    author_tag TEXT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    locked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suggestions_guild_id ON suggestions(guild_id);

-- 15. Suggestion Votes
CREATE TABLE IF NOT EXISTS suggestion_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suggestion_id INT NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    username TEXT,
    vote_type TEXT NOT NULL CHECK (vote_type IN ('up', 'down')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(suggestion_id, user_id)
);

-- 16. Giveaways
CREATE TABLE IF NOT EXISTS giveaways (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    prize TEXT NOT NULL,
    duration TEXT,
    winners_count INT DEFAULT 1,
    ends_at TIMESTAMPTZ NOT NULL,
    host_id TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    paused_at TIMESTAMPTZ,
    paused_remaining INT,
    requirements JSONB DEFAULT '{}',
    bonus_entries JSONB DEFAULT '[]',
    participants TEXT[] DEFAULT '{}',
    winners TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_giveaways_guild_id ON giveaways(guild_id);
CREATE INDEX IF NOT EXISTS idx_giveaways_status ON giveaways(status);

-- 17. Custom Commands
CREATE TABLE IF NOT EXISTS custom_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    reply_type TEXT DEFAULT 'text',
    reply_content TEXT,
    aliases TEXT[] DEFAULT '{}',
    cooldown INT DEFAULT 0,
    permissions TEXT[] DEFAULT '{}',
    variables JSONB DEFAULT '{}',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(guild_id, name)
);
CREATE INDEX IF NOT EXISTS idx_custom_commands_guild_id ON custom_commands(guild_id);

-- ============================================
-- RPC Functions
-- ============================================

-- Increment XP for a user
CREATE OR REPLACE FUNCTION increment_xp(uid TEXT, amount NUMERIC)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE profiles
    SET total_xp = COALESCE(total_xp, 0) + amount,
        total_cp = COALESCE(total_cp, 0) + amount,
        updated_at = now()
    WHERE id = uid;
END;
$$;

-- ============================================
-- Enable Realtime for key tables
-- ============================================
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE discord_linked_accounts;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE ticket_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- ============================================
-- Indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_total_cp ON profiles(total_cp DESC);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
CREATE INDEX IF NOT EXISTS idx_giveaways_ends_at ON giveaways(ends_at);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
