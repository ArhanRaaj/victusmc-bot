import { Events, AuditLogEvent } from 'discord.js';
import type { GuildMember } from 'discord.js';
import type { Event } from '../types/index.js';
import { auditLogSettings } from '../services/auditLogSettings.js';
import { handleMassKick } from './antiNukeHandler.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { logger } from '../utils/logger.js';

export const guildMemberRemoveEvent: Event = {
    name: Events.GuildMemberRemove,
    async execute(member: GuildMember) {
        try {
            if (member.guild) {
                const auditLog = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 }).catch(() => null);
                if (auditLog && auditLog.entries.first()) {
                    const entry = auditLog.entries.first()!;
                    const diff = Date.now() - entry.createdTimestamp;
                    if (diff < 5000 && entry.targetId === member.id) {
                        await handleMassKick(member.guild, entry.executorId!);
                    }
                }
            }

            const guildId = member.guild.id;
            const config = await auditLogSettings.get(guildId);
            const channelId = config.channels?.member_leave;
            if (!config.enabled || !channelId || !config.events.includes('member_leave')) return;

            const logChannel = member.guild.channels.cache.get(channelId);
            if (!logChannel || !logChannel.isTextBased()) return;

            const rolesStr = member.roles.cache
                .filter((role: any) => role.name !== '@everyone')
                .map((role: any) => `<@&${role.id}>`)
                .join(', ') || 'None';

            const joinedAt = member.joinedAt 
                ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:f> (<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>)`
                : 'Unknown';

            const container = ComponentsV2.baseContainer(ComponentsV2.Accents.danger);
            container.addTextDisplayComponents(
                ComponentsV2.text('## 📤 Member Left\n\u200b'),
                ComponentsV2.text(`**User:** <@${member.user.id}> (${member.user.username})\n**ID:** \`${member.user.id}\``),
                ComponentsV2.text(`**Joined:** ${joinedAt}\n**Roles:** ${rolesStr}`),
                ComponentsV2.text(`-# <t:${Math.floor(Date.now() / 1000)}:R>`)
            );
            await (logChannel as any).send({ components: [container], flags: ComponentsV2.IS_COMPONENTS_V2 }).catch(() => {});
        } catch (error) {
            logger.error('Error executing guildMemberRemove event:', error);
        }
    }
};

export default guildMemberRemoveEvent;
