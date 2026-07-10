import { ChannelType } from 'discord.js';
import type { VoiceState, Client } from 'discord.js';
import type { Event } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { j2cSettings } from '../services/j2cSettings.js';
import { auditLogSettings } from '../services/auditLogSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { getConfig as getLevelingConfig, addVoiceXp, startVoiceSession, endVoiceSession, getVoiceSessionStart } from '../services/levelingSettings.js';

export const voiceStateUpdateEvent: Event = {
    name: 'voiceStateUpdate',
    async execute(oldState: VoiceState, newState: VoiceState) {
        const guild = newState.guild ?? oldState.guild;
        if (!guild) return;

        // --- Voice Audit Logging ---
        try {
            const config = await auditLogSettings.get(guild.id);
            const member = newState.member ?? oldState.member;
            if (config.enabled && member && !member.user.bot) {
                if (newState.channelId && !oldState.channelId) {
                    const ch = config.channels?.voice_join;
                    if (ch && config.events.includes('voice_join')) {
                        const logChannel = guild.channels.cache.get(ch);
                        if (logChannel?.isTextBased()) {
                            const c = ComponentsV2.infoContainer('<:VolumeUp:1524363013233053707> Voice Join', `**${member.user.tag}** joined <#${newState.channelId}>`);
                            await (logChannel as any).send({ components: [c], flags: ComponentsV2.IS_COMPONENTS_V2 }).catch(() => {});
                        }
                    }
                } else if (!newState.channelId && oldState.channelId) {
                    const ch = config.channels?.voice_leave;
                    if (ch && config.events.includes('voice_leave')) {
                        const logChannel = guild.channels.cache.get(ch);
                        if (logChannel?.isTextBased()) {
                            const startTime = getVoiceSessionStart(guild.id, member.id);
                            let duration = '';
                            if (startTime) {
                                const elapsed = Date.now() - startTime;
                                const hrs = Math.floor(elapsed / 3600000);
                                const mins = Math.floor((elapsed % 3600000) / 60000);
                                const secs = Math.floor((elapsed % 60000) / 1000);
                                duration = `\n<:Timer:1524363047534329916> Duration: ${hrs > 0 ? `${hrs}h ` : ''}${mins > 0 ? `${mins}m ` : ''}${secs}s`;
                            }
                            const c = ComponentsV2.warningContainer('<:Dissable:1524363096855023626> Voice Leave', `**${member.user.tag}** left <#${oldState.channelId}>${duration}`);
                            await (logChannel as any).send({ components: [c], flags: ComponentsV2.IS_COMPONENTS_V2 }).catch(() => {});
                        }
                    }
                } else if (newState.channelId && oldState.channelId && newState.channelId !== oldState.channelId) {
                    const ch = config.channels?.voice_move;
                    if (ch && config.events.includes('voice_move')) {
                        const logChannel = guild.channels.cache.get(ch);
                        if (logChannel?.isTextBased()) {
                            const c = ComponentsV2.baseContainer(ComponentsV2.Accents.primary);
                            c.addTextDisplayComponents(ComponentsV2.text(`## <:Retry:1524363041024512010> Voice Move\n**${member.user.tag}** moved from <#${oldState.channelId}> to <#${newState.channelId}>`));
                            await (logChannel as any).send({ components: [c], flags: ComponentsV2.IS_COMPONENTS_V2 }).catch(() => {});
                        }
                    }
                }
            }
        } catch (error) {
            logger.error('Error executing voice audit log:', error);
        }

        // --- J2C System ---
        try {
            const j2cConfig = await j2cSettings.get(guild.id);
            if (j2cConfig.enabled && j2cConfig.channelId) {
                    const member = newState.member ?? oldState.member;
                    
                    // 1. User joins the J2C trigger channel
                    if (newState.channelId === j2cConfig.channelId && member && !member.user.bot) {
                        const categoryId = j2cConfig.categoryId || newState.channel?.parentId || null;
                        const chanName = j2cConfig.nameFormat.replace(/{username}/g, member.user.username);
                        
                        // Create temporary voice channel
                        const tempChannel = await guild.channels.create({
                            name: chanName,
                            type: ChannelType.GuildVoice,
                            parent: categoryId || undefined,
                            permissionOverwrites: [
                                {
                                    id: member.id,
                                    allow: ['ManageChannels', 'MoveMembers', 'MuteMembers', 'DeafenMembers']
                                }
                            ]
                        });
                        
                        // Add to tracked list with ownerId
                        await j2cSettings.addTempChannel(tempChannel.id, member.id);
                        
                        // Send Voice Control Panel to the channel's text chat
                        try {
                            const { buildVoiceControlPanel } = await import('../commands/j2c.js');
                            const panel = buildVoiceControlPanel(member.id);
                            await (tempChannel as any).send({
                                components: [panel],
                                flags: ComponentsV2.IS_COMPONENTS_V2
                            });
                        } catch (err) {
                            logger.error('Failed to send voice control panel:', err);
                        }

                        // Send Direct Message (DM) to creator
                        try {
                            const dmContainer = ComponentsV2.baseContainer(ComponentsV2.Accents.purple);
                            dmContainer.addTextDisplayComponents(
                                ComponentsV2.text(
                                    `# <:Stars:1524363036389937212> Voice Channel Created!\n\n` +
                                    `Your temporary voice channel **${chanName}** has been successfully created in **${guild.name}**!\n\n` +
                                    `### 🎙️ Manage Your Channel\n` +
                                    `Go to the voice channel's text chat to use the **Voice Control Panel** dropdown. You can lock/unlock, rename, limit, or mute/ban members in your channel.`
                                )
                            );
                            await member.send({
                                components: [dmContainer],
                                flags: ComponentsV2.IS_COMPONENTS_V2
                            }).catch(() => {});
                        } catch (dmErr) {
                            logger.debug(`Failed to DM member ${member.id} about VC creation:`, dmErr);
                        }

                        // Move member to the new voice channel
                        await member.voice.setChannel(tempChannel).catch(() => {});
                    }
                    
                    // 2. User leaves/moves from a channel (cleanup empty temporary channel)
                    const tempChannels = await j2cSettings.getTempChannels();
                    if (oldState.channelId && tempChannels.includes(oldState.channelId)) {
                        const oldChannel = oldState.channel;
                        if (oldChannel && oldChannel.members.size === 0) {
                            await oldChannel.delete().catch(() => {});
                            await j2cSettings.removeTempChannel(oldState.channelId);
                        }
                    }
                }
            } catch (error) {
                logger.error('Error executing J2C voice state update:', error);
            }

        // --- Voice XP Tracking ---
        try {
            const member = newState.member ?? oldState.member;
            if (!member || member.user.bot) return;

            const hadChannel = !!oldState.channelId;
            const hasChannel = !!newState.channelId;
            const guildId = guild.id;

            // Start session on join
            if (hasChannel && !hadChannel) {
                const cfg = getLevelingConfig(guildId);
                if (cfg.enabled && (cfg.voiceChannels.length === 0 || cfg.voiceChannels.includes(newState.channelId!))) {
                    startVoiceSession(guildId, member.id);
                }
            }

            // End session on leave
            if (!hasChannel && hadChannel) {
                endVoiceSession(guildId, member.id);
                const cfg = getLevelingConfig(guildId);
                if (cfg.enabled && (cfg.voiceChannels.length === 0 || cfg.voiceChannels.includes(oldState.channelId!))) {
                    const result = addVoiceXp(guildId, member.id);
                    if (result.leveledUp && cfg.announceChannel) {
                        const channel = guild.channels.cache.get(cfg.announceChannel);
                        if (channel?.isTextBased()) {
                            const c = ComponentsV2.baseContainer(ComponentsV2.Accents.success);
                            c.addTextDisplayComponents(ComponentsV2.text(
                                `<:Stars:1524363036389937212> Congratulations <@${member.id}>! You reached **voice level ${result.newLevel}**!`
                            ));
                            await (channel as any).send({ components: [c], flags: ComponentsV2.IS_COMPONENTS_V2 }).catch(() => {});
                        }
                    }
                }
            }

            // Restart session on move to a different channel
            if (hasChannel && hadChannel && newState.channelId !== oldState.channelId) {
                endVoiceSession(guildId, member.id);
                const cfg = getLevelingConfig(guildId);
                if (cfg.enabled && (cfg.voiceChannels.length === 0 || cfg.voiceChannels.includes(newState.channelId!))) {
                    startVoiceSession(guildId, member.id);
                }
            }
        } catch (error) {
            logger.error('Error executing voice XP tracking:', error);
        }
    },
};

