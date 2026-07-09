import { supabase } from './supabase.js';
import { logger } from '../utils/logger.js';

export interface CountingConfig {
    enabled: boolean;
    channelId: string | null;
    lastNumber: number;
    lastUserId: string | null;
    count: number;
}

const DEFAULT_CONFIG: CountingConfig = {
    enabled: false,
    channelId: null,
    lastNumber: 0,
    lastUserId: null,
    count: 0,
};

class CountingSettingsService {
    async get(guildId: string): Promise<CountingConfig> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_counting_settings');
            if (embed?.description) {
                return { ...DEFAULT_CONFIG, ...JSON.parse(embed.description) };
            }
        } catch (error) {
            logger.error(`Failed to get counting settings for guild ${guildId}:`, error);
        }
        return DEFAULT_CONFIG;
    }

    async set(guildId: string, updates: Partial<CountingConfig>): Promise<CountingConfig> {
        const current = await this.get(guildId);
        const updated = { ...current, ...updates };
        try {
            await supabase.saveCustomEmbed(guildId, '_counting_settings', {
                description: JSON.stringify(updated),
            });
        } catch (error) {
            logger.error(`Failed to save counting settings for guild ${guildId}:`, error);
        }
        return updated;
    }
}

export const countingSettings = new CountingSettingsService();