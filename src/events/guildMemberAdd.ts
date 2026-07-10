import { ChannelType, Events, AuditLogEvent } from 'discord.js';
import type { GuildMember } from 'discord.js';
import type { Event } from '../types/index.js';
import { welcomeSettings } from '../services/welcomeSettings.js';
import { greetSettings, formatGreetMsg } from '../services/greetSettings.js';
import { buildWelcomePayload } from '../commands/welcome.js';
import { auditLogSettings } from '../services/auditLogSettings.js';
import { autoRoleService } from '../services/autoRoleSettings.js';
import { handleBotAdd } from './antiNukeHandler.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { logger } from '../utils/logger.js';

export const guildMemberAddEvent: Event = {
    name: Events.GuildMemberAdd,
    async execute(member: GuildMember) {
        try {
            if (member.user.bot && member.guild) {
                const auditLog = await member.guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 1 }).catch(() => null);
                if (auditLog && auditLog.entries.first()) {
                    const entry = auditLog.entries.first()!;
                    const diff = Date.now() - entry.createdTimestamp;
                    if (diff < 5000) {
                        await handleBotAdd(member.guild, member.user, entry.executorId!);
                    }
                }
            }

            // Welcome system
            const config = await welcomeSettings.get(member.guild.id);
            if (config.enabled && config.channelId) {
                const channel = member.guild.channels.cache.get(config.channelId);
                if (channel && channel.type === ChannelType.GuildText) {
                    const payload = await buildWelcomePayload(config, member);
                    await channel.send(payload).catch((err) => {
                        logger.error(`Failed to send welcome message for ${member.user.tag}:`, err);
                    });
                }
            }

            // Greet system - welcome message
            const greetCfg = await greetSettings.get(member.guild.id);
            if (greetCfg.welcomeEnabled && greetCfg.welcomeChannelId) {
                const greetChannel = member.guild.channels.cache.get(greetCfg.welcomeChannelId);
                if (greetChannel && greetChannel.type === ChannelType.GuildText) {
                    const msg = formatGreetMsg(greetCfg.welcomeMsg, member);
                    await greetChannel.send({ content: msg }).catch(() => {});
                }
            }

            // Greet system - DM message
            if (greetCfg.dmEnabled) {
                const msg = formatGreetMsg(greetCfg.dmMsg, member);
                await member.send({ content: msg }).catch(() => {});
            }

            // Assign Auto-Roles (welcome system)
            if (config.autoRoleIds && config.autoRoleIds.length > 0) {
                const rolesToAssign = config.autoRoleIds.filter((id: string) => member.guild.roles.cache.has(id));
                if (rolesToAssign.length > 0) {
                    await member.roles.add(rolesToAssign).catch((err) => {
                        logger.error(`Failed to assign auto-roles to ${member.user.tag}:`, err);
                    });
                }
            }

            // Auto-Role system
            const autoRoleCfg = await autoRoleService.get(member.guild.id);
            if (autoRoleCfg.enabled) {
                const isBot = member.user.bot;
                const roleIds = isBot ? autoRoleCfg.botRoleIds : autoRoleCfg.roleIds;
                if (roleIds.length > 0) {
                    const validRoles = roleIds.filter((id: string) => member.guild.roles.cache.has(id));
                    if (validRoles.length > 0) {
                        await member.roles.add(validRoles).catch(() => {});
                    }
                }
            }

            // Audit logging join event
            const auditConfig = await auditLogSettings.get(member.guild.id);
            const joinChannelId = auditConfig.channels?.member_join;
            if (auditConfig.enabled && joinChannelId && auditConfig.events.includes('member_join')) {
                const logChannel = member.guild.channels.cache.get(joinChannelId);
                if (logChannel && logChannel.isTextBased()) {
                    const accountAge = `<t:${Math.floor(member.user.createdTimestamp / 1000)}:f> (<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>)`;
                    const container = ComponentsV2.baseContainer(ComponentsV2.Accents.success);
                    container.addTextDisplayComponents(
                        ComponentsV2.text('## 📥 Member Joined\n\u200b'),
                        ComponentsV2.text(`**User:** <@${member.user.id}> (${member.user.username})\n**ID:** \`${member.user.id}\``),
                        ComponentsV2.text(`**Account Created:** ${accountAge}`),
                        ComponentsV2.text(`-# <t:${Math.floor(Date.now() / 1000)}:R>`)
                    );
                    await (logChannel as any).send({ components: [container], flags: ComponentsV2.IS_COMPONENTS_V2 }).catch(() => {});
                }
            }
        } catch (error) {
            logger.error('Error executing guildMemberAdd event:', error);
        }
    }
};
