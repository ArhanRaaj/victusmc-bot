import { Events } from 'discord.js';
import type { GuildBan } from 'discord.js';
import type { Event } from '../types/index.js';
import { auditLogSettings } from '../services/auditLogSettings.js';
import { handleGuildBanAdd } from './antiNukeHandler.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { logger } from '../utils/logger.js';

export const guildBanAddEvent: Event = {
    name: Events.GuildBanAdd,
    async execute(ban: GuildBan) {
        try {
            await handleGuildBanAdd(ban);

            const guildId = ban.guild.id;
            const config = await auditLogSettings.get(guildId);
            const channelId = config.channels?.ban;
            if (!config.enabled || !channelId || !config.events.includes('ban')) return;

            const logChannel = ban.guild.channels.cache.get(channelId);
            if (!logChannel || !logChannel.isTextBased()) return;

            const reason = ban.reason || 'No reason provided';

            const container = ComponentsV2.baseContainer(ComponentsV2.Accents.danger);
            container.addTextDisplayComponents(
                ComponentsV2.text('## 🔨 Member Banned\n\u200b'),
                ComponentsV2.text(`**User:** <@${ban.user.id}> (${ban.user.username})\n**ID:** \`${ban.user.id}\``),
                ComponentsV2.text(`**Reason:** ${reason}`),
                ComponentsV2.text(`-# <t:${Math.floor(Date.now() / 1000)}:R>`)
            );
            await (logChannel as any).send({ components: [container], flags: ComponentsV2.IS_COMPONENTS_V2 }).catch(() => {});
        } catch (error) {
            logger.error('Error executing guildBanAdd event:', error);
        }
    }
};

export default guildBanAddEvent;
