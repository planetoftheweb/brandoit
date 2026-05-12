## ADDED Requirements

### Requirement: Prompt Textarea Accepts Image Drops
The system SHALL allow users to drag and drop an image file onto the prompt textarea.

#### Scenario: Image file dropped
- **WHEN** a user drops an image file onto the prompt textarea
- **THEN** the system opens a choice dialog
- **AND** no generation starts automatically

#### Scenario: Non-image file dropped
- **WHEN** a user drops a non-image file onto the prompt textarea
- **THEN** the system rejects it with a user-friendly error

### Requirement: Content-Only Prompt Extraction
The system SHALL generate prompt text from a dropped image without duplicating toolbar menu concerns.

#### Scenario: Generate prompt from image
- **WHEN** the user chooses to generate a prompt from the dropped image
- **THEN** the prompt text focuses on subject matter, objects, visible text, and semantic content
- **AND** it excludes layout, composition, camera/framing, style, rendering medium, palette, lighting mood, and aspect ratio details
- **AND** the generated text is inserted into the prompt field for review before generation

### Requirement: Temporary Style Reference
The system SHALL allow a dropped image to influence generation style without persisting the image.

#### Scenario: Use image style
- **WHEN** the user chooses style reference with image style as authoritative
- **THEN** the image-derived style replaces the current Style menu for the generated output
- **AND** a removable active-reference chip appears near the prompt

#### Scenario: Keep menu style
- **WHEN** the user chooses style reference with menu style as authoritative
- **THEN** the existing Style menu remains the primary style instruction
- **AND** the dropped image is treated only as a soft reference

#### Scenario: Remove style reference
- **WHEN** the user clicks remove on the active-reference chip
- **THEN** subsequent generations ignore the dropped image
