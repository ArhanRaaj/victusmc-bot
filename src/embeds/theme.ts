import { config } from '../config.js';
import { ComponentsV2 } from './componentsV2.js';

export const BOT_BANNER_URL = 'https://cdn.discordapp.com/attachments/1416827980004724766/1523993256961118299/wmremove-transformed.png';

export function createContainer(options: {
    title?: string;
    description?: string;
    accent?: number;
} = {}) {
    const { title, description, accent = ComponentsV2.Accents.info } = options;
    const c = ComponentsV2.baseContainer(accent);
    const parts: string[] = [];
    if (title) parts.push(`# ${title}`);
    if (description) parts.push(description);
    if (parts.length) c.addTextDisplayComponents(ComponentsV2.text(parts.join('\n\n')));
    return c;
}

export function successContainer(title: string, description?: string) {
    return ComponentsV2.successContainer(title, description || '');
}

export function errorContainer(title: string, description?: string) {
    return ComponentsV2.errorContainer(title, description || '');
}

export function warningContainer(title: string, description?: string) {
    return ComponentsV2.warningContainer(title, description || '');
}

export function infoContainer(title: string, description?: string) {
    return ComponentsV2.infoContainer(title, description || '');
}

export function notLinkedContainer() {
    return ComponentsV2.warningContainer(
        '<:Link:1524363114903113799> Account Not Linked',
        'Your Discord account is not linked to VictusMC.\n\n' +
        '**To link your account:**\n' +
        '1. Visit the **VictusMC website**\n' +
        '2. Log in to your VictusMC account\n' +
        '3. Go to account settings\n' +
        '4. Link your Discord account\n\n' +
        'Once linked, you can access account-aware controls and sync your roles!'
    );
}

export function permissionDeniedContainer() {
    return ComponentsV2.errorContainer(
        '<:Ban:1524363011291222086> Permission Denied',
        'You do not have permission to use this command.'
    );
}

export function getServerStatusColor(status: string): number {
    switch (status?.toLowerCase()) {
        case 'running': return ComponentsV2.Accents.success;
        case 'starting':
        case 'stopping': return ComponentsV2.Accents.warning;
        case 'offline':
        case 'suspended': return ComponentsV2.Accents.danger;
        default: return ComponentsV2.Accents.primary;
    }
}

export function getServerStatusEmoji(status: string): string {
    switch (status?.toLowerCase()) {
        case 'running': return '<:Tick:1524363090626482326>';
        case 'starting': return '<:Pause:1524363094933897226>';
        case 'stopping': return '<:Setting:1524363057990598687>';
        case 'offline': return '<:Cross:1524363088621469737>';
        case 'suspended': return '⛔';
        default: return '<:Cross:1524363088621469737>';
    }
}

export function getInvoiceStatusEmoji(status: string): string {
    switch (status?.toLowerCase()) {
        case 'paid': return '<:Tick:1524363090626482326>';
        case 'unpaid': return '<:Processing:1524363038713708544>';
        case 'cancelled': return '<:Cross:1524363088621469737>';
        case 'refunded': return '<:Retry:1524363041024512010>';
        default: return '<:Exclamation:1524363098809569350>';
    }
}

export function getServiceStatusEmoji(status: string): string {
    switch (status?.toLowerCase()) {
        case 'active': return '<:Tick:1524363090626482326>';
        case 'suspended': return '<:Exclamation:1524363098809569350>';
        case 'cancelled': return '<:Cross:1524363088621469737>';
        case 'pending': return '<:Processing:1524363038713708544>';
        default: return '<:Exclamation:1524363098809569350>';
    }
}
