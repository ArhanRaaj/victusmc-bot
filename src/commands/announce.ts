import {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ContainerBuilder,
    ChannelType,
    TextChannel,
} from 'discord.js';
import type { Command } from '../types/index.js';
import { supabase } from '../services/supabase.js';
import { config } from '../config.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { requireAdmin } from '../middleware/requireLinked.js';
import { logger } from '../utils/logger.js';

const DM_RATE_LIMIT = {
    messagesPerMinute: 30,
    delayBetweenMs: 2000,
    maxRetries: 3,
    backoffMultiplier: 2,
    abortThreshold: 0.1,
    cooldownMinutes: 5,
};

type JobStatus = 'running' | 'paused' | 'completed' | 'aborted';
interface SendJob {
    status: JobStatus;
    sent: number;
    failed: number;
    total: number;
    abortController?: AbortController;
}
const activeSends = new Map<string, SendJob>();

const CUSTOM_IDS = {
    CREATE_MODAL: 'announce_create_modal',
    CHANNEL_SELECT: 'announce_channel_select',
    PREVIEW: 'announce_preview',
    CONFIRM_SEND: 'announce_confirm_send',
    CANCEL: 'announce_cancel',
    PING_TOGGLE: 'announce_ping_toggle',
    ABORT: 'announce_abort',
    BACK_TO_PREVIEW: 'announce_back_to_preview',
    EDIT_TITLE: 'announce_edit_title',
    EDIT_DESCRIPTION: 'announce_edit_description',
    EDIT_THUMBNAIL: 'announce_edit_thumbnail',
    EDIT_IMAGE: 'announce_edit_image',
    EDIT_FOOTER: 'announce_edit_footer',
} as const;

interface PendingAnnouncement {
    title: string;
    description: string;
    type: 'info' | 'warning' | 'success' | 'error';
    channelId: string;
    thumbnailUrl: string;
    imageUrl: string;
    footerText: string;
    pingEveryone: boolean;
    dmCategory?: 'maintenance' | 'billing' | 'security' | 'promotions';
}

const pendingAnnouncements = new Map<string, PendingAnnouncement>();

