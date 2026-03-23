## Why

The current manual subtask detection filter only recognizes limited patterns (e.g., "Manual QA" prefix or "(manual)" suffix), missing common variations like "Manual verification:". This prevents users from interacting with these subtasks through Specboard's UI to mark them as complete, breaking the workflow for manual testing tasks.

## What Changes

- Extend manual subtask detection regex/logic to recognize additional manual task patterns:
  - "Manual verification:" prefix
  - Other common manual testing prefixes (e.g., "Manual test:", "Manual check:")
- Ensure backward compatibility with existing patterns ("Manual QA", "(manual)")
- Update any related UI indicators or filters that depend on manual subtask detection

## Capabilities

### New Capabilities

None

### Modified Capabilities

- `manual-subtask-detection`: Expand pattern matching to recognize broader range of manual task prefixes while maintaining backward compatibility with existing patterns

## Impact

- Frontend parsing logic in `public/app.js` where subtasks are classified as manual
- Potentially affects filtering, UI rendering, and interaction handlers for manual subtasks
- No breaking changes - purely additive pattern matching
