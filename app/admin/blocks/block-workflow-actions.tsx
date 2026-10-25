"use client";

import { Button } from '@/components/ui/button';
import {
  closeFormsForMatching,
  openClubIntake,
  openStudentForm,
  setCurrentBlock,
} from './actions';

type Variant = 'default' | 'outline' | 'destructive';

type WorkflowActionButtonProps = {
  blockId: string;
  actionType: 'make-current' | 'open-club-intake' | 'open-student-form' | 'close-forms';
  label: string;
  variant?: Variant;
  disabled?: boolean;
};

export function WorkflowActionButton({
  blockId,
  actionType,
  label,
  variant = 'outline',
  disabled = false,
}: WorkflowActionButtonProps) {
  const action = getAction(actionType);
  const confirmationMessage = getConfirmationMessage(actionType);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (!confirmationMessage) return;

    const confirmed = window.confirm(confirmationMessage);

    if (!confirmed) {
      event.preventDefault();
    }
  }

  return (
    <form action={action} onSubmit={handleSubmit}>
      <input type="hidden" name="block_id" value={blockId} />
      <Button type="submit" variant={variant} disabled={disabled}>
        {label}
      </Button>
    </form>
  );
}

function getAction(actionType: WorkflowActionButtonProps['actionType']) {
  if (actionType === 'make-current') return setCurrentBlock;
  if (actionType === 'open-club-intake') return openClubIntake;
  if (actionType === 'open-student-form') return openStudentForm;
  return closeFormsForMatching;
}

function getConfirmationMessage(actionType: WorkflowActionButtonProps['actionType']) {
  if (actionType === 'make-current') {
    return 'Make this the current session? Admin pages will use this session after the change.';
  }

  if (actionType === 'open-club-intake') {
    return 'Open club sign-up for this session? This will make it the current session and close student choices.';
  }

  if (actionType === 'open-student-form') {
    return 'Open student choices for this session? This will make it the current session and close club sign-up.';
  }

  if (actionType === 'close-forms') {
    return 'Close club sign-up and student choices for this session? You can run matching after this.';
  }

  return '';
}
