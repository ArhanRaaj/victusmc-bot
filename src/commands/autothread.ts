import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import type { Command } from '../types/index.js';
import { autoThreadService } from '../services/autoThreadSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const autothreadCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('autothread')
        .setDescription('Auto-create threads in channels')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('add').setDescription('Add a channel for auto-threading')
                .addChannelOption(opt => opt.setName('channel').setDescription('Text channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
                .addStringOption(opt => opt.setName('name').setDescription('Thread name template (use {user})').setRequired(false).setMaxLength(100))
        )
        .addSubcommand(sub =>
            sub.setName('remove').setDescription('Remove a channel from auto-threading')
                .addChannelOption(opt => opt.setName('channel').setDescription('Channel to remove').setRequired(true).addChannelTypes(ChannelType.GuildText))
        )
        .addSubcommand(sub => sub.setName('list').setDescription('List auto-thread channels'))
        .addSubcommand(sub => sub.setName('disable').setDescription('Disable auto-threading')),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const sub = interaction.options.getSubcommand();
        const config = await autoThreadService.get(interaction.guildId!);

        if (sub === 'add') {
            const channel = interaction.options.getChannel('channel', true);
            const name = interaction.options.getString('name') || '{user}\'s thread';
            const channels = config?.channelIds ? [...config.channelIds] : [];
            if (channels.includes(channel.id)) {
                const c = ComponentsV2.errorContainer('Already Added', `<#${channel.id}> is already set up.`);
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            channels.push(channel.id);
            await autoThreadService.save(interaction.guildId!, { channelIds: channels, duration: 60, name });
            const c = ComponentsV2.successContainer('Auto-Thread Added', `<#${channel.id}> will auto-create threads with name: **${name}**`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'remove') {
            const channel = interaction.options.getChannel('channel', true);
            if (!config || !config.channelIds.includes(channel.id)) {
                const c = ComponentsV2.errorContainer('Not Found', `<#${channel.id}> is not configured.`);
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            const channels = config.channelIds.filter(id => id !== channel.id);
            if (channels.length === 0) {
                await autoThreadService.delete(interaction.guildId!);
            } else {
                await autoThreadService.save(interaction.guildId!, { ...config, channelIds: channels });
            }
            const c = ComponentsV2.successContainer('Auto-Thread Removed', `<#${channel.id}> removed.`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'list') {
            if (!config || config.channelIds.length === 0) {
                const c = ComponentsV2.infoContainer('No Channels', 'No auto-thread channels configured.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            const list = config.channelIds.map(id => `<#${id}>`).join('\n');
            const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
            c.addTextDisplayComponents(ComponentsV2.text(`# <:Edit:1524363079675154433> Auto-Thread Channels\n${list}`));
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'disable') {
            await autoThreadService.delete(interaction.guildId!);
            const c = ComponentsV2.errorContainer('Disabled', 'Auto-threading disabled.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }
    },
};