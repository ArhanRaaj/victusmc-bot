import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    SlashCommandOptionsOnlyBuilder,
    SlashCommandSubcommandsOnlyBuilder,
    ButtonInteraction,
    StringSelectMenuInteraction,
    ModalSubmitInteraction,
    AutocompleteInteraction,
} from 'discord.js';

// ============================================
// Command Types
// ============================================

export interface Command {
    data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder | Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'>;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
    handleButton?: (interaction: ButtonInteraction) => Promise<void>;
    handleSelectMenu?: (interaction: StringSelectMenuInteraction) => Promise<void>;
    handleModal?: (interaction: ModalSubmitInteraction) => Promise<void>;
    requiresLink?: boolean; // If true, user must have linked account
    adminOnly?: boolean; // If true, user must be admin
    cooldown?: number; // Cooldown in seconds
}

export interface Event {
    name: string;
    once?: boolean;
    execute: (...args: any[]) => Promise<void>;
}

// ============================================
// Component Types
// ============================================

export interface ButtonHandler {
    customId: string | RegExp;
    execute: (interaction: ButtonInteraction) => Promise<void>;
}

export interface SelectMenuHandler {
    customId: string | RegExp;
    execute: (interaction: StringSelectMenuInteraction) => Promise<void>;
}

export interface ModalHandler {
    customId: string | RegExp;
    execute: (interaction: ModalSubmitInteraction) => Promise<void>;
}

// ============================================
// API Response Types
// ============================================

export interface LinkedAccount {
    id: string;
    user_id: string;
    discord_id: string;
    discord_username: string;
    discord_avatar: string | null;
    linked_at: string;
}

export interface LinkToken {
    id: string;
    discord_id: string;
    discord_username: string;
    token: string;
    expires_at: string;
    used: boolean;
}

export interface UserProfile {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    full_name?: string | null;
    username?: string | null;
    is_admin: boolean;
    billing_panel_created?: boolean;
    billing_account_created?: boolean;
    control_panel_created: boolean;
    victus_drive_created?: boolean;
    avatar_url: string | null;
    credits?: number | string | null;
    credit?: number | string | null;
    balance?: number | string | null;
    total_cp?: number | string | null;
    total_xp?: number | string | null;
    created_at: string;
}

export interface BotSettings {
    guild_id: string;
    linked_role_id: string | null;
    log_channel_id: string | null;
    ai_channel_id: string | null;
    ticket_panel_channel_id: string | null;
    ticket_parent_category_id: string | null;
    ticket_archive_channel_id: string | null;
    ticket_staff_role_ids: string[];
    ticket_admin_role_ids: string[];
    ticket_allow_user_close: boolean;
    ticket_allow_user_reopen: boolean;
    prefix: string | null;
    suggestion_channel_id: string | null;
    announcement_channels: string[];
    updated_at: string;
}

// ============================================
// Bot Redesign Types
// ============================================

export interface CustomEmbed {
    id: string;
    guild_id: string;
    name: string;
    title: string | null;
    description: string | null;
    thumbnail_url: string | null;
    image_url: string | null;
    footer_text: string | null;
    footer_icon_url: string | null;
    color: string | null;
    author_name: string | null;
    author_icon_url: string | null;
    author_url: string | null;
    buttons: any[];
    select_menu: any | null;
    created_at: string;
    updated_at: string;
}

export interface EmbedSettings {
    guild_id: string;
    default_color: string | null;
    default_footer: string | null;
    default_author: string | null;
    default_thumbnail: string | null;
    allowed_roles: string[];
    allowed_channels: string[];
    logging_channel_id: string | null;
    updated_at: string;
}

export interface Suggestion {
    id: number;
    guild_id: string;
    channel_id: string;
    message_id: string;
    user_id: string;
    author_tag: string;
    title: string;
    content: string;
    status: 'pending' | 'approved' | 'denied' | 'implemented';
    locked: boolean;
    created_at: string;
    updated_at: string;
}

export interface SuggestionVote {
    id: string;
    suggestion_id: number;
    user_id: string;
    username: string;
    vote_type: 'up' | 'down';
    created_at: string;
}

export interface Giveaway {
    id: string;
    guild_id: string;
    channel_id: string;
    message_id: string;
    prize: string;
    duration: string;
    winners_count: number;
    ends_at: string;
    host_id: string;
    status: 'active' | 'paused' | 'ended';
    paused_at: string | null;
    paused_remaining: number | null;
    requirements: {
        roles?: string[];
        level?: number;
        invites?: number;
        booster?: boolean;
    };
    bonus_entries: Array<{
        roleId: string;
        bonus: number;
    }>;
    participants: string[];
    winners: string[];
    created_at: string;
    updated_at: string;
}

export interface CustomCommand {
    id: string;
    guild_id: string;
    name: string;
    reply_type: 'text' | 'embed' | 'image' | 'message' | 'custom_embed';
    reply_content: string;
    aliases: string[];
    cooldown: number;
    permissions: string[];
    variables: Record<string, string>;
    enabled: boolean;
    created_at: string;
    updated_at: string;
}

// ============================================
// Ticket Types
// ============================================

export interface Ticket {
    id: string;
    ticket_number: number;
    guild_id: string;
    channel_id: string | null;
    user_id: string;
    discord_id: string;
    category_id: string;
    subject: string;
    description: string;
    email: string;
    status: 'open' | 'claimed' | 'locked' | 'closed';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    claimed_by: string | null;
    claimed_by_name: string | null;
    linked_server_id: string | null;
    linked_invoice_id: string | null;
    custom_answers: Record<string, string>;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    // Joined fields
    category?: TicketCategory;
}

export interface TicketCategory {
    id: string;
    guild_id: string;
    name: string;
    emoji: string;
    description: string | null;
    priority_default: 'low' | 'medium' | 'high' | 'urgent';
    staff_roles: string[];
    custom_questions: TicketQuestion[];
    position: number;
    enabled: boolean;
    discord_category_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface TicketQuestion {
    id: string;
    label: string;
    placeholder?: string;
    type: 'short' | 'paragraph';
    required: boolean;
    max_length?: number;
}

export interface TicketMessage {
    id: string;
    ticket_id: string;
    author_discord_id: string;
    author_username: string | null;
    author_is_staff: boolean;
    content: string;
    attachments: string[];
    created_at: string;
}

export interface UserPreferences {
    id: string;
    user_id: string;
    discord_id: string;
    dm_maintenance: boolean;
    dm_billing: boolean;
    dm_security: boolean;
    dm_promotions: boolean;
    created_at: string;
    updated_at: string;
}

export interface Announcement {
    id: string;
    guild_id: string;
    title: string;
    description: string;
    type: 'info' | 'warning' | 'success' | 'error';
    target: 'channel' | 'dm' | 'both';
    dm_category: 'maintenance' | 'billing' | 'security' | 'promotions' | null;
    channel_id: string | null;
    thumbnail_url: string | null;
    image_url: string | null;
    footer_text: string | null;
    ping_everyone: boolean;
    status: 'draft' | 'scheduled' | 'sending' | 'completed' | 'cancelled';
    scheduled_at: string | null;
    sent_count: number;
    failed_count: number;
    created_by: string;
    created_by_name: string | null;
    created_at: string;
    completed_at: string | null;
}

// ============================================
// Embed Theme
// ============================================

export const VICTUS_COLORS = {
    primary: 0x2b2d31,
    success: 0x2b2d31,
    warning: 0x2b2d31,
    error: 0x2b2d31,
    info: 0x2b2d31,
    neutral: 0x2b2d31,
} as const;

export type VictusColor = keyof typeof VICTUS_COLORS;
