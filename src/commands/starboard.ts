import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import type { Command } from '../types/index.js';
import { starboardService } from '../services/starboardSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const starboardCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('starboard')
        .setDescription('Starboard — auto-pin popular messages')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('set').setDescription('Set starboard channel and minimum reactions')
                .addChannelOption(opt => opt.setName('channel').setDescription('Channel for starboard posts').setRequired(true).addChannelTypes(ChannelType.GuildText))
                .addIntegerOption(opt => opt.setName('min').setDescription('Minimum reactions required').setRequired(true).setMinValue(1).setMaxValue(100))
                .addStringOption(opt => opt.setName('emoji').setDescription('Reaction emoji to track (default ⭐)').setRequired(false))
        )
        .addSubcommand(sub => sub.setName('status').setDescription('View starboard config'))
        .addSubcommand(sub => sub.setName('disable').setDescription('Disable starboard')),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const sub = interaction.options.getSubcommand();

        if (sub === 'set') {
            const channel = interaction.options.getChannel('channel', true);
            const min = interaction.options.getInteger('min', true);
            const emoji = interaction.options.getString('emoji') || '⭐';
            await starboardService.saveConfig(interaction.guildId!, {
                channelId: channel.id,
                minReactions: min,
                emoji,
                enabled: true,
            });
            const c = ComponentsV2.successContainer('Starboard Set',
                `Posts with **${min}+** ${emoji} reactions will appear in <#${channel.id}>`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'status') {
            const cfg = await starboardService.getConfig(interaction.guildId!);
            if (!cfg.enabled) {
                const c = ComponentsV2.infoContainer('Not Enabled', 'Starboard is not set up.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
            c.addTextDisplayComponents(ComponentsV2.text(
                `## <:Edit:1524363079675154433> Starboard\n**Channel:** <#${cfg.channelId}>\n**Minimum:** ${cfg.minReactions} ${cfg.emoji}`
            ));
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'disable') {
            await starboardService.saveConfig(interaction.guildId!, { channelId: '', minReactions: 3, emoji: '⭐', enabled: false });
            const c = ComponentsV2.errorContainer('Starboard Disabled', 'Starboard removed.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }
    },
};