import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@sparko/ui';

export function DraftGuard({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  return (
    <Dialog.Root open={blocker.state === 'blocked'}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title>Keep your changes?</Dialog.Title>
          <Dialog.Description>
            You have unsaved edits on this page. Save them before leaving, or
            discard this draft.
          </Dialog.Description>
          <div className="row">
            <Button
              variant="secondary"
              onClick={() => blocker.state === 'blocked' && blocker.reset()}
            >
              Stay here
            </Button>
            <Button
              variant="danger"
              onClick={() => blocker.state === 'blocked' && blocker.proceed()}
            >
              Discard and leave
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
