import { Client, Collection } from 'discord.js';
import type { Command } from '../types/index.js';
import { logger } from '../utils/logger.js';

// Import commands
import { helpCommand } from './help.js';
import { configCommand } from './config.js';
import { ticketCommand } from './ticket.js';
import { announceCommand } from './announce.js';
import { prefixCommand, setprefixCommand } from './prefix.js';
import { embedCommand, embedListActionButtons, embedLinksRouter } from './embed.js';
import { suggestCommand, suggestionCommand } from './suggest.js';
import { giveawayCommand } from './giveaway.js';
import { customcmdCommand } from './customcmd.js';
import { welcomeCommand } from './welcome.js';
import { staffAppCommand } from './staff-app.js';
import { j2cCommand } from './j2c.js';
import { warnCommand } from './warn.js';
import { dmCommand } from './dm.js';
import { playlistCommand } from './playlist.js';
import { afkCommand } from './afk.js';
import { purgeCommand } from './purge.js';
import { kickCommand } from './kick.js';
import { banCommand } from './ban.js';
import { timeoutCommand } from './timeout.js';
import { pollCommand } from './poll.js';
import { auditLogCommand } from './auditLog.js';
import { reactRolesCommand } from './reactroles.js';
import { unbanCommand } from './unban.js';
import { untimeoutCommand } from './untimeout.js';
import { whitelistCommand } from './whitelist.js';
import { antiNukeCommand } from './antinuke.js';
import { autoModCommand } from './automod.js';
import { minecraftCommand } from './minecraft.js';
import { funCommand } from './fun.js';
import { eightballCommand } from './8ball.js';
import { coinflipCommand } from './coinflip.js';
import { diceCommand } from './dice.js';
import { rateCommand } from './rate.js';
import { shipCommand } from './ship.js';
import { balCommand } from './bal.js';
import { dailyCommand } from './daily.js';
import { minesCommand } from './mines.js';
import { avatarCommand } from './avatar.js';
import { userinfoCommand } from './userinfo.js';
import { serverinfoCommand } from './serverinfo.js';
import { emojiCommand } from './emoji.js';
import { noprefixCommand } from './noprefix.js';
import { musicCommands } from './music/index.js';
import { levelingCommand, levelCommand } from './leveling.js';
import { staffCommand } from './staff.js';
import { attendanceCommand, attendanceLogCommand } from './attendance.js';
import { modCommand } from './mod.js';

// Export command collection
export const commands = new Collection<string, Command>();

// Register all commands
const allCommands: Command[] = [
    helpCommand,
    configCommand,
    ticketCommand,
    announceCommand,
    prefixCommand,
    setprefixCommand,
    embedCommand,
    embedListActionButtons,
    embedLinksRouter,
    suggestCommand,
    suggestionCommand,
    giveawayCommand,
    customcmdCommand,
    welcomeCommand,
    staffAppCommand,
    j2cCommand,
    warnCommand,
    dmCommand,
    playlistCommand,
    afkCommand,
    purgeCommand,
    kickCommand,
    banCommand,
    timeoutCommand,
    pollCommand,
    auditLogCommand,
    reactRolesCommand,
    unbanCommand,
    untimeoutCommand,
    whitelistCommand,
    antiNukeCommand,
    autoModCommand,
    minecraftCommand,
    funCommand,
    eightballCommand,
    coinflipCommand,
    diceCommand,
    rateCommand,
    shipCommand,
    balCommand,
    dailyCommand,
    minesCommand,
    avatarCommand,
    userinfoCommand,
    serverinfoCommand,
    emojiCommand,
    noprefixCommand,
    levelingCommand,
    levelCommand,
    staffCommand,
    attendanceCommand,
    attendanceLogCommand,
    modCommand,
    ...musicCommands,
];

for (const command of allCommands) {
    commands.set(command.data.name, command);
}

/**
 * Load commands into the client
 */
export async function loadCommands(client: Client): Promise<void> {
    for (const [name, command] of commands) {
        client.commands.set(name, command);
        logger.debug(`Loaded command: ${name}`);
    }
}

/**
 * Get all command data for registration
 */
export function getCommandData() {
    return allCommands
        .filter((cmd) => !cmd.data.name.startsWith('_'))
        .map((cmd) => cmd.data.toJSON());
}
