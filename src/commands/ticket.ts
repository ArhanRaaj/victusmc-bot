/**
 * VictusMC — Ticket System Command
 * Full Components V2 implementation with account linking enforcement
 */

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
    PermissionFlagsBits,
    CategoryChannel,
    AttachmentBuilder,
} from 'discord.js';
import type { Command, TicketCategory, Ticket, BotSettings } from '../types/index.js';
import { supabase } from '../services/supabase.js';
import { config } from '../config.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { requireLinkedAccount, getLinkedAccount } from '../middleware/requireLinked.js';
import { requireAdmin } from '../middleware/requireLinked.js';
import { logger } from '../utils/logger.js';
import { ticketPanelSettings } from '../services/ticketPanelSettings.js';
import { groqAi } from '../services/groqAi.js';
import { formatAiMessage } from '../utils/aiMessages.js';

// ============================================
// Custom IDs for components
// ============================================
const CUSTOM_IDS = {
    // Buttons
    CREATE_TICKET: 'ticket_create',
    LINK_ACCOUNT: 'ticket_link_account',
    CANCEL: 'ticket_cancel',
    CONFIRM: 'ticket_confirm',
    EDIT: 'ticket_edit',
    CLOSE: 'ticket_close',
    LOCK: 'ticket_lock',
    UNLOCK: 'ticket_unlock',
    CLAIM: 'ticket_claim',
    LINK_SERVER: 'ticket_link_server',
    LINK_INVOICE: 'ticket_link_invoice',
    AI_HELP: 'ticket_ai_help',
    // Select menus
    CATEGORY_SELECT: 'ticket_category_select',
    SERVER_SELECT: 'ticket_server_select',
    INVOICE_SELECT: 'ticket_invoice_select',
    // Modals
    TICKET_FORM: 'ticket_form',
    CATEGORY_ADD: 'ticket_category_add_modal',
} as const;

// Pending ticket data (in-memory cache for ticket creation flow)
const pendingTickets = new Map<string, {
    categoryId: string;
    categoryName: string;
    categoryEmoji: string;
    priorityDefault: string;
    customQuestions: any[];
}>();

function normalizeIds(value: unknown): string[] {
    if (!value) return [];
    const items = Array.isArray(value) ? value : String(value).split(/[\s,]+/);
    return Array.from(new Set(
        items
            .map((item) => String(item || '').trim())
            .filter(Boolean)
    ));
}

function combinedStaffRoleIds(settings: BotSettings | null, category?: Partial<TicketCategory> | null): string[] {
    return normalizeIds([
        ...normalizeIds(settings?.ticket_staff_role_ids),
        ...normalizeIds(settings?.ticket_admin_role_ids),
        ...normalizeIds(category?.staff_roles),
    ]);
}

function adminRoleIds(settings: BotSettings | null): string[] {
    return normalizeIds(settings?.ticket_admin_role_ids);
}

function memberHasAnyRole(member: any, roleIds: string[]): boolean {
    if (!member || roleIds.length === 0) return false;
    if (member.roles?.cache?.has) return roleIds.some((roleId) => member.roles.cache.has(roleId));
    if (Array.isArray(member.roles)) return roleIds.some((roleId) => member.roles.includes(roleId));
    return false;
}

function memberHasTicketStaffAccess(interaction: any, settings: BotSettings | null, category?: Partial<TicketCategory> | null): boolean {
    const member = interaction.member;
    if (!member) return false;

    if (member.permissions?.has?.(PermissionFlagsBits.Administrator) || member.permissions?.has?.(PermissionFlagsBits.ManageChannels)) {
        return true;
    }

    return memberHasAnyRole(member, combinedStaffRoleIds(settings, category));
}

function canCloseTicket(interaction: any, ticket: Ticket, settings: BotSettings | null): boolean {
    if (ticket.discord_id === interaction.user.id && settings?.ticket_allow_user_close !== false) return true;
    return memberHasTicketStaffAccess(interaction, settings, ticket.category);
}

async function denyTicketAction(interaction: any, message = 'You do not have permission to manage this ticket.') {
    await interaction.reply({ content: message }).catch(() => undefined);
}

export const ticketCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Ticket system management')
        .addSubcommand(sub =>
            sub
                .setName('panel')
                .setDescription('Spawn a ticket creation panel (Admin only)')
        )
        .addSubcommand(sub =>
            sub
                .setName('setup')
                .setDescription('Open the ticket setup dashboard (Admin only)')
        ),

    adminOnly: false,
    cooldown: 5,

    async execute(interaction) {
        logger.info(`<:Thunder:1524362985647247420> [Execute] /ticket command started by ${interaction.user.tag}`);

        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'setup') {
                await handleTicketSetup(interaction);
                return;
            }

            logger.info(`👉 [Execute] Subcommand: ${subcommand}`);

            const isAdmin = await requireAdmin(interaction);
            if (!isAdmin) {
                logger.warn(`<:Ban:1524363011291222086> [Execute] Access denied for ${interaction.user.tag}`);
                return;
            }

            logger.info(`⌛ [Execute] Deferring reply...`);
            await interaction.deferReply({
                flags: (ComponentsV2 as any).IS_COMPONENTS_V2
            });

            if (subcommand === 'panel') {
                await handlePanelSpawn(interaction);
            } else {
                await interaction.editReply({ content: '<:Cross:1524363088621469737> Unknown subcommand' });
            }
            logger.info(`<:Tick:1524363090626482326> [Execute] Command completed successfully`);
        } catch (error: any) {
            logger.error(`<:Cross:1524363088621469737> [Execute] Critical crash:`, error);

            const errorContainer = ComponentsV2.errorContainer(
                'Command Error',
                `An unexpected error occurred: ${error.message || 'Unknown error'}`
            );

            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({
                        components: [errorContainer],
                        flags: (ComponentsV2 as any).IS_COMPONENTS_V2
                    });
                } else {
                    await interaction.reply({
                        components: [errorContainer],
                        flags: (ComponentsV2 as any).IS_COMPONENTS_V2
                    });
                }
            } catch (replyErr) {
                logger.error(`Failed to send error reply:`, replyErr);
            }
        }
    },

    // ============================================
    // Button Handlers
    // ============================================
    async handleButton(interaction) {
        const customId = interaction.customId;

        try {
            // Create Ticket button
            if (customId === CUSTOM_IDS.CREATE_TICKET) {
                await handleCreateTicketButton(interaction);
                return;
            }

            // Link Account button
            if (customId === CUSTOM_IDS.LINK_ACCOUNT) {
                // Redirect to link website
                const container = ComponentsV2.infoContainer(
                    'Link Your Account',
                    'Visit the **VictusMC website** to connect your Discord to VictusMC.\n\n' +
                    'Once linked, you can create support tickets!'
                );
                await interaction.reply({
                    components: [container],
                    flags: ComponentsV2.IS_COMPONENTS_V2,
                });
                return;
            }

            // Cancel button
            if (customId === CUSTOM_IDS.CANCEL) {
                pendingTickets.delete(interaction.user.id);
                const container = ComponentsV2.infoContainer(
                    'Cancelled',
                    'Ticket creation has been cancelled.'
                );
                await interaction.update({
                    components: [container],
                });
                return;
            }

            // Confirm/Submit button
            if (customId === CUSTOM_IDS.CONFIRM) {
                await handleConfirmTicket(interaction);
                return;
            }

            // Ticket control buttons (in ticket channel)
            if (customId.startsWith('ticket_close_')) {
                await handleCloseTicket(interaction);
                return;
            }
            if (customId.startsWith('ticket_lock_')) {
                await handleLockTicket(interaction);
                return;
            }
            if (customId.startsWith('ticket_unlock_')) {
                await handleUnlockTicket(interaction);
                return;
            }
            if (customId.startsWith('ticket_claim_')) {
                await handleClaimTicket(interaction);
                return;
            }
            if (customId.startsWith('ticket_ai_')) {
                await handleAIHelp(interaction);
                return;
            }
            if (customId.startsWith('ticket_addmember_')) {
                await handleAddMemberButton(interaction);
                return;
            }

            // Ticket Setup Dashboard buttons
            if (customId.startsWith('ticket_setup:')) {
                await handleTicketSetupButton(interaction);
                return;
            }

        } catch (error) {
            logger.error('Button handler error:', error);
            const container = ComponentsV2.errorContainer(
                'Error',
                'Failed to process your request.'
            );
            try {
                await interaction.reply({
                    components: [container],
                    flags: ComponentsV2.IS_COMPONENTS_V2,
                });
            } catch {
                // Already replied
            }
        }
    },

    // ============================================
    // Select Menu Handlers
    // ============================================
    async handleSelectMenu(interaction) {
        const customId = interaction.customId;

        try {
            if (customId === CUSTOM_IDS.CATEGORY_SELECT) {
                logger.info(`<:Target:1524363004823470120> [SelectMenu] Category selection detected`);
                await handleCategorySelect(interaction);
                return;
            }

            // Ticket Setup Dashboard select menus
            if (customId.startsWith('ticket_setup:')) {
                await handleTicketSetupSelectMenu(interaction);
                return;
            }

        } catch (error) {
            logger.error('Select menu handler error:', error);
        }
    },

    // ============================================
    // Modal Handlers
    // ============================================
    async handleModal(interaction) {
        const customId = interaction.customId;

        try {
            if (customId.startsWith(CUSTOM_IDS.TICKET_FORM)) {
                await handleTicketFormSubmit(interaction);
                return;
            }
            if (customId.startsWith('ticket_addmember_modal_')) {
                await handleAddMemberModal(interaction);
                return;
            }

            // Ticket Setup Dashboard modals
            if (customId.startsWith('ticket_setup_modal:')) {
                await handleTicketSetupModal(interaction);
                return;
            }

        } catch (error) {
            logger.error('Modal handler error:', error);
            const container = ComponentsV2.errorContainer(
                'Error',
                'Failed to submit your ticket form.'
            );
            await interaction.reply({
                components: [container],
                flags: ComponentsV2.IS_COMPONENTS_V2,
            });
        }
    },
};

