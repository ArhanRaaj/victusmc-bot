import { 
    EmbedBuilder,
    PermissionFlagsBits, 
    SlashCommandBuilder 
} from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { logger } from '../utils/logger.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;
export const dmCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('dm')
        .setDescription('Send a direct message to a server member (Administrator only)')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(opt => 
            opt.setName('user')
                .setDescription('The user to message')
                .setRequired(true)
        )
        .addStringOption(opt => 
            opt.setName('message')
                .setDescription('The message content to send')
                .setRequired(true)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user', true);
        const messageText = interaction.options.getString('message', true);

        if (targetUser.bot) {
            await interaction.reply({ content: '<:Cross:1524363088621469737> You cannot send DMs to other bots.' });
            return;
        }

        const isPrefix = interaction.constructor.name === 'PrefixInteraction';
        await interaction.deferReply({ flags: isPrefix ? undefined : V2 });

        try {
            const dmEmbed = new EmbedBuilder()
                .setColor(0x2b2d31)
                .setTitle('<:Message:1524363100734623836> Official Server Message')
                .setDescription(`You have received an official message from the administration of **${interaction.guild?.name}**:\n\n>>> ${messageText}`)
                .setFooter({ text: 'VictusMC • Official administration broadcast' })
                .setTimestamp();

            await targetUser.send({ embeds: [dmEmbed] });

            if (isPrefix) {
                const successEmbed = new EmbedBuilder()
                    .setColor(0x2b2d31)
                    .setTitle('<:Tick:1524363090626482326> Message Delivered')
                    .setDescription(`Your official DM was successfully sent to <@${targetUser.id}>.`);
                await interaction.editReply({ embeds: [successEmbed] });
            } else {
                await interaction.editReply({
                    components: [ComponentsV2.successContainer('Message Delivered', `Your official DM was successfully sent to <@${targetUser.id}>.`)]
                });
            }
        } catch (error: any) {
            logger.warn(`Failed to send DM to user ${targetUser.id}:`, error);
            if (isPrefix) {
                const errorEmbed = new EmbedBuilder()
                    .setColor(0x2b2d31)
                    .setTitle('⛔ Delivery Failed')
                    .setDescription(`Could not send DM to <@${targetUser.id}>. Their DMs might be closed or they have blocked the bot.`);
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.editReply({
                    components: [ComponentsV2.errorContainer('Delivery Failed', `Could not send DM to <@${targetUser.id}>. Their DMs might be closed or they have blocked the bot.`)]
                });
            }
        }
    }
};
