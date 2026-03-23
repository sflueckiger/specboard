## Context

The `isManualSubtask()` function in `public/app.js` (lines 1444-1450) currently detects manual verification tasks using a limited set of patterns:
- "Manual QA" prefix
- "(manual)" suffix
- "— manual" anywhere
- "- manual)" anywhere

Users have encountered manual tasks with different wording (e.g., "Manual verification:") that aren't detected, breaking the workflow for marking these subtasks as complete through the UI.

## Goals / Non-Goals

**Goals:**
- Extend pattern matching to recognize common manual task prefixes: "Manual verification:", "Manual test:", "Manual check:", "Manually verify"
- Maintain backward compatibility with all existing patterns
- Keep the detection logic simple and performant (no significant overhead)

**Non-Goals:**
- Not creating a configuration UI for custom patterns (may be future work)
- Not changing how manual subtasks are rendered or interact (UI remains the same)
- Not modifying server-side parsing (this is frontend-only logic)

## Decisions

### Decision 1: Use case-insensitive prefix matching

**Chosen approach:** Extend the existing function with additional `startsWith()` checks for "manual verification", "manual test", "manual check", "manually verify" (case-insensitive via `lowerTitle`)

**Rationale:**
- Maintains consistency with existing code style
- Simple and readable - easy to add more patterns in the future
- Minimal performance impact (early returns on match)
- No regex complexity

**Alternative considered:** Consolidated regex pattern
- Rejected: More complex to maintain and understand
- Regex would be harder for future contributors to extend

### Decision 2: Preserve all existing patterns

**Chosen approach:** Keep all existing checks, add new ones

**Rationale:**
- Zero risk of breaking existing manual task detection
- Users may have tasks using current patterns
- No migration needed

## Risks / Trade-offs

**Risk:** Pattern list grows over time, function becomes unwieldy
→ **Mitigation:** If patterns exceed ~10, consider refactoring to array-based matching with comments

**Trade-off:** Case-insensitive matching catches more variations but could false-positive
→ **Accepted:** Manual tasks should explicitly state they're manual, false positives unlikely

## Migration Plan

No migration needed - this is a pure addition to client-side detection logic. Changes take effect immediately on page refresh.

## Open Questions

None - implementation is straightforward.
