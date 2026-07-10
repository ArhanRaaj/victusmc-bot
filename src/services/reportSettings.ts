import { supabase } from './supabase.js';

interface ReportConfig {
    channelId: string | null;
    enabled: boolean;
}

class ReportService {
    async getConfig(guildId: string): Promise<ReportConfig> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_report_config');
            return embed?.description ? JSON.parse(embed.description) : { channelId: null, enabled: false };
        } catch { return { channelId: null, enabled: false }; }
    }

    async saveConfig(guildId: string, config: ReportConfig): Promise<void> {
        await supabase.saveCustomEmbed(guildId, '_report_config', { description: JSON.stringify(config) });
    }
}

export const reportService = new ReportService();