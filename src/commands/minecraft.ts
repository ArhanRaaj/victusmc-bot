import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { config } from '../config.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;
async function fetchMojangApi(endpoint: string): Promise<any> {
    try {
        const res = await fetch(`https://api.ashcon.app/mojang/v2${endpoint}`);
        if (!res.ok) return null;
        return await res.json();
    } catch { return null; }
}

function renderPlayerCard(player: any): any {
    const skinUrl = `https://crafatar.com/renders/body/${player.uuid}?overlay`;
    const avatarUrl = `https://crafatar.com/avatars/${player.uuid}?overlay`;

    const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
    let text = `# <:Tool:1524363009202323466> Minecraft Player\n\n` +
        `### ${player.username}\n` +
        `› **UUID:** \`${player.uuid}\`\n` +
        `› **Skin:** [View Skin](https://crafatar.com/skins/${player.uuid})\n\n`;

    if (player.name_history?.length > 1) {
        text += `### Name History\n` +
            player.name_history.slice(-5).reverse().map((h: any) =>
                `› **${h.name}**${h.changedToAt ? ` — <t:${Math.floor(new Date(h.changedToAt).getTime() / 1000)}:R>` : ' — Original'}`
            ).join('\n');
    }

    c.addMediaGalleryComponents(ComponentsV2.mediaGallery(avatarUrl));
    c.addTextDisplayComponents(ComponentsV2.text(text))
        .addSeparatorComponents(ComponentsV2.separator())
        .addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setLabel('View Skin').setStyle(ButtonStyle.Link).setURL(`https://crafatar.com/skins/${player.uuid}`),
                new ButtonBuilder().setLabel('NameMC').setStyle(ButtonStyle.Link).setURL(`https://namemc.com/profile/${player.uuid}`),
            )
        );
    return c;
}

export const minecraftCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('minecraft')
        .setDescription('Minecraft utilities: server status, player lookup, skins')
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('status').setDescription('Check VictusMC server status (ping, players, version)')
        )
        .addSubcommand(sub =>
            sub.setName('player').setDescription('Look up a Minecraft player by username')
                .addStringOption(o => o.setName('username').setDescription('Minecraft username').setRequired(true).setMaxLength(16))
        )
        .addSubcommand(sub =>
            sub.setName('uuid').setDescription('Get UUID for a Minecraft username')
                .addStringOption(o => o.setName('username').setDescription('Minecraft username').setRequired(true).setMaxLength(16))
        )
        .addSubcommand(sub =>
            sub.setName('skin').setDescription('View a player skin and render')
                .addStringOption(o => o.setName('username').setDescription('Minecraft username').setRequired(true).setMaxLength(16))
        )
        .addSubcommand(sub =>
            sub.setName('history').setDescription('View name history for a player')
                .addStringOption(o => o.setName('username').setDescription('Minecraft username').setRequired(true).setMaxLength(16))
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'status') {
            await interaction.deferReply({ flags: V2 });
            try {
                const hostname = (config.branding.website || 'https://victusmc.net').replace('https://', '').replace('http://', '');
                const res = await fetch(`https://api.mcsrvstat.us/3/${hostname}`);
                const data: any = await res.json();
                const c = ComponentsV2.baseContainer(data.online ? ComponentsV2.Accents.success : ComponentsV2.Accents.danger);
                c.addMediaGalleryComponents(ComponentsV2.mediaGallery(`${config.branding.website}/favicon.png`));
                c.addTextDisplayComponents(ComponentsV2.text(
                    `# <:Tool:1524363009202323466> VictusMC Server Status\n\n` +
                    `› **Status:** ${data.online ? 'Online' : 'Offline'}\n` +
                    (data.online ? (
                        `› **IP:** \`${data.ip || 'victusmc.net'}\`\n` +
                        `› **Players:** ${data.players?.online || 0}/${data.players?.max || 0}\n` +
                        `› **Version:** ${data.version || 'Unknown'}\n` +
                        `› **MOTD:** ${data.motd?.clean?.join(' ') || 'VictusMC'}\n`
                    ) : '')
                )).addSeparatorComponents(ComponentsV2.separator());
                await interaction.editReply({ components: [c], flags: V2 });
            } catch {
                const c = ComponentsV2.errorContainer('Status Error', 'Failed to fetch server status. Try again later.');
                await interaction.editReply({ components: [c], flags: V2 });
            }
            return;
        }

        const username = interaction.options.getString('username', true);

        if (sub === 'player') {
            await interaction.deferReply({ flags: V2 });
            const data = await fetchMojangApi(`/user/${username}`);
            if (!data) {
                await interaction.editReply({ components: [ComponentsV2.errorContainer('Player Not Found', `No player found with username **${username}**.`)], flags: V2 });
                return;
            }
            await interaction.editReply({ components: [renderPlayerCard(data)], flags: V2 });
            return;
        }

        if (sub === 'uuid') {
            await interaction.deferReply({ flags: V2 });
            const data = await fetchMojangApi(`/user/${username}`);
            if (!data) {
                await interaction.editReply({ components: [ComponentsV2.errorContainer('Player Not Found', `No player found with username **${username}**.`)], flags: V2 });
                return;
            }
            const c = ComponentsV2.infoContainer('UUID Lookup', `**${username}**\n\n› UUID: \`${data.uuid}\``);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'skin') {
            await interaction.deferReply({ flags: V2 });
            const data = await fetchMojangApi(`/user/${username}`);
            if (!data) {
                await interaction.editReply({ components: [ComponentsV2.errorContainer('Player Not Found', `No player found with username **${username}**.`)], flags: V2 });
                return;
            }
            const skinUrl = `https://crafatar.com/renders/body/${data.uuid}?overlay`;
            const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
            c.addMediaGalleryComponents(ComponentsV2.mediaGallery(skinUrl));
            c.addTextDisplayComponents(ComponentsV2.text(`# <:Pallete:1524362993666756628> ${username}'s Skin\n\n[Download Skin](https://crafatar.com/skins/${data.uuid})`));
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'history') {
            await interaction.deferReply({ flags: V2 });
            const data = await fetchMojangApi(`/user/${username}`);
            if (!data) {
                await interaction.editReply({ components: [ComponentsV2.errorContainer('Player Not Found', `No player found with username **${username}**.`)], flags: V2 });
                return;
            }
            let text = `# <:Message:1524363100734623836> Name History — ${username}\n\n`;
            if (data.name_history?.length) {
                data.name_history.forEach((h: any) => {
                    text += `› **${h.name}**${h.changedToAt ? ` — Changed <t:${Math.floor(new Date(h.changedToAt).getTime() / 1000)}:R>` : ' — Original name'}\n`;
                });
            } else {
                text += '_No name history found._';
            }
            const c = ComponentsV2.infoContainer('Name History', text);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }
    },
};
