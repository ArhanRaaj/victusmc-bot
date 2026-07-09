import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import type { Command } from '../types/index.js';
import { countingSettings } from '../services/countingSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const countingCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('counting')
        .setDescription('Manage the counting game system (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('enable').setDescription('Enable the counting game in a channel')
                .addChannelOption(opt => opt.setName('channel').setDescription('Channel for counting').addChannelTypes(ChannelType.GuildText).setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('set').setDescription('Set the current count number')
                .addIntegerOption(opt => opt.setName('number').setDescription('The count to start from').setRequired(true).setMinValue(0))
        )
        .addSubcommand(sub =>
            sub.setName('disable').setDescription('Disable the counting game')
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const sub = interaction.options.getSubcommand();

        if (sub === 'enable') {
            const channel = interaction.options.getChannel('channel', true);
            const updated = await countingSettings.set(interaction.guildId!, {
                enabled: true,
                channelId: channel.id,
                lastNumber: 0,
                lastUserId: null,
                count: 0,
            });
            const c = ComponentsV2.successContainer(
                'Counting Enabled',
                `The counting game has been enabled in <#${channel.id}>.\nStart by typing **1** in that channel.`
            );
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'set') {
            const number = interaction.options.getInteger('number', true);
            const updated = await countingSettings.set(interaction.guildId!, {
                lastNumber: number - 1,
                lastUserId: null,
                count: number,
            });
            const c = ComponentsV2.successContainer(
                'Count Set',
                `The count has been set to **${number}**. The next number to type is **${number}**.`
            );
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'disable') {
            await countingSettings.set(interaction.guildId!, { enabled: false });
            const c = ComponentsV2.successContainer('Counting Disabled', 'The counting game has been disabled.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }
    },
};