// ============================================
// Panel Management
// ============================================

async function handlePanelSpawn(interaction: any) {
    const guildId = interaction.guildId!;
    const categories = await supabase.getTicketCategories(guildId);
    const settings = await supabase.getBotSettings(guildId).catch(() => null);

    if (categories.length === 0) {
        const container = ComponentsV2.warningContainer(
            'No Categories',
            'You need to create ticket categories first.\n\n' +
            'Use `/ticket category add` to create categories.'
        );
        await interaction.editReply({
            components: [container],
            flags: ComponentsV2.IS_COMPONENTS_V2,
        });
        return;
    }

    // Create the premium ticket panel
    const panel = createTicketPanel(categories);
    const configuredChannelId = settings?.ticket_panel_channel_id;
    const targetChannel = configuredChannelId
        ? await interaction.guild.channels.fetch(configuredChannelId).catch(() => null)
        : interaction.channel;

    if (!targetChannel || !targetChannel.isTextBased?.()) {
        const container = ComponentsV2.errorContainer(
            'Invalid Panel Channel',
            'The configured ticket panel channel ID is missing or is not a text channel.'
        );
        await interaction.editReply({
            components: [container],
            flags: ComponentsV2.IS_COMPONENTS_V2,
        });
        return;
    }

    // Send to configured channel (not ephemeral)
    await targetChannel.send({
        components: [panel],
        flags: (ComponentsV2 as any).IS_COMPONENTS_V2,
    });

    const container = ComponentsV2.successContainer(
        'Panel Created',
        `The premium ticket panel has been spawned in <#${targetChannel.id}>.`
    );
    await interaction.editReply({
        components: [container],
        flags: ComponentsV2.IS_COMPONENTS_V2,
    });
}

function createTicketPanel(categories: TicketCategory[]): ContainerBuilder {
    const sections = categories
        .map(c => `### ${c.emoji} ${c.name} Ticket:\n\n${c.description || 'No description available.'}`)
        .join('\n\n');

    const list = categories
        .map(c => `» ${c.emoji} **${c.name}** - Create a ${c.name} ticket`)
        .join('\n');

    const container = new ContainerBuilder()
        .setAccentColor(ComponentsV2.Accents.purple)
        .addTextDisplayComponents(
            ComponentsV2.text(
                `# VictusMC™ ➤ Support Hub\n\n` +
                `Need help? Open a ticket below\n\n` +
                `**V** Please select the category that best fits your needs from the options below. Our team will assist you as soon as possible.\n\n` +
                `${sections}\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `### <:Stars:1524363036389937212> Available Categories\n` +
                `${list}\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `-# 🆔 You'll be asked internal questions when creating a ticket`
            )
        );

    // Add select menu
    const select = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(CUSTOM_IDS.CATEGORY_SELECT)
            .setPlaceholder('Select a ticket type...')
            .addOptions(categories.map(c => ({
                label: c.name,
                emoji: c.emoji,
                value: c.id,
                description: c.description?.substring(0, 100) || 'Click to open ticket'
            })))
    );

    container.addActionRowComponents(select);

    return container;
}

// ============================================
// Category Management
// ============================================

async function handleCategoriesList(interaction: any) {
    const guildId = interaction.guildId!;
    const categories = await supabase.getAllTicketCategories(guildId);

    if (categories.length === 0) {
        const container = ComponentsV2.infoContainer(
            'No Categories',
            'No ticket categories have been created yet.\n\n' +
            'Use `/ticket category add` to create one.'
        );
        await interaction.editReply({
            components: [container],
            flags: ComponentsV2.IS_COMPONENTS_V2,
        });
        return;
    }

    const categoryList = categories
        .map((c, i) =>
            `**${i + 1}.** ${c.emoji} ${c.name} ${c.enabled ? '<:Tick:1524363090626482326>' : '<:Cross:1524363088621469737>'}\n` +
            `-# ${c.description || 'No description'} | Priority: ${c.priority_default}`
        )
        .join('\n\n');

    const container = new ContainerBuilder()
        .setAccentColor(ComponentsV2.Accents.info)
        .addTextDisplayComponents(
            ComponentsV2.text(
                `# <:Message:1524363100734623836> Ticket Categories\n\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `${categoryList}\n` +
                `━━━━━━━━━━━━━━━━━━\n\n` +
                `-# Use \`/ticket category add\` or \`/ticket category remove\` to manage.`
            )
        );

    await interaction.editReply({
        components: [container],
        flags: ComponentsV2.IS_COMPONENTS_V2,
    });
}



// ============================================
// Ticket Creation Flow
// ============================================

async function handleCreateTicketButton(interaction: any) {
    // Step 1: Check if account is linked
    const linked = await getLinkedAccount(interaction.user.id);

    if (!linked) {
        // Show link account prompt
        const container = new ContainerBuilder()
            .setAccentColor(ComponentsV2.Accents.warning)
            .addTextDisplayComponents(
                ComponentsV2.text(
                    `# <:Link:1524363114903113799> Account Not Linked\n\n` +
                    `You need to link your Discord account to VictusMC before creating a ticket.\n\n` +
                    `━━━━━━━━━━━━━━━━━━\n` +
                    `### <:Edit:1524363079675154433> How to Link\n` +
                    `1. Visit **VictusMC website**\n` +
                    `2. Sign in to your VictusMC account\n` +
                    `3. Link your Discord in account settings\n` +
                    `4. Return here to create your ticket\n` +
                    `━━━━━━━━━━━━━━━━━━`
                )
            );

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(CUSTOM_IDS.LINK_ACCOUNT)
                .setLabel('Link Account')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('<:Link:1524363114903113799>'),
            new ButtonBuilder()
                .setCustomId(CUSTOM_IDS.CANCEL)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:Cross:1524363088621469737>')
        );

        container.addActionRowComponents(buttons);

        await interaction.reply({
            components: [container],
            flags: ComponentsV2.IS_COMPONENTS_V2,
        });
        return;
    }

    // Step 2: Show category selection
    const categories = await supabase.getTicketCategories(interaction.guildId!);

    if (categories.length === 0) {
        const container = ComponentsV2.errorContainer(
            'No Categories',
            'No ticket categories are available. Please contact an administrator.'
        );
        await interaction.reply({
            components: [container],
            flags: ComponentsV2.IS_COMPONENTS_V2,
        });
        return;
    }

    const container = new ContainerBuilder()
        .setAccentColor(ComponentsV2.Accents.info)
        .addTextDisplayComponents(
            ComponentsV2.text(
                `# <:Ticket:1524363100734623836> Create Support Ticket\n\n` +
                `Select the category that best describes your issue.\n\n` +
                `━━━━━━━━━━━━━━━━━━`
            )
        );

    const selectMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(CUSTOM_IDS.CATEGORY_SELECT)
            .setPlaceholder('Select a category...')
            .addOptions(
                categories.map(c =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(c.name)
                        .setDescription(c.description || 'No description')
                        .setValue(c.id)
                        .setEmoji(c.emoji)
                )
            )
    );

    const cancelButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(CUSTOM_IDS.CANCEL)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Cross:1524363088621469737>')
    );

    container.addActionRowComponents(selectMenu);
    container.addActionRowComponents(cancelButton);

    await interaction.reply({
        components: [container],
        flags: ComponentsV2.IS_COMPONENTS_V2,
    });
}

