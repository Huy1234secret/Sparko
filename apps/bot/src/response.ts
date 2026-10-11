import { MessageFlags, type RepliableInteraction, type ModalBuilder } from 'discord.js';

/** One initial acknowledgement; watchdog keeps stalled database calls within Discord's deadline. */
export class InteractionResponse {
  private reserved = false;
  private readonly watchdog: ReturnType<typeof setTimeout>;
  constructor(private readonly interaction: RepliableInteraction) {
    this.watchdog = setTimeout(() => {
      if (!this.interaction.replied && !this.interaction.deferred && !this.reserved) {
        this.reserved = true;
        void this.interaction.reply({ content: 'Sparko is busy. Try this action again.', flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }).catch(() => undefined);
      }
    }, 2300);
    this.watchdog.unref();
  }
  async defer(): Promise<boolean> {
    if (this.reserved || this.interaction.replied || this.interaction.deferred) return false;
    this.reserved = true; clearTimeout(this.watchdog);
    await this.interaction.deferReply({ flags: MessageFlags.Ephemeral }); return true;
  }
  async modal(modal: ModalBuilder): Promise<boolean> {
    if (this.reserved || this.interaction.replied || this.interaction.deferred || !('showModal' in this.interaction)) return false;
    this.reserved = true; clearTimeout(this.watchdog);
    await this.interaction.showModal(modal); return true;
  }
  async send(content: string): Promise<void> {
    clearTimeout(this.watchdog);
    if (this.interaction.deferred) await this.interaction.editReply({ content, allowedMentions: { parse: [] } });
    else if (!this.interaction.replied && !this.reserved) { this.reserved = true; await this.interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }); }
    else if (this.interaction.replied) await this.interaction.followUp({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  }
  dispose(): void { clearTimeout(this.watchdog); }
}