export const announceCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Send announcements (Admin only)')
        .addSubcommand(sub =>
            sub
                .setName('create')
                .setDescription('Create a new announcement')
        )
        .addSubcommand(sub =>
            sub
                .setName('history')
                .setDescription('View recent announcements')
        )
        .addSubcommand(sub =>
            sub
                .setName('abort')
                .setDescription('Abort an in-progress announcement')
                .addStringOption(opt =>
                    opt
                        .setName('id')
                        .setDescription('Announcement ID to abort')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('channels')
                .setDescription('Manage announcement channels')
                .addChannelOption(opt =>
                    opt
                        .setName('channel')
                        .setDescription('Channel to add/remove')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt
                        .setName('action')
                        .setDescription('Add or remove the channel')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Add', value: 'add' },
                            { name: 'Remove', value: 'remove' }
                        )
                )
        ),

    adminOnly: true,
    cooldown: 10,

    async execute(interaction) {
        const isAdmin = await requireAdmin(interaction);
        if (!isAdmin) return;

        const subcommand = interaction.options.getSubcommand();

        try {
            switch (subcommand) {
                case 'create':
                    await handleCreate(interaction);
                    break;
                case 'history':
                    await handleHistory(interaction);
                    break;
                case 'abort':
                    await handleAbort(interaction);
                    break;
                case 'channels':
                    await handleChannels(interaction);
                    break;
            }
        } catch (error) {
            logger.error('Announce command error:', error);
            const container = ComponentsV2.errorContainer(
                'Error',
                'Failed to process announcement command.'
            );
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    components: [container],
                    flags: ComponentsV2.IS_COMPONENTS_V2,
                });
            } else {
                await interaction.reply({
                    components: [container],
                    flags: ComponentsV2.IS_COMPONENTS_V2,
                });
            }
        }
    },

    async handleButton(interaction) {
        const customId = interaction.customId;

        try {
            if (customId === CUSTOM_IDS.CONFIRM_SEND) {
                await handleConfirmSend(interaction);
                return;
            }

            if (customId === CUSTOM_IDS.CANCEL) {
                pendingAnnouncements.delete(interaction.user.id);
                const container = ComponentsV2.infoContainer(
                    'Cancelled',
                    'Announcement has been cancelled.'
                );
                await interaction.update({
                    components: [container],
                });
                return;
            }

            if (customId === CUSTOM_IDS.PING_TOGGLE) {
                const pending = pendingAnnouncements.get(interaction.user.id);
                if (pending) {
                    pending.pingEveryone = !pending.pingEveryone;
                    await showPreview(interaction);
                }
                return;
            }

            if (customId === CUSTOM_IDS.EDIT_TITLE || customId === CUSTOM_IDS.EDIT_DESCRIPTION ||
                customId === CUSTOM_IDS.EDIT_THUMBNAIL || customId === CUSTOM_IDS.EDIT_IMAGE ||
                customId === CUSTOM_IDS.EDIT_FOOTER) {
                await showEditModal(interaction, customId);
                return;
            }

            if (customId.startsWith('announce_abort_')) {
                const announcementId = customId.split('_')[2];
                const job = activeSends.get(announcementId);
                if (job) {
                    job.status = 'aborted';
                    job.abortController?.abort();
                }
                const container = ComponentsV2.warningContainer(
                    'Aborted',
                    'Announcement sending has been aborted.'
                );
                await interaction.update({
                    components: [container],
                });
                return;
            }
        } catch (error) {
            logger.error('Button handler error:', error);
        }
    },

    async handleSelectMenu(interaction) {
        const customId = interaction.customId;

        try {
            if (customId === CUSTOM_IDS.CHANNEL_SELECT) {
                const pending = pendingAnnouncements.get(interaction.user.id);
                if (pending) {
                    pending.channelId = interaction.values[0];
                    await showPreview(interaction);
                }
                return;
            }
        } catch (error) {
            logger.error('Select menu handler error:', error);
        }
    },

    async handleModal(interaction) {
        const customId = interaction.customId;

        try {
            if (customId.startsWith('announce_edit_')) {
                await handleEditModalSubmit(interaction);
                return;
            }
            if (customId === CUSTOM_IDS.CREATE_MODAL) {
                await handleModalSubmit(interaction);
                return;
            }
        } catch (error) {
            logger.error('Modal handler error:', error);
        }
    },
};

