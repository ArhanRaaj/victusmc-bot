import { Events } from 'discord.js';
import type { Message } from 'discord.js';
import type { Event } from '../types/index.js';
import { auditLogSettings } from '../services/auditLogSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { logger } from '../utils/logger.js';

export const messageUpdateEvent: Event = {
    name: Events.MessageUpdate,
    async execute(oldMessage: Message, newMessage: Message) {
        try {
            if (newMessage.author?.bot) return;
            if (oldMessage.content === newMessage.content) return;

            const guildId = newMessage.guildId;
            if (!guildId) return;

            const config = await auditLogSettings.get(guildId);
            const channelId = config.channels?.message_edit;
            if (!config.enabled || !channelId || !config.events.includes('message_edit')) return;

            const logChannel = newMessage.guild?.channels.cache.get(channelId);
            if (!logChannel || !logChannel.isTextBased()) return;

            const oldContent = oldMessage.content || '*None*';
            const newContent = newMessage.content || '*None*';

            const container = ComponentsV2.baseContainer(ComponentsV2.Accents.warning);
            container.addTextDisplayComponents(
                ComponentsV2.text('## <:Edit:1524363079675154433> Message Edited\n\u200b'),
                ComponentsV2.text(`**User:** <@${newMessage.author?.id}> (${newMessage.author?.tag || 'Unknown'})\n**Channel:** <#${newMessage.channelId}>`),
                ComponentsV2.text(`**Before:** ${oldContent.slice(0, 500)}\n**After:** ${newContent.slice(0, 500)}`),
                ComponentsV2.text(`-# <t:${Math.floor(Date.now() / 1000)}:R>`)
            );
            await (logChannel as any).send({ components: [container], flags: ComponentsV2.IS_COMPONENTS_V2 }).catch(() => {});
        } catch (error) {
            logger.error('Error executing messageUpdate event:', error);
        }
    }
};

export default messageUpdateEvent;
