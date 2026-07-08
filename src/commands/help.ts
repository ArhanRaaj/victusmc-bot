import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, StringSelectMenuBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { config } from '../config.js';
import { supabase } from '../services/supabase.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;
const HERO_IMAGE = 'https://cdn.discordapp.com/attachments/1416827980004724766/1523993256961118299/wmremove-transformed.png';
const INVITE_URL = `https://discord.com/api/oauth2/authorize?client_id=${config.discord.clientId}&permissions=8&scope=bot%20applications.commands`;

const CATEGORY_ARTWORK: Record<string, string> = {
    main: HERO_IMAGE,
    administration: HERO_IMAGE,
    moderation: HERO_IMAGE,
    music: HERO_IMAGE,
    features: HERO_IMAGE,
    tickets: HERO_IMAGE,
    minecraft: HERO_IMAGE,
};

function getSelectMenu(currentVal?: string) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId('help_category')
        .setPlaceholder('Explore command categories...')
        .addOptions([
            { label: 'Overview', description: 'Main landing page & information', value: 'main' },
            { label: 'Setup & Administration', description: 'Welcomer, prefix, configurations', value: 'administration' },
            { label: 'Moderation & Logs', description: 'Moderation, auto-moderation, anti-nuke, logs', value: 'moderation' },
            { label: 'Music System', description: 'Compact player & audio controls', value: 'music' },
            { label: 'Tickets System', description: 'Discord ticket support setup & controls', value: 'tickets' },
            { label: 'Features & Utilities', description: 'Giveaways, suggestions, polls, custom commands', value: 'features' },
            { label: 'Minecraft & Fun', description: 'Server status, skins, utility & fun tools', value: 'minecraft' },
        ]);

    if (currentVal) {
        menu.options.forEach(opt => {
            if (opt.data.value === currentVal) opt.setDefault(true);
        });
    }

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function getButtons() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel('Invite Bot')
            .setStyle(ButtonStyle.Link)
            .setURL(INVITE_URL),
        new ButtonBuilder()
            .setLabel('Website')
            .setEmoji({ id: '1524335091302535249', name: 'store' })
            .setStyle(ButtonStyle.Link)
            .setURL('https://mc.victuscloud.com'),
        new ButtonBuilder()
            .setLabel('Support Discord')
            .setEmoji({ id: '1524335906750857298', name: 'story' })
            .setStyle(ButtonStyle.Link)
            .setURL(config.branding.website + '/discord')
    );
}