async function handleCreate(interaction: any) {
    const guildId = interaction.guildId!;
    const settings = await supabase.getBotSettings(guildId);
    const channels = settings?.announcement_channels || [];

    if (channels.length === 0) {
        const container = ComponentsV2.errorContainer(
            'No Announcement Channels',
            'No announcement channels have been configured. Use `/announce channels` to add one first.'
        );
        await interaction.reply({
            components: [container],
            flags: ComponentsV2.IS_COMPONENTS_V2,
            ephemeral: true,
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(CUSTOM_IDS.CREATE_MODAL)
        .setTitle('Create Announcement');

    const titleInput = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Title')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., Server Maintenance')
        .setRequired(true)
        .setMaxLength(256);

    const descriptionInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('The main announcement content...')
        .setRequired(true)
        .setMaxLength(4000);

    const thumbnailInput = new TextInputBuilder()
        .setCustomId('thumbnail')
        .setLabel('Thumbnail URL (optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://example.com/thumbnail.png')
        .setRequired(false)
        .setMaxLength(512);

    const imageInput = new TextInputBuilder()
        .setCustomId('image')
        .setLabel('Image URL (optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://example.com/banner.png')
        .setRequired(false)
        .setMaxLength(512);

    const footerInput = new TextInputBuilder()
        .setCustomId('footer')
        .setLabel('Footer Text (optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., VictusMC Team')
        .setRequired(false)
        .setMaxLength(256);

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(thumbnailInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(footerInput)
    );

    await interaction.showModal(modal);
}

async function handleModalSubmit(interaction: any) {
    const title = interaction.fields.getTextInputValue('title');
    const description = interaction.fields.getTextInputValue('description');
    const thumbnailUrl = interaction.fields.getTextInputValue('thumbnail') || '';
    const imageUrl = interaction.fields.getTextInputValue('image') || '';
    const footerText = interaction.fields.getTextInputValue('footer') || '';

    const settings = await supabase.getBotSettings(interaction.guildId!);
    const channels = settings?.announcement_channels || [];

    if (channels.length === 0) {
        const container = ComponentsV2.errorContainer(
            'No Channels',
            'No announcement channels configured.'
        );
        await interaction.reply({
            components: [container],
            flags: ComponentsV2.IS_COMPONENTS_V2,
            ephemeral: true,
        });
        return;
    }

    pendingAnnouncements.set(interaction.user.id, {
        title,
        description,
        type: 'info',
        channelId: '',
        thumbnailUrl,
        imageUrl,
        footerText,
        pingEveryone: false,
    });

    await showChannelSelect(interaction);
}

async function showChannelSelect(interaction: any) {
    const settings = await supabase.getBotSettings(interaction.guildId!);
    const channels = settings?.announcement_channels || [];

    const channelOptions = channels.map((id: string) => {
        const ch = interaction.client.channels.cache.get(id) as TextChannel | undefined;
        return new StringSelectMenuOptionBuilder()
            .setLabel(ch?.name || `#${id.slice(0, 5)}`)
            .setValue(id)
            .setDescription(ch ? `#${ch.name}` : 'Unknown channel');
    });

    const container = new ContainerBuilder()
        .setAccentColor(ComponentsV2.Accents.info)
        .addTextDisplayComponents(
            ComponentsV2.text(
                `# <:Annc:1524363017813360710> Select Channel\n\n` +
                `Choose which channel to send the announcement to:\n` +
                `━━━━━━━━━━━━━━━━━━`
            )
        );

    const channelSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(CUSTOM_IDS.CHANNEL_SELECT)
            .setPlaceholder('Select a channel...')
            .addOptions(channelOptions)
    );

    container.addActionRowComponents(channelSelect);

    if (interaction.replied || interaction.deferred) {
        await interaction.editReply({
            components: [container],
            flags: ComponentsV2.IS_COMPONENTS_V2,
        });
    } else {
        await interaction.reply({
            components: [container],
            flags: ComponentsV2.IS_COMPONENTS_V2,
        });
    }
}

async function showEditModal(interaction: any, customId: string) {
    const pending = pendingAnnouncements.get(interaction.user.id);
    if (!pending) return;

    const fieldMap: Record<string, { id: string; label: string; style: any; value: string; placeholder: string; maxLength: number }> = {
        [CUSTOM_IDS.EDIT_TITLE]: {
            id: 'title', label: 'Title', style: TextInputStyle.Short,
            value: pending.title, placeholder: 'e.g., Server Maintenance', maxLength: 256,
        },
        [CUSTOM_IDS.EDIT_DESCRIPTION]: {
            id: 'description', label: 'Description', style: TextInputStyle.Paragraph,
            value: pending.description, placeholder: 'The announcement content...', maxLength: 4000,
        },
        [CUSTOM_IDS.EDIT_THUMBNAIL]: {
            id: 'thumbnail', label: 'Thumbnail URL', style: TextInputStyle.Short,
            value: pending.thumbnailUrl, placeholder: 'https://example.com/thumb.png', maxLength: 512,
        },
        [CUSTOM_IDS.EDIT_IMAGE]: {
            id: 'image', label: 'Image URL', style: TextInputStyle.Short,
            value: pending.imageUrl, placeholder: 'https://example.com/banner.png', maxLength: 512,
        },
        [CUSTOM_IDS.EDIT_FOOTER]: {
            id: 'footer', label: 'Footer Text', style: TextInputStyle.Short,
            value: pending.footerText, placeholder: 'e.g., VictusMC Team', maxLength: 256,
        },
    };

    const fieldDef = fieldMap[customId];
    if (!fieldDef) return;

    const modal = new ModalBuilder()
        .setCustomId(`announce_edit_${fieldDef.id}`)
        .setTitle(`Edit ${fieldDef.label}`);

    const input = new TextInputBuilder()
        .setCustomId(fieldDef.id)
        .setLabel(fieldDef.label)
        .setStyle(fieldDef.style)
        .setValue(fieldDef.value)
        .setPlaceholder(fieldDef.placeholder)
        .setMaxLength(fieldDef.maxLength)
        .setRequired(fieldDef.id === 'title' || fieldDef.id === 'description');

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(input)
    );

    await interaction.showModal(modal);
}

