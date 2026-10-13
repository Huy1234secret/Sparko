import { Button, Icon, Modal } from '../ui';

/** Step-by-step help for giving Sparko a missing Discord permission. */
export function FixPermissionModal({
  open,
  title,
  why,
  steps,
  checking,
  onCheck,
  onClose,
}: {
  open: boolean;
  title: string;
  why: string;
  steps: string[];
  checking: boolean;
  onCheck: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon="shield-alert"
      title={title}
      description={why}
      footer={
        <>
          <a
            className="sp-btn sp-btn--secondary"
            href="https://discord.com/app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Discord
            <Icon name="external-link" size="sm" />
          </a>
          <Button
            variant="primary"
            loading={checking}
            loadingLabel="Checking…"
            onClick={onCheck}
          >
            Check again
          </Button>
        </>
      }
    >
      <ol className="sp-howto">
        {steps.map((step) => (
          <li key={step}>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="sp-notice sp-notice--info sp-notice--compact">
        <Icon name="info" className="sp-notice__icon" />
        <div className="sp-notice__title">
          Sparko never asks for Administrator.
        </div>
      </div>
    </Modal>
  );
}

export const fixes = {
  manageRoles: {
    title: 'Give Sparko the Manage Roles permission',
    why: 'Automatic roles and Reward roles need it to give roles to members.',
    steps: [
      'In Discord, open Server Settings, then Roles.',
      'Pick the Sparko role and switch on Manage Roles.',
      'Drag the Sparko role above the roles it should give.',
      'Come back here and choose Check again.',
    ],
  },
  channel: (name: string) => ({
    title: `Let Sparko post in #${name}`,
    why: 'It needs View Channel, Send Messages and Embed Links there.',
    steps: [
      `In Discord, right-click #${name} and choose Edit Channel.`,
      'Open Permissions and add the Sparko role.',
      'Allow View Channel, Send Messages and Embed Links, then save.',
      'Come back here and choose Check again.',
    ],
  }),
};
