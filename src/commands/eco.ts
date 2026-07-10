import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types/index.js';
import { economy } from '../services/economySettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const ecoCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('eco')
        .setDescription('Economy management')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('give').setDescription('Give coins to a user')
                .addUserOption(opt => opt.setName('user').setRequired(true))
                .addIntegerOption(opt => opt.setName('amount').setRequired(true).setMinValue(1))
        )
        .addSubcommand(sub =>
            sub.setName('remove').setDescription('Remove coins from a user')
                .addUserOption(opt => opt.setName('user').setRequired(true))
                .addIntegerOption(opt => opt.setName('amount').setRequired(true).setMinValue(1))
        )
        .addSubcommand(sub =>
            sub.setName('set').setDescription('Set a user\'s balance')
                .addUserOption(opt => opt.setName('user').setRequired(true))
                .addIntegerOption(opt => opt.setName('amount').setRequired(true).setMinValue(0))
        )
        .addSubcommand(sub =>
            sub.setName('balance').setDescription('View any user\'s balance')
                .addUserOption(opt => opt.setName('user').setRequired(true))
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const sub = interaction.options.getSubcommand();
        const target = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount');

        if (sub === 'give') {
            await economy.addCash(interaction.guildId!, target.id, amount!);
            const c = ComponentsV2.successContainer('Coins Added',
                `Gave **${amount!.toLocaleString()}** coins to ${target.tag}.`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'remove') {
            await economy.removeCash(interaction.guildId!, target.id, amount!);
            const c = ComponentsV2.successContainer('Coins Removed',
                `Removed **${amount!.toLocaleString()}** coins from ${target.tag}.`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'set') {
            const entry = await economy.getEntry(interaction.guildId!, target.id);
            const diff = amount! - entry.balance;
            if (diff >= 0) {
                await economy.addCash(interaction.guildId!, target.id, diff);
            } else {
                await economy.removeCash(interaction.guildId!, target.id, Math.abs(diff));
            }
            const c = ComponentsV2.successContainer('Balance Set',
                `${target.tag}'s balance set to **${amount!.toLocaleString()}** coins.`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'balance') {
            const bal = await economy.getBalance(interaction.guildId!, target.id);
            const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
            c.addTextDisplayComponents(ComponentsV2.text(
                `## <: <:user:780495126019473419> ${target.username}'s Balance\n**${bal.toLocaleString()}** coins`
            ));
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }
    },
};