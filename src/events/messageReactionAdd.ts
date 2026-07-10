import { Events } from 'discord.js';
import type { MessageReaction, User } from 'discord.js';
import type { Event } from '../types/index.js';
import { starboardService } from '../services/starboardSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const messageReactionAddEvent: Event = {
    name: Events.MessageReactionAdd,
    async execute(reaction: MessageReaction, user: User) {
        if (user.bot || !reaction.message.guildId) return;

        const cfg = await starboardService.getConfig(reaction.message.guildId);
        if (!cfg.enabled || reaction.emoji.name !== cfg.emoji) return;

        const starChannel = reaction.message.guild?.channels.cache.get(cfg.channelId);
        if (!starChannel?.isTextBased()) return;

        const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
        if (!message.content && message.attachments.size === 0) return;

        const guildId = message.guildId!;
        const count = reaction.count || 1;
        if (count < cfg.minReactions) return;

        const starred = await starboardService.getStarred(guildId);
        const existing = starred.find(s => s.messageId === message.id);

        if (existing) {
            await starboardService.updateStarred(guildId, message.id, count);
            const starMsg = await starChannel.messages.fetch(existing.starboardMessageId).catch(() => null);
            if (starMsg) {
                const c = ComponentsV2.baseContainer(ComponentsV2.Accents.warning);
                c.addTextDisplayComponents(ComponentsV2.text(
                    `## ${cfg.emoji} **${count}** | <#${message.channelId}>\n\n${message.content?.slice(0, 1000) || ''}\n\n-# by <@${message.author.id}>`
                ));
                if (message.attachments.size > 0) {
                    const att = message.attachments.first()!;
                    c.addMediaGalleryComponents(ComponentsV2.mediaGallery(att.url));
                }
                await starMsg.edit({ components: [c], flags: V2 }).catch(() => {});
            }
            return;
        }

        const c = ComponentsV2.baseContainer(ComponentsV2.Accents.warning);
        c.addTextDisplayComponents(ComponentsV2.text(
            `## ${cfg.emoji} **${count}** | <#${message.channelId}>\n\n${message.content?.slice(0, 1000) || ''}\n\n-# by <@${message.author.id}>`
        ));
        if (message.attachments.size > 0) {
            const att = message.attachments.first()!;
            c.addMediaGalleryComponents(ComponentsV2.mediaGallery(att.url));
        }

        const sent = await starChannel.send({ components: [c], flags: V2 }).catch(() => null);
        if (sent) {
            await starboardService.addStarred(guildId, {
                messageId: message.id,
                channelId: message.channelId,
                starboardMessageId: sent.id,
                count,
            });
        }
    },
};