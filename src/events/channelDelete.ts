import { ChannelType, Events, AuditLogEvent } from 'discord.js';
import type { DMChannel, GuildChannel } from 'discord.js';
import type { Event } from '../types/index.js';
import { warnSettings } from '../services/warnSettings.js';
import { handleChannelDelete, handleRoleDelete } from './antiNukeHandler.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { logger } from '../utils/logger.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const channelDeleteEvent: Event = {
    name: Events.ChannelDelete,
    async execute(channel: any) {
        if (channel.partial) return;
        if (!channel.guild) return;

        try {
            const auditLog = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 }).catch(() => null);
            if (auditLog && auditLog.entries.first()) {
                const entry = auditLog.entries.first()!;
                const diff = Date.now() - entry.createdTimestamp;
                if (diff < 5000) {
                    await handleChannelDelete(channel.guild, entry.executorId!);
                }
            }

            const guildId = channel.guild.id;
            const config = await warnSettings.get(guildId);

            if (config.warnChannelId === channel.id) {
                logger.info(`Warn channel ${channel.id} was deleted in guild ${guildId}. Recreating...`);

                // Recreate the channel under the same name, category parent, and copy permissions
                const newChannel = await channel.guild.channels.create({
                    name: channel.name,
                    type: ChannelType.GuildText,
                    parent: channel.parentId || undefined,
                    permissionOverwrites: channel.permissionOverwrites.cache.map((p: any) => ({
                        id: p.id,
                        type: p.type,
                        allow: p.allow.toArray(),
                        deny: p.deny.toArray()
                    }))
                });

                // Update settings to reference new channel
                await warnSettings.set(guildId, { warnChannelId: newChannel.id });

                // Send restoration log alert
                const alertCard = ComponentsV2.warningContainer(
                    'Channel Recreated',
                    'The warnings logs channel was deleted and has been automatically recreated to maintain staff operations.'
                );
                await (newChannel as any).send({ components: [alertCard], flags: V2 }).catch(() => {});
            }
        } catch (error) {
            logger.error('Error executing channelDelete event:', error);
        }
    }
};
