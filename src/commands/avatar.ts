import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const avatarCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Get a user\'s avatar')
        .setDMPermission(false)
        .addUserOption(o =>
            o.setName('user').setDescription('The user (defaults to yourself)')
        ),

    async execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
        const avatarUrl = member?.displayAvatarURL({ size: 1024 }) || user.displayAvatarURL({ size: 1024 });

        const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
        c.addMediaGalleryComponents(ComponentsV2.mediaGallery(avatarUrl));
        c.addTextDisplayComponents(ComponentsV2.text(
            `# <:Image:1524363100734623836> ${user.username}'s Avatar\n\n[Open Avatar](${avatarUrl})`
        ));
        await interaction.reply({ components: [c], flags: V2 });
    },
};
