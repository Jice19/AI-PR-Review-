## ADDED Requirements

### Requirement: Issues grouped by severity
When analysis is complete, the ReviewReport component SHALL group issues by severity in descending order: CRITICAL → HIGH → MEDIUM → LOW.

#### Scenario: Multiple severity levels present
- **WHEN** the review has issues with varying severities
- **THEN** issues are displayed in groups sorted by severity (CRITICAL first, LOW last)
- **AND** each group shows the severity label and count

#### Scenario: Only one severity level present
- **WHEN** all issues have the same severity
- **THEN** a single grouped section is shown

### Requirement: Severity group visual distinction
Each severity group SHALL have a distinct visual identity using color coding:
- CRITICAL: red left border, red badge
- HIGH: orange left border, orange badge
- MEDIUM: yellow left border, yellow badge
- LOW: blue left border, blue badge

#### Scenario: CRITICAL issues group
- **WHEN** CRITICAL issues group is rendered
- **THEN** the group header shows a red badge with "CRITICAL" label and issue count

#### Scenario: Empty severity group
- **WHEN** no issues exist for a particular severity level
- **THEN** that severity group is not rendered (hidden, not showing count 0)

### Requirement: Issues maintain order within groups
Issues within each severity group SHALL maintain their original order from the analysis pipeline.

#### Scenario: Issues within a group
- **WHEN** 3 HIGH issues are generated with IDs in order [A, B, C]
- **THEN** they are displayed as [A, B, C] within the HIGH group
