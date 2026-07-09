import { ChannelType, AttachmentBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { Message } from 'discord.js';
import { config } from '../config.js';
import { supabase } from '../services/supabase.js';
import { groqAi } from '../services/groqAi.js';
import { victusAiActions } from '../services/victusAiActions.js';
import { checkAutoMod } from '../services/autoModHandler.js';
import type { Event } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { formatAiMessage } from '../utils/aiMessages.js';
import { handleTicketChannelMessage, mirrorAiReplyToTicket } from '../services/ticketBridge.js';
import { isChannelSummoned } from '../services/summonedChannels.js';
import { PrefixInteraction, translateV2Components } from '../utils/prefixInteraction.js';
import { checkCooldown } from '../middleware/rateLimit.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { buildFinalEmbedPayload } from '../commands/embed.js';
import { isNoprefixUser } from '../services/noprefixSettings.js';
import { addChatXp, getConfig as getLevelingConfig } from '../services/levelingSettings.js';
import { countingSettings } from '../services/countingSettings.js';
import { stickySettings, StickyMessage } from '../services/stickySettings.js';

const SETTINGS_TTL_MS = 20_000;
const MAX_QUEUE_DEPTH = 3;

const aiChannelCache = new Map<string, { channelId: string; expiresAt: number }>();

// Per-user serial queue: a message that arrives while the previous one is still
// being answered (slow free AI key) is queued and answered in order, instead of
// being silently dropped by a cooldown.
const userChains = new Map<string, Promise<unknown>>();
const userQueueDepth = new Map<string, number>();

function enqueuePerUser(userId: string, task: () => Promise<void>): boolean {
    const depth = userQueueDepth.get(userId) || 0;
    if (depth >= MAX_QUEUE_DEPTH) return false; // too many already pending; drop the overflow
    userQueueDepth.set(userId, depth + 1);
    const prev = userChains.get(userId) || Promise.resolve();
    const next = prev
        .then(task)
        .catch(() => { /* errors are handled inside the task */ })
        .finally(() => userQueueDepth.set(userId, Math.max(0, (userQueueDepth.get(userId) || 1) - 1)));
    userChains.set(userId, next);
    return true;
}

async function getAiChannelId(guildId: string): Promise<string> {
    const cached = aiChannelCache.get(guildId);
    if (cached && cached.expiresAt > Date.now()) return cached.channelId;

    const settings = await supabase.getBotSettings(guildId).catch(() => null);
    const channelId = settings?.ai_channel_id || config.bot.aiChannelId || '';
    aiChannelCache.set(guildId, {
        channelId,
        expiresAt: Date.now() + SETTINGS_TTL_MS,
    });

    return channelId;
}

function buildPromptFromMessage(message: Message): string {
    const content = message.content.trim();
    const attachments = [...message.attachments.values()]
        .slice(0, 5)
        .map((attachment) => `${attachment.name || 'attachment'} (${attachment.contentType || 'unknown type'})`)
        .join(', ');

    if (content && attachments) return `${content}\n\nAttachments: ${attachments}`;
    if (content) return content;
    if (attachments) return `The user sent attachments and may need support: ${attachments}`;
    return '';
}

// When the AI answers publicly inside a ticket channel (e.g. staff /summon-ed
// it), mirror the answer into the website ticket thread so the web user sees it.
async function mirrorPublicReply(message: Message, publicReply: boolean, text: string): Promise<void> {
    if (!publicReply || !message.inGuild() || !text) return;
    const botId = message.client.user?.id;
    if (!botId) return;
    await mirrorAiReplyToTicket(message.channelId, botId, text).catch(() => undefined);
}

async function replyWithAi(message: Message, prompt: string, publicReply: boolean, fallbackMessage: string): Promise<void> {
    try {
        if ('sendTyping' in message.channel) {
            await message.channel.sendTyping().catch(() => undefined);
        }

        const actionResult = await victusAiActions.tryHandle(prompt, {
            discordId: message.author.id,
            publicReply,
        });

        if (actionResult.handled) {
            let content = actionResult.content;
            if (publicReply && actionResult.dmContent) {
                const dmSent = await message.author.send({
                    content: formatAiMessage(actionResult.dmContent),
                }).then(() => true).catch(() => false);

                if (!dmSent) {
                    content = 'That is private account info, so DM me for the answer. I could not open DMs with you from here.';
                }
            }

            await message.reply({
                content: formatAiMessage(content),
                allowedMentions: { repliedUser: false },
            });
            await mirrorPublicReply(message, publicReply, content);
            return;
        }

        const linked = await supabase.getLinkedAccount(message.author.id).catch(() => null);
        const profile = linked ? await supabase.getUserProfile(linked.user_id).catch(() => null) : null;
        const answer = await groqAi.askVictus(prompt, {
            discordTag: message.author.tag,
            discordId: message.author.id,
            linked: !!linked,
            profile,
            publicReply,
        });

        await message.reply({
            content: formatAiMessage(answer),
            allowedMentions: { repliedUser: false },
        });
        await mirrorPublicReply(message, publicReply, answer);
    } catch (error) {
        logger.error(publicReply ? 'AI channel response failed:' : 'AI DM response failed:', error);
        await message.reply({
            content: fallbackMessage,
            allowedMentions: { repliedUser: false },
        }).catch(() => undefined);
    }
}

function formatDurationMs(ms: number): string {
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hrs}h ${remainingMins}m`;
}

export const messageCreateEvent: Event = {
    name: 'messageCreate',
    async execute(message: Message) {
        if (message.author.bot) return;

        // --- Auto-Moderation ---
        if (message.inGuild()) {
            const handled = await checkAutoMod(message).catch(() => false);
            if (handled) return;
        }

        // --- AFK System ---
        if (message.inGuild()) {
            const guildId = message.guildId!;
            
            // 1. Check if the message sender is returning from AFK
            try {
                const authorAfkEmbed = await supabase.getCustomEmbed(guildId, `_afk_${message.author.id}`);
                if (authorAfkEmbed?.description) {
                    const afkData = JSON.parse(authorAfkEmbed.description);
                    await supabase.deleteCustomEmbed(guildId, `_afk_${message.author.id}`);
                    
                    const durationMs = Date.now() - new Date(afkData.timestamp).getTime();
                    const durationStr = formatDurationMs(durationMs);
                    
                    let body = `<:Search:1524363077393317968> You are no longer AFK.\n\n` +
                        `› **You were AFK for:** ${durationStr}\n` +
                        `› **Reason:** ${afkData.reason || 'AFK'}\n\n`;

                    const loggedMentions = afkData.mentions || [];
                    if (loggedMentions.length > 0) {
                        const mentionList = loggedMentions
                            .map((m: any) => `› **${m.authorTag || m.username || m.tag || m.authorName || 'Unknown User'}** in <#${m.channelId}>: [Jump to Message](https://discord.com/channels/${guildId}/${m.channelId}/${m.messageId}) (<t:${Math.floor(new Date(m.timestamp).getTime() / 1000)}:R>)`)
                            .slice(0, 10)
                            .join('\n');
                        body += `### <:Edit:1524363079675154433> Mentions while you were AFK\n${mentionList}`;
                    } else {
                        body += `### <:Edit:1524363079675154433> Mentions while you were AFK\nNo one mentioned you while you were away.`;
                    }

                    const welcomeContainer = ComponentsV2.successContainer(
                        `Welcome back, ${message.author.username}!`,
                        body
                    );

                    await message.reply({
                        components: [welcomeContainer],
                        flags: [ComponentsV2.IS_COMPONENTS_V2]
                    }).catch(() => {});
                }
            } catch (err) {
                logger.error('Error handling sender AFK return:', err);
            }

            // 2. Check if the message mentions anyone who is AFK
            if (message.mentions.users.size > 0) {
                for (const [mentionedId, mentionedUser] of message.mentions.users) {
                    if (mentionedId === message.author.id || mentionedUser.bot) continue;
                    
                    try {
                        const targetAfkEmbed = await supabase.getCustomEmbed(guildId, `_afk_${mentionedId}`);
                        if (targetAfkEmbed?.description) {
                            const afkData = JSON.parse(targetAfkEmbed.description);
                            
                            // Send AFK notification in the channel
                            const afkContainer = ComponentsV2.infoContainer(
                                'AFK User Mentioned',
                                `<:Search:1524363077393317968> **${mentionedUser.username}** is currently AFK: **${afkData.reason || 'AFK'}** (<t:${Math.floor(new Date(afkData.timestamp).getTime() / 1000)}:R>)`
                            );
                            await message.reply({
                                components: [afkContainer],
                                flags: [ComponentsV2.IS_COMPONENTS_V2]
                            }).catch(() => {});

                            // Log the mention into their AFK data
                            const loggedMentions = afkData.mentions || [];
                            loggedMentions.push({
                                authorTag: message.author.tag || message.author.username,
                                username: message.author.username,
                                content: message.content.slice(0, 100),
                                channelId: message.channelId,
                                messageId: message.id,
                                timestamp: new Date().toISOString()
                            });
                            afkData.mentions = loggedMentions;

                            await supabase.saveCustomEmbed(guildId, `_afk_${mentionedId}`, {
                                description: JSON.stringify(afkData)
                            });
                        }
                    } catch (err) {
                        logger.error(`Error logging AFK mention for user ${mentionedId}:`, err);
                    }
                }
            }
        }

        // --- Counting Game ---
        if (message.inGuild()) {
            const countingConfig = await countingSettings.get(message.guildId!);
            if (countingConfig.enabled && countingConfig.channelId === message.channelId) {
                const number = parseInt(message.content);
                if (isNaN(number)) {
                    await message.delete().catch(() => {});
                    return;
                }
                if (number !== countingConfig.lastNumber + 1) {
                    await message.delete().catch(() => {});
                    const c = ComponentsV2.errorContainer(
                        'Wrong Number!',
                        `<@${message.author.id}> ruined the count! The next number should have been **${countingConfig.lastNumber + 1}**. Count reset to **0**.`
                    );
                    await message.channel.send({ components: [c], flags: ComponentsV2.IS_COMPONENTS_V2 }).catch(() => {});
                    await countingSettings.set(message.guildId!, { lastNumber: 0, lastUserId: null, count: 0 });
                    return;
                }
                if (message.author.id === countingConfig.lastUserId) {
                    await message.delete().catch(() => {});
                    const c = ComponentsV2.errorContainer(
                        'Wait Your Turn!',
                        `<@${message.author.id}> you can't count twice in a row! Count reset to **0**.`
                    );
                    await message.channel.send({ components: [c], flags: ComponentsV2.IS_COMPONENTS_V2 }).catch(() => {});
                    await countingSettings.set(message.guildId!, { lastNumber: 0, lastUserId: null, count: 0 });
                    return;
                }
                const reactions = ['🎉', '✅'];
                if (number % 100 === 0) await message.react('🎉').catch(() => {});
                if (number === 69) await message.react('😏').catch(() => {});
                await countingSettings.set(message.guildId!, { lastNumber: number, lastUserId: message.author.id, count: number });
            }
        }

        // --- Sticky Messages ---
        if (message.inGuild()) {
            const guildId = message.guildId!;
            const stickies = await stickySettings.getStickies(guildId);
            const sticky = stickies.find((s: StickyMessage) => s.channel === message.channelId && s.enabled);
            if (sticky) {
                if (sticky.messageId) {
                    try {
                        const old = await message.channel.messages.fetch(sticky.messageId).catch(() => null);
                        if (old) await old.delete().catch(() => {});
                    } catch {}
                }
                const sent = await message.channel.send({ content: sticky.content }).catch(() => null);
                if (sent) {
                    await stickySettings.updateMessageId(guildId, message.channelId, sent.id);
                }
            }
        }

        // --- Chat XP Tracking ---
        if (message.inGuild()) {
            const levelingConfig = getLevelingConfig(message.guildId!);
            if (levelingConfig.enabled) {
                if (levelingConfig.chatChannels.length === 0 || levelingConfig.chatChannels.includes(message.channelId)) {
                    const result = addChatXp(message.guildId!, message.author.id);
                    if (result.leveledUp && levelingConfig.announceChannel) {
                        const channel = message.guild?.channels.cache.get(levelingConfig.announceChannel);
                        if (channel?.isTextBased()) {
                            const c = ComponentsV2.baseContainer(ComponentsV2.Accents.success);
                            c.addTextDisplayComponents(ComponentsV2.text(
                                `<:Stars:1524363036389937212> Congratulations <@${message.author.id}>! You reached **chat level ${result.newLevel}**!`
                            ));
                            await (channel as any).send({ components: [c], flags: ComponentsV2.IS_COMPONENTS_V2 }).catch(() => {});
                        }
                    }
                }
            }
        }

        // Get guild specific prefix or default to '!'
        let prefix = '!';
        if (message.inGuild()) {
            const settings = await supabase.getBotSettings(message.guildId).catch(() => null);
            if (settings?.prefix) {
                prefix = settings.prefix;
            }
        }

        const botId = message.client.user?.id;
        const mentionPrefix = botId ? `<@${botId}>` : null;
        const mentionNickPrefix = botId ? `<@!${botId}>` : null;

        const content = message.content.trim();

        // --- Pure mention (just @VictusMC with no other text) ---
        if (message.inGuild() && botId && (content === `<@${botId}>` || content === `<@!${botId}>`)) {
            const c = ComponentsV2.baseContainer(ComponentsV2.Accents.primary);
            c.addMediaGalleryComponents(ComponentsV2.mediaGallery('https://cdn.discordapp.com/attachments/1416827980004724766/1523993256961118299/wmremove-transformed.png'));
            c.addTextDisplayComponents(
                ComponentsV2.text('## <:Wave:1524363100734623836> Hey there! I\'m VictusMC Bot\n\u200b'),
                ComponentsV2.text(
                    'Your all-in-one companion for the **VictusMC** Minecraft network.\n\n' +
                    '### <:Giveaway:1524363020250382437> What I Can Do\n' +
                    '› **Server Info** — Check status, player counts, and more\n' +
                    '› **Moderation** — Keep your server safe with auto-mod & anti-nuke\n' +
                    '› **Tickets** — Handle support requests seamlessly\n' +
                    '› **Music** — Play high-quality audio in voice channels\n' +
                    '› **Giveaways & Polls** — Engage your community\n' +
                    '› **Custom Layouts** — Design beautiful Components V2 panels\n\n' +
                    '### 📦 Quick Links\n' +
                    '› Use \`/help\` to explore all commands\n' +
                    '› Server IP: \`play.victusmc.net\`\n' +
                    '› We have **2 gamemodes**: **Lifesteal** & **PvP**\n\u200b'
                ),
                ComponentsV2.text('-# <:Stars:1524363036389937212> VictusMC • Premium Discord Bot')
            );
            c.addActionRowComponents(
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder().setLabel('Website').setStyle(ButtonStyle.Link).setURL('https://victusmc.net'),
                    new ButtonBuilder().setLabel('Commands').setStyle(ButtonStyle.Primary).setCustomId('help_mention'),
                    new ButtonBuilder().setLabel('Support').setStyle(ButtonStyle.Link).setURL('https://victusmc.net/discord')
                )
            );
            await message.reply({ components: [c], flags: ComponentsV2.IS_COMPONENTS_V2 }).catch(() => {});
            return;
        }

        // --- Emoji Upload Handler ---
        if (message.attachments.size > 0 || message.embeds.some(e => e.image || e.thumbnail)) {
            const pending = (await import('../commands/emoji.js')).pendingUploads.get(message.author.id);
            if (pending && pending.channelId === message.channelId) {
                const imageUrl = message.attachments.first()?.url || message.embeds.find(e => e.image)?.image?.url || message.embeds.find(e => e.thumbnail)?.thumbnail?.url;
                if (imageUrl) {
                    (await import('../commands/emoji.js')).pendingUploads.delete(message.author.id);
                    const guild = message.guild;
                    if (!guild) return;
                    try {
                        const response = await fetch(imageUrl);
                        const buffer = Buffer.from(await response.arrayBuffer());
                        const emoji = await guild.emojis.create({ attachment: buffer, name: pending.name });
                        const c = ComponentsV2.successContainer('<:Tick:1524363090626482326> Emoji Added',
                            `Successfully added **${emoji}** \`:${emoji.name}:\``);
                        await message.reply({ components: [c], flags: ComponentsV2.IS_COMPONENTS_V2 });
                    } catch (err: any) {
                        const reason = err.message?.includes('rate') ? 'Rate limited. Try again in a moment.'
                            : err.message?.includes('image') ? 'The image format is invalid or too large (max 256KB for static, 50KB for animated).'
                            : err.message || 'Unknown error.';
                        const c = ComponentsV2.errorContainer('<:Cross:1524363088621469737> Failed to Add Emoji', reason);
                        await message.reply({ components: [c], flags: ComponentsV2.IS_COMPONENTS_V2 });
                    }
                    return;
                }
            }
        }

        let isCommand = false;
        let commandPrefix = '';

        // Noprefix: check if the user is allowed to run commands without a prefix
        if (message.inGuild() && isNoprefixUser(message.guildId!, message.author.id) && !content.startsWith(prefix) && !content.startsWith(mentionPrefix || '') && !content.startsWith(mentionNickPrefix || '')) {
            const cmdName = content.split(/\s+/)[0]?.toLowerCase();
            if (cmdName && message.client.commands.has(cmdName)) {
                isCommand = true;
                commandPrefix = '';
            }
        }

        if (content.startsWith(prefix)) {
            isCommand = true;
            commandPrefix = prefix;
        } else if (mentionPrefix && content.startsWith(mentionPrefix)) {
            isCommand = true;
            commandPrefix = mentionPrefix;
        } else if (mentionNickPrefix && content.startsWith(mentionNickPrefix)) {
            isCommand = true;
            commandPrefix = mentionNickPrefix;
        }

        if (isCommand) {
            const rawArgs = content.slice(commandPrefix.length).trim();
            if (rawArgs.length > 0) {
                const args: string[] = [];
                const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
                let match;
                while ((match = regex.exec(rawArgs)) !== null) {
                    args.push(match[1] || match[2] || match[0]);
                }

                const commandName = args.shift()?.toLowerCase();
                if (commandName) {
                    // Check standard commands
                    const command = message.client.commands.get(commandName);
                    if (command) {
                        if (command.cooldown) {
                            const remaining = checkCooldown({ user: message.author } as any, commandName, command.cooldown);
                            if (remaining > 0) {
                                const container = ComponentsV2.warningContainer(
                                    'Slow Down!',
                                    `Please wait **${remaining}** second${remaining > 1 ? 's' : ''} before using this command again.`
                                );
                                await message.reply(translateV2Components({ components: [container], flags: ComponentsV2.IS_COMPONENTS_V2 })).catch(() => {});
                                return;
                            }
                        }

                        if (command.adminOnly) {
                            const isAdmin = await supabase.isUserAdmin(message.author.id).catch(() => false);
                            if (!isAdmin) {
                                const container = ComponentsV2.errorContainer(
                                    'Permission Denied',
                                    'This command is restricted to bot administrators.'
                                );
                                await message.reply(translateV2Components({ components: [container], flags: ComponentsV2.IS_COMPONENTS_V2 })).catch(() => {});
                                return;
                            }
                        }

                        try {
                            const prefixInteraction = new PrefixInteraction(message, commandName, args, command.data.toJSON());
                            logger.info(`Prefix Command: ${prefix}${commandName} by ${message.author.tag} (${message.author.id})`);
                            await command.execute(prefixInteraction as any);
                        } catch (error) {
                            logger.error(`Error running prefix command ${commandName}:`, error);
                            await message.reply('<:Exclamation:1524363098809569350> An error occurred while executing this command.').catch(() => {});
                        }
                        return;
                    }

                    // Check custom commands
                    if (message.inGuild()) {
                        const customCmd = await supabase.getCustomCommand(message.guildId, commandName);
                        if (customCmd && customCmd.enabled) {
                            if (customCmd.cooldown > 0) {
                                const remaining = checkCooldown({ user: message.author } as any, `custom:${commandName}`, customCmd.cooldown);
                                if (remaining > 0) {
                                    const container = ComponentsV2.warningContainer(
                                        'Slow Down!',
                                        `Please wait **${remaining}** second${remaining > 1 ? 's' : ''} before using this command again.`
                                    );
                                    await message.reply(translateV2Components({ components: [container], flags: ComponentsV2.IS_COMPONENTS_V2 })).catch(() => {});
                                    return;
                                }
                            }

                            if (customCmd.permissions && customCmd.permissions.length > 0) {
                                const member = message.member;
                                const hasRole = member?.roles.cache.some(role => customCmd.permissions.includes(role.id));
                                const isAdmin = member?.permissions.has(PermissionFlagsBits.Administrator);
                                if (!hasRole && !isAdmin) {
                                    const container = ComponentsV2.errorContainer(
                                        'Permission Denied',
                                        'You do not have the required roles to run this custom command.'
                                    );
                                    await message.reply(translateV2Components({ components: [container], flags: ComponentsV2.IS_COMPONENTS_V2 })).catch(() => {});
                                    return;
                                }
                            }

                            let replyText = customCmd.reply_content;
                            const variableMap: Record<string, string> = {
                                '{user}': `<@${message.author.id}>`,
                                '{user.name}': message.author.username,
                                '{user.id}': message.author.id,
                                '{guild}': message.guild?.name || 'this server',
                                '{channel}': `<#${message.channelId}>`,
                            };

                            for (const [vKey, vVal] of Object.entries(variableMap)) {
                                replyText = replyText.replace(new RegExp(vKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), vVal);
                            }

                            if (customCmd.reply_type === 'text') {
                                await message.reply({ content: replyText }).catch(() => {});
                            } else if (customCmd.reply_type === 'embed') {
                                try {
                                    let embedPayload;
                                    try {
                                        embedPayload = JSON.parse(replyText);
                                    } catch {
                                        embedPayload = { components: [ComponentsV2.infoContainer(customCmd.name, replyText)], flags: ComponentsV2.IS_COMPONENTS_V2 };
                                    }
                                    await message.reply(embedPayload).catch(() => {});
                                } catch {
                                    await message.reply({ content: replyText }).catch(() => {});
                                }
                            } else if (customCmd.reply_type === 'custom_embed') {
                                try {
                                    const embed = await supabase.getCustomEmbed(message.guildId!, replyText);
                                    if (embed) {
                                        const payload = buildFinalEmbedPayload(embed);
                                        await message.reply({ components: [payload], flags: ComponentsV2.IS_COMPONENTS_V2 }).catch(() => {});
                                    } else {
                                        await message.reply({ content: `<:Cross:1524363088621469737> Linked custom embed template **\`${replyText}\`** not found.` }).catch(() => {});
                                    }
                                } catch (error) {
                                    logger.error('Failed to send custom command embed:', error);
                                    await message.reply({ content: '<:Exclamation:1524363098809569350> Failed to load the custom embed response.' }).catch(() => {});
                                }
                            } else if (customCmd.reply_type === 'image') {
                                await message.reply({ files: [new AttachmentBuilder(replyText)] }).catch(() => {});
                            } else if (customCmd.reply_type === 'message') {
                                await message.reply({ content: replyText }).catch(() => {});
                            }
                            return;
                        }
                    }
                }
            }
        }

        const summoned = message.inGuild() ? isChannelSummoned(message.channelId) : false;

        // Mirror messages in ticket channels to the website ticket (runs even if
        // the AI is disabled). Normally that's the end of it — but if staff have
        // /summon-ed this channel, fall through so the AI also answers.
        const ticketHandled = await handleTicketChannelMessage(message);
        if (ticketHandled && !summoned) return;

        if (!groqAi.isEnabled()) return;

        if (message.channel.type === ChannelType.DM) {
            const prompt = buildPromptFromMessage(message);
            if (prompt.length < 3) return;

            enqueuePerUser(message.author.id, () => replyWithAi(
                message,
                prompt,
                false,
                'VictusMC AI could not answer your DM right now. Please try again in a moment or open a support ticket.'
            ));
            return;
        }

        if (!message.inGuild()) return;

        // The AI answers in a guild channel when ANY of these is true:
        //  - the bot is directly @mentioned (works in any channel, configured or not)
        //  - the channel has been /summon-ed by staff
        //  - it's the configured AI support channel
        const isMentioned = !!botId && message.mentions.users.has(botId);
        const aiChannelId = await getAiChannelId(message.guildId);
        const isAiChannel = !!aiChannelId && message.channelId === aiChannelId;

        if (!isMentioned && !summoned && !isAiChannel) return;

        let prompt = buildPromptFromMessage(message);
        // Strip the bot mention so the AI doesn't see a raw "<@id>" token.
        if (isMentioned && botId) {
            prompt = prompt.replace(new RegExp(`<@!?${botId}>`, 'g'), '').trim();
        }
        if (prompt.length < 3) return;

        enqueuePerUser(message.author.id, () => replyWithAi(
            message,
            prompt,
            true,
            'VictusMC AI could not answer this message right now. A staff member can still help here.'
        ));
    },
};