async function handleCategorySelect(interaction: any) {
    const categoryId = interaction.values[0];
    logger.info(`<:Search:1524363077393317968> [CategorySelect] ID: ${categoryId} by ${interaction.user.tag}`);
    const category = await supabase.getTicketCategory(categoryId);

    if (!category) {
        const container = ComponentsV2.errorContainer(
            'Error',
            'Category not found. Please try again.'
        );
        await interaction.update({
            components: [container],
        });
        return;
    }

    // Store pending ticket data
    pendingTickets.set(interaction.user.id, {
        categoryId: category.id,
        categoryName: category.name,
        categoryEmoji: category.emoji,
        priorityDefault: category.priority_default,
        customQuestions: category.custom_questions || [],
    });

    // NOTE: a modal must be shown within Discord's 3s ack window and cannot
    // follow a defer, so we must NOT do extra DB work here. The previous email
    // pre-fill (getLinkedAccount + getUserProfile) added two slow calls that
    // pushed past 3s on a cold API -> "interaction failed". Leave the email
    // blank; the form collects it.
    const email = '';

    // Open the ticket form modal
    logger.info(`<:Stars:1524363036389937212> [CategorySelect] Opening modal for ${category.name}`);
    const modal = new ModalBuilder()
        .setCustomId(`${CUSTOM_IDS.TICKET_FORM}_${categoryId}`)
        .setTitle(`New Ticket: ${category.name}`);

    // Email field (pre-filled)
    const emailInput = new TextInputBuilder()
        .setCustomId('email')
        .setLabel('Email Address')
        .setStyle(TextInputStyle.Short)
        .setValue(email)
        .setPlaceholder('your@email.com')
        .setRequired(true)
        .setMaxLength(100);

    // Subject field
    const subjectInput = new TextInputBuilder()
        .setCustomId('subject')
        .setLabel('Issue Subject')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Brief description of your issue')
        .setRequired(true)
        .setMaxLength(100);

    // Description field
    const descriptionInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Issue Description')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Provide as much detail as possible about your issue...')
        .setRequired(true)
        .setMaxLength(1000);

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(emailInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(subjectInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput)
    );

    // Add up to 2 custom questions (Discord modal limit is 5 components)
    const customQuestions = (category.custom_questions || []).slice(0, 2);
    for (const q of customQuestions) {
        const customInput = new TextInputBuilder()
            .setCustomId(`custom_${q.id}`)
            .setLabel(q.label)
            .setStyle(q.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
            .setPlaceholder(q.placeholder || '')
            .setRequired(q.required || false)
            .setMaxLength(q.max_length || 500);

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(customInput)
        );
    }

    try {
        await interaction.showModal(modal);
        logger.info(`<:Tick:1524363090626482326> [CategorySelect] Modal shown successfully`);
    } catch (err: any) {
        logger.error(`<:Cross:1524363088621469737> [CategorySelect] Failed to show modal: ${err.message}`);
    }
}

async function handleTicketFormSubmit(interaction: any) {
    await interaction.deferReply({ flags: (ComponentsV2 as any).IS_COMPONENTS_V2 | 64 });

    const pending = pendingTickets.get(interaction.user.id);
    if (!pending) {
        const container = ComponentsV2.errorContainer(
            'Session Expired',
            'Your ticket session has expired. Please start again.'
        );
        await interaction.editReply({
            components: [container],
            flags: ComponentsV2.IS_COMPONENTS_V2,
        });
        return;
    }

    // Get form values
    const email = interaction.fields.getTextInputValue('email');
    const subject = interaction.fields.getTextInputValue('subject');
    const description = interaction.fields.getTextInputValue('description');

    // Get custom answers
    const customAnswers: Record<string, string> = {};
    for (const q of pending.customQuestions) {
        try {
            const value = interaction.fields.getTextInputValue(`custom_${q.id}`);
            if (value) customAnswers[q.id] = value;
        } catch {
            // Field not found
        }
    }

    // Show confirmation
    const confirmContainer = createConfirmationContainer({
        categoryName: pending.categoryName,
        categoryEmoji: pending.categoryEmoji,
        email,
        subject,
        description,
        customAnswers,
        customQuestions: pending.customQuestions,
    });

    await interaction.editReply({
        components: [confirmContainer],
        flags: (ComponentsV2 as any).IS_COMPONENTS_V2,
    });

    // Store full data for confirmation
    pendingTickets.set(interaction.user.id, {
        ...pending,
        email,
        subject,
        description,
        customAnswers,
    } as any);
}

function createConfirmationContainer(data: any): ContainerBuilder {
    let customFields = '';
    if (data.customAnswers && Object.keys(data.customAnswers).length > 0) {
        for (const q of data.customQuestions) {
            if (data.customAnswers[q.id]) {
                customFields += `\n» **${q.label}:** ${data.customAnswers[q.id].substring(0, 50)}${data.customAnswers[q.id].length > 50 ? '...' : ''}`;
            }
        }
    }

    const container = new ContainerBuilder()
        .setAccentColor(ComponentsV2.Accents.info)
        .addTextDisplayComponents(
            ComponentsV2.text(
                `# <:Message:1524363100734623836> Confirm Ticket\n\n` +
                `Please review your ticket before submitting.\n\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `### 📌 Ticket Details\n` +
                `» **Category:** ${data.categoryEmoji} ${data.categoryName}\n` +
                `» **Email:** ${data.email}\n` +
                `» **Subject:** ${data.subject}\n` +
                `${customFields}\n` +
                `\n### <:Edit:1524363079675154433> Description\n` +
                `${data.description.substring(0, 200)}${data.description.length > 200 ? '...' : ''}\n` +
                `━━━━━━━━━━━━━━━━━━`
            )
        );

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(CUSTOM_IDS.CONFIRM)
            .setLabel('Submit Ticket')
            .setStyle(ButtonStyle.Success)
            .setEmoji('<:Tick:1524363090626482326>'),
        new ButtonBuilder()
            .setCustomId(CUSTOM_IDS.CANCEL)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('<:Cross:1524363088621469737>')
    );

    container.addActionRowComponents(buttons);

    return container;
}

