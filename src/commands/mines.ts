import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { economy } from '../services/economySettings.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;
const GRID_SIZE = 9;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
const MINE_COUNT = 3;
const WIN_MULTIPLIER = 1.5;

interface MinesGame {
    userId: string;
    guildId: string;
    bet: number;
    mines: Set<number>;
    revealed: Set<number>;
    gameOver: boolean;
    won: boolean;
    reward: number;
}

const activeGames = new Map<string, MinesGame>();

function gameKey(userId: string, guildId: string): string {
    return `${guildId}:${userId}`;
}

export const minesCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('mines')
        .setDescription('Play Mines — reveal safe tiles to win cash')
        .setDMPermission(false)
        .addIntegerOption(o =>
            o.setName('bet')
                .setDescription('Amount to bet')
                .setRequired(true)
                .setMinValue(50)
                .setMaxValue(100000)
        ),

    async execute(interaction) {
        const guildId = interaction.guildId!;
        const userId = interaction.user.id;
        const bet = interaction.options.getInteger('bet', true);

        const key = gameKey(userId, guildId);
        if (activeGames.has(key)) {
            const c = ComponentsV2.warningContainer('<:Exclamation:1524363098809569350> Game In Progress',
                'You already have an active Mines game. Finish it first!');
            await interaction.reply({ components: [c], flags: V2 });
            return;
        }

        const balance = await economy.getBalance(guildId, userId);
        if (balance < bet) {
            const c = ComponentsV2.errorContainer('<:Cross:1524363088621469737> Insufficient Cash',
                `You need **$${bet.toLocaleString()}** but only have **$${balance.toLocaleString()}**.\n\nUse \`/daily\` to earn more cash!`);
            await interaction.reply({ components: [c], flags: V2 });
            return;
        }

        const result = await economy.removeCash(guildId, userId, bet);
        if (!result.success) {
            const c = ComponentsV2.errorContainer('<:Cross:1524363088621469737> Bet Failed', 'Could not place your bet.');
            await interaction.reply({ components: [c], flags: V2 });
            return;
        }

        const mines = new Set<number>();
        while (mines.size < MINE_COUNT) {
            const pos = Math.floor(Math.random() * TOTAL_CELLS);
            mines.add(pos);
        }

        const game: MinesGame = {
            userId,
            guildId,
            bet,
            mines,
            revealed: new Set<number>(),
            gameOver: false,
            won: false,
            reward: Math.floor(bet * WIN_MULTIPLIER),
        };

        activeGames.set(key, game);

        const c = buildMinesContainer(game);
        await interaction.reply({ components: [c], flags: V2 });
    },

    async handleButton(interaction) {
        if (!interaction.customId.startsWith('mines:')) return;

        const guildId = interaction.guildId!;
        const userId = interaction.user.id;
        const parts = interaction.customId.split(':');
        const action = parts[1];

        if (action === 'cashout') {
            const key = gameKey(userId, guildId);
            const game = activeGames.get(key);
            if (!game || game.gameOver) {
                await interaction.deferUpdate();
                return;
            }

            game.gameOver = true;
            game.won = true;

            const finalBalance = await economy.addCash(guildId, userId, game.reward);
            activeGames.delete(key);

            const c = ComponentsV2.successContainer('<:Diamond:1524363027711918110> Cashed Out!',
                `You cashed out **$${game.reward.toLocaleString()}**!\n\n**Final Balance:** $${finalBalance.toLocaleString()}\n\n**Safe tiles revealed:** ${game.revealed.size}/${TOTAL_CELLS - MINE_COUNT}`);
            await interaction.update({ components: [c] });
            return;
        }

        if (action === 'reveal') {
            const cellIdx = parseInt(parts[2], 10);
            if (isNaN(cellIdx)) return;

            const key = gameKey(userId, guildId);
            const game = activeGames.get(key);
            if (!game || game.gameOver) return;
            if (game.revealed.has(cellIdx)) {
                await interaction.deferUpdate();
                return;
            }

            game.revealed.add(cellIdx);

            if (game.mines.has(cellIdx)) {
                game.gameOver = true;
                game.won = false;
                activeGames.delete(key);

                const c = ComponentsV2.errorContainer('<:Thunder:1524362985647247420> You Hit a Mine!',
                    `**Bet lost:** $${game.bet.toLocaleString()}\n\nYou hit a mine on tile **${cellIdx + 1}**. Better luck next time!`);
                await interaction.update({ components: [c] });
                return;
            }

            const safeCount = game.revealed.size;
            const totalSafe = TOTAL_CELLS - MINE_COUNT;

            if (safeCount >= totalSafe) {
                game.gameOver = true;
                game.won = true;
                const finalBalance = await economy.addCash(guildId, userId, game.reward);
                activeGames.delete(key);

                const c = ComponentsV2.successContainer('<:Stars:1524363036389937212> You Won Mines!',
                    `You revealed all safe tiles!\n\n**Won:** $${game.reward.toLocaleString()}\n**Final Balance:** $${finalBalance.toLocaleString()}`);
                await interaction.update({ components: [c] });
                return;
            }

            const c = buildMinesContainer(game);
            await interaction.update({ components: [c] });
        }
    },
};

function buildMinesContainer(game: MinesGame): ContainerBuilder {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    for (let r = 0; r < GRID_SIZE; r++) {
        const row = new ActionRowBuilder<ButtonBuilder>();
        for (let c = 0; c < GRID_SIZE; c++) {
            const idx = r * GRID_SIZE + c;
            const btn = new ButtonBuilder().setCustomId(`mines:reveal:${idx}`);

            if (game.gameOver) {
                if (game.mines.has(idx)) {
                    btn.setLabel('<:Ban:1524363011291222086>').setStyle(ButtonStyle.Danger);
                } else if (game.revealed.has(idx)) {
                    btn.setLabel('<:Diamond:1524363027711918110>').setStyle(ButtonStyle.Success);
                } else {
                    btn.setLabel('<:Cross:1524363088621469737>').setStyle(ButtonStyle.Secondary).setDisabled(true);
                }
            } else if (game.revealed.has(idx)) {
                btn.setLabel('<:Diamond:1524363027711918110>').setStyle(ButtonStyle.Success).setDisabled(true);
            } else {
                btn.setLabel('<:Cross:1524363088621469737>').setStyle(ButtonStyle.Secondary);
            }

            row.addComponents(btn);
        }
        rows.push(row);
    }

    const infoText =
        `# <:Ban:1524363011291222086> Mines\n\n` +
        `**Bet:** $${game.bet.toLocaleString()} | **Mines:** ${MINE_COUNT} | **Grid:** ${GRID_SIZE}×${GRID_SIZE}\n\n` +
        `**Revealed:** ${game.revealed.size}/${TOTAL_CELLS - MINE_COUNT} safe tiles\n` +
        `**Cashout Value:** $${game.reward.toLocaleString()}\n\n` +
        `Click tiles to reveal. Avoid the <:Ban:1524363011291222086> mines!`;

    if (!game.gameOver) {
        const cashoutRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`mines:cashout`)
                .setLabel(`Cash Out $${game.reward.toLocaleString()}`)
                .setStyle(ButtonStyle.Success)
        );
        rows.push(cashoutRow);
    }

    const container = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
    container.addTextDisplayComponents(ComponentsV2.text(infoText));
    for (const row of rows) {
        container.addActionRowComponents(row);
    }

    return container;
}
