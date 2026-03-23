### Requirement: System detects manual verification subtasks

The system SHALL classify subtasks as manual verification tasks based on their title text, enabling special UI treatment and user interaction for manual testing workflows.

#### Scenario: Legacy "Manual QA" prefix detected
- **WHEN** a subtask title starts with "Manual QA" (case-sensitive)
- **THEN** the subtask is classified as a manual verification task

#### Scenario: Manual suffix detected
- **WHEN** a subtask title contains "(manual)" (case-insensitive)
- **THEN** the subtask is classified as a manual verification task

#### Scenario: Manual with em-dash detected
- **WHEN** a subtask title contains "— manual" (case-insensitive)
- **THEN** the subtask is classified as a manual verification task

#### Scenario: Manual with hyphen suffix detected
- **WHEN** a subtask title contains "- manual)" (case-insensitive)
- **THEN** the subtask is classified as a manual verification task

### Requirement: System detects "Manual verification" prefix

The system SHALL detect subtasks beginning with "Manual verification:" as manual verification tasks.

#### Scenario: Manual verification prefix detected
- **WHEN** a subtask title starts with "Manual verification:" (case-insensitive)
- **THEN** the subtask is classified as a manual verification task

#### Scenario: Example real-world task detected
- **WHEN** a subtask title is "Manual verification: Edit a client and contact, confirm country dropdown works and saves correctly (requires user to run bun run dev and test in browser)"
- **THEN** the subtask is classified as a manual verification task

### Requirement: System detects additional manual task prefixes

The system SHALL detect subtasks beginning with common manual testing prefixes as manual verification tasks.

#### Scenario: Manual test prefix detected
- **WHEN** a subtask title starts with "Manual test:" (case-insensitive)
- **THEN** the subtask is classified as a manual verification task

#### Scenario: Manual check prefix detected
- **WHEN** a subtask title starts with "Manual check:" (case-insensitive)
- **THEN** the subtask is classified as a manual verification task

#### Scenario: Manually verify prefix detected
- **WHEN** a subtask title starts with "Manually verify" (case-insensitive)
- **THEN** the subtask is classified as a manual verification task

### Requirement: Backward compatibility maintained

The system SHALL continue to detect all existing manual task patterns without regression.

#### Scenario: All legacy patterns still work
- **WHEN** subtasks use any previously supported pattern ("Manual QA", "(manual)", "— manual", "- manual)")
- **THEN** all such subtasks are still classified as manual verification tasks

#### Scenario: Pattern detection is additive
- **WHEN** new patterns are added to detection logic
- **THEN** no existing manual subtasks lose their manual classification
