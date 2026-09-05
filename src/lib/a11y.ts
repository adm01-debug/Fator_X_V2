import type { KeyboardEvent } from 'react';

/**
 * Returns an onKeyDown handler that invokes `handler` when the user presses
 * Enter or Space, mirroring a click. Use on elements given role="button" and
 * tabIndex={0} so they are keyboard-operable.
 */
export function onActivateKey<T = Element>(handler: () => void) {
  return (e: KeyboardEvent<T>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handler();
    }
  };
}

/**
 * Drop-in `onKeyDown` handler for elements with `role="button"` and
 * `tabIndex={0}` that already declare an `onClick`. Pressing Enter or Space
 * dispatches a synthetic click on the element itself, so the keyboard path and
 * the pointer path stay in sync without duplicating the callback.
 */
export function handleKeyboardClick<T extends HTMLElement = HTMLElement>(
  e: KeyboardEvent<T>,
): void {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  e.currentTarget.click();
}
