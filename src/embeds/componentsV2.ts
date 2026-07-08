/**
 * Premium Discord Components v2 layouts for VictusMC.
 * Keep button emoji-free to avoid guild-specific invalid emoji failures.
 */

import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SeparatorBuilder,
    StringSelectMenuBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder,
} from 'discord.js';
import { config } from '../config.js';
import { decodeDisplayText, formatCredits, formatDate, Icons, statusIcon, statusLabel } from '../utils/premium.js';

export const IS_COMPONENTS_V2 = 1 << 15;

export const Accents = {
    primary: 0x2b2d31,
    success: 0x2b2d31,
    warning: 0x2b2d31,
    danger: 0x2b2d31,
    info: 0x2b2d31,
    purple: 0x2b2d31,
    discord: 0x2b2d31,
    midnight: 0x2b2d31,
} as const;

const HERO_IMAGE = 'https://cdn.discordapp.com/attachments/1416827980004724766/1523993256961118299/wmremove-transformed.png';
const INVITE_URL = `https://discord.com/api/oauth2/authorize?client_id=${config.discord.clientId}&permissions=8&scope=bot%20applications.commands`;

export function text(content: string): TextDisplayBuilder {
    return new TextDisplayBuilder().setContent(content && content.trim() ? content : ' ');
}

export function separator(divider = true): SeparatorBuilder {
    return new SeparatorBuilder().setDivider(divider);
}

export function mediaGallery(imageUrl: string): MediaGalleryBuilder {
    return new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl));
}

export function thumbnail(imageUrl = config.branding.logo): ThumbnailBuilder {
    return new ThumbnailBuilder().setURL(imageUrl);
}

export function baseContainer(accent: number): ContainerBuilder {
    return new ContainerBuilder().setAccentColor(accent);
}

function brandLine(label = 'VICTUSMC') {
    return `-# ${Icons.spark} ${label} • secure account intelligence • Discord operations`;
}

function panelTitle(title: string, eyebrow = 'COMMAND LAYER') {
    return `${brandLine(eyebrow)}\n# ${title}`;
}

function premiumContainer(accent: number, title: string, description: string, eyebrow?: string, imageUrl = HERO_IMAGE): ContainerBuilder {
    const container = baseContainer(accent);
    if (imageUrl) container.addMediaGalleryComponents(mediaGallery(imageUrl));
    container
        .addTextDisplayComponents(text(`${panelTitle(title, eyebrow)}\n\n${description}`))
        .addSeparatorComponents(separator());
    return container;
}

function footerNote(note = 'VictusMC • Minecraft Community') {
    return text(`-# ${note}`);
}

function commandButtons(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel('Website')
            .setStyle(ButtonStyle.Link)
            .setURL(config.branding.website),
        new ButtonBuilder()
            .setLabel('Store')
            .setStyle(ButtonStyle.Link)
            .setURL(config.branding.website + '/store'),
        new ButtonBuilder()
            .setLabel('Support')
            .setStyle(ButtonStyle.Link)
            .setURL(config.branding.website + '/discord')
    );
}

