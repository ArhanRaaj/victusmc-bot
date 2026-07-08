import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SectionBuilder, ThumbnailBuilder, TextDisplayBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const userinfoCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Get info about a user')
        .setDMPermission(false)
        .addUserOption(o =>
            o.setName('user').setDescription('The user (defaults to yourself)')
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });

        const user = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
        const roles = member?.roles.cache.filter(r => r.id !== interaction.guildId).sort((a, b) => b.position - a.position);
        const avatarUrl = member?.displayAvatarURL({ size: 256 }) || user.displayAvatarURL({ size: 256 });
        const created = Math.floor(user.createdTimestamp / 1000);
        const joined = member ? Math.floor((member.joinedTimestamp || 0) / 1000) : null;

        const statusEmojis: Record<string, string> = {
            online: '🟢',
            idle: '🟡',
            dnd: '🔴',
            offline: '⚫',
        };
        const status = member?.presence?.status || 'offline';

        const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);

        const titleSection = new SectionBuilder()
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# ${member?.displayName || user.username}\n` +
                `-# @${user.username}`
            ));
        c.addSectionComponents(titleSection);

        c.addSeparatorComponents(ComponentsV2.separator());

        c.addTextDisplayComponents(ComponentsV2.text(
            `${statusEmojis[status]} **${status.charAt(0).toUpperCase() + status.slice(1)}** • \`${user.id}\`\n` +
            `**Account Created:** <t:${created}:R>\n` +
            (joined ? `**Joined Server:** <t:${joined}:R>` : '')
        ));

        if (roles?.size) {
            c.addSeparatorComponents(ComponentsV2.separator());
            c.addTextDisplayComponents(ComponentsV2.text(
                `**Roles (${roles.size}):**\n` +
                roles.first(10).map(r => `<@&${r.id}>`).join(' ') +
                (roles.size > 10 ? ` *+${roles.size - 10} more*` : '')
            ));
        }

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setLabel('Open Avatar')
                .setStyle(ButtonStyle.Link)
                .setURL(user.displayAvatarURL({ size: 512 })),
            new ButtonBuilder()
                .setLabel('View Profile')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/users/${user.id}`)
        );
        c.addActionRowComponents(buttons);

        await interaction.editReply({ components: [c], flags: V2 });
    },
};
