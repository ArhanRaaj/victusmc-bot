import { supabase } from './supabase.js';
import { logger } from '../utils/logger.js';

export interface AntiNukeConfig {
    enabled: boolean;
    logChannelId: string | null;
    whitelistRoleIds: string[];
    trustedRoleIds: string[];
    punishments: {
        massBan: { enabled: boolean; threshold: number; action: 'kick' | 'ban' | 'none' };
        massKick: { enabled: boolean; threshold: number; action: 'ban' | 'none' };
        channelSpam: { enabled: boolean; threshold: number; action: 'lockdown' | 'none' };
        channelDelete: { enabled: boolean; threshold: number; action: 'restore' | 'none' };
        roleDelete: { enabled: boolean; threshold: number; action: 'restore' | 'none' };
        roleCreate: { enabled: boolean; threshold: number; action: 'delete' | 'none' };
        webhookSpam: { enabled: boolean; threshold: number; action: 'delete' | 'none' };
        botAdd: { enabled: boolean; action: 'kick' | 'ban' | 'none' };
    };
}

const DEFAULT_CONFIG: AntiNukeConfig = {
    enabled: false,
    logChannelId: null,
    whitelistRoleIds: [],
    trustedRoleIds: [],
    punishments: {
        massBan: { enabled: true, threshold: 3, action: 'ban' },
        massKick: { enabled: true, threshold: 3, action: 'ban' },
        channelSpam: { enabled: true, threshold: 5, action: 'lockdown' },
        channelDelete: { enabled: true, threshold: 2, action: 'restore' },
        roleDelete: { enabled: true, threshold: 2, action: 'restore' },
        roleCreate: { enabled: true, threshold: 3, action: 'delete' },
        webhookSpam: { enabled: true, threshold: 3, action: 'delete' },
        botAdd: { enabled: true, action: 'kick' },
    },
};

export class AntiNukeSettingsService {
    async get(guildId: string): Promise<AntiNukeConfig> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_antinuke_settings');
            let raw: any = {};
            if (embed?.description) {
                raw = JSON.parse(embed.description);
            }
            return { ...DEFAULT_CONFIG, ...raw };
        } catch (error) {
            logger.error(`Failed to get anti-nuke settings for guild ${guildId}:`, error);
            return DEFAULT_CONFIG;
        }
    }

    async set(guildId: string, updates: Partial<AntiNukeConfig>): Promise<AntiNukeConfig> {
        const current = await this.get(guildId);
        const updated = { ...current, ...updates };
        try {
            await supabase.saveCustomEmbed(guildId, '_antinuke_settings', {
                description: JSON.stringify(updated),
            });
        } catch (error) {
            logger.error(`Failed to save anti-nuke settings for guild ${guildId}:`, error);
        }
        return updated;
    }
}

export const antiNukeSettings = new AntiNukeSettingsService();