function clampPanelText(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 24).trim()}... [message trimmed]`;
}

function createBrandedContainer(accent: number, title: string, description: string, eyebrow: string): ContainerBuilder {
    return premiumContainer(accent, title, description, eyebrow)
        .addTextDisplayComponents(footerNote());
}

export function successContainer(title: string, description: string): ContainerBuilder {
    return createBrandedContainer(Accents.success, `✅ ${title}`, description, 'SUCCESS SIGNAL');
}

export function errorContainer(title: string, description: string): ContainerBuilder {
    return createBrandedContainer(Accents.danger, `⛔ ${title}`, description, 'ERROR SIGNAL');
}

export function warningContainer(title: string, description: string): ContainerBuilder {
    return createBrandedContainer(Accents.warning, `⚠️ ${title}`, description, 'ATTENTION REQUIRED');
}

export function infoContainer(title: string, description: string): ContainerBuilder {
    return createBrandedContainer(Accents.info, `💠 ${title}`, description, 'INFORMATION NODE');
}

export function linkAccountContainer(
    username: string,
    avatarUrl: string,
    expiryTimestamp: number,
    linkUrl: string
): ContainerBuilder {
    const container = premiumContainer(
        Accents.discord,
        'Link Your VictusMC Account',
        `**Confirm the Discord account and VictusMC account before connecting them.**\n\n` +
        `> Discord identity: **${username}**\n` +
        `> Secure token expires: <t:${expiryTimestamp}:R>\n\n` +
        `### What happens next\n` +
        `› Open the private link below\n` +
        `› Sign in to VictusMC\n` +
        `› Review both accounts\n` +
        `› Confirm the connection`,
        'PRIVATE LINK SESSION'
    );

    if (avatarUrl) {
        container.addTextDisplayComponents(text(`-# Discord avatar preview`));
        container.addMediaGalleryComponents(mediaGallery(avatarUrl));
    }

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel('Link Account')
            .setStyle(ButtonStyle.Link)
            .setURL(linkUrl),
        new ButtonBuilder()
            .setLabel('Create Account')
            .setStyle(ButtonStyle.Link)
            .setURL(`${config.branding.website}/discord-signup?from=bot`),
        new ButtonBuilder()
            .setLabel('Help')
            .setStyle(ButtonStyle.Link)
            .setURL(`${config.branding.website}/docs`)
    );

    container
        .addActionRowComponents(buttons)
        .addTextDisplayComponents(footerNote('Private link tokens are single-user and expire automatically.'));

    return container;
}

export function linkPanelContainer(): ContainerBuilder {
    const container = premiumContainer(
        Accents.primary,
        'VictusMC Account Link Panel',
        `**Bind Discord to VictusMC and unlock account-aware controls.**\n\n` +
        `### Unlocks\n` +
        `› Website linked role and member verification\n` +
        `› Account-aware support and community commands\n` +
        `› Private operational DMs from VictusMC\n` +
        `› Faster support context for staff\n\n` +
        `### Security\n` +
        `Each click creates a private expiring token for the user who pressed it. The final website page shows both accounts before linking.`,
        'PUBLIC CONNECTION PANEL'
    );

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId('victus_link_panel_start')
            .setLabel('Link VictusMC Account')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setLabel('Open VictusMC')
            .setStyle(ButtonStyle.Link)
            .setURL(config.branding.website),
        new ButtonBuilder()
            .setLabel('Invite Bot')
            .setStyle(ButtonStyle.Link)
            .setURL(INVITE_URL)
    );

    return container
        .addActionRowComponents(buttons)
        .addTextDisplayComponents(footerNote('Press the button once. The next message is private to you.'));
}

export function adminDmContainer(subject: string, message: string, adminEmail?: string | null): ContainerBuilder {
    const container = premiumContainer(
        Accents.primary,
        subject,
        `${message}\n\n` +
        `### Source\n` +
        `› Sent by **VictusMC Admin**${adminEmail ? ` (${adminEmail})` : ''}\n` +
        `› Delivery channel: Discord direct message\n` +
        `› This message was queued from the admin panel`,
        'ADMIN DIRECT MESSAGE'
    );

    return container
        .addActionRowComponents(commandButtons())
        .addTextDisplayComponents(footerNote('You can configure DM notification categories with /preferences.'));
}

