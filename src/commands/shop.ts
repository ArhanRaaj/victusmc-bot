import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types/index.js';
import { shopService } from '../services/shopSettings.js';
import { ComponentsV2 } from '../embeds/componentsV2.js';

const V2 = ComponentsV2.IS_COMPONENTS_V2;

export const shopCommand: Command = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Buy items and roles with coins')
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('list').setDescription('List items in the shop'))
        .addSubcommand(sub =>
            sub.setName('buy').setDescription('Buy an item')
                .addStringOption(opt => opt.setName('item').setDescription('Item ID from /shop list').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('add').setDescription('Add an item to the shop (Admin)')
                .addStringOption((opt: any) => opt.setName('name').setDescription('Item name').setRequired(true).setMaxLength(50))
                .addIntegerOption((opt: any) => opt.setName('price').setDescription('Price in coins').setRequired(true).setMinValue(1))
                .addRoleOption((opt: any) => opt.setName('role').setDescription('Role to give on purchase').setRequired(false))
                .addStringOption((opt: any) => opt.setName('description').setDescription('Item description').setRequired(false).setMaxLength(200)))
        .addSubcommand(sub =>
            sub.setName('remove').setDescription('Remove an item from the shop (Admin)')
                .addStringOption((opt: any) => opt.setName('item').setDescription('Item ID to remove').setRequired(true))),

    async execute(interaction) {
        await interaction.deferReply({ flags: V2 });
        const sub = interaction.options.getSubcommand();

        if (sub === 'list') {
            const items = await shopService.getItems(interaction.guildId!);
            if (items.length === 0) {
                const c = ComponentsV2.infoContainer('Empty Shop', 'No items in the shop yet.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            const list = items.map(i =>
                `**${i.id}.** ${i.name} — **${i.price.toLocaleString()}** coins${i.roleId ? ` → <@&${i.roleId}>` : ''}\n${i.description ? `-# ${i.description}` : ''}`
            ).join('\n\n');
            const c = ComponentsV2.baseContainer(ComponentsV2.Accents.success);
            c.addTextDisplayComponents(ComponentsV2.text(`# <:Edit:1524363079675154433> Shop\n\n${list}\n\n-# Use \`/shop buy item:<id>\` to purchase.`));
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'buy') {
            const itemId = interaction.options.getString('item', true);
            const result = await shopService.buyItem(interaction.guildId!, interaction.user.id, itemId);

            if (!result.success) {
                const c = ComponentsV2.errorContainer('Purchase Failed', result.reason || 'Unknown error.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }

            const items = await shopService.getItems(interaction.guildId!);
            const item = items.find(i => i.id === itemId);
            let extra = '';
            if (item?.roleId && interaction.member) {
                const role = interaction.guild?.roles.cache.get(item.roleId);
                if (role) {
                    await (interaction.member as any).roles.add(role).catch(() => {});
                    extra = `\nRole <@&${item.roleId}> has been assigned.`;
                }
            }

            const c = ComponentsV2.successContainer('Purchase Successful',
                `You bought **${item?.name || itemId}** for **${item?.price.toLocaleString() || '?'}** coins.${extra}`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'add') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                const c = ComponentsV2.errorContainer('No Permission', 'Admin required.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            const name = interaction.options.getString('name', true);
            const price = interaction.options.getInteger('price', true);
            const role = interaction.options.getRole('role');
            const desc = interaction.options.getString('description') || '';
            const id = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

            await shopService.addItem(interaction.guildId!, {
                id,
                name,
                price,
                roleId: role?.id || null,
                description: desc,
            });
            const c = ComponentsV2.successContainer('Item Added', `**${name}** (${id}) for **${price.toLocaleString()}** coins.`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }

        if (sub === 'remove') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                const c = ComponentsV2.errorContainer('No Permission', 'Admin required.');
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            const itemId = interaction.options.getString('item', true);
            const removed = await shopService.removeItem(interaction.guildId!, itemId);
            if (!removed) {
                const c = ComponentsV2.errorContainer('Not Found', `No item with ID **${itemId}**.`);
                await interaction.editReply({ components: [c], flags: V2 });
                return;
            }
            const c = ComponentsV2.successContainer('Item Removed', `Item **${itemId}** removed from shop.`);
            await interaction.editReply({ components: [c], flags: V2 });
            return;
        }
    },
};