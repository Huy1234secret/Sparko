import { legal } from '../content/legal';

/**
 * Where "Add to Discord" and "Sign in" lead. Until the backend is connected
 * these show a short explanation instead of leaving the site.
 */
export const supportServer = legal.discordInvite;
export const panelHost = new URL(legal.site).host;