async function handleConfirmTicket(interaction: any) {
    await interaction.deferReply({ flags: (ComponentsV2 as any).IS_COMPONENTS_V2 | 64 });

    const pending = pendingTickets.get(interaction.user.id) as any;
    if (!pending || !pending.subject) {
        const container = ComponentsV2.errorContainer(
            'Session Expired',
            'Your ticket session has expired. Please start again.'
        );
        await interaction.editReply({
            components: [container],
            flags: (ComponentsV2 as any).IS_COMPONENTS_V2,
        });
        return;
    }

    // Allow ticket creation even when the account isn't linked — we remind the
    // user to /link inside the ticket instead of blocking support entirely.
    const linked = await getLinkedAccount(interaction.user.id);

    // Create ticket channel
    const guild = interaction.guild!;
    const ticketNumber = await supabase.getNextTicketNumber(guild.id);
    const channelName = `ticket-${ticketNumber}`;

    // Get category for routing and staff roles
    const category = await supabase.getTicketCategory(pending.categoryId);
    const settings = await supabase.getBotSettings(guild.id).catch(() => null);

    // Find or create the parent category
    let parentId = category?.discord_category_id || settings?.ticket_parent_category_id || null;
    if (parentId) {
        const parentChannel = await guild.channels.fetch(parentId).catch(() => null);
        if (!parentChannel || parentChannel.type !== ChannelType.GuildCategory) {
            parentId = null;
        }
    }

    // If no parentId is set, fall back to "Tickets" category
    if (!parentId) {
        let ticketsCategory = guild.channels.cache.find(
            (c: any) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'tickets'
        ) as CategoryChannel | undefined;

        if (!ticketsCategory) {
            ticketsCategory = await guild.channels.create({
                name: 'Tickets',
                type: ChannelType.GuildCategory,
            });
        }
        parentId = ticketsCategory!.id;
    }

    const globalAdminRoleIds = adminRoleIds(settings)
        .filter((roleId) => guild.roles.cache.has(roleId));
    const globalStaffRoleIds = combinedStaffRoleIds(settings, category)
        .filter((roleId) => guild.roles.cache.has(roleId) && !globalAdminRoleIds.includes(roleId));

    // Create the ticket channel
    const ticketChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: parentId,
        permissionOverwrites: [
            {
                id: guild.id,
                deny: [PermissionFlagsBits.ViewChannel],
            },
            {
                id: interaction.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles,
                ],
            },
            ...globalStaffRoleIds.map((roleId) => ({
                id: roleId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles,
                ],
            })),
            ...globalAdminRoleIds.map((roleId) => ({
                id: roleId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.ManageMessages,
                    PermissionFlagsBits.ManageChannels,
                ],
            })),
        ],
    });

    // Save ticket to database
    const ticket = await supabase.createTicket({
        guild_id: guild.id,
        channel_id: ticketChannel.id,
        user_id: linked?.userId ?? null,
        discord_id: interaction.user.id,
        category_id: pending.categoryId,
        ticket_number: ticketNumber,
        subject: pending.subject,
        description: pending.description,
        email: pending.email,
        priority: pending.priorityDefault,
        custom_answers: pending.customAnswers || {},
    });

    if (!ticket) {
        await ticketChannel.delete().catch(() => { });
        const container = ComponentsV2.errorContainer(
            'Error',
            `Failed to create ticket. Please try again.`
        );
        await interaction.editReply({
            components: [container],
            flags: (ComponentsV2 as any).IS_COMPONENTS_V2,
        });
        return;
    }

    // Ping the staff/admin roles + the owner, then post the control panel that
    // includes the user's entered details and a /link reminder if needed.
    const staffPing = [...globalStaffRoleIds, ...globalAdminRoleIds]
        .map((id: string) => `<@&${id}>`)
        .join(' ');
    const controlPanel = createTicketControlPanel(ticket, interaction.user, linked);
    await ticketChannel.send({
        components: [controlPanel],
        flags: ComponentsV2.IS_COMPONENTS_V2,
        allowedMentions: { parse: ['roles', 'users'] },
    });
    // Components V2 messages can't carry a `content` field, so ping staff + the
    // owner in a separate plain message.
    const ticketPing = `${staffPing} <@${interaction.user.id}>`.trim();
    if (ticketPing) {
        await ticketChannel.send({
            content: ticketPing,
            allowedMentions: { parse: ['roles', 'users'] },
        }).catch(() => undefined);
    }

    // Clean up pending data
    pendingTickets.delete(interaction.user.id);

    // Send confirmation
    const container = ComponentsV2.successContainer(
        'Ticket Created!',
        `Your ticket has been created: <#${ticketChannel.id}>\n\n` +
        `**Ticket #${ticket.ticket_number}** — ${pending.categoryEmoji} ${pending.categoryName}`
    );

    await interaction.editReply({
        components: [container],
        flags: (ComponentsV2 as any).IS_COMPONENTS_V2,
    });

    logger.info(`Ticket #${ticket.ticket_number} created by ${interaction.user.tag}`);
}

// ============================================
// Add member to ticket
// ============================================

async function handleAddMemberButton(interaction: any) {
    const ticketId = interaction.customId.split('_')[2];
    const modal = new ModalBuilder()
        .setCustomId(`ticket_addmember_modal_${ticketId}`)
        .setTitle('Add a member to this ticket');
    const input = new TextInputBuilder()
        .setCustomId('user')
        .setLabel('User ID or @mention')
        .setPlaceholder('e.g. 123456789012345678')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    await interaction.showModal(modal);
}

async function handleAddMemberModal(interaction: any) {
    await interaction.deferReply();
    const raw = String(interaction.fields.getTextInputValue('user') || '').trim();
    const userId = (raw.match(/\d{15,20}/) || [])[0];
    if (!userId) {
        await interaction.editReply({ content: '<:Cross:1524363088621469737> Could not read a user ID. Paste their Discord user ID or mention.' });
        return;
    }
    const channel = interaction.channel;
    const member = await interaction.guild?.members.fetch(userId).catch(() => null);
    if (!member) {
        await interaction.editReply({ content: '<:Cross:1524363088621469737> That user is not in this server.' });
        return;
    }
    try {
        await channel.permissionOverwrites.edit(userId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true,
        });
        await interaction.editReply({ content: `<:Tick:1524363090626482326> Added <@${userId}> to this ticket.` });
        await channel.send({
            content: `<:Add:1524363108766974247> <@${userId}> was added to the ticket by <@${interaction.user.id}>.`,
            allowedMentions: { users: [userId] },
        }).catch(() => undefined);
    } catch {
        await interaction.editReply({ content: '<:Cross:1524363088621469737> Failed to add the member (do I have Manage Channels here?).' });
    }
}

// ============================================
// Ticket Control Panel
// ============================================

export function createTicketControlPanel(ticket: Ticket, user: any, linked?: any): ContainerBuilder {
    // Robust against website-originated tickets which may not carry every field.
    const status: string = String((ticket as any).status || 'open');
    const priority: string = String((ticket as any).priority || 'medium');
    const statusEmoji = status === 'open' ? '<:Tick:1524363090626482326>' : status === 'claimed' ? '<:Pause:1524363094933897226>' : '<:Cross:1524363088621469737>';
    const priorityEmoji = ({
        low: '<:Tick:1524363090626482326>',
        medium: '<:Pause:1524363094933897226>',
        high: '<:Setting:1524363057990598687>',
        urgent: '<:Cross:1524363088621469737>',
    } as Record<string, string>)[priority] || '<:Cross:1524363088621469737>';

    const categoryEmoji = ticket.category?.emoji || '🗂️';
    const categoryName = ticket.category?.name || 'General';

    const createdAt = (ticket as any).created_at ? new Date((ticket as any).created_at) : new Date();
    const createdAgo = getTimeAgo(createdAt);

    const ownerMention = (ticket as any).discord_id
        ? `<@${(ticket as any).discord_id}>`
        : (linked?.discord_id ? `<@${linked.discord_id}>` : ((ticket as any).email || 'Website user'));

    const customAnswers = (ticket as any).custom_answers && typeof (ticket as any).custom_answers === 'object'
        ? Object.entries((ticket as any).custom_answers)
            .filter(([k, v]) => v && !['source', 'page_url', 'guest_id', 'user_agent', 'name', 'support_group'].includes(k))
            .map(([k, v]) => `» **${k}:** ${String(v).slice(0, 300)}`)
            .join('\n')
        : '';

    const container = new ContainerBuilder()
        .setAccentColor(ComponentsV2.Accents.purple)
        .addTextDisplayComponents(
            ComponentsV2.text(
                `# <:Ticket:1524363100734623836> Support Ticket\n\n` +
                `Ticket #${ticket.ticket_number} • ${categoryEmoji} ${categoryName}\n\n` +
                `Please wait for a staff member to assist you. Use the buttons below to manage your ticket.\n\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `### 📊 Ticket Info\n` +
                `» **Owner:** ${ownerMention}\n` +
                `» **Category:** ${categoryEmoji} ${categoryName}\n` +
                `» **Status:** ${statusEmoji} ${status.charAt(0).toUpperCase() + status.slice(1)}\n` +
                `» **Priority:** ${priorityEmoji} ${priority.charAt(0).toUpperCase() + priority.slice(1)}\n` +
                `» **Created:** ${createdAgo}\n` +
                (ticket.claimed_by ? `» **Assigned:** <@${ticket.claimed_by}>\n` : '') +
                `━━━━━━━━━━━━━━━━━━\n` +
                `### <:Edit:1524363079675154433> Issue Details\n` +
                `» **Subject:** ${(ticket as any).subject || '—'}\n` +
                `» **Details:**\n${String((ticket as any).description || '—').slice(0, 1400)}\n` +
                (customAnswers ? customAnswers + '\n' : '') +
                (linked ? '' : `\n<:Exclamation:1524363098809569350> **Not linked yet?** Visit VictusMC website to connect your account.\n`) +
                `━━━━━━━━━━━━━━━━━━`
            )
        );

    // Note: Thumbnails added via embed thumbnail, not ContainerBuilder

    // Control buttons
    const isLocked = ticket.status === 'locked';
    const isClaimed = !!ticket.claimed_by;

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`ticket_close_${ticket.id}`)
            .setLabel('Close')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('<:Cross:1524363088621469737>'),
        new ButtonBuilder()
            .setCustomId(`ticket_lock_${ticket.id}`)
            .setLabel('Lock')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Lock:1524363064001040385>')
            .setDisabled(isLocked),
        new ButtonBuilder()
            .setCustomId(`ticket_unlock_${ticket.id}`)
            .setLabel('Unlock')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:UnLock:1524363066404503614>')
            .setDisabled(!isLocked),
        new ButtonBuilder()
            .setCustomId(`ticket_claim_${ticket.id}`)
            .setLabel(isClaimed ? 'Claimed' : 'Claim')
            .setStyle(isClaimed ? ButtonStyle.Success : ButtonStyle.Primary)
            .setEmoji('<:User:1524363104903893052>')
            .setDisabled(isClaimed)
    );

    // Second row with AI and linking
    const buttons2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`ticket_ai_${ticket.id}`)
            .setLabel('Ask AI')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Stars:1524363036389937212>'),
        new ButtonBuilder()
            .setCustomId(`ticket_addmember_${ticket.id}`)
            .setLabel('Add Member')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:Add:1524363108766974247>'),
        new ButtonBuilder()
            .setLabel('VictusMC')
            .setStyle(ButtonStyle.Link)
            .setURL(config.branding.website)
            .setEmoji('<:Home:1524363002927911122>')
    );

    container.addActionRowComponents(buttons);
    container.addActionRowComponents(buttons2);

    return container;
}

