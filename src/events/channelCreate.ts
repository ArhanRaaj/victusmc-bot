import { Events, AuditLogEvent } from 'discord.js';
import type { GuildChannel } from 'discord.js';
import type { Event } from '../types/index.js';
import { handleChannelCreate } from './antiNukeHandler.js';
import { logger } from '../utils/logger.js';

export const channelCreateEvent: Event = {
    name: Events.ChannelCreate,
    async execute(channel: any) {
        if (!channel.guild) return;
        try {
            const auditLog = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 }).catch(() => null);
            if (auditLog && auditLog.entries.first()) {
                const entry = auditLog.entries.first()!;
                const diff = Date.now() - entry.createdTimestamp;
                if (diff < 5000) {
                    await handleChannelCreate(channel.guild, entry.executorId!);
                }
            }
        } catch (error) {
            logger.error('Error executing channelCreate event:', error);
        }
    }
};

export default channelCreateEvent;
