import { Events } from 'discord.js';
import type { Message } from 'discord.js';
import type { Event } from '../types/index.js';
import { auditLogSettings } from '../services/auditLogSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { logger } from '../utils/logger.js';

export const messageDeleteEvent: Event = {
    name: Events.MessageDelete,
    async execute(message: Message) {
        try {
            if (message.author?.bot) return;

            const guildId = message.guildId;
            if (!guildId) return;

            const config = await auditLogSettings.get(guildId);
            const channelId = config.channels?.message_delete;
            if (!config.enabled || !channelId || !config.events.includes('message_delete')) return;

            const logChannel = message.guild?.channels.cache.get(channelId);
            if (!logChannel || !logChannel.isTextBased()) return;

            const content = message.content || '*No text content (attachments or embeds only)*';

            const container = ComponentsV2.baseContainer(ComponentsV2.Accents.danger);
            container.addTextDisplayComponents(
                ComponentsV2.text('## 🗑️ Message Deleted\n\u200b'),
                ComponentsV2.text(`**User:** <@${message.author?.id}> (${message.author?.tag || 'Unknown'})\n**Channel:** <#${message.channelId}>`),
                ComponentsV2.text(`**Content:** ${content.slice(0, 1000)}`),
                ComponentsV2.text(`-# <t:${Math.floor(Date.now() / 1000)}:R>`)
            );
            await (logChannel as any).send({ components: [container], flags: ComponentsV2.IS_COMPONENTS_V2 }).catch(() => {});
        } catch (error) {
            logger.error('Error executing messageDelete event:', error);
        }
    }
};

export default messageDeleteEvent;