// ============================================
// Ticket Control Handlers
// ============================================

async function sendTicketArchiveSummary(interaction: any, ticket: Ticket, settings: BotSettings | null) {
    const archiveChannelId = settings?.ticket_archive_channel_id || settings?.log_channel_id;
    if (!archiveChannelId) return;

    const transcriptChannel = await interaction.guild?.channels.fetch(archiveChannelId).catch(() => null);
    if (!transcriptChannel?.isTextBased?.()) return;

    // Build a full transcript from the live Discord channel history (newest →
    // oldest, paged), then render it chronologically.
    const lines: string[] = [];
    try {
        const source = interaction.channel;
        const collected: any[] = [];
        let beforeId: string | undefined;
        for (let page = 0; page < 5; page++) { // up to ~500 messages
            const batch = await source?.messages?.fetch({ limit: 100, before: beforeId }).catch(() => null);
            if (!batch || batch.size === 0) break;
            collected.push(...batch.values());
            beforeId = batch.last()?.id;
            if (batch.size < 100) break;
        }
        collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        for (const m of collected) {
            const ts = new Date(m.createdTimestamp).toISOString().replace('T', ' ').slice(0, 19);
            const author = m.author?.bot
                ? `${m.author.username} [BOT]`
                : (m.member?.displayName || m.author?.username || 'Unknown');
            let body = (m.content || '').trim();
            if (!body && m.components?.length) body = '[panel / buttons]';
            else if (!body && m.embeds?.length) body = '[embed]';
            lines.push(`[${ts} UTC] ${author}: ${body}`);
            for (const att of m.attachments?.values?.() || []) lines.push(`        ↳ ${att.url}`);
        }
    } catch {
        // Fall back to the header only if history can't be read.
    }

    const ownerLine = ticket.discord_id ? `@${ticket.discord_id}` : ((ticket as any).email || 'Website user');
    const header = [
        'VictusMC — Ticket Transcript',
        `Ticket #${ticket.ticket_number}`,
        `Subject:   ${ticket.subject || '—'}`,
        `Category:  ${ticket.category?.name || 'General'}`,
        `Owner:     ${ownerLine}`,
        `Closed by: ${interaction.user?.tag || interaction.user?.id || 'unknown'}`,
        `Opened:    ${ticket.created_at || '—'}`,
        `Closed:    ${new Date().toISOString()}`,
        `Messages:  ${lines.length}`,
        '='.repeat(64),
        '',
    ].join('\n');

    const file = new AttachmentBuilder(Buffer.from(header + lines.join('\n') + '\n', 'utf8'), {
        name: `transcript-ticket-${ticket.ticket_number}.txt`,
    });

    const unix = Math.floor(Date.now() / 1000);
    await transcriptChannel.send({
        content:
            `## 🧾 Ticket Transcript — #${ticket.ticket_number}\n` +
            `<:Ticket:1524363100734623836> **Category:** ${ticket.category?.emoji || '🗂️'} ${ticket.category?.name || 'General'}\n` +
            `<:Edit:1524363079675154433> **Subject:** ${ticket.subject || '—'}\n` +
            `<:User:1524363104903893052> **Owner:** ${ticket.discord_id ? `<@${ticket.discord_id}>` : ownerLine}\n` +
            `<:Shield:1524362964772196422> **Closed by:** <@${interaction.user.id}>  •  <:Time:1524363075271000146> <t:${unix}:F>\n` +
            `<:Message:1524363100734623836> **Messages:** ${lines.length}`,
        files: [file],
        allowedMentions: { parse: [] },
    }).catch(() => undefined);
}

async function handleCloseTicket(interaction: any) {
    const ticketId = interaction.customId.split('_')[2];
    const ticket = await supabase.getTicket(ticketId);

    if (!ticket) {
    await interaction.reply({ content: '<:Cross:1524363088621469737> Ticket not found.' });
        return;
    }

    const settings = await supabase.getBotSettings(ticket.guild_id).catch(() => null);
    if (!canCloseTicket(interaction, ticket, settings)) {
        await denyTicketAction(interaction, 'Only the ticket owner or configured staff roles can close this ticket.');
        return;
    }

    // Update ticket status
    await supabase.updateTicket(ticketId, {
        status: 'closed',
        closed_at: new Date().toISOString(),
    });

    await sendTicketArchiveSummary(interaction, ticket, settings);

    // Send closing message
    const container = ComponentsV2.successContainer(
        'Ticket Closed',
        `This ticket has been closed by <@${interaction.user.id}>.\n\n` +
        `The channel will be deleted in 10 seconds.`
    );

    await interaction.update({
        components: [container],
    });

    // Delete channel after delay
    setTimeout(async () => {
        try {
            await interaction.channel.delete();
        } catch {
            // Channel already deleted
        }
    }, 10000);

    logger.info(`Ticket #${ticket.ticket_number} closed by ${interaction.user.tag}`);
}

async function handleLockTicket(interaction: any) {
    const ticketId = interaction.customId.split('_')[2];
    const ticket = await supabase.getTicket(ticketId);

    if (!ticket) {
        await interaction.reply({ content: '<:Cross:1524363088621469737> Ticket not found.' });
        return;
    }

    const settings = await supabase.getBotSettings(ticket.guild_id).catch(() => null);
    if (!memberHasTicketStaffAccess(interaction, settings, ticket.category)) {
        await denyTicketAction(interaction, 'Only configured staff roles can lock tickets.');
        return;
    }

    // Lock the channel
    await interaction.channel.permissionOverwrites.edit(ticket.discord_id, {
        SendMessages: false,
    });

    await supabase.updateTicket(ticketId, { status: 'locked' });

    // Update control panel
    const updatedTicket = await supabase.getTicket(ticketId);
    const controlPanel = createTicketControlPanel(updatedTicket, interaction.user);

    await interaction.update({
        components: [controlPanel],
    });

    logger.info(`Ticket #${ticket.ticket_number} locked by ${interaction.user.tag}`);
}

async function handleUnlockTicket(interaction: any) {
    const ticketId = interaction.customId.split('_')[2];
    const ticket = await supabase.getTicket(ticketId);

    if (!ticket) {
        await interaction.reply({ content: '<:Cross:1524363088621469737> Ticket not found.' });
        return;
    }

    const settings = await supabase.getBotSettings(ticket.guild_id).catch(() => null);
    if (!memberHasTicketStaffAccess(interaction, settings, ticket.category)) {
        await denyTicketAction(interaction, 'Only configured staff roles can unlock tickets.');
        return;
    }

    // Unlock the channel
    await interaction.channel.permissionOverwrites.edit(ticket.discord_id, {
        SendMessages: true,
    });

    await supabase.updateTicket(ticketId, { status: ticket.claimed_by ? 'claimed' : 'open' });

    // Update control panel
    const updatedTicket = await supabase.getTicket(ticketId);
    const controlPanel = createTicketControlPanel(updatedTicket, interaction.user);

    await interaction.update({
        components: [controlPanel],
    });

    logger.info(`Ticket #${ticket.ticket_number} unlocked by ${interaction.user.tag}`);
}

