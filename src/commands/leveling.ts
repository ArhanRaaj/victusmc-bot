import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, ActionRowBuilder, ChannelSelectMenuBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { MediaGalleryBuilder, MediaGalleryItemBuilder } from 'discord.js';
import { getConfig, updateConfig, getUserLevel, calculateLevel, xpForNextLevel, xpForLevel, addRoleReward, removeRoleReward, checkRoleRewards } from '../services/levelingSettings.js';
import { logger } from '../utils/logger.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

function progressBar(current: number, max: number, length = 12): string {
    const filled = Math.round((current / max) * length);
    const empty = length - filled;
    return '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, empty));
}

function xpBar(xp: number, level: number): string {
    const current = xp - xpForLevel(level);
    const needed = xpForNextLevel(level) - xpForLevel(level);
    if (needed <= 0) return '`MAX LEVEL`';
    return `${progressBar(current, needed)} \`${current.toLocaleString()} / ${needed.toLocaleString()}\``;
}

export const levelingCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('leveling')
        .setDescription('Configure the leveling system')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('setup')
                .setDescription('Configure leveling channels and settings'))
        .addSubcommand(sub =>
            sub.setName('rewards').setDescription('Manage level role rewards')
                .addStringOption(opt => opt.setName('action').setDescription('add, remove, or list').setRequired(true)
                    .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' }, { name: 'List', value: 'list' }))
                .addIntegerOption(opt => opt.setName('level').setDescription('Level for the reward').setMinValue(1).setMaxValue(100).setRequired(false))
                .addRoleOption(opt => opt.setName('role').setDescription('Role to assign').setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('setlog').setDescription('Set level-up log channel')
                .addChannelOption(opt => opt.setName('channel').setDescription('Channel for level-up logs').setRequired(true).addChannelTypes(ChannelType.GuildText))
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand(true);
        const guildId = interaction.guildId!;

        if (sub === 'setup') {
            const config = getConfig(guildId);
            const statusEmoji = config.enabled ? '<:Tick:1524363090626482326>' : '<:Cross:1524363088621469737>';
            const statusText = config.enabled ? 'Enabled' : 'Disabled';

            const chatChannelsText = config.chatChannels.length > 0
                ? config.chatChannels.map(id => `<#${id}>`).join(', ')
                : 'All channels';
            const voiceChannelsText = config.voiceChannels.length > 0
                ? config.voiceChannels.map(id => `<#${id}>`).join(', ')
                : 'All channels';
            const announceText = config.announceChannel
                ? `<#${config.announceChannel}>`
                : 'None';
            const logText = config.levelLogChannel
                ? `<#${config.levelLogChannel}>`
                : 'None';
            const rewardsText = config.roleRewards.length > 0
                ? config.roleRewards.map(r => `Lvl ${r.level}`).join(', ')
                : 'None';

            const container = ComponentsV2.baseContainer(ComponentsV2.Accents.primary);
            container.addTextDisplayComponents(ComponentsV2.text(
                `# <:Setting:1524363057990598687> Leveling Configuration\n\n` +
                `${statusEmoji} **Status:** ${statusText}\n` +
                `<:Message:1524363100734623836> **Chat Channels:** ${chatChannelsText}\n` +
                `<:VolumeUp:1524363013233053707> **Voice Channels:** ${voiceChannelsText}\n` +
                `<:Annc:1524363017813360710> **Announce Channel:** ${announceText}\n` +
                `<:Edit:1524363079675154433> **Log Channel:** ${logText}\n` +
                `🎁 **Role Rewards:** ${rewardsText}\n\n` +
                `Use the menus below to update channels and the button to toggle the system.`
            ));

            const chatSelect = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId(`leveling_chat_${guildId}`)
                    .setPlaceholder('Select chat XP channels')
                    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread)
                    .setMinValues(0)
                    .setMaxValues(25)
            );

            const voiceSelect = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId(`leveling_voice_${guildId}`)
                    .setPlaceholder('Select voice XP channels')
                    .setChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
                    .setMinValues(0)
                    .setMaxValues(25)
            );

            const announceSelect = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId(`leveling_announce_${guildId}`)
                    .setPlaceholder('Select announce channel')
                    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                    .setMinValues(0)
                    .setMaxValues(1)
            );

            const toggleButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`leveling_toggle_${guildId}`)
                    .setLabel(config.enabled ? 'Disable Leveling' : 'Enable Leveling')
                    .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
            );

            await interaction.reply({
                components: [container, chatSelect, voiceSelect, announceSelect, toggleButton],
                flags: V2,
            });
            return;
        }

        if (sub === 'rewards') {
            const action = interaction.options.getString('action', true);

            if (action === 'add') {
                const level = interaction.options.getInteger('level', true);
                const role = interaction.options.getRole('role', true);
                addRoleReward(guildId, level, role.id);
                const c = ComponentsV2.successContainer('Reward Added',
                    `Level **${level}** → <@&${role.id}>`);
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }

            if (action === 'remove') {
                const level = interaction.options.getInteger('level', true);
                const removed = removeRoleReward(guildId, level);
                if (removed) {
                    const c = ComponentsV2.successContainer('Reward Removed', `Level **${level}** reward removed.`);
                    await interaction.reply({ components: [c], flags: V2 });
                } else {
                    const c = ComponentsV2.errorContainer('Not Found', `No reward for level **${level}**.`);
                    await interaction.reply({ components: [c], flags: V2 });
                }
                return;
            }

            if (action === 'list') {
                const config = getConfig(guildId);
                if (config.roleRewards.length === 0) {
                    const c = ComponentsV2.infoContainer('No Rewards', 'No role rewards configured.');
                    await interaction.reply({ components: [c], flags: V2 });
                    return;
                }
                const list = config.roleRewards.map(r => `**${r.level}** → <@&${r.roleId}>`).join('\n');
                const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
                c.addTextDisplayComponents(ComponentsV2.text(`# <:Edit:1524363079675154433> Level Role Rewards\n\n${list}`));
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }
        }

        if (sub === 'setlog') {
            const channel = interaction.options.getChannel('channel', true);
            updateConfig(guildId, { levelLogChannel: channel.id });
            const c = ComponentsV2.successContainer('Log Channel Set', `Level-up logs will be sent to <#${channel.id}>.`);
            await interaction.reply({ components: [c], flags: V2 });
            return;
        }
    },

    async handleButton(interaction) {
        if (!interaction.customId.startsWith('leveling_toggle_')) return;
        const guildId = interaction.customId.replace('leveling_toggle_', '');
        if (guildId !== interaction.guildId) return;
        const config = getConfig(guildId);
        const newState = !config.enabled;
        updateConfig(guildId, { enabled: newState });
        const c = newState
            ? ComponentsV2.successContainer('<:Tick:1524363090626482326> Leveling Enabled', 'XP tracking is now active for this server.')
            : ComponentsV2.warningContainer('<:Dissable:1524363096855023626> Leveling Disabled', 'XP tracking has been turned off.');
        await interaction.update({ components: [c], flags: V2 });
    },

    async handleSelectMenu(interaction) {
        const customId = interaction.customId;
        const guildId = interaction.guildId!;

        if (customId.startsWith('leveling_chat_')) {
            if (customId.replace('leveling_chat_', '') !== guildId) return;
            const channels = interaction.values;
            updateConfig(guildId, { chatChannels: channels });
            const c = ComponentsV2.successContainer('<:Tick:1524363090626482326> Chat Channels Updated', `Chat XP will be tracked in ${channels.length > 0 ? channels.map(id => `<#${id}>`).join(', ') : '**all channels**'}.`);
            await interaction.update({ components: [c], flags: V2 });
            return;
        }

        if (customId.startsWith('leveling_voice_')) {
            if (customId.replace('leveling_voice_', '') !== guildId) return;
            const channels = interaction.values;
            updateConfig(guildId, { voiceChannels: channels });
            const c = ComponentsV2.successContainer('<:Tick:1524363090626482326> Voice Channels Updated', `Voice XP will be tracked in ${channels.length > 0 ? channels.map(id => `<#${id}>`).join(', ') : '**all channels**'}.`);
            await interaction.update({ components: [c], flags: V2 });
            return;
        }

        if (customId.startsWith('leveling_announce_')) {
            if (customId.replace('leveling_announce_', '') !== guildId) return;
            const channel = interaction.values[0] || null;
            updateConfig(guildId, { announceChannel: channel });
            const c = ComponentsV2.successContainer('<:Tick:1524363090626482326> Announce Channel Updated', channel ? `Level-up announcements will be sent to <#${channel}>.` : 'Level-up announcements are disabled.');
            await interaction.update({ components: [c], flags: V2 });
            return;
        }
    },
};

export const levelCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('level')
        .setDescription('Check your level and XP progress')
        .setDMPermission(false)
        .addUserOption(o =>
            o.setName('user')
                .setDescription('The user to check (defaults to yourself)')),

    async execute(interaction) {
        const target = interaction.options.getUser('user') || interaction.user;
        const guildId = interaction.guildId!;
        const userId = target.id;

        const config = getConfig(guildId);
        if (!config.enabled) {
            const c = ComponentsV2.warningContainer(
                '<:Exclamation:1524363098809569350> Leveling Disabled',
                'The leveling system is not enabled in this server.'
            );
            await interaction.reply({ components: [c], flags: V2 });
            return;
        }

        const data = getUserLevel(guildId, userId);
        const chatLevel = calculateLevel(data.chatXp);
        const voiceLevel = calculateLevel(data.voiceXp);
        const totalXp = data.chatXp + data.voiceXp;
        const totalLevel = calculateLevel(totalXp);

        const chatXpInLevel = data.chatXp - xpForLevel(chatLevel);
        const chatXpNeeded = xpForNextLevel(chatLevel) - xpForLevel(chatLevel);
        const voiceXpInLevel = data.voiceXp - xpForLevel(voiceLevel);
        const voiceXpNeeded = xpForNextLevel(voiceLevel) - xpForLevel(voiceLevel);
        const totalXpInLevel = totalXp - xpForLevel(totalLevel);
        const totalXpNeeded = xpForNextLevel(totalLevel) - xpForLevel(totalLevel);

        const container = ComponentsV2.baseContainer(ComponentsV2.Accents.primary);
        const files: AttachmentBuilder[] = [];

        try {
            const { createCanvas, loadImage } = await import('@napi-rs/canvas');
            const canvas = createCanvas(880, 260);
            const ctx = canvas.getContext('2d');
            const w = canvas.width, h = canvas.height;

            // === CLEAN DARK BACKGROUND ===
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 30;
            ctx.shadowOffsetY = 5;
            const bg = ctx.createLinearGradient(0, 0, 0, h);
            bg.addColorStop(0, '#12121c');
            bg.addColorStop(1, '#08080f');
            ctx.fillStyle = bg;
            ctx.beginPath();
            ctx.roundRect(0, 0, w, h, 16);
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;

            // Subtle border
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(1, 1, w - 2, h - 2, 15);
            ctx.stroke();

            // === AVATAR ===
            const avatarUrl = target.displayAvatarURL({ extension: 'png', size: 256 });
            let avatarImg: any;
            try {
                const r = await fetch(avatarUrl);
                avatarImg = await loadImage(Buffer.from(await r.arrayBuffer()));
            } catch { avatarImg = null; }

            const aX = 48, aY = 130, aR = 42;
            if (avatarImg) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(aX, aY, aR, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(avatarImg, aX - aR, aY - aR, aR * 2, aR * 2);
                ctx.restore();
                ctx.strokeStyle = 'rgba(255,255,255,0.12)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(aX, aY, aR - 1, 0, Math.PI * 2);
                ctx.stroke();
            }

            // === USERNAME ===
            ctx.textBaseline = 'bottom';
            ctx.font = 'bold 24px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(target.displayName, 115, 54);

            // === LEVEL & XP SUMMARY LINE ===
            ctx.font = '14px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
            ctx.fillStyle = '#6b7280';
            ctx.textBaseline = 'bottom';
            ctx.fillText(`Level ${totalLevel}  •  ${totalXp.toLocaleString()} total XP`, 115, 78);

            // === DIVIDER ===
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            ctx.beginPath();
            ctx.roundRect(115, 89, w - 140, 1, 0.5);
            ctx.fill();

            // === BARS ===
            const barX = 115;
            const barW = w - 160;
            const barH = 24;

            function drawBar(y: number, label: string, level: number, pct: number, cur: number, max: number, track: string, fillA: string, fillB: string) {
                const ratio = max > 0 ? Math.min(cur / max, 1) : 0;
                const fw = Math.max(barW * ratio, barH);

                ctx.textBaseline = 'bottom';
                ctx.font = '13px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
                ctx.fillStyle = track;
                ctx.fillText(label, barX, y - 6);

                ctx.font = 'bold 13px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
                ctx.fillStyle = fillA;
                ctx.fillText(`Level ${level}`, barX + (label === '💬 Chat' ? 55 : 65), y - 6);

                ctx.textAlign = 'right';
                ctx.font = '12px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
                ctx.fillStyle = '#52525b';
                ctx.fillText(`${pct}%`, barX + barW, y - 6);
                ctx.textAlign = 'left';

                // Track
                ctx.fillStyle = 'rgba(255,255,255,0.04)';
                ctx.beginPath();
                ctx.roundRect(barX, y, barW, barH, 12);
                ctx.fill();

                // Fill
                if (ratio > 0) {
                    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
                    grad.addColorStop(0, fillA);
                    grad.addColorStop(1, fillB);
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.roundRect(barX, y, fw, barH, 12);
                    ctx.fill();

                    // Gloss
                    const g = ctx.createLinearGradient(0, y, 0, y + barH / 2);
                    g.addColorStop(0, 'rgba(255,255,255,0.12)');
                    g.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.fillStyle = g;
                    ctx.beginPath();
                    ctx.roundRect(barX, y, fw, Math.max(barH / 2, 6), 12);
                    ctx.fill();
                }

                // XP text
                const txt = `${cur.toLocaleString()} / ${max.toLocaleString()} XP`;
                ctx.textBaseline = 'middle';
                if (ratio > 0.28) {
                    ctx.shadowColor = 'rgba(0,0,0,0.5)';
                    ctx.shadowBlur = 2;
                    ctx.font = 'bold 11px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(txt, barX + 10, y + barH / 2);
                    ctx.shadowBlur = 0;
                } else {
                    ctx.font = '11px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
                    ctx.fillStyle = '#52525b';
                    ctx.fillText(txt, barX + barW + 8, y + barH / 2);
                }
            }

            const chatPct = chatXpNeeded > 0 ? Math.round((chatXpInLevel / chatXpNeeded) * 100) : 100;
            drawBar(108, '💬 Chat', chatLevel, chatPct, chatXpInLevel, chatXpNeeded, '#a5b4fc', '#818cf8', '#6366f1');

            const voicePct = voiceXpNeeded > 0 ? Math.round((voiceXpInLevel / voiceXpNeeded) * 100) : 100;
            drawBar(156, '🔊 Voice', voiceLevel, voicePct, voiceXpInLevel, voiceXpNeeded, '#86efac', '#34d399', '#10b981');

            // === BOTTOM STATS ===
            ctx.textBaseline = 'bottom';
            ctx.font = '11px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
            ctx.fillStyle = '#3f3f50';
            ctx.fillText(`Chat XP: ${data.chatXp.toLocaleString()}  •  Voice XP: ${data.voiceXp.toLocaleString()}`, 30, 245);

            ctx.textAlign = 'right';
            ctx.font = 'bold 10px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
            ctx.fillStyle = '#3f3f50';
            ctx.fillText('VICTUSMC LEVELING', w - 30, 245);
            ctx.textAlign = 'left';

            const buffer = canvas.toBuffer('image/png');
            files.push(new AttachmentBuilder(buffer, { name: 'rankcard.png' }));
            container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://rankcard.png')));
        } catch (err) {
            logger.error('Failed to generate rank card:', err);
            container.addTextDisplayComponents(ComponentsV2.text(
                `# <:Stars:1524363036389937212> ${target.displayName}'s Level\n\n` +
                `### Chat Level: **${chatLevel}**\n${xpBar(data.chatXp, chatLevel)}\n\n` +
                `### Voice Level: **${voiceLevel}**\n${xpBar(data.voiceXp, voiceLevel)}\n\n` +
                `### Overall Level: **${totalLevel}**\n${xpBar(totalXp, totalLevel)}`
            ));
        }

        await interaction.reply({ files, components: [container], flags: V2 });
    },
};
