import { supabase } from './supabase.js';
import { logger } from '../utils/logger.js';

export interface AutoModRule {
    id: string;
    type: 'spam' | 'invites' | 'links' | 'scam' | 'mention_spam' | 'emoji_spam' | 'caps' | 'bad_words' | 'duplicate' | 'advertisement';
    enabled: boolean;
    punishment: 'warn' | 'delete' | 'timeout' | 'kick' | 'ban';
    threshold?: number;
    duration?: number;
    whitelistRoleIds: string[];
    whitelistChannelIds: string[];
}

export interface AutoModConfig {
    enabled: boolean;
    logChannelId: string | null;
    rules: AutoModRule[];
}

const DEFAULT_RULES: AutoModRule[] = [
    { id: 'spam', type: 'spam', enabled: true, punishment: 'timeout', threshold: 5, duration: 60, whitelistRoleIds: [], whitelistChannelIds: [] },
    { id: 'invites', type: 'invites', enabled: true, punishment: 'delete', whitelistRoleIds: [], whitelistChannelIds: [] },
    { id: 'links', type: 'links', enabled: false, punishment: 'delete', whitelistRoleIds: [], whitelistChannelIds: [] },
    { id: 'scam', type: 'scam', enabled: true, punishment: 'ban', whitelistRoleIds: [], whitelistChannelIds: [] },
    { id: 'mention_spam', type: 'mention_spam', enabled: true, punishment: 'timeout', threshold: 5, duration: 60, whitelistRoleIds: [], whitelistChannelIds: [] },
    { id: 'emoji_spam', type: 'emoji_spam', enabled: true, punishment: 'delete', threshold: 10, whitelistRoleIds: [], whitelistChannelIds: [] },
    { id: 'caps', type: 'caps', enabled: true, punishment: 'delete', threshold: 70, whitelistRoleIds: [], whitelistChannelIds: [] },
    { id: 'bad_words', type: 'bad_words', enabled: true, punishment: 'delete', whitelistRoleIds: [], whitelistChannelIds: [] },
    { id: 'duplicate', type: 'duplicate', enabled: true, punishment: 'delete', threshold: 3, whitelistRoleIds: [], whitelistChannelIds: [] },
    { id: 'advertisement', type: 'advertisement', enabled: true, punishment: 'warn', whitelistRoleIds: [], whitelistChannelIds: [] },
];

const DEFAULT_CONFIG: AutoModConfig = {
    enabled: false,
    logChannelId: null,
    rules: DEFAULT_RULES,
};

export class AutoModSettingsService {
    async get(guildId: string): Promise<AutoModConfig> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_automod_settings');
            let raw: any = {};
            if (embed?.description) {
                raw = JSON.parse(embed.description);
            }
            return { ...DEFAULT_CONFIG, ...raw };
        } catch (error) {
            logger.error(`Failed to get auto-mod settings for guild ${guildId}:`, error);
            return DEFAULT_CONFIG;
        }
    }

    async set(guildId: string, updates: Partial<AutoModConfig>): Promise<AutoModConfig> {
        const current = await this.get(guildId);
        const updated = { ...current, ...updates };
        try {
            await supabase.saveCustomEmbed(guildId, '_automod_settings', {
                description: JSON.stringify(updated),
            });
        } catch (error) {
            logger.error(`Failed to save auto-mod settings for guild ${guildId}:`, error);
        }
        return updated;
    }
}

export const autoModSettings = new AutoModSettingsService();

const SCAM_DOMAINS = [
    'discord-nitro.xyz', 'discord.giveaway', 'steamcommunity.ru',
    'free-nitro', 'nitro-gift', 'airdrop', 'claim-nitro',
];

export function isScamLink(text: string): boolean {
    const lower = text.toLowerCase();
    return SCAM_DOMAINS.some(d => lower.includes(d));
}

export function isInviteLink(text: string): boolean {
    return /discord\.(gg|com\/invite)\/\w+/i.test(text);
}

export function isUrl(text: string): boolean {
    return /https?:\/\/[^\s]+/.test(text);
}

export function getCapsPercentage(text: string): number {
    const letters = text.replace(/[^a-zA-Z]/g, '');
    if (!letters.length) return 0;
    const upper = letters.replace(/[^A-Z]/g, '');
    return (upper.length / letters.length) * 100;
}

export function countMentions(text: string): number {
    return (text.match(/<@!?&?\d+>/g) || []).length;
}

export function countEmojis(text: string): number {
    const emojiRegex = /<a?:\w+:\d+>|[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const matches = text.match(emojiRegex);
    return matches?.length || 0;
}

const BAD_WORDS_LIST = [
    'nigger', 'faggot', 'retard', 'kys', 'kill yourself', 'kill urself',
    'nazi', 'hitler', 'hailhitler',
];

export function containsBadWords(text: string): boolean {
    const lower = text.toLowerCase();
    return BAD_WORDS_LIST.some(w => lower.includes(w));
}

export function isAdvertisement(text: string): boolean {
    const lower = text.toLowerCase();
    const adPatterns = [
        /(buy|sell|purchase)\s+\w+\s+(for|with)\s+\$?/i,
        /discord\.(gg|com\/invite)\/\w+/i,
        /\b(cheap|discount|free|hack|cheat)\b.*\b(money|nitro|rank|level)\b/i,
    ];
    return adPatterns.some(p => p.test(lower));
}
