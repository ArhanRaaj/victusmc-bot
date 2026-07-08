import { PermissionFlagsBits, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { logger } from '../utils/logger.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

interface PendingEmoji {
    name: string;
    userId: string;
    guildId: string;
    channelId: string;
}

export const pendingUploads = new Map<string, PendingEmoji>();

export const emojiCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('emoji')
        .setDescription('Manage custom server emojis')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
        .addSubcommand(sub =>
            sub.setName('add').setDescription('Add a custom emoji to the server')
                .addStringOption(o => o.setName('name').setDescription('Emoji name (underscores allowed)').setRequired(true).setMaxLength(32))
        )
        .addSubcommand(sub =>
            sub.setName('list').setDescription('List all custom emojis in the server')
        )
        .addSubcommand(sub =>
            sub.setName('delete').setDescription('Delete a custom emoji')
                .addStringOption(o => o.setName('emoji').setDescription('Emoji name or the emoji itself').setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('rename').setDescription('Rename a custom emoji')
                .addStringOption(o => o.setName('emoji').setDescription('Emoji name or the emoji itself').setRequired(true))
                .addStringOption(o => o.setName('name').setDescription('New emoji name').setRequired(true).setMaxLength(32))
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand(true);

        if (sub === 'add') {
            const name = interaction.options.getString('name', true).toLowerCase().replace(/[^a-z0-9_]/g, '_');
            if (!name || name.length < 2) {
                const c = ComponentsV2.errorContainer('❌ Invalid Name', 'Emoji name must be at least 2 characters (a-z, 0-9, underscore).');
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }

            const c = ComponentsV2.infoContainer('📁 Add Emoji',
                `**Name:** \`:${name}:\`\n\nHow would you like to provide the image?`);
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`emoji:upload:${name}`)
                    .setLabel('Upload Image')
                    .setEmoji('📁')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`emoji:url:${name}`)
                    .setLabel('Image URL')
                    .setEmoji('🔗')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`emoji:reply:${name}`)
                    .setLabel('From Reply')
                    .setEmoji('↩️')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('emoji:cancel')
                    .setLabel('Cancel')
                    .setEmoji('❌')
                    .setStyle(ButtonStyle.Danger)
            );

            await interaction.reply({ components: [c, row], flags: V2 });
            return;
        }

        if (sub === 'list') {
            const guild = interaction.guild!;
            const emojis = guild.emojis.cache;

            if (emojis.size === 0) {
                const c = ComponentsV2.infoContainer('📋 Emoji List', 'No custom emojis in this server.');
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }

            const animated = emojis.filter(e => e.animated);
            const static_ = emojis.filter(e => !e.animated);

            let text = `# 📋 Custom Emojis (${emojis.size} total)\n\n`;
            if (static_.size > 0) {
                text += `### Static (${static_.size})\n`;
                text += static_.map(e => `${e} \`:${e.name}:\``).join(' ') + '\n\n';
            }
            if (animated.size > 0) {
                text += `### Animated (${animated.size})\n`;
                text += animated.map(e => `${e} \`:${e.name}:\``).join(' ') + '\n';
            }

            const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
            c.addTextDisplayComponents(ComponentsV2.text(text));
            await interaction.reply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'delete') {
            const guild = interaction.guild!;
            const input = interaction.options.getString('emoji', true);
            const emoji = resolveEmoji(guild, input);

            if (!emoji) {
                const c = ComponentsV2.errorContainer('❌ Emoji Not Found',
                    `No emoji found matching "${input}". Use \`/emoji list\` to see available emojis.`);
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }

            await interaction.deferReply({ flags: V2 });

            try {
                await emoji.delete();
                const c = ComponentsV2.successContainer('✅ Emoji Deleted',
                    `Deleted **\`:${emoji.name}:\`** from the server.`);
                await interaction.editReply({ components: [c], flags: V2 });
            } catch (err: any) {
                logger.error('Failed to delete emoji:', err);
                const c = ComponentsV2.errorContainer('❌ Failed to Delete', err.message || 'Unknown error.');
                await interaction.editReply({ components: [c], flags: V2 });
            }
            return;
        }

        if (sub === 'rename') {
            const guild = interaction.guild!;
            const input = interaction.options.getString('emoji', true);
            const newName = interaction.options.getString('name', true).toLowerCase().replace(/[^a-z0-9_]/g, '_');
            const emoji = resolveEmoji(guild, input);

            if (!emoji) {
                const c = ComponentsV2.errorContainer('❌ Emoji Not Found',
                    `No emoji found matching "${input}". Use \`/emoji list\` to see available emojis.`);
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }

            if (!newName || newName.length < 2) {
                const c = ComponentsV2.errorContainer('❌ Invalid Name', 'Name must be at least 2 characters (a-z, 0-9, underscore).');
                await interaction.reply({ components: [c], flags: V2 });
                return;
            }

            await interaction.deferReply({ flags: V2 });

            try {
                await emoji.edit({ name: newName });
                const c = ComponentsV2.successContainer('✅ Emoji Renamed',
                    `Renamed **\`:${emoji.name}:\`** → **\`:${newName}:\`**`);
                await interaction.editReply({ components: [c], flags: V2 });
            } catch (err: any) {
                logger.error('Failed to rename emoji:', err);
                const c = ComponentsV2.errorContainer('❌ Failed to Rename', err.message || 'Unknown error.');
                await interaction.editReply({ components: [c], flags: V2 });
            }
            return;
        }
    },

    async handleButton(interaction) {
        if (!interaction.customId.startsWith('emoji:')) return;
        const parts = interaction.customId.split(':');
        const action = parts[1];

        if (action === 'cancel') {
            const c = ComponentsV2.infoContainer('❌ Cancelled', 'Emoji creation cancelled.');
            await interaction.update({ components: [c] });
            return;
        }

        if (action === 'upload') {
            const name = parts.slice(2).join(':');
            pendingUploads.set(interaction.user.id, {
                name,
                userId: interaction.user.id,
                guildId: interaction.guildId!,
                channelId: interaction.channelId,
            });

            const c = ComponentsV2.infoContainer('📁 Upload Image',
                `**Name:** \`:${name}:\`\n\nSend an image in this channel to create the emoji.\n\nThe bot will wait **60 seconds** for your image.`);
            await interaction.update({ components: [c] });

            setTimeout(() => {
                pendingUploads.delete(interaction.user.id);
            }, 60000);
            return;
        }

        if (action === 'url') {
            const name = parts.slice(2).join(':');
            const modal = new ModalBuilder()
                .setCustomId(`emoji_modal:url:${name}`)
                .setTitle('Enter Image URL');
            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId('url')
                        .setLabel('Image URL (PNG, JPG, GIF, WebP)')
                        .setPlaceholder('https://example.com/image.png')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                )
            );
            await interaction.showModal(modal);
            return;
        }

        if (action === 'reply') {
            const name = parts.slice(2).join(':');
            const channel = interaction.channel;
            if (!channel) {
                await interaction.update({ components: [ComponentsV2.errorContainer('❌ No Channel', 'Could not find this channel.')] });
                return;
            }

            const messages = await channel.messages.fetch({ limit: 20 });
            const userMsg = messages.find(m => m.author.id === interaction.user.id && m.reference?.messageId);
            if (!userMsg || !userMsg.reference?.messageId) {
                const c = ComponentsV2.errorContainer('❌ No Reply Found', 'Reply to a message containing an image, then click this button.\n\n**How to use:**\n1. Reply to a message that has an image\n2. Click "From Reply"');
                await interaction.update({ components: [c] });
                return;
            }

            const refMsg = await channel.messages.fetch(userMsg.reference.messageId).catch(() => null);
            const imageUrl = refMsg?.attachments.first()?.url || refMsg?.embeds.find(e => e.image)?.image?.url || refMsg?.embeds.find(e => e.thumbnail)?.thumbnail?.url;
            if (!imageUrl) {
                const c = ComponentsV2.errorContainer('❌ No Image Found', 'The message you replied to does not contain an image.');
                await interaction.update({ components: [c] });
                return;
            }

            await interaction.deferUpdate();
            await createEmoji(interaction, name, imageUrl);
        }
    },

    async handleModal(interaction) {
        if (!interaction.customId.startsWith('emoji_modal:url:')) return;
        const name = interaction.customId.split(':')[2];
        const url = interaction.fields.getTextInputValue('url').trim();

        if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
            const c = ComponentsV2.errorContainer('❌ Invalid URL', 'Please provide a valid image URL starting with http:// or https://');
            await interaction.reply({ components: [c] });
            return;
        }

        await interaction.deferReply();
        await createEmoji(interaction, name, url);
    },
};

