import { supabase } from './supabase.js';
import { logger } from '../utils/logger.js';

export interface GreetConfig {
    welcomeEnabled: boolean;
    welcomeChannelId: string | null;
    welcomeMsg: string;
    leaveEnabled: boolean;
    leaveChannelId: string | null;
    leaveMsg: string;
    dmEnabled: boolean;
    dmMsg: string;
}

const DEFAULT_CONFIG: GreetConfig = {
    welcomeEnabled: false,
    welcomeChannelId: null,
    welcomeMsg: 'Welcome {user} to {guild}! Member #{member_count}',
    leaveEnabled: false,
    leaveChannelId: null,
    leaveMsg: '{user.name} has left the server.',
    dmEnabled: false,
    dmMsg: 'Welcome {user.name} to {guild}! We hope you enjoy your stay.',
};

class GreetSettingsService {
    async get(guildId: string): Promise<GreetConfig> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_greet_settings');
            if (embed?.description) {
                return { ...DEFAULT_CONFIG, ...JSON.parse(embed.description) };
            }
        } catch (error) {
            logger.error(`Failed to get greet settings for guild ${guildId}:`, error);
        }
        return DEFAULT_CONFIG;
    }

    async set(guildId: string, updates: Partial<GreetConfig>): Promise<GreetConfig> {
        const current = await this.get(guildId);
        const updated = { ...current, ...updates };
        try {
            await supabase.saveCustomEmbed(guildId, '_greet_settings', {
                description: JSON.stringify(updated),
            });
        } catch (error) {
            logger.error(`Failed to save greet settings for guild ${guildId}:`, error);
        }
        return updated;
    }
}

export const greetSettings = new GreetSettingsService();

export function formatGreetMsg(template: string, member: any): string {
    return template
        .replace(/{user}/g, `<@${member.user.id}>`)
        .replace(/{user\.name}/g, member.user.username)
        .replace(/{guild}/g, member.guild?.name || 'the server')
        .replace(/{member_count}/g, String(member.guild?.memberCount || 0));
}