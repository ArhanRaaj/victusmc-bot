import { createClient, SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import type { 
    BotSettings, LinkedAccount, LinkToken, UserProfile,
    CustomEmbed, EmbedSettings, Suggestion, SuggestionVote, Giveaway, CustomCommand
} from '../types/index.js';
import { localSettings } from './localSettings.js';

const DEFAULT_DM_PREFERENCES = {
    dm_maintenance: true,
    dm_billing: true,
    dm_security: true,
    dm_promotions: true,
};

class SupabaseService {
    public client: SupabaseClient;

    constructor() {
        // Create client with service role key and auth bypass
        this.client = createClient(config.supabase.url, config.supabase.serviceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
            db: {
                schema: 'public',
            },
            realtime: {
                params: {
                    eventsPerSecond: 10,
                },
                transport: ws as any,
            },
        });
    }

    /**
     * Subscribe to real-time changes on linked accounts
     */
    subscribeToLinks(callback: (payload: any) => void) {
        logger.debug('🔌 Initializing Realtime connection to discord_linked_accounts...');

        const channel = this.client
            .channel('any-channel-name') // Channel name can be anything
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'discord_linked_accounts',
                },
                (payload) => {
                    logger.info('🚀 Realtime: Received INSERT event');
                    callback(payload);
                }
            );

        channel.subscribe((status, error) => {
            if (status === 'SUBSCRIBED') {
                logger.info('✅ Realtime: Successfully subscribed to database changes!');
            } else if (status === 'CHANNEL_ERROR') {
                logger.error('❌ Realtime Channel Error:', error?.message || 'Unknown error');
            } else if (status === 'TIMED_OUT') {
                logger.warn('⚠️ Realtime: Connection timed out. Ensure "supabase_realtime" publication includes "discord_linked_accounts".');
            } else {
                logger.debug(`📦 Realtime Status Update: ${status}`);
            }
        });

        return channel;
    }

    /**
     * Subscribe to ticket + ticket_message inserts to drive the Discord bridge:
     * new website tickets -> Discord channels, and website messages -> Discord.
     */
    subscribeToTicketBridge(
        onTicketInsert: (ticket: any) => void,
        onMessageInsert: (message: any) => void,
    ) {
        const channel = this.client
            .channel('ticket-bridge')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tickets' },
                (payload) => onTicketInsert(payload.new))
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_messages' },
                (payload) => onMessageInsert(payload.new));

        channel.subscribe((status, error) => {
            if (status === 'SUBSCRIBED') {
                logger.info('✅ Realtime: Ticket bridge subscribed.');
            } else if (status === 'CHANNEL_ERROR') {
                logger.error('❌ Realtime ticket bridge error:', error?.message || 'Unknown error');
            } else if (status === 'TIMED_OUT') {
                logger.warn('⚠️ Ticket bridge timed out. Ensure "supabase_realtime" includes "tickets" and "ticket_messages".');
            }
        });

        return channel;
    }

    /**
     * Point a website ticket at its freshly created Discord channel.
     */
    async setTicketChannel(ticketId: string, channelId: string): Promise<boolean> {
        const { error } = await this.client
            .from('tickets')
            .update({ channel_id: channelId, updated_at: new Date().toISOString() })
            .eq('id', ticketId);
        if (error) {
            logger.error('Failed to set ticket channel:', error);
            return false;
        }
        return true;
    }

    /**
     * Atomically claim a website message for relaying to Discord. Returns true
     * only for the caller that wins the race (bridged_at was null), so the
     * realtime relay and the catch-up never double-post.
     */
    async claimMessageForBridge(messageId: string): Promise<boolean> {
        const { data, error } = await this.client
            .from('ticket_messages')
            .update({ bridged_at: new Date().toISOString() })
            .eq('id', messageId)
            .is('bridged_at', null)
            .select('id');
        if (error) {
            logger.error('Failed to claim message for bridge:', error);
            return false;
        }
        return Array.isArray(data) && data.length > 0;
    }

    /**
     * Website messages on a ticket that have not yet been relayed to Discord.
     */
    async getUnbridgedMessages(ticketId: string): Promise<any[]> {
        const { data, error } = await this.client
            .from('ticket_messages')
            .select('*')
            .eq('ticket_id', ticketId)
            .is('bridged_at', null)
            .order('created_at', { ascending: true });
        if (error) {
            logger.error('Failed to load unbridged messages:', error);
            return [];
        }
        return data || [];
    }

    // ============================================
    // Account Linking
    // ============================================

    /**
     * Get linked account by Discord ID
     */
    async getLinkedAccount(discordId: string): Promise<LinkedAccount | null> {
        const { data, error } = await this.client
            .from('discord_linked_accounts')
            .select('*')
            .eq('discord_id', discordId)
            .single();

        if (error && error.code !== 'PGRST116') {
            logger.error('Failed to get linked account:', error);
        }
        return data;
    }

    /**
     * Get linked account by VictusMC user ID
     */
    async getLinkedAccountByUserId(userId: string): Promise<LinkedAccount | null> {
        const { data, error } = await this.client
            .from('discord_linked_accounts')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code !== 'PGRST116') {
            logger.error('Failed to get linked account by user ID:', error);
        }
        return data;
    }

    /**
     * Create a link token for account verification
     */
    async createLinkToken(
        discordId: string,
        discordUsername: string,
        token: string,
        expiresAt: Date
    ): Promise<LinkToken | null> {
        // First, invalidate any existing tokens for this Discord ID
        await this.client
            .from('discord_link_tokens')
            .delete()
            .eq('discord_id', discordId);

        const { data, error } = await this.client
            .from('discord_link_tokens')
            .insert({
                discord_id: discordId,
                discord_username: discordUsername,
                token,
                expires_at: expiresAt.toISOString(),
            })
            .select()
            .single();

        if (error) {
            logger.error('Failed to create link token:', error);
            return null;
        }
        return data;
    }

    /**
     * Verify and consume a link token
     */
    async verifyLinkToken(token: string, userId: string): Promise<boolean> {
        // Get the token
        const { data: tokenData, error: tokenError } = await this.client
            .from('discord_link_tokens')
            .select('*')
            .eq('token', token)
            .eq('used', false)
            .single();

        if (tokenError || !tokenData) {
            logger.warn('Invalid or used link token');
            return false;
        }

        // Check if expired
        if (new Date(tokenData.expires_at) < new Date()) {
            logger.warn('Link token expired');
            return false;
        }

        // Create the link
        const { error: linkError } = await this.client
            .from('discord_linked_accounts')
            .insert({
                user_id: userId,
                discord_id: tokenData.discord_id,
                discord_username: tokenData.discord_username,
            });

        if (linkError) {
            logger.error('Failed to create account link:', linkError);
            return false;
        }

        // Mark token as used
        await this.client
            .from('discord_link_tokens')
            .update({ used: true })
            .eq('id', tokenData.id);

        logger.info(`Account linked: Discord ${tokenData.discord_id} -> User ${userId}`);
        return true;
    }

    /**
     * Unlink a Discord account
     */
    async unlinkAccount(discordId: string): Promise<boolean> {
        const { error } = await this.client
            .from('discord_linked_accounts')
            .delete()
            .eq('discord_id', discordId);

        if (error) {
            logger.error('Failed to unlink account:', error);
            return false;
        }
        return true;
    }

    /**
     * Get all linked accounts (for startup role sync)
     */
    async getAllLinkedAccounts(): Promise<{ discord_id: string }[]> {
        const { data, error } = await this.client
            .from('discord_linked_accounts')
            .select('discord_id');

        if (error) {
            logger.error('Failed to get all linked accounts:', error);
            return [];
        }
        return data || [];
    }

    // ============================================
    // Bot Settings
    // ============================================

    /**
     * Get bot settings for a guild
     */
    async getBotSettings(guildId: string): Promise<BotSettings | null> {
        const { data, error } = await this.client
            .from('bot_settings')
            .select('*')
            .eq('guild_id', guildId)
            .single();

        if (error && error.code !== 'PGRST116') {
            logger.error(`Failed to get bot settings for ${guildId}:`, error);
        }

        const fallbackAiChannelId = await localSettings.getAiChannelId(guildId);
        if (!fallbackAiChannelId) return data as BotSettings | null;
        return {
            ...(data || { guild_id: guildId }),
            ai_channel_id: data?.ai_channel_id || fallbackAiChannelId,
        } as BotSettings;
    }

    /**
     * Update bot settings
     */
    async updateBotSettings(
        guildId: string,
        settings: Partial<Omit<BotSettings, 'guild_id' | 'updated_at'>>
    ): Promise<boolean> {
        const { error } = await this.client
            .from('bot_settings')
            .upsert({
                guild_id: guildId,
                ...settings,
                updated_at: new Date().toISOString()
            });

        if (error) {
            const missingAiColumn = 'ai_channel_id' in settings && (
                error.code === '42703' ||
                error.code === 'PGRST204' ||
                String(error.message || '').includes('ai_channel_id')
            );
            if (missingAiColumn) {
                logger.warn('bot_settings.ai_channel_id is missing in Supabase; using local file fallback. Apply the migration when possible.');
                return localSettings.setAiChannelId(guildId, settings.ai_channel_id ?? null);
            }
            logger.error(`Failed to update bot settings for ${guildId}:`, error);
            return false;
        }

        if ('ai_channel_id' in settings) {
            await localSettings.setAiChannelId(guildId, settings.ai_channel_id ?? null);
        }
        return true;
    }

    // ============================================
    // User Profile
    // ============================================

    /**
     * Get user profile by user ID
     */
    async getUserProfile(userId: string): Promise<UserProfile | null> {
        const { data, error } = await this.client
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            logger.error('Failed to get user profile:', error);
            return null;
        }
        return data;
    }

    // ── VCCRS / CP economy ────────────────────────────────────────────────

    /** Top profiles by CP (for the leaderboard). */
    async getCpLeaderboard(limit = 10, offset = 0): Promise<any[]> {
        const { data, error } = await this.client
            .from('profiles')
            .select('*')
            .order('total_cp', { ascending: false, nullsFirst: false })
            .range(offset, offset + limit - 1);
        if (error) {
            logger.error('getCpLeaderboard failed:', error);
            return [];
        }
        return data || [];
    }

    /** The user's 1-based CP rank (how many profiles have more CP, +1). */
    async getCpRank(userId: string): Promise<number | null> {
        const profile = await this.getUserProfile(userId);
        if (!profile) return null;
        const myCp = Number((profile as any).total_cp ?? 0);
        const { count, error } = await this.client
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .gt('total_cp', myCp);
        if (error) {
            logger.error('getCpRank failed:', error);
            return null;
        }
        return (count ?? 0) + 1;
    }

    /** Recent CP ledger entries for a user. */
    async getCpTransactions(userId: string, limit = 6, offset = 0): Promise<any[]> {
        const { data, error } = await this.client
            .from('cp_transactions')
            .select('action_type, cp_earned, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (error) {
            logger.error('getCpTransactions failed:', error);
            return [];
        }
        return data || [];
    }

    /**
     * Award XP to a linked user, mirroring how the website grants upload XP:
     * bump profiles.total_xp via the increment_xp RPC and write a row to the XP
     * ledger (cp_transactions). action_type drives the friendly label shown in
     * the wallet's "Recent Activity (XP)" panel. Returns true on success.
     */
    async grantXp(userId: string, amount: number, actionType: string, metadata: Record<string, unknown> = {}): Promise<boolean> {
        if (!userId || !Number.isFinite(amount) || amount <= 0) return false;
        const { error: rpcError } = await this.client.rpc('increment_xp', { uid: userId, amount });
        if (rpcError) {
            logger.error('grantXp increment_xp failed:', rpcError);
            return false;
        }
        const { error: ledgerError } = await this.client
            .from('cp_transactions')
            .insert({ user_id: userId, action_type: actionType, cp_earned: Math.floor(amount), metadata });
        if (ledgerError) {
            // XP already credited; ledger row is cosmetic, so don't fail hard.
            logger.warn(`grantXp ledger insert failed: ${ledgerError.message}`);
        }
        return true;
    }

    /** Total CP ledger entries for a user (for pagination). */
    async getCpTransactionCount(userId: string): Promise<number> {
        const { count, error } = await this.client
            .from('cp_transactions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId);
        if (error) return 0;
        return count ?? 0;
    }

    // ── Economy money-movement RPCs (all atomic, server-side) ─────────────

    private async econRpc(fn: string, params: Record<string, unknown>): Promise<any> {
        const { data, error } = await this.client.rpc(fn, params);
        if (error) {
            logger.error(`${fn} failed:`, error);
            return { ok: false, error: error.message || 'Database error' };
        }
        return data;
    }

    econTransferCp(fromUserId: string, toUserId: string, amount: number, reason?: string) {
        return this.econRpc('econ_transfer_cp', { p_from: fromUserId, p_to: toUserId, p_amount: amount, p_reason: reason ?? null });
    }

    econBank(userId: string, op: 'deposit' | 'withdraw', amount: number) {
        return this.econRpc('econ_bank', { p_user: userId, p_op: op, p_amount: amount });
    }

    econSpendCp(userId: string, amount: number, reason?: string, meta?: Record<string, unknown>) {
        return this.econRpc('econ_spend_cp', { p_user: userId, p_amount: amount, p_reason: reason ?? null, p_meta: meta ?? {} });
    }

    econGrantCp(userId: string, amount: number, kind = 'convert_in', reason?: string, meta?: Record<string, unknown>) {
        return this.econRpc('econ_grant_cp', { p_user: userId, p_amount: amount, p_kind: kind, p_reason: reason ?? null, p_meta: meta ?? {} });
    }

    econAdminAdjustCp(adminUserId: string, userId: string, delta: number, reason?: string) {
        return this.econRpc('econ_admin_adjust_cp', { p_admin: adminUserId, p_user: userId, p_delta: delta, p_reason: reason ?? null });
    }

    econAdminSetFrozen(adminUserId: string, userId: string, frozen: boolean) {
        return this.econRpc('econ_admin_set_frozen', { p_admin: adminUserId, p_user: userId, p_frozen: frozen });
    }

    async getEconomyRates(): Promise<any[]> {
        const { data, error } = await this.client.from('economy_rates').select('*').eq('enabled', true);
        if (error) {
            logger.error('getEconomyRates failed:', error);
            return [];
        }
        return data || [];
    }

    async getEconomyLedger(userId: string, limit = 8, offset = 0): Promise<any[]> {
        const { data, error } = await this.client
            .from('economy_ledger')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);
        if (error) {
            logger.error('getEconomyLedger failed:', error);
            return [];
        }
        return data || [];
    }

    /**
     * Check if user is admin
     */
    async isUserAdmin(userIdOrDiscordId: string): Promise<boolean> {
        let userId = userIdOrDiscordId;
        if (!userIdOrDiscordId.includes('-')) {
            const linked = await this.getLinkedAccount(userIdOrDiscordId).catch(() => null);
            if (!linked) return false;
            userId = linked.user_id;
        }
        const profile = await this.getUserProfile(userId);
        return profile?.is_admin ?? false;
    }

    /**
     * Get detailed user activity history (simplified for now)
     */
    async getUserHistory(userId: string): Promise<any[]> {
        // This will eventually pull from a separate activity_logs or transactions table
        // For now, we'll return an empty array if no specific table exists
        const { data, error } = await this.client
            .from('audit_logs')
            .select('*')
            .or(`admin_id.eq.${userId},target_id.eq.${userId}`)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) {
            logger.error('Failed to get user history:', error);
            return [];
        }
        return data || [];
    }

    // ============================================
    // Audit Logging
    // ============================================

    /**
     * Log an audit event
     */
    async logAudit(
        adminId: string | null,
        adminEmail: string | null,
        action: string,
        targetType: string,
        targetId: string,
        details: Record<string, any> = {}
    ): Promise<void> {
        const { error } = await this.client
            .from('audit_logs')
            .insert({
                admin_id: adminId,
                admin_email: adminEmail,
                action,
                target_type: targetType,
                target_id: targetId,
                details,
            });

        if (error) {
            logger.error('Failed to log audit event:', error);
        }
    }

    // ============================================
    // Ticket Categories
    // ============================================

    /**
     * Get all enabled ticket categories for a guild
     */
    async getTicketCategories(guildId: string): Promise<any[]> {
        const { data, error } = await this.client
            .from('ticket_categories')
            .select('*')
            .eq('guild_id', guildId)
            .eq('enabled', true)
            .order('position', { ascending: true });

        if (error) {
            logger.error('Failed to get ticket categories:', error);
            return [];
        }
        return data || [];
    }

    /**
     * Get all ticket categories (including disabled) for admin
     */
    async getAllTicketCategories(guildId: string): Promise<any[]> {
        const { data, error } = await this.client
            .from('ticket_categories')
            .select('*')
            .eq('guild_id', guildId)
            .order('position', { ascending: true });

        if (error) {
            logger.error('Failed to get all ticket categories:', error);
            return [];
        }
        return data || [];
    }

    /**
     * Create a ticket category
     */
    async createTicketCategory(category: {
        guild_id: string;
        name: string;
        emoji?: string;
        description?: string;
        priority_default?: string;
        staff_roles?: string[];
        custom_questions?: any[];
        position?: number;
        discord_category_id?: string | null;
    }): Promise<any | null> {
        const { data, error } = await this.client
            .from('ticket_categories')
            .insert(category)
            .select()
            .single();

        if (error) {
            logger.error('Failed to create ticket category:', error);
            return null;
        }
        return data;
    }

    /**
     * Update a ticket category
     */
    async updateTicketCategory(id: string, updates: Partial<{
        name: string;
        emoji: string;
        description: string;
        priority_default: string;
        staff_roles: string[];
        custom_questions: any[];
        position: number;
        enabled: boolean;
        discord_category_id: string | null;
    }>): Promise<boolean> {
        const { error } = await this.client
            .from('ticket_categories')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            logger.error('Failed to update ticket category:', error);
            return false;
        }
        return true;
    }

    /**
     * Delete a ticket category
     */
    async deleteTicketCategory(id: string): Promise<boolean> {
        const { error } = await this.client
            .from('ticket_categories')
            .delete()
            .eq('id', id);

        if (error) {
            logger.error('Failed to delete ticket category:', error);
            return false;
        }
        return true;
    }

    /**
     * Get category by ID
     */
    async getTicketCategory(id: string): Promise<any | null> {
        const { data, error } = await this.client
            .from('ticket_categories')
            .select('*')
            .eq('id', id)
            .single();

        if (error && error.code !== 'PGRST116') {
            logger.error('Failed to get ticket category:', error);
        }
        return data;
    }

    // ============================================
    // Tickets
    // ============================================

    /**
     * Create a new ticket
     */
    async createTicket(ticketData: {
        guild_id: string;
        channel_id: string;
        user_id: string | null;
        discord_id: string;
        category_id: string;
        ticket_number: number;
        subject: string;
        description: string;
        email: string;
        priority?: string;
        custom_answers?: Record<string, string>;
    }): Promise<any | null> {
        const { data, error } = await this.client
            .from('tickets')
            .insert(ticketData)
            .select('*, category:ticket_categories(*)')
            .single();

        if (error) {
            logger.error('Failed to create ticket:', error);
            return null;
        }
        return data;
    }

    /**
     * Get ticket by ID
     */
    async getTicket(id: string): Promise<any | null> {
        const { data, error } = await this.client
            .from('tickets')
            .select('*, category:ticket_categories(*)')
            .eq('id', id)
            .single();

        if (error && error.code !== 'PGRST116') {
            logger.error('Failed to get ticket:', error);
        }
        return data;
    }

    /**
     * Get ticket by channel ID
     */
    async getTicketByChannel(channelId: string): Promise<any | null> {
        const { data, error } = await this.client
            .from('tickets')
            .select('*, category:ticket_categories(*)')
            .eq('channel_id', channelId)
            .single();

        if (error && error.code !== 'PGRST116') {
            logger.error('Failed to get ticket by channel:', error);
        }
        return data;
    }

    /**
     * Update ticket
     */
    async updateTicket(id: string, updates: Partial<{
        status: string;
        priority: string;
        claimed_by: string;
        claimed_by_name: string;
        linked_server_id: string;
        linked_invoice_id: string;
        closed_at: string;
    }>): Promise<boolean> {
        const { error } = await this.client
            .from('tickets')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            logger.error('Failed to update ticket:', error);
            return false;
        }
        return true;
    }

    /**
     * Get open tickets by user
     */
    async getOpenTicketsByUser(discordId: string): Promise<any[]> {
        const { data, error } = await this.client
            .from('tickets')
            .select('*, category:ticket_categories(*)')
            .eq('discord_id', discordId)
            .neq('status', 'closed')
            .order('created_at', { ascending: false });

        if (error) {
            logger.error('Failed to get user tickets:', error);
            return [];
        }
        return data || [];
    }

    /**
     * Get all tickets for a guild (admin)
     */
    async getGuildTickets(guildId: string, status?: string): Promise<any[]> {
        let query = this.client
            .from('tickets')
            .select('*, category:ticket_categories(*)')
            .eq('guild_id', guildId)
            .order('created_at', { ascending: false })
            .limit(50);

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) {
            logger.error('Failed to get guild tickets:', error);
            return [];
        }
        return data || [];
    }

    /**
     * Get next ticket number for a guild
     */
    async getNextTicketNumber(guildId: string): Promise<number> {
        const { data, error } = await this.client
            .from('tickets')
            .select('ticket_number')
            .eq('guild_id', guildId)
            .order('ticket_number', { ascending: false })
            .limit(1)
            .single();

        if (error || !data) {
            return 1;
        }
        return (data.ticket_number || 0) + 1;
    }

    // ============================================
    // Ticket Messages
    // ============================================

    /**
     * Log a ticket message
     */
    async logTicketMessage(message: {
        ticket_id: string;
        author_discord_id: string;
        author_username: string;
        author_is_staff: boolean;
        content: string;
        attachments?: string[];
    }): Promise<boolean> {
        const { error } = await this.client
            .from('ticket_messages')
            .insert(message);

        if (error) {
            logger.error('Failed to log ticket message:', error);
            return false;
        }
        return true;
    }

    /**
     * Get ticket messages (for AI context)
     */
    async getTicketMessages(ticketId: string, limit = 50): Promise<any[]> {
        const { data, error } = await this.client
            .from('ticket_messages')
            .select('*')
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: true })
            .limit(limit);

        if (error) {
            logger.error('Failed to get ticket messages:', error);
            return [];
        }
        return data || [];
    }

    // ============================================
    // User Preferences
    // ============================================

    /**
     * Get user preferences
     */
    async getUserPreferences(discordId: string): Promise<any | null> {
        const { data, error } = await this.client
            .from('user_preferences')
            .select('*')
            .eq('discord_id', discordId)
            .single();

        if (error && error.code !== 'PGRST116') {
            logger.error('Failed to get user preferences:', error);
        }
        return data;
    }

    /**
     * Create or update user preferences
     */
    async upsertUserPreferences(discordId: string, userId: string, prefs: Partial<{
        dm_maintenance: boolean;
        dm_billing: boolean;
        dm_security: boolean;
        dm_promotions: boolean;
    }>): Promise<boolean> {
        const existing = await this.getUserPreferences(discordId);
        const { error } = await this.client
            .from('user_preferences')
            .upsert({
                discord_id: discordId,
                user_id: userId,
                ...(existing ? {} : DEFAULT_DM_PREFERENCES),
                ...prefs,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'discord_id' });

        if (error) {
            logger.error('Failed to upsert user preferences:', error);
            return false;
        }
        return true;
    }

    /**
     * Get all users opted in for a DM category
     */
    async getUsersOptedInForDM(category: 'maintenance' | 'billing' | 'security' | 'promotions'): Promise<string[]> {
        const column = `dm_${category}`;
        const { data: linkedAccounts, error: linkedError } = await this.client
            .from('discord_linked_accounts')
            .select('discord_id');

        if (linkedError) {
            logger.error(`Failed to get linked accounts for ${category} DMs:`, linkedError);
            return [];
        }

        const { data: optedOut, error } = await this.client
            .from('user_preferences')
            .select('discord_id')
            .eq(column, false);

        if (error) {
            logger.error(`Failed to get users opted in for ${category}:`, error);
            return [];
        }

        const optedOutIds = new Set((optedOut || []).map(u => u.discord_id));
        return (linkedAccounts || [])
            .map(account => account.discord_id)
            .filter(discordId => discordId && !optedOutIds.has(discordId));
    }

    // ============================================
    // Discord Announcements
    // ============================================

    /**
     * Create a new announcement
     */
    async createDiscordAnnouncement(announcement: {
        guild_id: string;
        title: string;
        description: string;
        type?: string;
        target?: string;
        dm_category?: string;
        channel_id?: string;
        thumbnail_url?: string;
        image_url?: string;
        footer_text?: string;
        ping_everyone?: boolean;
        scheduled_at?: string;
        created_by: string;
        created_by_name?: string;
    }): Promise<any | null> {
        const { data, error } = await this.client
            .from('discord_announcements')
            .insert({ ...announcement, content: announcement.description, status: 'draft' })
            .select()
            .single();

        if (error) {
            logger.error('Failed to create announcement:', error);
            return null;
        }
        return data;
    }

    /**
     * Get announcement by ID
     */
    async getDiscordAnnouncement(id: string): Promise<any | null> {
        const { data, error } = await this.client
            .from('discord_announcements')
            .select('*')
            .eq('id', id)
            .single();

        if (error && error.code !== 'PGRST116') {
            logger.error('Failed to get announcement:', error);
        }
        return data;
    }

    /**
     * Update announcement
     */
    async updateDiscordAnnouncement(id: string, updates: Partial<{
        title: string;
        description: string;
        type: string;
        target: string;
        dm_category: string;
        thumbnail_url: string;
        image_url: string;
        footer_text: string;
        ping_everyone: boolean;
        status: string;
        sent_count: number;
        failed_count: number;
        completed_at: string;
    }>): Promise<boolean> {
        const { error } = await this.client
            .from('discord_announcements')
            .update(updates)
            .eq('id', id);

        if (error) {
            logger.error('Failed to update announcement:', error);
            return false;
        }
        return true;
    }

    /**
     * Get recent announcements for a guild
     */
    async getGuildAnnouncements(guildId: string, limit = 10): Promise<any[]> {
        const { data, error } = await this.client
            .from('discord_announcements')
            .select('*')
            .eq('guild_id', guildId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            logger.error('Failed to get guild announcements:', error);
            return [];
        }
        return data || [];
    }

    /**
     * Increment announcement counters
     */
    async incrementAnnouncementCounters(id: string, sent: number, failed: number): Promise<boolean> {
        const current = await this.getDiscordAnnouncement(id);
        if (!current) return false;

        return this.updateDiscordAnnouncement(id, {
            sent_count: (current.sent_count || 0) + sent,
            failed_count: (current.failed_count || 0) + failed,
        });
    }

    // ============================================
    // Admin Discord DM Queue
    // ============================================

    async getPendingDiscordDms(limit = 10): Promise<any[]> {
        const { data, error } = await this.client
            .from('discord_dm_queue')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(limit);

        if (error) {
            logger.error('Failed to get pending Discord DMs:', error);
            return [];
        }
        return data || [];
    }

    async claimDiscordDm(id: string): Promise<any | null> {
        const { data, error } = await this.client
            .from('discord_dm_queue')
            .update({ status: 'sending', error_message: null })
            .eq('id', id)
            .eq('status', 'pending')
            .select('*')
            .maybeSingle();

        if (error) {
            logger.error('Failed to claim Discord DM:', error);
            return null;
        }
        return data;
    }

    async markDiscordDmSent(id: string): Promise<boolean> {
        const { error } = await this.client
            .from('discord_dm_queue')
            .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                error_message: null,
            })
            .eq('id', id);

        if (error) {
            logger.error('Failed to mark Discord DM sent:', error);
            return false;
        }
        return true;
    }

    async markDiscordDmFailed(id: string, errorMessage: string): Promise<boolean> {
        const { error } = await this.client
            .from('discord_dm_queue')
            .update({
                status: 'failed',
                error_message: errorMessage.slice(0, 500),
            })
            .eq('id', id);

        if (error) {
            logger.error('Failed to mark Discord DM failed:', error);
            return false;
        }
        return true;
    }

    // ============================================
    // Custom Embeds
    // ============================================

    async getCustomEmbed(guildId: string, name: string): Promise<CustomEmbed | null> {
        const { data, error } = await this.client
            .from('custom_embeds')
            .select('*')
            .eq('guild_id', guildId)
            .eq('name', name)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            logger.error(`Failed to get custom embed ${name} for ${guildId}:`, error);
            return null;
        }
        return data;
    }

    async saveCustomEmbed(guildId: string, name: string, embed: Partial<CustomEmbed>): Promise<boolean> {
        const existing = await this.getCustomEmbed(guildId, name);
        if (existing) {
            const { error } = await this.client
                .from('custom_embeds')
                .update({
                    ...embed,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);

            if (error) {
                logger.error(`Failed to update custom embed ${name} for ${guildId}:`, error);
                return false;
            }
        } else {
            const { error } = await this.client
                .from('custom_embeds')
                .insert({
                    guild_id: guildId,
                    name: name,
                    ...embed,
                    updated_at: new Date().toISOString()
                });

            if (error) {
                logger.error(`Failed to insert custom embed ${name} for ${guildId}:`, error);
                return false;
            }
        }
        return true;
    }

    async deleteCustomEmbed(guildId: string, name: string): Promise<boolean> {
        const { error } = await this.client
            .from('custom_embeds')
            .delete()
            .eq('guild_id', guildId)
            .eq('name', name);

        if (error) {
            logger.error(`Failed to delete custom embed ${name} for ${guildId}:`, error);
            return false;
        }
        return true;
    }

    async listCustomEmbeds(guildId: string): Promise<CustomEmbed[]> {
        const { data, error } = await this.client
            .from('custom_embeds')
            .select('*')
            .eq('guild_id', guildId)
            .order('name', { ascending: true });

        if (error) {
            logger.error(`Failed to list custom embeds for ${guildId}:`, error);
            return [];
        }
        return data || [];
    }

    async getEmbedSettings(guildId: string): Promise<EmbedSettings | null> {
        const { data, error } = await this.client
            .from('embed_settings')
            .select('*')
            .eq('guild_id', guildId)
            .maybeSingle();

        if (error) {
            logger.error(`Failed to get embed settings for ${guildId}:`, error);
            return null;
        }
        return data;
    }

    async updateEmbedSettings(guildId: string, settings: Partial<EmbedSettings>): Promise<boolean> {
        const { error } = await this.client
            .from('embed_settings')
            .upsert({
                guild_id: guildId,
                ...settings,
                updated_at: new Date().toISOString()
            });

        if (error) {
            logger.error(`Failed to update embed settings for ${guildId}:`, error);
            return false;
        }
        return true;
    }

    // ============================================
    // Suggestions
    // ============================================

    async createSuggestion(
        guildId: string,
        channelId: string,
        messageId: string,
        userId: string,
        authorTag: string,
        title: string,
        content: string
    ): Promise<Suggestion | null> {
        const { data, error } = await this.client
            .from('suggestions')
            .insert({
                guild_id: guildId,
                channel_id: channelId,
                message_id: messageId,
                user_id: userId,
                author_tag: authorTag,
                title: title,
                content: content,
                status: 'pending'
            })
            .select()
            .single();

        if (error) {
            logger.error('Failed to create suggestion:', error);
            return null;
        }
        return data;
    }

    async getSuggestion(id: number): Promise<Suggestion | null> {
        const { data, error } = await this.client
            .from('suggestions')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (error) {
            logger.error(`Failed to get suggestion #${id}:`, error);
            return null;
        }
        return data;
    }

    async getSuggestionByMessage(messageId: string): Promise<Suggestion | null> {
        const { data, error } = await this.client
            .from('suggestions')
            .select('*')
            .eq('message_id', messageId)
            .maybeSingle();

        if (error) {
            logger.error(`Failed to get suggestion for message ${messageId}:`, error);
            return null;
        }
        return data;
    }

    async updateSuggestionStatus(id: number, status: 'pending' | 'approved' | 'denied' | 'implemented'): Promise<boolean> {
        const { error } = await this.client
            .from('suggestions')
            .update({ status: status, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            logger.error(`Failed to update suggestion status for #${id}:`, error);
            return false;
        }
        return true;
    }

    async toggleSuggestionLock(id: number): Promise<boolean> {
        const suggestion = await this.getSuggestion(id);
        if (!suggestion) return false;

        const { error } = await this.client
            .from('suggestions')
            .update({ locked: !suggestion.locked, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            logger.error(`Failed to toggle suggestion lock for #${id}:`, error);
            return false;
        }
        return true;
    }

    async deleteSuggestion(id: number): Promise<boolean> {
        const { error } = await this.client
            .from('suggestions')
            .delete()
            .eq('id', id);

        if (error) {
            logger.error(`Failed to delete suggestion #${id}:`, error);
            return false;
        }
        return true;
    }

    async addSuggestionVote(
        suggestionId: number,
        userId: string,
        username: string,
        voteType: 'up' | 'down'
    ): Promise<boolean> {
        const { error } = await this.client
            .from('suggestion_votes')
            .upsert(
                {
                    suggestion_id: suggestionId,
                    user_id: userId,
                    username: username,
                    vote_type: voteType,
                    created_at: new Date().toISOString()
                },
                { onConflict: 'suggestion_id,user_id' }
            );

        if (error) {
            logger.error(`Failed to add suggestion vote for #${suggestionId} by ${userId}:`, error);
            return false;
        }
        return true;
    }

    async removeSuggestionVote(suggestionId: number, userId: string): Promise<boolean> {
        const { error } = await this.client
            .from('suggestion_votes')
            .delete()
            .eq('suggestion_id', suggestionId)
            .eq('user_id', userId);

        if (error) {
            logger.error(`Failed to remove suggestion vote for #${suggestionId} by ${userId}:`, error);
            return false;
        }
        return true;
    }

    async getSuggestionVoteCounts(suggestionId: number): Promise<{ up: number; down: number }> {
        const { data, error } = await this.client
            .from('suggestion_votes')
            .select('vote_type')
            .eq('suggestion_id', suggestionId);

        if (error) {
            logger.error(`Failed to get suggestion vote counts for #${suggestionId}:`, error);
            return { up: 0, down: 0 };
        }

        const counts = { up: 0, down: 0 };
        data?.forEach((v: { vote_type: string }) => {
            if (v.vote_type === 'up') counts.up++;
            else if (v.vote_type === 'down') counts.down++;
        });
        return counts;
    }

    async getSuggestionVotes(suggestionId: number): Promise<SuggestionVote[]> {
        const { data, error } = await this.client
            .from('suggestion_votes')
            .select('*')
            .eq('suggestion_id', suggestionId)
            .order('created_at', { ascending: false });

        if (error) {
            logger.error(`Failed to get suggestion votes for #${suggestionId}:`, error);
            return [];
        }
        return data || [];
    }

    // ============================================
    // Giveaways
    // ============================================

    async createGiveaway(
        guildId: string,
        channelId: string,
        messageId: string,
        prize: string,
        duration: string,
        winnersCount: number,
        endsAt: Date,
        hostId: string,
        requirements: any,
        bonusEntries: any
    ): Promise<Giveaway | null> {
        const { data, error } = await this.client
            .from('giveaways')
            .insert({
                guild_id: guildId,
                channel_id: channelId,
                message_id: messageId,
                prize: prize,
                duration: duration,
                winners_count: winnersCount,
                ends_at: endsAt.toISOString(),
                host_id: hostId,
                requirements: requirements,
                bonus_entries: bonusEntries,
                status: 'active',
                participants: [],
                winners: []
            })
            .select()
            .single();

        if (error) {
            logger.error('Failed to create giveaway:', error);
            return null;
        }
        return data;
    }

    async getGiveaway(idOrMessageId: string): Promise<Giveaway | null> {
        const { data, error } = await this.client
            .from('giveaways')
            .select('*')
            .or(`id.eq.${idOrMessageId},message_id.eq.${idOrMessageId}`)
            .maybeSingle();

        if (error) {
            logger.error(`Failed to get giveaway ${idOrMessageId}:`, error);
            return null;
        }
        return data;
    }

    async updateGiveaway(id: string, updates: Partial<Giveaway>): Promise<boolean> {
        const { error } = await this.client
            .from('giveaways')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            logger.error(`Failed to update giveaway ${id}:`, error);
            return false;
        }
        return true;
    }

    async listGiveaways(guildId: string, activeOnly = false): Promise<Giveaway[]> {
        let query = this.client
            .from('giveaways')
            .select('*')
            .eq('guild_id', guildId);

        if (activeOnly) {
            query = query.eq('status', 'active');
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) {
            logger.error(`Failed to list giveaways for ${guildId}:`, error);
            return [];
        }
        return data || [];
    }

    async deleteGiveaway(id: string): Promise<boolean> {
        const { error } = await this.client
            .from('giveaways')
            .delete()
            .eq('id', id);

        if (error) {
            logger.error(`Failed to delete giveaway ${id}:`, error);
            return false;
        }
        return true;
    }

    // ============================================
    // Custom Commands
    // ============================================

    async createCustomCommand(guildId: string, cmd: Partial<CustomCommand>): Promise<boolean> {
        const { error } = await this.client
            .from('custom_commands')
            .upsert({
                guild_id: guildId,
                name: cmd.name,
                ...cmd,
                updated_at: new Date().toISOString()
            });

        if (error) {
            logger.error(`Failed to create custom command ${cmd.name} for ${guildId}:`, error);
            return false;
        }
        return true;
    }

    async deleteCustomCommand(guildId: string, name: string): Promise<boolean> {
        const { error } = await this.client
            .from('custom_commands')
            .delete()
            .eq('guild_id', guildId)
            .eq('name', name);

        if (error) {
            logger.error(`Failed to delete custom command ${name} for ${guildId}:`, error);
            return false;
        }
        return true;
    }

    async listCustomCommands(guildId: string): Promise<CustomCommand[]> {
        const { data, error } = await this.client
            .from('custom_commands')
            .select('*')
            .eq('guild_id', guildId)
            .order('name', { ascending: true });

        if (error) {
            logger.error(`Failed to list custom commands for ${guildId}:`, error);
            return [];
        }
        return data || [];
    }

    async getCustomCommand(guildId: string, name: string): Promise<CustomCommand | null> {
        const { data, error } = await this.client
            .from('custom_commands')
            .select('*')
            .eq('guild_id', guildId);

        if (error) {
            logger.error(`Failed to get custom command ${name} for ${guildId}:`, error);
            return null;
        }
        if (!data) return null;

        const command = data.find(c => c.name.toLowerCase() === name.toLowerCase() || 
            (Array.isArray(c.aliases) && c.aliases.some((a: string) => a.toLowerCase() === name.toLowerCase()))
        );
        return command || null;
    }

    async updateCustomCommand(guildId: string, name: string, updates: Partial<CustomCommand>): Promise<boolean> {
        const { error } = await this.client
            .from('custom_commands')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('guild_id', guildId)
            .eq('name', name);

        if (error) {
            logger.error(`Failed to update custom command ${name} for ${guildId}:`, error);
            return false;
        }
        return true;
    }
}

export const supabase = new SupabaseService();