async function handleEditModalSubmit(interaction: any) {
    const pending = pendingAnnouncements.get(interaction.user.id);
    if (!pending) return;

    const fieldId = interaction.customId.replace('announce_edit_', '');

    const value = interaction.fields.getTextInputValue(fieldId) || '';

    switch (fieldId) {
        case 'title':
            pending.title = value;
            break;
        case 'description':
            pending.description = value;
            break;
        case 'thumbnail':
            pending.thumbnailUrl = value;
            break;
        case 'image':
            pending.imageUrl = value;
            break;
        case 'footer':
            pending.footerText = value;
            break;
    }

    await showPreview(interaction);
}

async function showPreview(interaction: any) {
    const pending = pendingAnnouncements.get(interaction.user.id);
    if (!pending) return;

    const guild = interaction.guild;
    const channelName = guild?.channels.cache.get(pending.channelId)?.name || 'Unknown';

    let body = `# <:Annc:1524363017813360710> Announcement Preview\n\n` +
        `Review your announcement before sending.\n\n` +
        `━━━━━━━━━━━━━━━━━━\n`;

    if (pending.type === 'info') body += `### <:Info:1524363004823470120> ${pending.title}\n\n`;
    else if (pending.type === 'warning') body += `### <:Exclamation:1524363098809569350> ${pending.title}\n\n`;
    else if (pending.type === 'success') body += `### <:Tick:1524363090626482326> ${pending.title}\n\n`;
    else if (pending.type === 'error') body += `### <:Cross:1524363088621469737> ${pending.title}\n\n`;

    body += `${pending.description.substring(0, 500)}${pending.description.length > 500 ? '...' : ''}\n`;
    body += `━━━━━━━━━━━━━━━━━━\n\n`;

    if (pending.thumbnailUrl) body += `**Thumbnail:** [Link](${pending.thumbnailUrl})\n`;
    if (pending.imageUrl) body += `**Image:** [Link](${pending.imageUrl})\n`;
    if (pending.footerText) body += `**Footer:** ${pending.footerText}\n`;
    body += `**Channel:** #${channelName}\n`;
    body += `**Type:** ${pending.type}\n`;
    body += `**Ping:** ${pending.pingEveryone ? '@everyone' : 'None'}`;

    const container = new ContainerBuilder()
        .setAccentColor(getTypeAccent(pending.type))
        .addTextDisplayComponents(ComponentsV2.text(body));

    const editTitleBtn = new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.EDIT_TITLE)
        .setLabel('Edit Title')
        .setStyle(ButtonStyle.Secondary);
    const editDescBtn = new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.EDIT_DESCRIPTION)
        .setLabel('Edit Description')
        .setStyle(ButtonStyle.Secondary);
    const editThumbBtn = new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.EDIT_THUMBNAIL)
        .setLabel('Edit Thumbnail')
        .setStyle(ButtonStyle.Secondary);
    const editImageBtn = new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.EDIT_IMAGE)
        .setLabel('Edit Image')
        .setStyle(ButtonStyle.Secondary);
    const editFooterBtn = new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.EDIT_FOOTER)
        .setLabel('Edit Footer')
        .setStyle(ButtonStyle.Secondary);

    container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(editTitleBtn, editDescBtn)
    );
    container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(editThumbBtn, editImageBtn, editFooterBtn)
    );

    const pingToggleBtn = new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.PING_TOGGLE)
        .setLabel(pending.pingEveryone ? 'Ping @everyone: ON' : 'Ping @everyone: OFF')
        .setStyle(pending.pingEveryone ? ButtonStyle.Success : ButtonStyle.Secondary);

    const sendBtn = new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.CONFIRM_SEND)
        .setLabel('Send Announcement')
        .setStyle(ButtonStyle.Success)
        .setEmoji('<:Message:1524363100734623836>');

    const cancelBtn = new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.CANCEL)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('<:Cross:1524363088621469737>');

    container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(pingToggleBtn)
    );
    container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(sendBtn, cancelBtn)
    );

    const replyMethod = interaction.replied || interaction.deferred ? 'editReply' : 'update';
    await interaction[replyMethod]({
        components: [container],
        flags: ComponentsV2.IS_COMPONENTS_V2,
    });
}