export function helpMenuContainer(
    username: string,
    _avatarUrl: string,
    commandCount: number
): ContainerBuilder {
    const container = premiumContainer(
        Accents.primary,
        'VictusMC Help Menu',
        `Welcome, **${username}**.\n\n` +
        `### Live command surface\n` +
        `› **${commandCount}** slash commands available\n` +
        `› Account linking and role sync\n` +
        `› Community support and moderation workflows\n\n` +
        `Use the category selector below to open a command group.`,
        'HELP CENTER'
    );

    const menu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('help_category')
            .setPlaceholder('Select a command category')
            .addOptions([
                { label: 'Account', description: 'Link, unlink, profile, preferences', value: 'account' },
                { label: 'Servers', description: 'List, inspect, and power manage servers', value: 'servers' },
                { label: 'Billing', description: 'Invoices, services, and account billing', value: 'billing' },
                { label: 'AI Support', description: 'Ask the VictusMC AI assistant', value: 'ai' },
                { label: 'Support', description: 'Support paths and VictusMC links', value: 'support' },
            ])
    );

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel('Invite')
            .setStyle(ButtonStyle.Link)
            .setURL(INVITE_URL),
        new ButtonBuilder()
            .setLabel('Dashboard')
            .setStyle(ButtonStyle.Link)
            .setURL(config.branding.website),
        new ButtonBuilder()
            .setLabel('Support')
            .setStyle(ButtonStyle.Link)
            .setURL(config.branding.website)
    );

    return container
        .addActionRowComponents(buttons)
        .addActionRowComponents(menu)
        .addTextDisplayComponents(footerNote('Select a category to reshape this panel.'));
}

export function aiChatContainer(
    question: string,
    answer: string,
    model: string,
    linked: boolean
): ContainerBuilder {
    const container = premiumContainer(
        Accents.info,
        'VictusMC AI',
        `**Question**\n${clampPanelText(question, 900)}\n\n` +
        `**Answer**\n${clampPanelText(answer, 2900)}`,
        'GROQ LLAMA SUPPORT'
    );

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel('Open Dashboard')
            .setStyle(ButtonStyle.Link)
            .setURL(config.branding.website),
        new ButtonBuilder()
            .setLabel('Support')
            .setStyle(ButtonStyle.Link)
            .setURL(config.branding.website),
        new ButtonBuilder()
            .setLabel(linked ? 'Account Linked' : 'Link Account')
            .setStyle(ButtonStyle.Link)
            .setURL(`${config.branding.website}/discord-link`)
    );

    return container
        .addActionRowComponents(buttons)
        .addTextDisplayComponents(footerNote(`Model: ${model} - Victus-focused answers, not live billing approval.`));
}

export function userInfoContainer(
    username: string,
    discordId: string,
    isLinked: boolean,
    profile?: any,
    history: any[] = []
): ContainerBuilder {
    const accent = isLinked ? Accents.success : Accents.warning;
    const container = baseContainer(accent).addMediaGalleryComponents(mediaGallery(HERO_IMAGE));

    const displayName = decodeDisplayText(profile?.username || profile?.full_name || username, username);
    let content = `${panelTitle(`Victus Profile: ${displayName}`, 'ACCOUNT INTELLIGENCE')}\n`;
    content += `-# Discord ID: \`${discordId}\` • Link status: **${isLinked ? 'Connected' : 'Not linked'}**\n\n`;

    if (isLinked && profile) {
        const creditText = formatCredits(profile.credits || profile.credit || profile.balance || 0);

        content += `### Account Ledger\n`;
        content += `${Icons.mail} **Email:** ${profile.email || '`Hidden`'}\n`;
        content += `${Icons.credits} **Credits:** **${creditText}**\n`;
        content += `${Icons.calendar} **Joined:** ${formatDate(profile.created_at)}\n\n`;

        content += `### Recent Admin Trace\n`;
        if (history.length > 0) {
            history.slice(0, 3).forEach(h => {
                content += `${Icons.spark} ${formatDate(h.created_at)} - ${decodeDisplayText(h.action || 'Action')}\n`;
            });
        } else {
            content += `_No recent actions recorded._\n`;
        }
    } else {
        content += `_This user has not linked their VictusMC account yet._`;
    }

    return container
        .addTextDisplayComponents(text(content))
        .addActionRowComponents(commandButtons())
        .addTextDisplayComponents(footerNote());
}

export const ComponentsV2 = {
    text,
    separator,
    mediaGallery,
    thumbnail,
    baseContainer,
    successContainer,
    errorContainer,
    warningContainer,
    infoContainer,
    linkAccountContainer,
    linkPanelContainer,
    adminDmContainer,
    helpMenuContainer,
    aiChatContainer,
    userInfoContainer,
    Accents,
    IS_COMPONENTS_V2,
};
