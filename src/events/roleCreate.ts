import { Events, AuditLogEvent } from 'discord.js';
import type { Role } from 'discord.js';
import type { Event } from '../types/index.js';
import { handleRoleCreate } from './antiNukeHandler.js';
import { logger } from '../utils/logger.js';

export const roleCreateEvent: Event = {
    name: Events.GuildRoleCreate,
    async execute(role: Role) {
        if (!role.guild) return;
        try {
            const auditLog = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 }).catch(() => null);
            if (auditLog && auditLog.entries.first()) {
                const entry = auditLog.entries.first()!;
                const diff = Date.now() - entry.createdTimestamp;
                if (diff < 5000) {
                    await handleRoleCreate(role.guild, entry.executorId!);
                }
            }
        } catch (error) {
            logger.error('Error executing roleCreate event:', error);
        }
    }
};

export default roleCreateEvent;