// Periodic voice XP tick every 60 seconds
let voiceIntervalStarted = false;
function startVoiceXpInterval(client: Client): void {
    if (voiceIntervalStarted) return;
    voiceIntervalStarted = true;

    setInterval(async () => {
        for (const guild of client.guilds.cache.values()) {
            try {
                const cfg = getLevelingConfig(guild.id);
                if (!cfg.enabled) continue;

                for (const [, channel] of guild.channels.cache) {
                    if (!channel.isVoiceBased()) continue;
                    if (cfg.voiceChannels.length > 0 && !cfg.voiceChannels.includes(channel.id)) continue;

                    for (const [, member] of channel.members) {
                        if (member.user.bot) continue;
                        const result = addVoiceXp(guild.id, member.id);
                        if (result.leveledUp && cfg.announceChannel) {
                            const announce = guild.channels.cache.get(cfg.announceChannel);
                            if (announce?.isTextBased()) {
                                const c = ComponentsV2.baseContainer(ComponentsV2.Accents.success);
                                c.addTextDisplayComponents(ComponentsV2.text(
                                    `<:Stars:1524363036389937212> Congratulations <@${member.id}>! You reached **voice level ${result.newLevel}**!`
                                ));
                                await (announce as any).send({ components: [c], flags: ComponentsV2.IS_COMPONENTS_V2 }).catch(() => {});
                            }
                        }
                    }
                }
            } catch (err) {
                logger.error(`Voice XP tick error for guild ${guild.id}:`, err);
            }
        }
    }, 60_000);
}

// Export for initialization from ready event
export { startVoiceXpInterval };
