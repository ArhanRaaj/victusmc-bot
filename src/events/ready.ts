import { ActivityType, Client } from 'discord.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { assignLinkedRole } from '../utils/roles.js';
import { supabase } from '../services/supabase.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { sendAuditLog, sendNotificationDM } from '../utils/auditing.js';
import type { Event } from '../types/index.js';
import { registerApplicationCommands } from '../utils/registerCommands.js';
import { initTicketBridge } from '../services/ticketBridge.js';
import { startUptimeHeartbeat } from '../services/uptimeHeartbeat.js';
import { initializeFonts } from 'musicard';
import { startGiveawayScheduler } from '../commands/giveaway.js';
import { startVoiceXpInterval } from './voiceStateUpdate.js';
import { reminderService } from '../services/reminderSettings.js';
import { birthdayService } from '../services/birthdaySettings.js';

let dmQueueProcessing = false;

async function processAdminDmQueue(client: Client<true>) {
    if (dmQueueProcessing) return;
    dmQueueProcessing = true;

    try {
        const queuedMessages = await supabase.getPendingDiscordDms(10);
        for (const queued of queuedMessages) {
            const job = await supabase.claimDiscordDm(queued.id);
            if (!job) continue;

            try {
                const target = await client.users.fetch(job.discord_id).catch(() => null);
                if (!target) throw new Error(`Could not fetch Discord user ${job.discord_id}`);

                await target.send({
                    components: [ComponentsV2.adminDmContainer(job.subject, job.message, job.admin_email)],
                    flags: ComponentsV2.IS_COMPONENTS_V2,
                });

                await supabase.markDiscordDmSent(job.id);
                logger.info(`Admin Discord DM sent to ${target.tag} (${job.discord_id})`);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown Discord DM delivery failure';
                await supabase.markDiscordDmFailed(job.id, message);
                logger.warn(`Admin Discord DM failed for ${job.discord_id}: ${message}`);
            }
        }
    } catch (error) {
        logger.error('Discord DM queue processor failed:', error);
    } finally {
        dmQueueProcessing = false;
    }
}

export const readyEvent: Event = {
    name: 'clientReady',
    once: true,
    async execute(client: Client<true>) {
        logger.info(`Logged in as ${client.user.tag}`);

        // Initialize musicard fonts
        try {
            initializeFonts();
        } catch (err) {
            logger.error('Failed to initialize musicard fonts:', err);
        }
        logger.info(`Serving ${client.guilds.cache.size} guilds`);

        // Connect to the Lavalink music node now that the gateway is ready.
        try {
            await client.lavalink.init({ id: client.user.id, username: client.user.username });
            logger.info('🎵 Lavalink manager initialized');
        } catch (error) {
            logger.error('🎵 Lavalink init failed:', error);
        }

        if (config.bot.autoRegisterCommands) {
            await registerApplicationCommands('bot startup').catch((error) => {
                logger.error('Startup slash command sync failed:', error);
            });
        }

        logger.info('Setting up Supabase Realtime subscription...');
        supabase.subscribeToLinks(async (payload) => {
            logger.info('Realtime account link event received:', JSON.stringify(payload, null, 2));
            const { discord_id } = payload.new;

            const roleSuccess = await assignLinkedRole(client, discord_id);

            const dmContainer = ComponentsV2.successContainer(
                'Account Successfully Linked',
                'Your Discord account has been linked to VictusMC.\n\n' +
                'You now have access to account-aware commands.\n' +
                '› Use `/help` to explore the command center.'
            );
            await sendNotificationDM(client, discord_id, dmContainer, 'security');

            const supportGuildId = config.bot.supportGuildId;
            if (supportGuildId) {
                await sendAuditLog(
                    client,
                    supportGuildId,
                    'Account Linked (Realtime)',
                    `User ID: \`${discord_id}\`\n` +
                    `Status: ${roleSuccess ? 'Role assigned' : 'User not in server or role missing'}\n` +
                    `Action: Linked via website`,
                    ComponentsV2.Accents.success
                );
            }
        });

        // Bridge website tickets <-> Discord ticket channels.
        initTicketBridge(client);

        // Keep the Uptime Kuma "Discord Bot" push monitor green.
        startUptimeHeartbeat(client);

        // Start background giveaway ends_at checks scheduler
        startGiveawayScheduler(client);

        // Start voice XP interval (every 60 seconds)
        startVoiceXpInterval(client);

        await processAdminDmQueue(client);
        setInterval(() => {
            processAdminDmQueue(client).catch((error) => logger.error('DM queue interval failed:', error));
        }, 15000);

        // Reminder checker
        setInterval(async () => {
            for (const guild of client.guilds.cache.values()) {
                const due = await reminderService.getDue(guild.id);
                for (const { index, reminder } of due) {
                    const user = await client.users.fetch(reminder.userId).catch(() => null);
                    if (!user) continue;
                    if (reminder.channelId) {
                        const channel = guild.channels.cache.get(reminder.channelId);
                        if (channel?.isTextBased()) {
                            await channel.send({ content: `<@${reminder.userId}> ⏰ Reminder: ${reminder.message}` }).catch(() => {});
                        }
                    } else {
                        await user.send({ content: `⏰ Reminder: ${reminder.message}` }).catch(() => {});
                    }
                    await reminderService.markReminded(guild.id, index);
                }
            }
        }, 15000);

        // Birthday checker
        let lastBirthdayDate = '';
        setInterval(async () => {
            const today = new Date();
            const dateStr = `${today.getMonth() + 1}-${today.getDate()}`;
            if (dateStr === lastBirthdayDate) return;
            lastBirthdayDate = dateStr;

            for (const guild of client.guilds.cache.values()) {
                const cfg = await birthdayService.getConfig(guild.id);
                if (!cfg.enabled || !cfg.channelId) continue;
                const birthdays = await birthdayService.getTodaysBirthdays(guild.id);
                if (birthdays.length === 0) continue;
                const channel = guild.channels.cache.get(cfg.channelId);
                if (!channel?.isTextBased()) continue;
                const mentions = birthdays.map(b => `<@${b.userId}>`).join(', ');
                const roleMention = cfg.roleId ? `<@&${cfg.roleId}>` : '';

                const { ComponentsV2 } = await import('../embeds/componentsV2.js');
                const c = ComponentsV2.baseContainer(ComponentsV2.Accents.success);
                c.addTextDisplayComponents(ComponentsV2.text(
                    `## 🎂 Birthday${birthdays.length > 1 ? 's' : ''} Today!\n\n${mentions}\n\nHappy birthday! 🎉🎉\n\n${roleMention}`
                ));
                await channel.send({ components: [c], flags: ComponentsV2.IS_COMPONENTS_V2 }).catch(() => {});
            }
        }, 3600000); // every hour

        client.user.setPresence({
            status: 'online',
            activities: [
                {
                    name: `${config.branding.name} | /help`,
                    type: ActivityType.Watching,
                },
            ],
        });

        const activities = [
            { name: `${config.branding.name} | /help`, type: ActivityType.Watching },
            { name: 'the VictusMC community', type: ActivityType.Watching },
            { name: '/help for commands', type: ActivityType.Playing },
            { name: 'for rule breakers', type: ActivityType.Listening },
        ];

        let i = 0;
        setInterval(() => {
            client.user.setActivity(activities[i].name, { type: activities[i].type as ActivityType });
            i = (i + 1) % activities.length;
        }, 30000);
    },
};