async function handleConfirmSend(interaction: any) {
    const pending = pendingAnnouncements.get(interaction.user.id);
    if (!pending) {
        const container = ComponentsV2.errorContainer(
            'Session Expired',
            'Please start the announcement creation again.'
        );
        await interaction.update({ components: [container] });
        return;
    }

    await interaction.deferUpdate();

    const announcement = await supabase.createDiscordAnnouncement({
        guild_id: interaction.guildId!,
        title: pending.title,
        description: pending.description,
        type: pending.type,
        target: 'channel',
        channel_id: pending.channelId,
        thumbnail_url: pending.thumbnailUrl || undefined,
        image_url: pending.imageUrl || undefined,
        footer_text: pending.footerText || undefined,
        ping_everyone: pending.pingEveryone,
        created_by: interaction.user.id,
        created_by_name: interaction.user.tag,
    });

    if (!announcement) {
        const container = ComponentsV2.errorContainer(
            'Error',
            'Failed to save announcement. Please try again.'
        );
        await interaction.editReply({
            components: [container],
            flags: ComponentsV2.IS_COMPONENTS_V2,
        });
        return;
    }

    await supabase.updateDiscordAnnouncement(announcement.id, { status: 'sending' });

    const channel = interaction.client.channels.cache.get(pending.channelId) as TextChannel | undefined;
    if (!channel) {
        const container = ComponentsV2.errorContainer(
            'Error',
            'Selected channel not found.'
        );
        await interaction.editReply({
            components: [container],
            flags: ComponentsV2.IS_COMPONENTS_V2,
        });
        return;
    }

    const announceContainer = createAnnouncementContainer(pending);
    const content = pending.pingEveryone ? '@everyone' : undefined;

    await channel.send({
        content,
        components: [announceContainer],
        flags: ComponentsV2.IS_COMPONENTS_V2,
        allowedMentions: pending.pingEveryone ? { parse: ['everyone'] } : undefined,
    });

    pendingAnnouncements.delete(interaction.user.id);

    const container = ComponentsV2.successContainer(
        'Announcement Sent!',
        `Your announcement has been sent to <#${pending.channelId}>.\n\n` +
        `**ID:** \`${announcement.id.slice(0, 8)}\``
    );

    await interaction.editReply({
        components: [container],
        flags: ComponentsV2.IS_COMPONENTS_V2,
    });

    logger.info(`Announcement created by ${interaction.user.tag}: ${pending.title}`);
}