async function createEmoji(interaction: any, name: string, imageUrl: string) {
    const guild = interaction.guild!;
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
            const c = ComponentsV2.errorContainer('❌ Fetch Failed', `Could not fetch the image (HTTP ${response.status}). Make sure the URL is accessible.`);
            const method = interaction.editReply ?? interaction.update;
            await method({ components: [c] });
            return;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        const emoji = await guild.emojis.create({ attachment: buffer, name });

        const c = ComponentsV2.successContainer('✅ Emoji Added',
            `Successfully added **${emoji}** \`:${emoji.name}:\``);
        const method = interaction.editReply ?? interaction.update;
        await method({ components: [c] });
    } catch (err: any) {
        logger.error('Failed to create emoji:', err);
        const reason = err.message?.includes('rate') ? 'Rate limited. Try again in a moment.'
            : err.message?.includes('image') ? 'The image format is invalid or too large (max 256KB for static, 50KB for animated).'
            : err.message || 'Unknown error.';
        const c = ComponentsV2.errorContainer('❌ Failed to Add Emoji', reason);
        const method = interaction.editReply ?? interaction.update;
        await method({ components: [c] });
    }
}

function resolveEmoji(guild: any, input: string) {
    const emojis = guild.emojis.cache;

    if (input.startsWith('<') && input.endsWith('>')) {
        const id = input.replace(/<a?:.+?:(\d+)>/g, '$1').trim();
        return emojis.get(id) || null;
    }

    if (/^\d{17,20}$/.test(input)) {
        return emojis.get(input) || null;
    }

    const name = input.replace(/:/g, '').toLowerCase();
    return emojis.find((e: any) => e.name?.toLowerCase() === name) || null;
}
