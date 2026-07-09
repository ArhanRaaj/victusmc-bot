import { SlashCommandBuilder, ChannelType } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { config } from '../config.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

async function fetchPing(client: any): Promise<number> {
    const start = Date.now();
    await client.rest.get('/api/v10/gateway').catch(() => {});
    return Date.now() - start;
}

export const pingCommand: Command = {
    data: new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const apiPing = await fetchPing(interaction.client);
        const wsPing = interaction.client.ws.ping;
        const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
        c.addTextDisplayComponents(ComponentsV2.text(
            `# <:Info:1524363004823470120> Pong!\n\n` +
            `**WebSocket:** ${wsPing}ms\n` +
            `**API Latency:** ${apiPing}ms`
        ));
        await interaction.editReply({ components: [c], flags: V2 });
    },
};

export const membercountCommand: Command = {
    data: new SlashCommandBuilder().setName('membercount').setDescription('View server member count').setDMPermission(false),
    async execute(interaction) {
        const guild = interaction.guild!;
        const total = guild.memberCount;
        const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
        c.addTextDisplayComponents(ComponentsV2.text(
            `# <:User:1524363104903893052> Member Count\n\n` +
            `**${guild.name}** has **${total}** members.`
        ));
        await interaction.reply({ components: [c], flags: V2 });
    },
};

export const botinfoCommand: Command = {
    data: new SlashCommandBuilder().setName('botinfo').setDescription('View bot information'),
    async execute(interaction) {
        const client = interaction.client;
        const uptime = Math.floor(client.uptime / 1000);
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const mins = Math.floor((uptime % 3600) / 60);
        const wsPing = client.ws.ping;

        const c = ComponentsV2.baseContainer(config.branding.color);
        const body = `# VictusMC Bot\n\n` +
            `**Uptime:** ${days}d ${hours}h ${mins}m\n` +
            `**WebSocket:** ${wsPing}ms\n` +
            `**Servers:** ${client.guilds.cache.size}\n` +
            `**Users:** ${client.guilds.cache.reduce((a: number, g: any) => a + g.memberCount, 0)}`;

        c.addTextDisplayComponents(ComponentsV2.text(body));
        c.addSeparatorComponents(ComponentsV2.separator());
        c.addTextDisplayComponents(ComponentsV2.text(`-# VictusMC • ${config.branding.website}`));

        await interaction.reply({ components: [c], flags: V2 });
    },
};

export const servericonCommand: Command = {
    data: new SlashCommandBuilder().setName('servericon').setDescription('View server icon').setDMPermission(false),
    async execute(interaction) {
        const guild = interaction.guild!;
        const icon = guild.iconURL({ size: 512 });
        if (!icon) {
            await interaction.reply({ content: 'This server has no icon.', flags: 64 });
            return;
        }
        await interaction.reply({ content: icon });
    },
};

export const serverbannerCommand: Command = {
    data: new SlashCommandBuilder().setName('serverbanner').setDescription('View server banner').setDMPermission(false),
    async execute(interaction) {
        const guild = interaction.guild!;
        const banner = guild.bannerURL({ size: 1024 });
        if (!banner) {
            await interaction.reply({ content: 'This server has no banner.', flags: 64 });
            return;
        }
        await interaction.reply({ content: banner });
    },
};

export const avatarCommand: Command = {
    data: new SlashCommandBuilder().setName('avatar').setDescription('View a user avatar')
        .addUserOption(opt => opt.setName('user').setDescription('The user').setRequired(false)),
    async execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        const avatar = user.displayAvatarURL({ size: 512 });
        await interaction.reply({ content: avatar });
    },
};