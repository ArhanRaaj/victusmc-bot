import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SectionBuilder, ThumbnailBuilder, TextDisplayBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { config } from '../config.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const serverinfoCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Get info about the server')
        .setDMPermission(false),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });

        const guild = interaction.guild!;
        const owner = await guild.fetchOwner().catch(() => null);
        const channels = guild.channels.cache;
        const textChannels = channels.filter(c => c.type === 0).size;
        const voiceChannels = channels.filter(c => c.type === 2).size;
        const categories = channels.filter(c => c.type === 4).size;
        const boosts = guild.premiumSubscriptionCount || 0;
        const boostLevel = guild.premiumTier;
        const created = Math.floor(guild.createdTimestamp / 1000);
        const iconUrl = guild.iconURL({ size: 256 });
        const bannerUrl = guild.bannerURL({ size: 1024 });

        const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);

        if (bannerUrl) {
            c.addMediaGalleryComponents(ComponentsV2.mediaGallery(bannerUrl));
        } else {
            c.addMediaGalleryComponents(ComponentsV2.mediaGallery(config.branding.banner));
        }

        const titleSection = new SectionBuilder()
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconUrl || config.branding.logo))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `# ${guild.name}\n-# ID: \`${guild.id}\``
            ));
        c.addSectionComponents(titleSection);

        c.addSeparatorComponents(ComponentsV2.separator());

        c.addTextDisplayComponents(ComponentsV2.text(
            `**Owner:** ${owner?.user?.tag || 'Unknown'} **Created:** <t:${created}:R>\n` +
            `**Members:** ${guild.memberCount} **Channels:** ${textChannels} Text, ${voiceChannels} Voice, ${categories} Categories\n` +
            `**Boosts:** ${boosts} (Level ${boostLevel}) **Roles:** ${guild.roles.cache.size}`
        ));

        c.addSeparatorComponents(ComponentsV2.separator());

        const gamesSection = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `### Gamemodes\n` +
                `> **Lifesteal** — Fight, steal hearts, survive!\n` +
                `> **PvP** — Competitive player-versus-player arena\n\n` +
                `**Server IP:** \`play.victusmc.net\``
            ));
        c.addSectionComponents(gamesSection);

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setLabel('Store')
                .setStyle(ButtonStyle.Link)
                .setURL(`${config.branding.website}/store`),
            new ButtonBuilder()
                .setLabel('Discord')
                .setStyle(ButtonStyle.Link)
                .setURL(`${config.branding.website}/discord`),
            new ButtonBuilder()
                .setLabel('Hosting')
                .setStyle(ButtonStyle.Link)
                .setURL('https://www.victuscloud.com')
        );
        c.addActionRowComponents(buttons);

        await interaction.editReply({ components: [c], flags: V2 });
    },
};
