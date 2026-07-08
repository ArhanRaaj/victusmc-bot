import { supabase } from './supabase.js';
import { logger } from '../utils/logger.js';

export interface TicketPanelConfig {
    title: string;
    description: string;
    imageUrl: string | null;
    footer: string | null;
    thumbnail: string | null;
}

const DEFAULT_PANEL: TicketPanelConfig = {
    title: 'VictusMC Support Hub',
    description: 'Select a category below to open a support ticket.\n\nOur team will assist you as soon as possible.',
    imageUrl: null,
    footer: null,
    thumbnail: null,
};

export class TicketPanelSettingsService {
    async get(guildId: string): Promise<TicketPanelConfig> {
        try {
            const embed = await supabase.getCustomEmbed(guildId, '_ticket_panel_settings');
            if (embed?.description) {
                return { ...DEFAULT_PANEL, ...JSON.parse(embed.description) };
            }
        } catch (error) {
            logger.error(`Failed to get ticket panel settings for guild ${guildId}:`, error);
        }
        return DEFAULT_PANEL;
    }

    async set(guildId: string, updates: Partial<TicketPanelConfig>): Promise<TicketPanelConfig> {
        const current = await this.get(guildId);
        const updated = { ...current, ...updates };
        try {
            await supabase.saveCustomEmbed(guildId, '_ticket_panel_settings', {
                description: JSON.stringify(updated)
            });
        } catch (error) {
            logger.error(`Failed to save ticket panel settings for guild ${guildId}:`, error);
        }
        return updated;
    }
}

export const ticketPanelSettings = new TicketPanelSettingsService();
