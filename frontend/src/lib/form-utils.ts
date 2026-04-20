import type { FieldErrors } from 'react-hook-form';

/**
 * Focus and scroll the first invalid field into view after a validation failure.
 * Pass the output of react-hook-form's handleSubmit's onInvalid callback.
 */
export function focusFirstError(errors: FieldErrors) {
  const firstName = Object.keys(errors)[0];
  if (!firstName) return;

  requestAnimationFrame(() => {
    const el =
      (document.querySelector(`[name="${firstName}"]`) as HTMLElement | null) ||
      (document.getElementById(firstName) as HTMLElement | null);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof (el as HTMLInputElement).focus === 'function') {
      (el as HTMLInputElement).focus({ preventScroll: true });
    }
  });
}
