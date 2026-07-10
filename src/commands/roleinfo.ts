import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const roleinfoCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('roleinfo')
        .setDescription('View role information')
        .setDMPermission(false)
        .addRoleOption(opt => opt.setName('role').setDescription('The role to inspect').setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const role = interaction.options.getRole('role', true) as any;

        const permissions = (role.permissions?.toArray?.() || [])
            .filter((p: string) => !['ViewChannel', 'ReadMessageHistory', 'SendMessages', 'AddReactions', 'UseExternalEmojis', 'Connect', 'Speak', 'UseVAD'].includes(p))
            .slice(0, 15)
            .map((p: string) => `\`${p}\``)
            .join(', ') || 'None notable';

        const created = role.createdTimestamp ? Math.floor(role.createdTimestamp / 1000) : Math.floor(Date.now() / 1000);
        const members = role.members?.size ?? 0;

        const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
        c.addTextDisplayComponents(ComponentsV2.text(
            `# <@&${role.id}> Role Info\n\n` +
            `**Name:** ${role.name}\n` +
            `**ID:** \`${role.id}\`\n` +
            `**Color:** ${role.hexColor}\n` +
            `**Position:** ${role.position}\n` +
            `**Members:** ${members}\n` +
            `**Mentionable:** ${role.mentionable ? 'Yes' : 'No'}\n` +
            `**Displayed Separately:** ${role.hoist ? 'Yes' : 'No'}\n` +
            `**Created:** <t:${created}:f>\n\n` +
            `**Key Permissions:**\n${permissions}`
        ));
        await interaction.editReply({ components: [c], flags: V2 });
    },
};