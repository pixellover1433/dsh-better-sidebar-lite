**What the client plugin-apply test asserts** (`tests/client/plugin-apply.spec.tsx`):
- `inject` lists exactly the services we require (`['connection', 'slots', 'locale', 'layout']`).
- Applying registers ONE entry into the session-scoped `details` single slot at `priority: -1`
  (assert the region/tablist render once a current session exists via `rt.sessions.add`).
- Locale dictionaries register under the decided namespace; switching locale yields zh/en;
  **fiber teardown removes both the entries and the dictionaries** (HMR safety — same
  pattern as ui-jobs' `expect(headerEntryIds(ctx)).not.toContain('job-list')` after dispose).
- The zh/en dictionaries stay key-identical (same key set), matching ui-jobs' parity test.