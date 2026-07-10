import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { logger } from '../utils/logger.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const modCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('mod')
        .setDescription('Moderation utility commands')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('mute').setDescription('Mute a member')
                .addUserOption(opt => opt.setName('user').setDescription('The user').setRequired(true))
                .addStringOption(opt => opt.setName('reason').setDescription('Reason for mute'))
        )
        .addSubcommand(sub =>
            sub.setName('unmute').setDescription('Unmute a member')
                .addUserOption(opt => opt.setName('user').setDescription('The user').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('lock').setDescription('Lock a channel')
                .addChannelOption(opt => opt.setName('channel').setDescription('Channel to lock').addChannelTypes(ChannelType.GuildText).setRequired(false))
                .addStringOption(opt => opt.setName('reason').setDescription('Reason'))
        )
        .addSubcommand(sub =>
            sub.setName('unlock').setDescription('Unlock a channel')
                .addChannelOption(opt => opt.setName('channel').setDescription('Channel to unlock').addChannelTypes(ChannelType.GuildText).setRequired(false))
                .addStringOption(opt => opt.setName('reason').setDescription('Reason'))
        )
        .addSubcommand(sub =>
            sub.setName('slowmode').setDescription('Set channel slowmode')
                .addIntegerOption(opt => opt.setName('seconds').setDescription('Slowmode in seconds (0 to disable)').setRequired(true).setMinValue(0).setMaxValue(21600))
                .addChannelOption(opt => opt.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(false))
        )
        .addSubcommand(sub =>
            sub.setName('setnick').setDescription('Change a member nickname')
                .addUserOption(opt => opt.setName('user').setDescription('The user').setRequired(true))
                .addStringOption(opt => opt.setName('nickname').setDescription('New nickname').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('deafen').setDescription('Deafen a member in voice')
                .addUserOption(opt => opt.setName('user').setDescription('The user').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('undeafen').setDescription('Undeafen a member in voice')
                .addUserOption(opt => opt.setName('user').setDescription('The user').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('move').setDescription('Move a member to another voice channel')
                .addUserOption(opt => opt.setName('user').setDescription('The user').setRequired(true))
                .addChannelOption(opt => opt.setName('channel').setDescription('Target voice channel').setRequired(true).addChannelTypes(ChannelType.GuildVoice))
        )
        .addSubcommand(sub =>
            sub.setName('disconnect').setDescription('Disconnect a member from voice')
                .addUserOption(opt => opt.setName('user').setDescription('The user').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('stealemoji').setDescription('Steal an emoji from a message or URL')
                .addStringOption(opt => opt.setName('emoji').setDescription('The emoji (custom or URL)').setRequired(true))
                .addStringOption(opt => opt.setName('name').setDescription('Name for the emoji'))
        )
        .addSubcommand(sub =>
            sub.setName('stealsticker').setDescription('Steal a sticker from a message')
                .addStringOption(opt => opt.setName('sticker_id').setDescription('Sticker ID to steal').setRequired(true))
                .addStringOption(opt => opt.setName('name').setDescription('Name for the sticker'))
        )
        .addSubcommand(sub =>
            sub.setName('clear').setDescription('Clear messages from a user')
                .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages (max 100)').setRequired(true).setMinValue(1).setMaxValue(100))
                .addUserOption(opt => opt.setName('user').setDescription('Filter by user').setRequired(false))
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const sub = interaction.options.getSubcommand();

        try {
            switch (sub) {
                case 'mute': return await handleMute(interaction);
                case 'unmute': return await handleUnmute(interaction);
                case 'lock': return await handleLock(interaction);
                case 'unlock': return await handleUnlock(interaction);
                case 'slowmode': return await handleSlowmode(interaction);
                case 'setnick': return await handleSetNick(interaction);
                case 'deafen': return await handleDeafen(interaction);
                case 'undeafen': return await handleUndeafen(interaction);
                case 'move': return await handleMove(interaction);
                case 'disconnect': return await handleDisconnect(interaction);
                case 'stealemoji': return await handleStealEmoji(interaction);
                case 'stealsticker': return await handleStealSticker(interaction);
                case 'clear': return await handleClear(interaction);
            }
        } catch (error: any) {
            logger.error(`Mod command ${sub} error:`, error);
            const c = ComponentsV2.errorContainer('Error', error.message || 'An error occurred.');
            await interaction.editReply({ components: [c], flags: V2 });
        }
    },
};

async function handleMute(interaction: any) {
    const user = interaction.options.getMember('user');
    if (!user) {
        const c = ComponentsV2.errorContainer('Error', 'User not found in this server.');
        await interaction.editReply({ components: [c], flags: V2 });
        return;
    }
    const reason = interaction.options.getString('reason') || 'No reason provided';
    await user.timeout(28 * 24 * 60 * 60 * 1000, reason);
    const c = ComponentsV2.successContainer('Member Muted', `${user.user.tag} has been muted.\n**Reason:** ${reason}`);
    await interaction.editReply({ components: [c], flags: V2 });
}

async function handleUnmute(interaction: any) {
    const user = interaction.options.getMember('user');
    if (!user) {
        const c = ComponentsV2.errorContainer('Error', 'User not found.');
        await interaction.editReply({ components: [c], flags: V2 });
        return;
    }
    await user.timeout(null);
    const c = ComponentsV2.successContainer('Member Unmuted', `${user.user.tag} has been unmuted.`);
    await interaction.editReply({ components: [c], flags: V2 });
}

async function handleLock(interaction: any) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const reason = interaction.options.getString('reason') || 'No reason';
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
    const c = ComponentsV2.successContainer('Channel Locked', `<#${channel.id}> has been locked.\n**Reason:** ${reason}`);
    await interaction.editReply({ components: [c], flags: V2 });
}

async function handleUnlock(interaction: any) {
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const reason = interaction.options.getString('reason') || 'No reason';
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
    const c = ComponentsV2.successContainer(' Channel Unlocked', `<#${channel.id}> has been unlocked.\n**Reason:** ${reason}`);
    await interaction.editReply({ components: [c], flags: V2 });
}

async function handleSlowmode(interaction: any) {
    const seconds = interaction.options.getInteger('seconds', true);
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    await channel.setRateLimitPerUser(seconds);
    const msg = seconds > 0 ? `Slowmode set to **${seconds}** seconds.` : 'Slowmode disabled.';
    const c = ComponentsV2.successContainer('Slowmode Updated', `<#${channel.id}>: ${msg}`);
    await interaction.editReply({ components: [c], flags: V2 });
}

async function handleSetNick(interaction: any) {
    const member = interaction.options.getMember('user');
    if (!member) {
        const c = ComponentsV2.errorContainer('Error', 'User not found.');
        await interaction.editReply({ components: [c], flags: V2 });
        return;
    }
    const nickname = interaction.options.getString('nickname', true);
    await member.setNickname(nickname);
    const c = ComponentsV2.successContainer('Nickname Changed', `${member.user.tag}'s nickname set to **${nickname}**.`);
    await interaction.editReply({ components: [c], flags: V2 });
}

async function handleDeafen(interaction: any) {
    const member = interaction.options.getMember('user');
    if (!member) {
        const c = ComponentsV2.errorContainer('Error', 'User not found.');
        await interaction.editReply({ components: [c], flags: V2 });
        return;
    }
    if (!member.voice.channel) {
        const c = ComponentsV2.warningContainer('Not in Voice', `${member.user.tag} is not in a voice channel.`);
        await interaction.editReply({ components: [c], flags: V2 });
        return;
    }
    await member.voice.setDeaf(true);
    const c = ComponentsV2.successContainer('Member Deafened', `${member.user.tag} has been deafened.`);
    await interaction.editReply({ components: [c], flags: V2 });
}

async function handleUndeafen(interaction: any) {
    const member = interaction.options.getMember('user');
    if (!member) {
        const c = ComponentsV2.errorContainer('Error', 'User not found.');
        await interaction.editReply({ components: [c], flags: V2 });
        return;
    }
    await member.voice.setDeaf(false);
    const c = ComponentsV2.successContainer('Member Undeafened', `${member.user.tag} has been undeafened.`);
    await interaction.editReply({ components: [c], flags: V2 });
}

async function handleMove(interaction: any) {
    const member = interaction.options.getMember('user');
    const channel = interaction.options.getChannel('channel', true);
    if (!member) {
        const c = ComponentsV2.errorContainer('Error', 'User not found.');
        await interaction.editReply({ components: [c], flags: V2 });
        return;
    }
    if (!member.voice.channel) {
        const c = ComponentsV2.warningContainer('Not in Voice', `${member.user.tag} is not in a voice channel.`);
        await interaction.editReply({ components: [c], flags: V2 });
        return;
    }
    await member.voice.setChannel(channel);
    const c = ComponentsV2.successContainer('Member Moved', `${member.user.tag} moved to <#${channel.id}>.`);
    await interaction.editReply({ components: [c], flags: V2 });
}

async function handleDisconnect(interaction: any) {
    const member = interaction.options.getMember('user');
    if (!member) {
        const c = ComponentsV2.errorContainer('Error', 'User not found.');
        await interaction.editReply({ components: [c], flags: V2 });
        return;
    }
    if (!member.voice.channel) {
        const c = ComponentsV2.warningContainer('Not in Voice', `${member.user.tag} is not in a voice channel.`);
        await interaction.editReply({ components: [c], flags: V2 });
        return;
    }
    await member.voice.disconnect();
    const c = ComponentsV2.successContainer('Member Disconnected', `${member.user.tag} has been disconnected from voice.`);
    await interaction.editReply({ components: [c], flags: V2 });
}

async function handleStealEmoji(interaction: any) {
    const emojiInput = interaction.options.getString('emoji', true);
    const name = interaction.options.getString('name');

    let emojiUrl: string | null = null;
    let emojiName = name || 'stolen';

    const customMatch = emojiInput.match(/<a?:(\w+):(\d+)>/);
    if (customMatch) {
        emojiName = name || customMatch[1];
        const animated = emojiInput.startsWith('<a:');
        emojiUrl = `https://cdn.discordapp.com/emojis/${customMatch[2]}.${animated ? 'gif' : 'png'}`;
    } else if (emojiInput.startsWith('http')) {
        emojiUrl = emojiInput;
    }

    if (!emojiUrl) {
        const c = ComponentsV2.errorContainer('Invalid Emoji', 'Provide a custom emoji or a direct image URL.');
        await interaction.editReply({ components: [c], flags: V2 });
        return;
    }

    const emoji = await interaction.guild.emojis.create({ attachment: emojiUrl, name: emojiName });
    const c = ComponentsV2.successContainer('Emoji Stolen', `Emoji added: <:${emoji.name}:${emoji.id}>`);
    await interaction.editReply({ components: [c], flags: V2 });
}

async function handleStealSticker(interaction: any) {
    const stickerId = interaction.options.getString('sticker_id', true);
    const name = interaction.options.getString('name') || 'stolen_sticker';

    try {
        const sticker = await interaction.client.fetchSticker(stickerId);
        const url = sticker.url;
        await interaction.guild.stickers.create({ file: url, name, description: sticker.description || 'Stolen sticker', tags: sticker.tags || 'stolen' });
        const c = ComponentsV2.successContainer('Sticker Stolen', `Sticker "${sticker.name}" has been added to the server as "${name}".`);
        await interaction.editReply({ components: [c], flags: V2 });
    } catch {
        const c = ComponentsV2.errorContainer('Error', 'Invalid sticker ID or unable to fetch.');
        await interaction.editReply({ components: [c], flags: V2 });
    }
}

async function handleClear(interaction: any) {
    const amount = interaction.options.getInteger('amount', true);
    const user = interaction.options.getUser('user');

    let messages;
    if (user) {
        messages = await interaction.channel.messages.fetch({ limit: 100 });
        const filtered = messages.filter((m: any) => m.author.id === user.id).first(amount);
        if (filtered.length === 0) {
            const c = ComponentsV2.warningContainer('No Messages', `No messages from ${user.tag} found.`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }
        await interaction.channel.bulkDelete(filtered, true);
        const c = ComponentsV2.successContainer('Messages Cleared', `Cleared **${filtered.length}** messages from ${user.tag}.`);
        await interaction.editReply({ components: [c], flags: V2 });
    } else {
        await interaction.channel.bulkDelete(amount, true);
        const c = ComponentsV2.successContainer('Messages Cleared', `Cleared **${amount}** messages.`);
        await interaction.editReply({ components: [c], flags: V2 });
    }
}