## ADDED Requirements

### Requirement: IssueCard shows fix suggestion when available
The IssueCard component SHALL display a collapsible "修复建议" section when the issue has a non-null `suggestion` property.

#### Scenario: Issue has fix suggestion
- **WHEN** an issue with `suggestion` object is rendered
- **THEN** a "修复建议" expandable section is visible
- **AND** clicking it toggles visibility of the suggestion details

#### Scenario: Issue has no fix suggestion
- **WHEN** an issue without `suggestion` is rendered
- **THEN** no "修复建议" section is shown

### Requirement: Code before/after comparison display
When the fix suggestion is expanded, the system SHALL display `codeBefore` and `codeAfter` side by side in distinct visual styles (red-tinted for before, green-tinted for after).

#### Scenario: Suggestion has codeBefore and codeAfter
- **WHEN** suggestion details are expanded
- **THEN** `codeBefore` is displayed in a red-tinted code block
- **AND** `codeAfter` is displayed in a green-tinted code block
- **AND** both use monospace font

### Requirement: Security rationale display
When the fix suggestion has a `securityRationale` field, the system SHALL display it below the code comparison.

#### Scenario: Suggestion has security rationale
- **WHEN** suggestion details are expanded and `securityRationale` exists
- **THEN** the rationale text is displayed with a distinct label

#### Scenario: Suggestion has no security rationale
- **WHEN** suggestion details are expanded but `securityRationale` is empty/undefined
- **THEN** no rationale section is shown

### Requirement: Save suggestion to database
The `saveIssues` function SHALL accept and persist an optional `suggestion` field for each issue, mapping it to the Prisma `ReviewIssue.suggestion` Json column.

#### Scenario: Issue has suggestion data
- **WHEN** `saveIssues` is called with an issue containing `suggestion`
- **THEN** the suggestion JSON is persisted in the database

#### Scenario: Issue has no suggestion data
- **WHEN** `saveIssues` is called with an issue without `suggestion`
- **THEN** the `suggestion` column is left as null
