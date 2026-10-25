'use client';

import { useEffect, useState } from 'react';

type Props = {
  formId: string;
};

type ValidationState = {
  errors: string[];
  meetingDaysInvalid: boolean;
  maxCapacityInvalid: boolean;
  minimumViableInvalid: boolean;
};

export function ClubFormValidator({ formId }: Props) {
  const [validation, setValidation] = useState<ValidationState>({
    errors: [],
    meetingDaysInvalid: false,
    maxCapacityInvalid: false,
    minimumViableInvalid: false,
  });

  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;

    if (!form) return;

    const formElement = form;

    function setSectionHighlight(
      selector: string,
      isInvalid: boolean,
      mode: 'container' | 'input' = 'container'
    ) {
      const element = formElement.querySelector<HTMLElement>(selector);
      if (!element) return;

      if (mode === 'container') {
        element.classList.toggle('border-red-300', isInvalid);
        element.classList.toggle('bg-red-50', isInvalid);
        element.classList.toggle('rounded-xl', isInvalid);
        element.classList.toggle('p-3', isInvalid);
      } else {
        element.classList.toggle('border-red-500', isInvalid);
        element.classList.toggle('ring-1', isInvalid);
        element.classList.toggle('ring-red-500', isInvalid);
      }
    }

    function applyHighlights(state: ValidationState) {
      setSectionHighlight(
        '[data-validation="meeting-days"]',
        state.meetingDaysInvalid
      );

      setSectionHighlight(
        'input[name="max_capacity"]',
        state.maxCapacityInvalid,
        'input'
      );

      setSectionHighlight(
        'input[name="minimum_viable_enrollment"]',
        state.minimumViableInvalid,
        'input'
      );
    }

    function clearHighlights() {
      applyHighlights({
        errors: [],
        meetingDaysInvalid: false,
        maxCapacityInvalid: false,
        minimumViableInvalid: false,
      });
    }

    function validateForm(): ValidationState {
      const nextErrors: string[] = [];

      const meetingDays = formElement.querySelectorAll<HTMLInputElement>(
        'input[name="meeting_days"]:checked'
      );

      const capacityTypeElement =
        formElement.querySelector<HTMLSelectElement>(
          'select[name="capacity_type"]'
        );

      const maxCapacityElement =
        formElement.querySelector<HTMLInputElement>(
          'input[name="max_capacity"]'
        );

      const minimumElement = formElement.querySelector<HTMLInputElement>(
        'input[name="minimum_viable_enrollment"]'
      );

      const capacityType = capacityTypeElement?.value ?? 'limited';
      const maxCapacityRaw = maxCapacityElement?.value?.trim() ?? '';
      const minimumRaw = minimumElement?.value?.trim() ?? '';

      const maxCapacity =
        maxCapacityRaw === '' ? null : Number.parseInt(maxCapacityRaw, 10);

      const minimumViable =
        minimumRaw === '' ? 0 : Number.parseInt(minimumRaw, 10);

      const meetingDaysInvalid = meetingDays.length === 0;

      const maxCapacityInvalid =
        capacityType === 'limited' &&
        (maxCapacity === null || Number.isNaN(maxCapacity) || maxCapacity < 1);

      const minimumViableInvalid =
        maxCapacity !== null &&
        !Number.isNaN(maxCapacity) &&
        !Number.isNaN(minimumViable) &&
        minimumViable > maxCapacity;

      if (meetingDaysInvalid) {
        nextErrors.push('Please select at least one meeting day.');
      }

      if (maxCapacityInvalid) {
        nextErrors.push(
          'Please enter a maximum capacity for limited-capacity clubs.'
        );
      }

      if (minimumViableInvalid) {
        nextErrors.push(
          'Minimum viable enrollment cannot be greater than maximum capacity.'
        );
      }

      const nextState: ValidationState = {
        errors: nextErrors,
        meetingDaysInvalid,
        maxCapacityInvalid,
        minimumViableInvalid,
      };

      setValidation(nextState);

      if (hasTriedSubmit) {
        applyHighlights(nextState);
      }

      return nextState;
    }

    function handleSubmit(event: Event) {
      setHasTriedSubmit(true);

      const minimumElement = formElement.querySelector<HTMLInputElement>(
        'input[name="minimum_viable_enrollment"]'
      );

      if ((minimumElement?.value?.trim() ?? '') === '' && minimumElement) {
        minimumElement.value = '0';
      }

      const nextState = validateForm();
      applyHighlights(nextState);

      if (nextState.errors.length > 0) {
        event.preventDefault();
        event.stopPropagation();

        const errorBox = document.getElementById(`${formId}-errors`);
        errorBox?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    function handleChange() {
      if (!hasTriedSubmit) return;

      const nextState = validateForm();
      applyHighlights(nextState);
    }

    formElement.addEventListener('submit', handleSubmit);
    formElement.addEventListener('change', handleChange);
    formElement.addEventListener('input', handleChange);

    return () => {
      formElement.removeEventListener('submit', handleSubmit);
      formElement.removeEventListener('change', handleChange);
      formElement.removeEventListener('input', handleChange);
      clearHighlights();
    };
  }, [formId, hasTriedSubmit]);

  if (!hasTriedSubmit || validation.errors.length === 0) {
    return null;
  }

  return (
    <div
      id={`${formId}-errors`}
      className="md:col-span-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
    >
      <div className="font-semibold">
        Please fix the following before submitting:
      </div>

      <ul className="mt-2 list-disc pl-5">
        {validation.errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}