async function handleHistory(interaction: any) {
    await interaction.deferReply({ flags: ComponentsV2.IS_COMPONENTS_V2 });

    const announcements = await supabase.getGuildAnnouncements(interaction.guildId!, 10);

    if (announcements.length === 0) {
        const container = ComponentsV2.infoContainer(
            'No Announcements',
            'No announcements have been sent yet.'
        );
        await interaction.editReply({
            components: [container],
            flags: ComponentsV2.IS_COMPONENTS_V2,
        });
        return;
    }

    const list = announcements.map((a: any, i: number) => {
        const statusMap: Record<string, string> = {
            draft: '<:Edit:1524363079675154433>',
            scheduled: '<:Time:1524363075271000146>',
            sending: '<:Message:1524363100734623836>',
            completed: '<:Tick:1524363090626482326>',
            cancelled: '<:Cross:1524363088621469737>',
        };
        const statusEmoji = statusMap[a.status as string] || '<:Exclamation:1524363098809569350>';

        return `**${i + 1}.** ${statusEmoji} ${a.title}\n` +
            `-# ${a.status} | Ping: ${a.ping_everyone ? '@everyone' : 'No'} | Sent: ${a.sent_count} | Failed: ${a.failed_count} | ${new Date(a.created_at).toLocaleDateString()}`;
    }).join('\n\n');

    const container = new ContainerBuilder()
        .setAccentColor(ComponentsV2.Accents.info)
        .addTextDisplayComponents(
            ComponentsV2.text(
                `# <:Message:1524363100734623836> Announcement History\n\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `${list}\n` +
                `━━━━━━━━━━━━━━━━━━`
            )
        );

    await interaction.editReply({
        components: [container],
        flags: ComponentsV2.IS_COMPONENTS_V2,
    });
}

async function handleAbort(interaction: any) {
    await interaction.deferReply({ flags: ComponentsV2.IS_COMPONENTS_V2 });

    const announcementId = interaction.options.getString('id', true);
    const job = activeSends.get(announcementId);

    if (!job) {
        const container = ComponentsV2.errorContainer(
            'Not Found',
            'No active sending job found for that announcement ID.'
        );
        await interaction.editReply({
            components: [container],
            flags: ComponentsV2.IS_COMPONENTS_V2,
        });
        return;
    }

    job.status = 'aborted';
    job.abortController?.abort();

    await supabase.updateDiscordAnnouncement(announcementId, { status: 'cancelled' });

    const container = ComponentsV2.successContainer(
        'Aborted',
        `Announcement sending has been aborted.\n\n` +
        `**Sent:** ${job.sent}\n` +
        `**Failed:** ${job.failed}\n` +
        `**Remaining:** ${job.total - job.sent - job.failed}`
    );

    await interaction.editReply({
        components: [container],
        flags: ComponentsV2.IS_COMPONENTS_V2,
    });

    logger.info(`Announcement ${announcementId} aborted by ${interaction.user.tag}`);
}

async function handleChannels(interaction: any) {
    await interaction.deferReply({ flags: ComponentsV2.IS_COMPONENTS_V2 });

    const channel = interaction.options.getChannel('channel', true);
    const action = interaction.options.getString('action', true);

    const settings = await supabase.getBotSettings(interaction.guildId!);
    const current = settings?.announcement_channels || [];

    let updated: string[];
    if (action === 'add') {
        if (current.includes(channel.id)) {
            const container = ComponentsV2.warningContainer(
                'Already Added',
                `<#${channel.id}> is already an announcement channel.`
            );
            await interaction.editReply({
                components: [container],
                flags: ComponentsV2.IS_COMPONENTS_V2,
            });
            return;
        }
        updated = [...current, channel.id];
    } else {
        if (!current.includes(channel.id)) {
            const container = ComponentsV2.warningContainer(
                'Not Found',
                `<#${channel.id}> is not in the announcement channels list.`
            );
            await interaction.editReply({
                components: [container],
                flags: ComponentsV2.IS_COMPONENTS_V2,
            });
            return;
        }
        updated = current.filter((id: string) => id !== channel.id);
    }

    const success = await supabase.updateBotSettings(interaction.guildId!, {
        announcement_channels: updated,
    });

    if (!success) throw new Error('Failed to update channels');

    const container = ComponentsV2.successContainer(
        'Announcement Channels Updated',
        `<#${channel.id}> has been **${action === 'add' ? 'added to' : 'removed from'}** the announcement channels.\n\n` +
        `**Current channels:** ${updated.length > 0 ? updated.map((id: string) => `<#${id}>`).join(', ') : 'None'}`
    );

    await interaction.editReply({
        components: [container],
        flags: ComponentsV2.IS_COMPONENTS_V2,
    });
}

