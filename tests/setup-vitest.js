import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Explicit unmount + DOM cleanup after every test. RTL can auto-detect a
// GLOBAL afterEach and register this itself, but that requires vitest's
// `test.globals: true` (making describe/it/expect ambient everywhere) — this
// project's tests import those explicitly instead, so cleanup is wired here
// rather than relying on that implicit detection.
afterEach(() => {
  cleanup();
});
