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