function createAnnouncementContainer(pending: PendingAnnouncement): ContainerBuilder {
    let body = '';
    if (pending.type === 'info') body += `# <:Info:1524363004823470120> ${pending.title}\n\n`;
    else if (pending.type === 'warning') body += `# <:Exclamation:1524363098809569350> ${pending.title}\n\n`;
    else if (pending.type === 'success') body += `# <:Tick:1524363090626482326> ${pending.title}\n\n`;
    else if (pending.type === 'error') body += `# <:Cross:1524363088621469737> ${pending.title}\n\n`;

    body += `${pending.description}\n\n`;

    if (pending.footerText) {
        body += `━━━━━━━━━━━━━━━━━━\n`;
        body += `-# ${pending.footerText} • ${new Date().toLocaleDateString()}`;
    } else {
        body += `━━━━━━━━━━━━━━━━━━\n`;
        body += `-# VictusMC • ${new Date().toLocaleDateString()}`;
    }

    const container = new ContainerBuilder()
        .setAccentColor(getTypeAccent(pending.type))
        .addTextDisplayComponents(ComponentsV2.text(body));

    return container;
}

function getTypeEmoji(type: string): string {
    return {
        info: '<:Info:1524363004823470120>',
        warning: '<:Exclamation:1524363098809569350>',
        success: '<:Tick:1524363090626482326>',
        error: '<:Cross:1524363088621469737>',
    }[type] || '<:Info:1234363004823470120>';
}

function getTypeAccent(type: string): number {
    return {
        info: ComponentsV2.Accents.info,
        warning: ComponentsV2.Accents.warning,
        success: ComponentsV2.Accents.success,
        error: ComponentsV2.Accents.danger,
    }[type] || ComponentsV2.Accents.info;
}

async function sendDMsAsync(client: any, announcementId: string, pending: PendingAnnouncement, interaction: any) {
    const optedIn = await supabase.getUsersOptedInForDM(pending.dmCategory || 'maintenance');
    if (optedIn.length === 0) {
        await supabase.updateDiscordAnnouncement(announcementId, {
            status: 'completed',
            completed_at: new Date().toISOString(),
        });
        return;
    }

    const abortController = new AbortController();
    const job: SendJob = {
        status: 'running',
        sent: 0,
        failed: 0,
        total: optedIn.length,
        abortController,
    };
    activeSends.set(announcementId, job);

    const dmEmbed = createAnnouncementContainer(pending);

    for (const discordId of optedIn) {
        if (job.status === 'aborted') break;

        try {
            const user = await client.users.fetch(discordId).catch(() => null);
            if (!user) {
                job.failed++;
                continue;
            }
            await user.send({
                components: [dmEmbed],
                flags: ComponentsV2.IS_COMPONENTS_V2,
            });
            job.sent++;
        } catch (error) {
            job.failed++;
        }

        const failureRate = job.failed / (job.sent + job.failed);
        if (failureRate > DM_RATE_LIMIT.abortThreshold && (job.sent + job.failed) > 10) {
            logger.warn(`Abort threshold reached for announcement ${announcementId}`);
            job.status = 'aborted';
            break;
        }

        await sleep(DM_RATE_LIMIT.delayBetweenMs);

        if ((job.sent + job.failed) % 10 === 0) {
            await supabase.updateDiscordAnnouncement(announcementId, {
                sent_count: job.sent,
                failed_count: job.failed,
            });
        }
    }

    const finalStatus = job.status === 'aborted' ? 'cancelled' : 'completed';
    await supabase.updateDiscordAnnouncement(announcementId, {
        status: finalStatus,
        sent_count: job.sent,
        failed_count: job.failed,
        completed_at: new Date().toISOString(),
    });

    activeSends.delete(announcementId);
    logger.info(`Announcement ${announcementId} ${finalStatus}: ${job.sent} sent, ${job.failed} failed}`);
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}