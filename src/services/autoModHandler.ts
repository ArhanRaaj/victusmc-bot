import { Message, TextChannel, PermissionFlagsBits } from 'discord.js';
import { autoModSettings, AutoModRule, isScamLink, isInviteLink, getCapsPercentage, countMentions, countEmojis, containsBadWords, isAdvertisement } from './autoModSettings.js';
import { supabase } from './supabase.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { logger } from '../utils/logger.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

interface RateLimitEntry {
    count: number;
    timestamps: number[];
    lastMessage?: string;
}

const RATE_WINDOW_MS = 5000;
const spamTracker = new Map<string, RateLimitEntry>();
const duplicateTracker = new Map<string, { count: number; lastContent: string }>();

function isWhitelisted(message: Message, rule: AutoModRule): boolean {
    if (!message.inGuild() || !message.member) return false;
    if (message.member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (rule.whitelistRoleIds.some(r => message.member!.roles.cache.has(r))) return true;
    if (rule.whitelistChannelIds.includes(message.channelId)) return true;
    return false;
}

async function applyPunishment(message: Message, rule: AutoModRule, reason: string) {
    if (!message.inGuild() || !message.member) return;

    if (rule.punishment === 'delete' || rule.punishment === 'warn') {
        await message.delete().catch(() => {});
    }

    if (rule.punishment === 'timeout') {
        const duration = (rule.duration || 60) * 1000;
        await message.member.timeout(duration, `Auto-Mod: ${reason}`).catch(() => {});
    }

    if (rule.punishment === 'kick') {
        await message.member.kick(`Auto-Mod: ${reason}`).catch(() => {});
    }

    if (rule.punishment === 'ban') {
        await message.member.ban({ reason: `Auto-Mod: ${reason}` }).catch(() => {});
    }

    const config = await autoModSettings.get(message.guildId!);
    if (config.logChannelId) {
        const logChannel = message.guild.channels.cache.get(config.logChannelId) as TextChannel | undefined;
        if (logChannel) {
            const container = ComponentsV2.warningContainer(
                '<:Shield:1524362964772196422> Auto-Mod Action',
                `**Rule:** ${rule.type}\n**User:** ${message.author.tag} (<@${message.author.id}>)\n**Action:** ${rule.punishment}\n**Reason:** ${reason}\n**Channel:** <#${message.channelId}>`
            );
            logChannel.send({ components: [container], flags: V2 }).catch(() => {});
        }
    }
}

export async function checkAutoMod(message: Message): Promise<boolean> {
    if (!message.inGuild() || !message.member) return false;
    if (message.author.bot) return false;

    const config = await autoModSettings.get(message.guildId!);
    if (!config.enabled) return false;

    const content = message.content;
    if (!content) return false;

    for (const rule of config.rules) {
        if (!rule.enabled) continue;
        if (isWhitelisted(message, rule)) continue;

        try {
            switch (rule.type) {
                case 'spam': {
                    const key = `${message.author.id}:${message.guildId}`;
                    const now = Date.now();
                    let entry = spamTracker.get(key);
                    if (!entry) {
                        entry = { count: 0, timestamps: [] };
                        spamTracker.set(key, entry);
                    }
                    entry.timestamps = entry.timestamps.filter(t => now - t < RATE_WINDOW_MS);
                    entry.timestamps.push(now);
                    entry.count = entry.timestamps.length;
                    if (entry.count >= (rule.threshold || 5)) {
                        await applyPunishment(message, rule, 'Spam detected');
                        spamTracker.delete(key);
                        return true;
                    }
                    break;
                }

                case 'invites': {
                    if (isInviteLink(content)) {
                        await applyPunishment(message, rule, 'Discord invite link');
                        return true;
                    }
                    break;
                }

                case 'scam': {
                    if (isScamLink(content)) {
                        await applyPunishment(message, rule, 'Scam link detected');
                        return true;
                    }
                    break;
                }

                case 'mention_spam': {
                    const mentions = countMentions(content);
                    if (mentions >= (rule.threshold || 5)) {
                        await applyPunishment(message, rule, 'Excessive mentions');
                        return true;
                    }
                    break;
                }

                case 'emoji_spam': {
                    const emojis = countEmojis(content);
                    if (emojis >= (rule.threshold || 10)) {
                        await applyPunishment(message, rule, 'Excessive emojis');
                        return true;
                    }
                    break;
                }

                case 'caps': {
                    const pct = getCapsPercentage(content);
                    if (pct >= (rule.threshold || 70) && content.length > 10) {
                        await applyPunishment(message, rule, 'Excessive caps');
                        return true;
                    }
                    break;
                }

                case 'bad_words': {
                    if (containsBadWords(content)) {
                        await applyPunishment(message, rule, 'Inappropriate language');
                        return true;
                    }
                    break;
                }

                case 'duplicate': {
                    const key = `${message.author.id}:${message.channelId}`;
                    let entry = duplicateTracker.get(key);
                    if (!entry) {
                        entry = { count: 0, lastContent: '' };
                        duplicateTracker.set(key, entry);
                    }
                    if (content === entry.lastContent) {
                        entry.count++;
                        if (entry.count >= (rule.threshold || 3)) {
                            await applyPunishment(message, rule, 'Duplicate message spam');
                            duplicateTracker.delete(key);
                            return true;
                        }
                    } else {
                        entry.count = 1;
                        entry.lastContent = content;
                    }
                    break;
                }

                case 'advertisement': {
                    if (isAdvertisement(content)) {
                        await applyPunishment(message, rule, 'Advertisement detected');
                        return true;
                    }
                    break;
                }
            }
        } catch (error) {
            logger.error(`Auto-mod rule ${rule.type} failed:`, error);
        }
    }

    return false;
}

setInterval(() => {
    const cutoff = Date.now() - RATE_WINDOW_MS * 2;
    for (const [key, entry] of spamTracker) {
        entry.timestamps = entry.timestamps.filter(t => t > cutoff);
        if (entry.timestamps.length === 0) spamTracker.delete(key);
    }
    duplicateTracker.clear();
}, 30000);
