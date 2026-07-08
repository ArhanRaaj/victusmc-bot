import { Client, Guild, GuildAuditLogsEntry, GuildBan, GuildChannel, Role, Webhook, User, TextChannel, PermissionFlagsBits } from 'discord.js';
import { antiNukeSettings } from '../services/antiNukeSettings.js';
import * as antiNukeTracker from '../services/antiNukeTracker.js';
import { logger } from '../utils/logger.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

async function sendAlert(guild: Guild, title: string, description: string, color: number = ComponentsV2.Accents.danger) {
    const config = await antiNukeSettings.get(guild.id);
    if (!config.logChannelId) return;
    const channel = guild.channels.cache.get(config.logChannelId) as TextChannel | undefined;
    if (!channel) return;
    const container = ComponentsV2.baseContainer(color);
    container.addTextDisplayComponents(ComponentsV2.text(`# 🛡️ Anti-Nuke Alert\n\n**${title}**\n\n${description}`));
    channel.send({ components: [container], flags: ComponentsV2.IS_COMPONENTS_V2 }).catch(() => {});
}

export async function handleGuildBanAdd(ban: GuildBan) {
    const config = await antiNukeSettings.get(ban.guild.id);
    if (!config.enabled || !config.punishments.massBan.enabled) return;
    const count = antiNukeTracker.recordAction(ban.guild.id, 'ban', ban.user.id);
    if (count >= config.punishments.massBan.threshold) {
        const executors = antiNukeTracker.getActioners(ban.guild.id, 'ban');
        const topExecutor = [...executors.entries()].sort((a, b) => b[1] - a[1])[0];
        await sendAlert(ban.guild, 'Mass Ban Detected', `**${count}** bans in the last 5 seconds.\nSuspected executor: <@${topExecutor?.[0] || 'Unknown'}>\nAction: **${config.punishments.massBan.action}**`);
        if (config.punishments.massBan.action === 'ban' && topExecutor) {
            const member = await ban.guild.members.fetch(topExecutor[0]).catch(() => null);
            if (member && !config.trustedRoleIds.some(r => member.roles.cache.has(r))) {
                member.ban({ reason: 'Anti-Nuke: Mass ban detection' }).catch(() => {});
            }
        }
        antiNukeTracker.resetTracker(ban.guild.id, 'ban');
    }
}

export async function handleMassKick(guild: Guild, executorId: string) {
    const config = await antiNukeSettings.get(guild.id);
    if (!config.enabled || !config.punishments.massKick.enabled) return;
    const count = antiNukeTracker.recordAction(guild.id, 'kick', executorId);
    if (count >= config.punishments.massKick.threshold) {
        await sendAlert(guild, 'Mass Kick Detected', `**${count}** kicks in the last 5 seconds.\nSuspected executor: <@${executorId}>\nAction: **${config.punishments.massKick.action}**`);
        if (config.punishments.massKick.action === 'ban') {
            const member = await guild.members.fetch(executorId).catch(() => null);
            if (member && !config.trustedRoleIds.some(r => member.roles.cache.has(r))) {
                member.ban({ reason: 'Anti-Nuke: Mass kick detection' }).catch(() => {});
            }
        }
        antiNukeTracker.resetTracker(guild.id, 'kick');
    }
}

export async function handleChannelDelete(guild: Guild, executorId: string) {
    const config = await antiNukeSettings.get(guild.id);
    if (!config.enabled || !config.punishments.channelDelete.enabled) return;
    const count = antiNukeTracker.recordAction(guild.id, 'channel_delete', executorId);
    if (count >= config.punishments.channelDelete.threshold) {
        await sendAlert(guild, 'Mass Channel Deletion', `**${count}** channels deleted in the last 5 seconds.\nSuspected executor: <@${executorId}>\nAction: **${config.punishments.channelDelete.action}**`);
        antiNukeTracker.resetTracker(guild.id, 'channel_delete');
    }
}

export async function handleRoleDelete(guild: Guild, executorId: string) {
    const config = await antiNukeSettings.get(guild.id);
    if (!config.enabled || !config.punishments.roleDelete.enabled) return;
    const count = antiNukeTracker.recordAction(guild.id, 'role_delete', executorId);
    if (count >= config.punishments.roleDelete.threshold) {
        await sendAlert(guild, 'Mass Role Deletion', `**${count}** roles deleted in the last 5 seconds.\nSuspected executor: <@${executorId}>\nAction: **${config.punishments.roleDelete.action}**`);
        antiNukeTracker.resetTracker(guild.id, 'role_delete');
    }
}

export async function handleRoleCreate(guild: Guild, executorId: string) {
    const config = await antiNukeSettings.get(guild.id);
    if (!config.enabled || !config.punishments.roleCreate.enabled) return;
    const count = antiNukeTracker.recordAction(guild.id, 'role_create', executorId);
    if (count >= config.punishments.roleCreate.threshold) {
        await sendAlert(guild, 'Mass Role Creation', `**${count}** roles created in the last 5 seconds.\nSuspected executor: <@${executorId}>\nAction: **${config.punishments.roleCreate.action}**`);
        antiNukeTracker.resetTracker(guild.id, 'role_create');
    }
}

export async function handleChannelCreate(guild: Guild, executorId: string) {
    const config = await antiNukeSettings.get(guild.id);
    if (!config.enabled || !config.punishments.channelSpam.enabled) return;
    const count = antiNukeTracker.recordAction(guild.id, 'channel_create', executorId);
    if (count >= config.punishments.channelSpam.threshold) {
        await sendAlert(guild, 'Channel Spam Detected', `**${count}** channels created in the last 5 seconds.\nSuspected executor: <@${executorId}>\nAction: **${config.punishments.channelSpam.action}**`);
        antiNukeTracker.resetTracker(guild.id, 'channel_create');
    }
}

export async function handleWebhookCreate(guild: Guild, executorId: string) {
    const config = await antiNukeSettings.get(guild.id);
    if (!config.enabled || !config.punishments.webhookSpam.enabled) return;
    const count = antiNukeTracker.recordAction(guild.id, 'webhook_create', executorId);
    if (count >= config.punishments.webhookSpam.threshold) {
        await sendAlert(guild, 'Webhook Spam Detected', `**${count}** webhooks created in the last 5 seconds.\nSuspected executor: <@${executorId}>\nAction: **${config.punishments.webhookSpam.action}**`);
        antiNukeTracker.resetTracker(guild.id, 'webhook_create');
    }
}

export async function handleBotAdd(guild: Guild, botUser: User, executorId: string) {
    const config = await antiNukeSettings.get(guild.id);
    if (!config.enabled || !config.punishments.botAdd.enabled) return;
    const executor = await guild.members.fetch(executorId).catch(() => null);
    if (executor && config.trustedRoleIds.some(r => executor.roles.cache.has(r))) return;
    const action = config.punishments.botAdd.action;
    await sendAlert(guild, 'Bot Added', `Bot: **${botUser.tag}** (<@${botUser.id}>)\nAdded by: <@${executorId}>\nAction: **${action}**`);
    if (action !== 'none') {
        const botMember = await guild.members.fetch(botUser.id).catch(() => null);
        if (action === 'kick' && botMember) botMember.kick('Anti-Nuke: Unauthorized bot addition').catch(() => {});
        else if (action === 'ban' && botMember) botMember.ban({ reason: 'Anti-Nuke: Unauthorized bot addition' }).catch(() => {});
    }
}
