import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../types/index.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';
import { getVoiceSessionStart } from '../services/levelingSettings.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const voicetimeCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('voicetime')
        .setDescription('Check how long you have been in your current voice channel')
        .setDMPermission(false),
    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });

        const member = interaction.member as any;
        if (!member.voice?.channelId) {
            const c = ComponentsV2.warningContainer('<:Dissable:1524363096855023626> Not in VC', 'You are not in a voice channel.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        const startTime = getVoiceSessionStart(interaction.guildId!, interaction.user.id);
        if (!startTime) {
            const c = ComponentsV2.warningContainer('<:Exclamation:1524363098809569350> No Session', 'No voice session tracking found. Try rejoining the VC.');
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        const elapsed = Date.now() - startTime;
        const hrs = Math.floor(elapsed / 3600000);
        const mins = Math.floor((elapsed % 3600000) / 60000);
        const secs = Math.floor((elapsed % 60000) / 1000);

        const parts: string[] = [];
        if (hrs > 0) parts.push(`${hrs}h`);
        if (mins > 0) parts.push(`${mins}m`);
        parts.push(`${secs}s`);

        const c = ComponentsV2.baseContainer(ComponentsV2.Accents.info);
        c.addTextDisplayComponents(ComponentsV2.text(
            `# <:Timer:1524363047534329916> Voice Time\n\n` +
            `<@${interaction.user.id}> has been in <#${member.voice.channelId}> for **${parts.join(' ')}**.`
        ));
        await interaction.editReply({ components: [c], flags: V2 });
    },
};
