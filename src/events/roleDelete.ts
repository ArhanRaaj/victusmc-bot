import { Events, AuditLogEvent } from 'discord.js';
import type { Role } from 'discord.js';
import type { Event } from '../types/index.js';
import { handleRoleDelete } from './antiNukeHandler.js';
import { logger } from '../utils/logger.js';

export const roleDeleteEvent: Event = {
    name: Events.GuildRoleDelete,
    async execute(role: Role) {
        if (!role.guild) return;
        try {
            const auditLog = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 }).catch(() => null);
            if (auditLog && auditLog.entries.first()) {
                const entry = auditLog.entries.first()!;
                const diff = Date.now() - entry.createdTimestamp;
                if (diff < 5000) {
                    await handleRoleDelete(role.guild, entry.executorId!);
                }
            }
        } catch (error) {
            logger.error('Error executing roleDelete event:', error);
        }
    }
};

export default roleDeleteEvent;
