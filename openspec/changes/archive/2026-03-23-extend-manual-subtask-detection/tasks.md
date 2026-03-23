## 1. Update Manual Subtask Detection Logic

- [x] 1.1 Locate the `isManualSubtask()` function in public/app.js (lines 1444-1450)
- [x] 1.2 Add case-insensitive check for "manual verification" prefix using `lowerTitle.startsWith('manual verification')`
- [x] 1.3 Add case-insensitive check for "manual test" prefix using `lowerTitle.startsWith('manual test')`
- [x] 1.4 Add case-insensitive check for "manual check" prefix using `lowerTitle.startsWith('manual check')`
- [x] 1.5 Add case-insensitive check for "manually verify" prefix using `lowerTitle.startsWith('manually verify')`
- [x] 1.6 Verify all existing patterns remain unchanged (no regression)

## 2. Testing and Verification

- [ ] 2.1 Create test subtask with "Manual verification:" prefix and verify it appears in Manual Verification section
- [ ] 2.2 Create test subtask with "Manual test:" prefix and verify it appears in Manual Verification section
- [ ] 2.3 Create test subtask with "Manual check:" prefix and verify it appears in Manual Verification section
- [ ] 2.4 Manual verification: Test legacy patterns still work ("Manual QA", "(manual)", "— manual", "- manual)")
- [ ] 2.5 Manual verification: Confirm the real-world example "Manual verification: Edit a client and contact, confirm country dropdown works and saves correctly (requires user to run bun run dev and test in browser)" is now detected correctly
- [ ] 2.6 Manual verification: Verify case-insensitive matching works (e.g., "MANUAL VERIFICATION:" or "Manual Test:")
- [ ] 2.7 Manually verify the pattern "Manually verify API endpoints respond correctly" is now detected
- [ ] 2.8 Manually verify the pattern "Manually verify admin portal API calls work" is now detected
- [ ] 2.9 Manual verification: Confirm manual subtask click handlers work correctly for new patterns
