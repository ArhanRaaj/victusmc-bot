import { Events, AuditLogEvent } from 'discord.js';
import type { Webhook } from 'discord.js';
import type { Event } from '../types/index.js';
import { handleWebhookCreate } from './antiNukeHandler.js';
import { logger } from '../utils/logger.js';

export const webhookUpdateEvent: Event = {
    name: Events.WebhooksUpdate,
    async execute(channel: any) {
        if (!channel.guild) return;
        try {
            const auditLog = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.WebhookCreate, limit: 1 }).catch(() => null);
            if (auditLog && auditLog.entries.first()) {
                const entry = auditLog.entries.first()!;
                const diff = Date.now() - entry.createdTimestamp;
                if (diff < 5000) {
                    await handleWebhookCreate(channel.guild, entry.executorId!);
                }
            }
        } catch (error) {
            logger.error('Error executing webhookUpdate event:', error);
        }
    }
};

export default webhookUpdateEvent;
