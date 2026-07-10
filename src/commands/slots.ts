import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { economy } from '../services/economySettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

const SLOTS = ['🍒', '🍋', '🍊', '🍇', '💎', '7️⃣', '⭐', '🔔'];
const PAYOUTS: Record<string, number> = {
    '7️⃣': 10, '💎': 8, '⭐': 6, '🔔': 5,
    '🍇': 4, '🍊': 3, '🍋': 2, '🍒': 1.5,
};

export const slotsCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Play the slot machine')
        .setDMPermission(false)
        .addIntegerOption(opt =>
            opt.setName('bet').setDescription('Amount to bet (min 50)').setRequired(true).setMinValue(50).setMaxValue(1_000_000)),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const bet = interaction.options.getInteger('bet', true);

        const { success } = await economy.removeCash(interaction.guildId!, interaction.user.id, bet);
        if (!success) {
            const bal = await economy.getBalance(interaction.guildId!, interaction.user.id);
            const c = ComponentsV2.errorContainer('Insufficient Funds', `You have **${bal.toLocaleString()}** coins but need **${bet.toLocaleString()}**.`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        const r1 = SLOTS[Math.floor(Math.random() * SLOTS.length)];
        const r2 = SLOTS[Math.floor(Math.random() * SLOTS.length)];
        const r3 = SLOTS[Math.floor(Math.random() * SLOTS.length)];

        let multiplier = 0;
        let result: string;

        if (r1 === r2 && r2 === r3) {
            multiplier = PAYOUTS[r1] || 3;
            result = 'JACKPOT! 🎉';
        } else if (r1 === r2 || r2 === r3 || r1 === r3) {
            multiplier = 1.5;
            result = 'Pair!';
        } else {
            result = 'No win';
        }

        const winnings = Math.floor(bet * multiplier);

        if (winnings > 0) {
            await economy.addCash(interaction.guildId!, interaction.user.id, winnings);
        }

        const c = ComponentsV2.baseContainer(multiplier >= 3 ? ComponentsV2.Accents.success : multiplier >= 1.5 ? ComponentsV2.Accents.warning : ComponentsV2.Accents.danger);
        c.addTextDisplayComponents(ComponentsV2.text(
            `## 🎰 Slots\n\n**${r1} | ${r2} | ${r3}**\n\n**${result}**\nBet: **${bet.toLocaleString()}** → ${winnings > 0 ? `Won **${winnings.toLocaleString()}**` : 'Lost'}\n${winnings > 0 ? `Profit: **+${(winnings - bet).toLocaleString()}**` : `Loss: **-${bet.toLocaleString()}**`}`
        ));
        await interaction.editReply({ components: [c], flags: V2 });
    },
};