export const helpCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Open the premium VictusMc interactive help menu')
        .setDMPermission(false),

    cooldown: 3,

    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: V2 });
        } catch {
            return;
        }

        const settings = await supabase.getBotSettings(interaction.guildId!).catch(() => null);
        const prefix = settings?.prefix || '!';

        const container = ComponentsV2.baseContainer(config.branding.color);
        container.addMediaGalleryComponents(ComponentsV2.mediaGallery(CATEGORY_ARTWORK.main));

        const body = `-# 💫 VICTUSMC OPERATIONS • COMMAND LAYER\n` +
            `# VictusMc Support Hub\n\n` +
            `Welcome, **${interaction.user.username}**. This panel grants access to all operational commands for the VictusMc Minecraft community bot.\n\n` +
            `### ⚙️ Quick Connection Details\n` +
            `› **Server Prefix:** \`${prefix}\`\n` +
            `› **Bot Prefix:** \`!\` / Mention prefix (e.g. <@${interaction.client.user?.id}>)\n` +
            `› **Website:** [victusmc.net](${config.branding.website})\n\n` +
            `Use the dropdown menu below to inspect specific modules.`;

        container.addTextDisplayComponents(ComponentsV2.text(body))
            .addSeparatorComponents(ComponentsV2.separator())
            .addActionRowComponents(getButtons())
            .addActionRowComponents(getSelectMenu('main'))
            .addTextDisplayComponents(ComponentsV2.text(`-# Private session • VictusMc v1.0`));

        await interaction.editReply({
            components: [container],
            flags: V2,
        });
    },

    async handleSelectMenu(interaction) {
        if (interaction.customId !== 'help_category') return;

        const category = interaction.values[0] || 'main';
        const settings = await supabase.getBotSettings(interaction.guildId!).catch(() => null);
        const prefix = settings?.prefix || '!';

        const container = ComponentsV2.baseContainer(config.branding.color);
        
        const artwork = CATEGORY_ARTWORK[category] || CATEGORY_ARTWORK.main;
        container.addMediaGalleryComponents(ComponentsV2.mediaGallery(artwork));

        let title = '';
        let desc = '';

        switch (category) {
            case 'main':
                title = 'VictusMc Support Hub';
                desc = `Welcome, **${interaction.user.username}**. This panel grants access to all operational commands for the VictusMc Minecraft community bot.\n\n` +
                    `### ⚙️ Quick Connection Details\n` +
                    `› **Server Prefix:** \`${prefix}\`\n` +
                    `› **Bot Prefix:** \`!\` / Mention prefix\n` +
                    `› **Website:** [victusmc.net](${config.branding.website})\n\n` +
                    `Use the dropdown menu below to inspect specific modules.`;
                break;

            case 'administration':
                title = 'Setup & Administration';
                desc = `Commands to configure welcome parameters, logs, prefixes, and voice channels.\n\n` +
                    `### Command Catalog\n` +
                    `› \`/config view\` • Inspect current bot configuration.\n` +
                    `› \`/config logs <channel>\` • Set the target channel for audit logs.\n` +
                    `› \`/config transcript-channel <channel>\` • Set the ticket transcript log channel.\n` +
                    `› \`/setprefix <prefix>\` • Changes the server-specific prefix.\n` +
                    `› \`/prefix\` • Inspect current server prefix.\n` +
                    `› \`/welcome setup\` • Configure welcome channel, auto-role, and nicknames.\n` +
                    `› \`/j2c\` • Set up Join-To-Create temporary voice channels.\n` +
                    `› \`/reactroles\` • Create dropdown, button, or unique reaction role panels.`;
                break;

            case 'moderation':
                title = 'Moderation & Logs';
                desc = `Keep your server secure with moderation tools, auto-moderation rules, anti-nuke shielding, and whitelists.\n\n` +
                    `### Command Catalog\n` +
                    `› \`/kick <user> [reason]\` • Kick a user from the guild.\n` +
                    `› \`/ban <user> [reason]\` • Permanently ban a user.\n` +
                    `› \`/unban <user_id> [reason]\` • Lift a server ban.\n` +
                    `› \`/timeout <user> <duration> [reason]\` • Place a user in timeout.\n` +
                    `› \`/untimeout <user> [reason]\` • Remove a user's timeout.\n` +
                    `› \`/purge <count> [user]\` • Bulk-delete channel messages.\n` +
                    `› \`/warn <user> <reason>\` • Issue a warn to a member.\n` +
                    `› \`/whitelist <add/remove/list/edit>\` • Manage user immunities for moderation.\n` +
                    `› \`/antinuke\` • Configure anti-nuke protection (mass ban/kick/channel delete).\n` +
                    `› \`/automod\` • Configure auto-moderation rules (spam, invites, bad words, etc.).\n` +
                    `› \`/audit-log setup\` • Configure logging for server events.\n\n` +
                    `_Requires appropriate moderator/admin permissions to run._`;
                break;

            case 'music':
                title = 'Music System';
                desc = `Listen to high-fidelity audio directly inside Voice channels.\n\n` +
                    `### Command Catalog\n` +
                    `› \`/music\` • Open the interactive Now Playing & controls panel.\n` +
                    `› \`/play <query/URL>\` • Play a track from YouTube, SoundCloud, Spotify, or direct URLs.\n` +
                    `› \`/playrandom\` • Play a curated random track.\n` +
                    `› \`/nowplaying\` • Spawns the compact music player card.\n` +
                    `› \`/skip\` • Skip the current song.\n` +
                    `› \`/stop\` • Halt audio, clear queue, and disconnect.\n` +
                    `› \`/volume <level>\` • Adjust volume (0-150%).\n` +
                    `› \`/loop <off/track/queue>\` • Repeat current tracks.\n` +
                    `› \`/shuffle\` • Shuffle queue.\n` +
                    `› \`/queue\` • List upcoming tracks.`;
                break;

            case 'tickets':
                title = 'Ticket Support System';
                desc = `Fully configurable ticket system using Components V2.\n\n` +
                    `### Command Catalog\n` +
                    `› \`/ticket create\` • Opens a ticket form modal.\n` +
                    `› \`/ticket add <user>\` • Add user to support channel.\n` +
                    `› \`/ticket remove <user>\` • Remove user from channel.\n` +
                    `› \`/ticket claim\` • Allocate ticket to active staff.\n` +
                    `› \`/ticket close\` • Terminate support thread and log transcript.`;
                break;

            case 'features':
                title = 'Features & Customization';
                desc = `Create custom commands, layouts, giveaways, suggestions, and polls.\n\n` +
                    `### Command Catalog\n` +
                    `› \`/create-command\` • Create a custom prefix/slash command.\n` +
                    `› \`/giveaway create\` • Open giveaway builder.\n` +
                    `› \`/giveaway end/pause/resume/reroll\` • Manage giveaways.\n` +
                    `› \`/suggest <title> <content>\` • Submit a user suggestion.\n` +
                    `› \`/suggestion modapprove/moddeny\` • Moderate suggestions.\n` +
                    `› \`/poll create\` • Launch a server-wide poll.`;
                break;

            case 'minecraft':
                title = 'Minecraft & Fun Utilities';
                desc = `Minecraft utilities, economy, and fun commands.\n\n` +
                    `### Command Catalog\n` +
                    `› \`/afk [reason]\` • Set your status to AFK.\n` +
                    `› \`/bal [user]\` • Check cash balance.\n` +
                    `› \`/daily\` • Claim $500 daily cash reward.\n` +
                    `› \`/avatar [user]\` • View a user's avatar.\n` +
                    `› \`/userinfo [user]\` • View user information.\n` +
                    `› \`/serverinfo\` • View server information.\n` +
                    `› \`/minecraft status\` • Get VictusMc online status, ping, and player count.\n` +
                    `› \`/minecraft player\` • Look up a Java player's profile.\n` +
                    `› \`/minecraft uuid\` • Resolve a username to UUID.\n` +
                    `› \`/minecraft skin\` • Get a player's skin download.\n` +
                    `› \`/minecraft history\` • View a player's name history.\n` +
                    `› \`/8ball\` • Ask the magic 8-ball (bet optional).\n` +
                    `› \`/coinflip\` • Flip a coin (bet optional).\n` +
                    `› \`/dice\` • Roll a die (bet optional).\n` +
                    `› \`/rate\` • Rate something.\n` +
                    `› \`/ship\` • Ship two users.\n` +
                    `› \`/mines <bet>\` • Play Mines (9×9, 3 mines).`;
                break;
        }

        const body = `-# 💠 VICTUSMC OPERATIONS • ${category.toUpperCase()}\n` +
            `# ${title}\n\n` +
            `${desc}`;

        container.addTextDisplayComponents(ComponentsV2.text(body))
            .addSeparatorComponents(ComponentsV2.separator())
            .addActionRowComponents(getButtons())
            .addActionRowComponents(getSelectMenu(category))
            .addTextDisplayComponents(ComponentsV2.text(`-# Server Prefix: ${prefix} • Active Session`));

        await interaction.update({
            components: [container],
            embeds: [],
            flags: V2,
        });
    },
};