async function handleClaimTicket(interaction: any) {
    const ticketId = interaction.customId.split('_')[2];
    const ticket = await supabase.getTicket(ticketId);

    if (!ticket) {
        await interaction.reply({ content: '<:Cross:1524363088621469737> Ticket not found.' });
        return;
    }

    const settings = await supabase.getBotSettings(ticket.guild_id).catch(() => null);
    if (!memberHasTicketStaffAccess(interaction, settings, ticket.category)) {
        await denyTicketAction(interaction, 'Only configured staff roles can claim tickets.');
        return;
    }

    await supabase.updateTicket(ticketId, {
        status: 'claimed',
        claimed_by: interaction.user.id,
        claimed_by_name: interaction.user.tag,
    });

    // Update control panel
    const updatedTicket = await supabase.getTicket(ticketId);
    const controlPanel = createTicketControlPanel(updatedTicket, interaction.user);

    await interaction.update({
        components: [controlPanel],
    });

    // Notify in channel
    await interaction.channel.send({
        content: `<:User:1524363104903893052> **${interaction.user.tag}** has claimed this ticket.`,
    });

    logger.info(`Ticket #${ticket.ticket_number} claimed by ${interaction.user.tag}`);
}

async function handleAIHelp(interaction: any) {
    await interaction.deferReply({});

    const ticketId = interaction.customId.split('_')[2];
    const ticket = await supabase.getTicket(ticketId);

    if (!ticket) {
        await interaction.editReply({ content: '<:Cross:1524363088621469737> Ticket not found.' });
        return;
    }

    if (!config.ai.enabled) {
        await interaction.editReply({
            content: 'AI support is not currently enabled. A staff member will assist you shortly.',
        });
        return;
    }

    try {
        const messages = await supabase.getTicketMessages(ticketId);
        const suggestion = await groqAi.suggestForTicket({
            subject: ticket.subject,
            category: ticket.category?.name,
            description: ticket.description,
            messages,
        });

        await interaction.editReply({
            content: formatAiMessage(suggestion),
        });
    } catch (error) {
        logger.error('Ticket AI suggestion failed:', error);
        await interaction.editReply({
            content: 'The Groq assistant could not review this ticket right now. Staff can still continue manually.',
        });
    }
    if (Date.now() < 0) {

    // Get ticket messages for context
    const messages = await supabase.getTicketMessages(ticketId);

    // Generate AI suggestion (simplified - would use OpenAI in production)
    const container = ComponentsV2.infoContainer(
        '<:Bot:1524362962905862164> AI Suggestion',
        `Based on your ticket in the **${ticket.category?.name}** category:\n\n` +
        `**Issue:** ${ticket.subject}\n\n` +
        `**Suggestion:** A staff member will review your ticket shortly. ` +
        `In the meantime, please ensure you've provided all relevant details ` +
        `including any error messages or steps to reproduce the issue.`
    );

    await interaction.editReply({
        components: [container],
        flags: ComponentsV2.IS_COMPONENTS_V2,
    });
    }
}

// ============================================
// Utility Functions
// ============================================

function getTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
}

// ============================================
// Enhanced Category Management
// ============================================



// ============================================
// Ticket Setup Dashboard (like Staff App)
// ============================================

function renderTicketSetupDashboard(config: any, panel: any): any {
    const c = ComponentsV2.baseContainer(ComponentsV2.Accents.primary);
    const catKeys = Object.keys(config || {});

    let text = `# <:Ticket:1524363100734623836> Ticket Panel Setup\n` +
        `Configure your ticket categories and customize the support panel.\n\n`;

    if (catKeys.length === 0) {
        text += `*No ticket categories configured. Use \`/ticket category add\` to create one, then return here to manage it.*`;
    } else {
        text += `### Configured Categories:\n`;
        catKeys.forEach((key: string) => {
            const cat = config[key];
            text += `• ${cat.emoji || '<:Ticket:1524363100734623836>'} **${cat.name}** (\`${key}\`) — ${cat.description || 'No description'}\n`;
        });
    }

    c.addTextDisplayComponents(ComponentsV2.text(text))
     .addSeparatorComponents(ComponentsV2.separator());

    if (catKeys.length > 0) {
        const selectMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('ticket_setup:select_cat')
                .setPlaceholder('Select a category to configure...')
                .addOptions(catKeys.map((key: string) => {
                    const cat = config[key];
                    return {
                        label: cat.name,
                        value: key,
                        emoji: cat.emoji || '<:Ticket:1524363100734623836>',
                    };
                }))
        );
        c.addActionRowComponents(selectMenu);
    }

    const topRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_setup:create_cat')
            .setLabel('Create Category <:Add:1524363108766974247>')
            .setStyle(ButtonStyle.Success)
    );

    const editPanelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_setup:edit_panel')
            .setLabel('Edit Panel <:Edit:1524363079675154433>')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('ticket_setup:publish')
            .setLabel('Publish Panel <:Annc:1524363017813360710>')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(catKeys.length === 0)
    );

    c.addActionRowComponents(topRow);
    c.addActionRowComponents(editPanelRow);
    return c;
}

function renderTicketCategorySubDashboard(cat: any): any {
    const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);

    const questionsList = cat.custom_questions?.length
        ? cat.custom_questions.map((q: any, i: number) => `\`${i + 1}.\` ${q.label} (${q.type})`).join('\n')
        : 'None configured';

    const text = `# <:Setting:1524363057990598687> Managing: ${cat.emoji || '<:Ticket:1524363100734623836>'} ${cat.name}\n` +
        `› **ID:** \`${cat.id}\`\n` +
        `› **Description:** *${cat.description || 'None'}*\n` +
        `› **Priority:** \`${cat.priority_default || 'low'}\`\n` +
        `› **Staff Roles:** ${cat.staff_roles?.length ? cat.staff_roles.map((r: string) => `<@&${r}>`).join(' ') : 'None'}\n` +
        `› **Discord Category:** ${cat.discord_category_id ? `<#${cat.discord_category_id}>` : 'Not set'}\n` +
        `› **Enabled:** ${cat.enabled ? '<:Tick:1524363090626482326>' : '<:Cross:1524363088621469737>'}\n\n` +
        `### Custom Questions (${cat.custom_questions?.length || 0})\n${questionsList}`;

    c.addTextDisplayComponents(ComponentsV2.text(text))
     .addSeparatorComponents(ComponentsV2.separator());

    const editRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_setup:back')
            .setLabel('⬅️ Back')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`ticket_setup:edit_details:${cat.id}`)
            .setLabel('Edit Details <:Edit:1524363079675154433>')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`ticket_setup:questions:${cat.id}`)
            .setLabel('Questions <:Exclamation:1524363098809569350>')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`ticket_setup:toggle:${cat.id}`)
            .setLabel(cat.enabled ? 'Disable <:Cross:1524363088621469737>' : 'Enable <:Tick:1524363090626482326>')
            .setStyle(ButtonStyle.Secondary)
    );

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`ticket_setup:staff_role:${cat.id}`)
            .setLabel('Set Staff Role')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`ticket_setup:discord_cat:${cat.id}`)
            .setLabel('Set Discord Category')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`ticket_setup:delete:${cat.id}`)
            .setLabel('Delete <:Delete:1524363081642147931>')
            .setStyle(ButtonStyle.Danger)
    );

    c.addActionRowComponents(editRow);
    c.addActionRowComponents(actionRow);
    return c;
}

function buildTicketPanel(categories: any[], panel: any): any {
    const p = panel || {
        title: 'VictusMC Support Hub',
        description: 'Select a category below to open a support ticket.',
        imageUrl: null,
        footer: null,
        thumbnail: null,
    };

    const c = ComponentsV2.baseContainer(ComponentsV2.Accents.primary);
    if (p.imageUrl) c.addMediaGalleryComponents(ComponentsV2.mediaGallery(p.imageUrl));

    let body = `# ${p.title}\n\n${p.description}`;
    if (p.footer) body += `\n\n-# ${p.footer}`;

    c.addTextDisplayComponents(ComponentsV2.text(body))
     .addSeparatorComponents(ComponentsV2.separator());

    const options = categories.map((cat) => ({
        label: cat.name,
        value: cat.id,
        description: cat.description ? cat.description.slice(0, 100) : undefined,
        emoji: cat.emoji || undefined,
    }));

    const selectMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('ticket_category_select')
            .setPlaceholder('Choose a category...')
            .addOptions(options)
    );

    c.addActionRowComponents(selectMenu);
    return c;
}

