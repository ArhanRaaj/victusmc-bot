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
        '🔗 Account Not Linked',
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
        '🚫 Permission Denied',
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
        case 'running': return '🟢';
        case 'starting': return '🟡';
        case 'stopping': return '🟠';
        case 'offline': return '🔴';
        case 'suspended': return '⛔';
        default: return '⚪';
    }
}

export function getInvoiceStatusEmoji(status: string): string {
    switch (status?.toLowerCase()) {
        case 'paid': return '✅';
        case 'unpaid': return '⏳';
        case 'cancelled': return '❌';
        case 'refunded': return '↩️';
        default: return '❓';
    }
}

export function getServiceStatusEmoji(status: string): string {
    switch (status?.toLowerCase()) {
        case 'active': return '✅';
        case 'suspended': return '⚠️';
        case 'cancelled': return '❌';
        case 'pending': return '⏳';
        default: return '❓';
    }
}
