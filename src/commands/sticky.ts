import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import type { Command } from '../types/index.js';
import { stickySettings } from '../services/stickySettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const stickyCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('sticky')
        .setDescription('Manage sticky messages in channels (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('set').setDescription('Set or update a sticky message in a channel')
                .addChannelOption(opt => opt.setName('channel').setDescription('The channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
                .addStringOption(opt => opt.setName('content').setDescription('The sticky message content').setRequired(true).setMaxLength(1900))
        )
        .addSubcommand(sub =>
            sub.setName('toggle').setDescription('Enable or disable the sticky message in a channel')
                .addChannelOption(opt => opt.setName('channel').setDescription('The channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('delete').setDescription('Delete the sticky message from a channel')
                .addChannelOption(opt => opt.setName('channel').setDescription('The channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('list').setDescription('List all sticky messages in the server')
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const sub = interaction.options.getSubcommand();

        if (sub === 'set') {
            const channel = interaction.options.getChannel('channel', true);
            const content = interaction.options.getString('content', true);
            const messages = await stickySettings.setSticky(interaction.guildId!, channel.id, content);
            const c = ComponentsV2.successContainer('Sticky Message Set', `Sticky message configured for <#${channel.id}>.`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'toggle') {
            const channel = interaction.options.getChannel('channel', true);
            const messages = await stickySettings.toggleSticky(interaction.guildId!, channel.id);
            const entry = messages.find((m: any) => m.channel === channel.id);
            const enabled = entry?.enabled;
            const c = enabled
                ? ComponentsV2.successContainer('Sticky Enabled', `Sticky message in <#${channel.id}> is now enabled.`)
                : ComponentsV2.warningContainer('Sticky Disabled', `Sticky message in <#${channel.id}> is now disabled.`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'delete') {
            const channel = interaction.options.getChannel('channel', true);
            const messages = await stickySettings.deleteSticky(interaction.guildId!, channel.id);
            const c = ComponentsV2.successContainer('Sticky Deleted', `Sticky message in <#${channel.id}> has been removed.`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'list') {
            const messages = await stickySettings.getStickies(interaction.guildId!);
            if (messages.length === 0) {
                const c = ComponentsV2.infoContainer('No Sticky Messages', 'No sticky messages configured.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            const list = messages.map((m: any, i: number) =>
                `**${i + 1}.** <#${m.channel}> — ${m.enabled ? '<:Tick:1524363090626482326>' : '<:Cross:1524363088621469737>'}\n\`\`\`${m.content.substring(0, 100)}${m.content.length > 100 ? '...' : ''}\`\`\``
            ).join('\n');
            const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
            c.addTextDisplayComponents(ComponentsV2.text(`# <:Edit:1524363079675154433> Sticky Messages\n\n${list}`));
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }
    },
};