// ============================================
// Ticket Setup Handlers
// ============================================

async function handleTicketSetup(interaction: any) {
    const member = interaction.member;
    const isAdmin = member?.permissions?.has?.(PermissionFlagsBits.Administrator) || member?.permissions?.has?.(PermissionFlagsBits.ManageChannels);
    if (!isAdmin) {
        const container = ComponentsV2.errorContainer(
            'Permission Denied',
            'You need **Administrator** or **Manage Channels** permission to configure tickets.'
        );
        await interaction.reply({ components: [container], flags: ComponentsV2.IS_COMPONENTS_V2 });
        return;
    }

    const guildId = interaction.guildId!;
    const categories = await supabase.getAllTicketCategories(guildId);
    const catMap: Record<string, any> = {};
    for (const cat of categories) {
        catMap[cat.id] = cat;
    }
    const panel = await ticketPanelSettings.get(guildId);
    const dashboard = renderTicketSetupDashboard(catMap, panel);
    await interaction.reply({ components: [dashboard], flags: ComponentsV2.IS_COMPONENTS_V2 });
}

async function handleTicketSetupButton(interaction: any) {
    const guildId = interaction.guildId!;
    const action = interaction.customId.split(':')[1];

    if (action === 'back') {
        const categories = await supabase.getAllTicketCategories(guildId);
        const catMap: Record<string, any> = {};
        for (const cat of categories) catMap[cat.id] = cat;
        const panel = await ticketPanelSettings.get(guildId);
        const dashboard = renderTicketSetupDashboard(catMap, panel);
        await interaction.update({ components: [dashboard] });
        return;
    }

    if (action === 'edit_panel') {
        const panel = await ticketPanelSettings.get(guildId);
        const modal = new ModalBuilder()
            .setCustomId('ticket_setup_modal:edit_panel')
            .setTitle('Edit Ticket Panel');
        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('title')
                    .setLabel('Panel Title')
                    .setValue(panel.title)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('description')
                    .setLabel('Panel Description')
                    .setValue(panel.description)
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('image_url')
                    .setLabel('Image URL (optional)')
                    .setValue(panel.imageUrl || '')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('thumbnail')
                    .setLabel('Thumbnail URL (optional)')
                    .setValue(panel.thumbnail || '')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('footer')
                    .setLabel('Footer text (optional)')
                    .setValue(panel.footer || '')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
            )
        );
        await interaction.showModal(modal);
        return;
    }

    if (action === 'publish') {
        const categories = await supabase.getTicketCategories(guildId);
        const panel = await ticketPanelSettings.get(guildId);
        const built = buildTicketPanel(categories, panel);
        const channel = interaction.channel;
        if (channel && channel.isTextBased()) {
            await (channel as any).send({ components: [built], flags: ComponentsV2.IS_COMPONENTS_V2 });
        }
        await interaction.update({
            components: [ComponentsV2.successContainer('Panel Posted', 'The ticket panel has been posted to this channel.')]
        });
        return;
    }

    if (action === 'edit_details') {
        const catId = interaction.customId.split(':')[2];
        const categories = await supabase.getAllTicketCategories(guildId);
        const cat = categories.find((c: any) => c.id === catId);
        if (!cat) return;

        const modal = new ModalBuilder()
            .setCustomId(`ticket_setup_modal:edit_details:${catId}`)
            .setTitle('Edit Category Details');
        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('name')
                    .setLabel('Category Name')
                    .setValue(cat.name)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('description')
                    .setLabel('Description (optional)')
                    .setValue(cat.description || '')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('emoji')
                    .setLabel('Emoji (optional)')
                    .setValue(cat.emoji || '')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
            )
        );
        await interaction.showModal(modal);
        return;
    }

    if (action === 'toggle') {
        const catId = interaction.customId.split(':')[2];
        const categories = await supabase.getAllTicketCategories(guildId);
        const cat = categories.find((c: any) => c.id === catId);
        if (!cat) return;
        await supabase.updateTicketCategory(catId, { enabled: !cat.enabled });
        const updated = await supabase.getTicketCategory(catId);
        if (updated) {
            await interaction.update({ components: [renderTicketCategorySubDashboard(updated)] });
        }
        return;
    }

    if (action === 'delete') {
        const catId = interaction.customId.split(':')[2];
        await supabase.deleteTicketCategory(catId);
        const categories = await supabase.getAllTicketCategories(guildId);
        const catMap: Record<string, any> = {};
        for (const cat of categories) catMap[cat.id] = cat;
        const panel = await ticketPanelSettings.get(guildId);
        const dashboard = renderTicketSetupDashboard(catMap, panel);
        await interaction.update({ components: [dashboard] });
        return;
    }

    // Create new category
    if (action === 'create_cat') {
        const modal = new ModalBuilder()
            .setCustomId('ticket_setup_modal:create_cat')
            .setTitle('Create Ticket Category');
        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('name')
                    .setLabel('Category Name')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(50)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('description')
                    .setLabel('Description (shown in panel)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false)
                    .setMaxLength(200)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('emoji')
                    .setLabel('Emoji (e.g. <:Ticket:1524363100734623836>)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(10)
            )
        );
        await interaction.showModal(modal);
        return;
    }

    // Show questions management
    if (action === 'questions') {
        const catId = interaction.customId.split(':')[2];
        const cat = await supabase.getTicketCategory(catId);
        if (!cat) return;

        const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);

        const questionsList = cat.custom_questions?.length
            ? cat.custom_questions.map((q: any, i: number) => `\`${i + 1}.\` **${q.label}** (${q.type})`).join('\n')
            : 'None yet.';

        const text = `# <:Exclamation:1524363098809569350> Questions for: ${cat.name}\n\n${questionsList}\n\nUse the buttons below to manage questions.`;
        c.addTextDisplayComponents(ComponentsV2.text(text))
         .addSeparatorComponents(ComponentsV2.separator());

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_setup:back_to_cat:' + catId)
                .setLabel('⬅️ Back')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`ticket_setup:add_question:${catId}`)
                .setLabel('<:Add:1524363108766974247> Add Question')
                .setStyle(ButtonStyle.Success)
        );

        // Add remove buttons if questions exist
        if (cat.custom_questions?.length) {
            const removeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                ...cat.custom_questions.map((_: any, i: number) =>
                    new ButtonBuilder()
                        .setCustomId(`ticket_setup:remove_question:${catId}:${i}`)
                        .setLabel(`✖️ #${i + 1}`)
                        .setStyle(ButtonStyle.Danger)
                )
            );
            c.addActionRowComponents(row);
            c.addActionRowComponents(removeRow);
        } else {
            c.addActionRowComponents(row);
        }

        await interaction.update({ components: [c] });
        return;
    }

    // Back to category from questions
    if (action === 'back_to_cat') {
        const catId = interaction.customId.split(':')[2];
        const cat = await supabase.getTicketCategory(catId);
        if (cat) {
            await interaction.update({ components: [renderTicketCategorySubDashboard(cat)] });
        }
        return;
    }

    // Add question modal
    if (action === 'add_question') {
        const catId = interaction.customId.split(':')[2];
        const modal = new ModalBuilder()
            .setCustomId(`ticket_setup_modal:add_question:${catId}`)
            .setTitle('Add Custom Question');
        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('label')
                    .setLabel('Question label')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(45)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('type')
                    .setLabel('Type: short, paragraph, or dropdown')
                    .setValue('short')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(20)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('required')
                    .setLabel('Required? true/false')
                    .setValue('true')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(5)
            )
        );
        await interaction.showModal(modal);
        return;
    }

    // Remove question (no confirmation, just do it)
    if (action === 'remove_question') {
        const parts = interaction.customId.split(':');
        const catId = parts[2];
        const index = parseInt(parts[3]);
        const cat = await supabase.getTicketCategory(catId);
        if (!cat || !cat.custom_questions?.length) return;
        cat.custom_questions.splice(index, 1);
        await supabase.updateTicketCategory(catId, { custom_questions: cat.custom_questions });
        // Refresh the questions view
        const updatedCat = await supabase.getTicketCategory(catId);
        if (!updatedCat) return;
        const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
        const questionsList = updatedCat.custom_questions?.length
            ? updatedCat.custom_questions.map((q: any, i: number) => `\`${i + 1}.\` **${q.label}** (${q.type})`).join('\n')
            : 'None yet.';
        const text = `# <:Exclamation:1524363098809569350> Questions for: ${updatedCat.name}\n\n${questionsList}\n\nUse the buttons below to manage questions.`;
        c.addTextDisplayComponents(ComponentsV2.text(text))
         .addSeparatorComponents(ComponentsV2.separator());
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_setup:back_to_cat:' + catId)
                .setLabel('⬅️ Back')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`ticket_setup:add_question:${catId}`)
                .setLabel('<:Add:1524363108766974247> Add Question')
                .setStyle(ButtonStyle.Success)
        );
        if (updatedCat.custom_questions?.length) {
            const removeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                ...updatedCat.custom_questions.map((_: any, i: number) =>
                    new ButtonBuilder()
                        .setCustomId(`ticket_setup:remove_question:${catId}:${i}`)
                        .setLabel(`✖️ #${i + 1}`)
                        .setStyle(ButtonStyle.Danger)
                )
            );
            c.addActionRowComponents(row);
            c.addActionRowComponents(removeRow);
        } else {
            c.addActionRowComponents(row);
        }
        await interaction.update({ components: [c] });
        return;
    }

    // Set staff role modal
    if (action === 'staff_role') {
        const catId = interaction.customId.split(':')[2];
        const cat = await supabase.getTicketCategory(catId);
        if (!cat) return;
        const currentRole = cat.staff_roles?.[0] || '';
        const modal = new ModalBuilder()
            .setCustomId(`ticket_setup_modal:staff_role:${catId}`)
            .setTitle('Set Staff Role ID');
        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('role_id')
                    .setLabel('Staff Role ID')
                    .setValue(currentRole)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            )
        );
        await interaction.showModal(modal);
        return;
    }

    // Set discord category modal
    if (action === 'discord_cat') {
        const catId = interaction.customId.split(':')[2];
        const cat = await supabase.getTicketCategory(catId);
        if (!cat) return;
        const currentCat = cat.discord_category_id || '';
        const modal = new ModalBuilder()
            .setCustomId(`ticket_setup_modal:discord_cat:${catId}`)
            .setTitle('Set Discord Category ID');
        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId('category_id')
                    .setLabel('Channel Category ID')
                    .setValue(currentCat)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            )
        );
        await interaction.showModal(modal);
        return;
    }
}

