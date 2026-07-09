import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types/index.js';
import { autoResponder } from '../services/autoResponder.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const autoresponderCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('autoresponder')
        .setDescription('Manage auto-reply triggers (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('add').setDescription('Add an auto-response')
                .addStringOption(opt => opt.setName('trigger').setDescription('Word or phrase to trigger on').setRequired(true).setMaxLength(200))
                .addStringOption(opt => opt.setName('response').setDescription('Response message').setRequired(true).setMaxLength(1900))
                .addStringOption(opt => opt.setName('match').setDescription('Match type').setRequired(true)
                    .addChoices({ name: 'Exact match', value: 'exact' }, { name: 'Contains', value: 'contains' }, { name: 'Starts with', value: 'starts' }))
        )
        .addSubcommand(sub =>
            sub.setName('edit').setDescription('Edit an auto-response')
                .addIntegerOption(opt => opt.setName('id').setDescription('The ID number from list').setRequired(true).setMinValue(1))
                .addStringOption(opt => opt.setName('trigger').setDescription('New trigger word').setRequired(false))
                .addStringOption(opt => opt.setName('response').setDescription('New response').setRequired(false).setMaxLength(1900))
                .addStringOption(opt => opt.setName('match').setDescription('New match type').setRequired(false)
                    .addChoices({ name: 'Exact match', value: 'exact' }, { name: 'Contains', value: 'contains' }, { name: 'Starts with', value: 'starts' }))
        )
        .addSubcommand(sub =>
            sub.setName('remove').setDescription('Remove an auto-response')
                .addIntegerOption(opt => opt.setName('id').setDescription('The ID number from list').setRequired(true).setMinValue(1))
        )
        .addSubcommand(sub =>
            sub.setName('deleteall').setDescription('Remove all auto-responses')
        )
        .addSubcommand(sub =>
            sub.setName('list').setDescription('List all auto-responses')
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const sub = interaction.options.getSubcommand();
        const responders = await autoResponder.get(interaction.guildId!);

        if (sub === 'add') {
            const trigger = interaction.options.getString('trigger', true);
            const response = interaction.options.getString('response', true);
            const match = interaction.options.getString('match') || 'contains';
            await autoResponder.add(interaction.guildId!, trigger, response, match, true);
            const c = ComponentsV2.successContainer('Auto-Response Added', `Trigger: **${trigger}**\nResponse: ${response.substring(0, 100)}`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'edit') {
            const id = interaction.options.getInteger('id', true) - 1;
            if (id < 0 || id >= responders.length) {
                const c = ComponentsV2.errorContainer('Invalid ID', 'No auto-response with that ID.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            const updates: any = {};
            const trigger = interaction.options.getString('trigger');
            const response = interaction.options.getString('response');
            const match = interaction.options.getString('match');
            if (trigger) updates.trigger = trigger;
            if (response) updates.response = response;
            if (match) updates.matchType = match;
            await autoResponder.edit(interaction.guildId!, id, updates);
            const c = ComponentsV2.successContainer('Auto-Response Edited', `ID **${id + 1}** has been updated.`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'remove') {
            const id = interaction.options.getInteger('id', true) - 1;
            if (id < 0 || id >= responders.length) {
                const c = ComponentsV2.errorContainer('Invalid ID', 'No auto-response with that ID.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            const removed = responders[id];
            await autoResponder.remove(interaction.guildId!, id);
            const c = ComponentsV2.successContainer('Auto-Response Removed', `Removed trigger: **${removed.trigger}**`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'deleteall') {
            await autoResponder.deleteAll(interaction.guildId!);
            const c = ComponentsV2.successContainer('All Removed', 'All auto-responses have been deleted.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'list') {
            if (responders.length === 0) {
                const c = ComponentsV2.infoContainer('No Auto-Responses', 'No auto-responses configured.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            const list = responders.map((r: any, i: number) =>
                `**${i + 1}.** "${r.trigger}" → ${r.response.substring(0, 80)}${r.response.length > 80 ? '...' : ''}\n` +
                `-# ${r.matchType} match | ${r.enabled ? 'Enabled' : 'Disabled'}`
            ).join('\n\n');
            const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
            c.addTextDisplayComponents(ComponentsV2.text(`# <:Edit:1524363079675154433> Auto-Responses\n\n${list}`));
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }
    },
};