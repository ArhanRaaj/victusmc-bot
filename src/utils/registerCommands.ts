import { REST, Routes } from 'discord.js';
import { config } from '../config.js';
import { getCommandData } from '../commands/index.js';
import { logger } from './logger.js';

/**
 * Sync slash commands with Discord.
 *
 * Registers commands GLOBALLY (so every server the bot is in gets the
 * commands). A guild ID override can be set for development/testing to
 * avoid global propagation delay.
 */
export async function registerApplicationCommands(source = 'startup'): Promise<void> {
    const rest = new REST({ version: '10' }).setToken(config.discord.token);
    const commandData = getCommandData();

    logger.info(`Syncing ${commandData.length} Discord slash commands (${source})...`);

    // Register to a specific guild (dev mode) — faster, no global propagation delay
    if (config.discord.guildId) {
        try {
            await rest.put(
                Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
                { body: commandData },
            );
            logger.info(`✅ Synced ${commandData.length} slash commands to guild ${config.discord.guildId}.`);
            return;
        } catch (error) {
            logger.error(`❌ Guild slash command sync failed for ${config.discord.guildId}:`, error);
        }
    }

    // Register globally (production) — all servers get commands, propagation takes ~1h for NEW commands
    try {
        await rest.put(Routes.applicationCommands(config.discord.clientId), { body: commandData });
        logger.info(`✅ Synced ${commandData.length} slash commands globally.`);
    } catch (error) {
        logger.error('❌ Global slash command sync failed:', error);
    }
}