async function handleTicketSetupSelectMenu(interaction: any) {
    const guildId = interaction.guildId!;
    const action = interaction.customId.split(':')[1];

    if (action === 'select_cat') {
        const catId = interaction.values[0];
        const cat = await supabase.getTicketCategory(catId);
        if (cat) {
            await interaction.update({ components: [renderTicketCategorySubDashboard(cat)] });
        }
    }
}

async function handleTicketSetupModal(interaction: any) {
    const guildId = interaction.guildId!;
    const parts = interaction.customId.split(':');
    const modalType = parts[1];

    if (modalType === 'edit_panel') {
        const title = interaction.fields.getTextInputValue('title').trim();
        const description = interaction.fields.getTextInputValue('description').trim();
        const imageUrl = interaction.fields.getTextInputValue('image_url').trim() || null;
        const thumbnail = interaction.fields.getTextInputValue('thumbnail').trim() || null;
        const footer = interaction.fields.getTextInputValue('footer').trim() || null;

        await ticketPanelSettings.set(guildId, { title, description, imageUrl, footer, thumbnail });
        const categories = await supabase.getAllTicketCategories(guildId);
        const catMap: Record<string, any> = {};
        for (const cat of categories) catMap[cat.id] = cat;
        const panel = await ticketPanelSettings.get(guildId);
        const dashboard = renderTicketSetupDashboard(catMap, panel);
        await (interaction as any).update({ components: [dashboard] });
        return;
    }

    if (modalType === 'edit_details') {
        const catId = parts[2];
        const name = interaction.fields.getTextInputValue('name').trim();
        const description = interaction.fields.getTextInputValue('description').trim() || null;
        const emoji = interaction.fields.getTextInputValue('emoji').trim() || null;

        await supabase.updateTicketCategory(catId, { name, description, emoji });
        const cat = await supabase.getTicketCategory(catId);
        if (cat) {
            await (interaction as any).update({ components: [renderTicketCategorySubDashboard(cat)] });
        }
        return;
    }

    // Create new category
    if (modalType === 'create_cat') {
        const name = interaction.fields.getTextInputValue('name').trim();
        const description = interaction.fields.getTextInputValue('description').trim() || null;
        const emoji = interaction.fields.getTextInputValue('emoji').trim() || null;

        await supabase.createTicketCategory({ guild_id: guildId, name, description, emoji, position: 0 });
        const categories = await supabase.getAllTicketCategories(guildId);
        const catMap: Record<string, any> = {};
        for (const cat of categories) catMap[cat.id] = cat;
        const panel = await ticketPanelSettings.get(guildId);
        const dashboard = renderTicketSetupDashboard(catMap, panel);
        await (interaction as any).update({ components: [dashboard] });
        return;
    }

    // Add question to category
    if (modalType === 'add_question') {
        const catId = parts[2];
        const label = interaction.fields.getTextInputValue('label').trim();
        const type = interaction.fields.getTextInputValue('type').trim().toLowerCase() || 'short';
        const requiredRaw = interaction.fields.getTextInputValue('required').trim().toLowerCase();
        const required = requiredRaw === 'true' || requiredRaw === 'yes';

        const cat = await supabase.getTicketCategory(catId);
        if (!cat) return;

        const questions = cat.custom_questions || [];
        questions.push({ label, type, required, options: type === 'dropdown' ? ['Option 1', 'Option 2'] : undefined });
        await supabase.updateTicketCategory(catId, { custom_questions: questions });

        // Refresh questions view
        const updatedCat = await supabase.getTicketCategory(catId);
        if (!updatedCat) return;
        const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
        const questionsList = updatedCat.custom_questions?.length
            ? updatedCat.custom_questions.map((q: any, i: number) => `\`${i + 1}.\` **${q.label}** (${q.type})`).join('\n')
            : 'None yet.';
        const text = `# <:Exclamation:1524363098809569350> Questions for: ${updatedCat.name}\n\n${questionsList}\n\nUse the buttons below to manage questions.`;
        c.addTextDisplayComponents(ComponentsV2.text(text))
         .addSeparatorComponents(ComponentsV2.separator());
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_setup:back_to_cat:' + catId)
                .setLabel('⬅️ Back')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`ticket_setup:add_question:${catId}`)
                .setLabel('<:Add:1524363108766974247> Add Question')
                .setStyle(ButtonStyle.Success)
        );
        if (updatedCat.custom_questions?.length) {
            const removeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                ...updatedCat.custom_questions.map((_: any, i: number) =>
                    new ButtonBuilder()
                        .setCustomId(`ticket_setup:remove_question:${catId}:${i}`)
                        .setLabel(`✖️ #${i + 1}`)
                        .setStyle(ButtonStyle.Danger)
                )
            );
            c.addActionRowComponents(row);
            c.addActionRowComponents(removeRow);
        } else {
            c.addActionRowComponents(row);
        }
        await (interaction as any).update({ components: [c] });
        return;
    }

    // Set staff role
    if (modalType === 'staff_role') {
        const catId = parts[2];
        const roleId = interaction.fields.getTextInputValue('role_id').trim();
        await supabase.updateTicketCategory(catId, { staff_roles: [roleId] });
        const cat = await supabase.getTicketCategory(catId);
        if (cat) {
            await (interaction as any).update({ components: [renderTicketCategorySubDashboard(cat)] });
        }
        return;
    }

    // Set discord category
    if (modalType === 'discord_cat') {
        const catId = parts[2];
        const categoryId = interaction.fields.getTextInputValue('category_id').trim();
        await supabase.updateTicketCategory(catId, { discord_category_id: categoryId });
        const cat = await supabase.getTicketCategory(catId);
        if (cat) {
            await (interaction as any).update({ components: [renderTicketCategorySubDashboard(cat)] });
        }
        return;
    }
}
