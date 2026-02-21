## ADDED Requirements

### Requirement: Generation Versioning
The system SHALL group all related outputs (initial generation, refinements) under a single Generation entity with ordered versions labeled Mark I, Mark II, Mark III, etc. Annotations are handled as overlay layers, not versions.

#### Scenario: Initial generation creates Mark I
- **WHEN** user generates a new image
- **THEN** a new Generation is created with a single version (Mark I, type: 'generation')
- **AND** the generation appears as one card in the history grid

#### Scenario: Refinement creates a new Mark
- **WHEN** user submits a refinement prompt for an existing generation
- **THEN** a new version is added to that generation (type: 'refinement')
- **AND** the version number increments (Mark II, Mark III, etc.)
- **AND** the refinement prompt is stored in the version metadata
- **AND** the history card thumbnail updates to show the latest version

#### Scenario: Version navigation
- **WHEN** user views a generation in ImageDisplay
- **THEN** a version navigator (dropdown or pill bar) SHALL be visible
- **AND** user can select any version to view it
- **AND** the current Mark label is displayed prominently

### Requirement: Annotation Layer System
The system SHALL treat annotations as an overlay layer on each version, not as a separate version. The base image remains untouched; annotations composite on top at render time.

#### Scenario: Save annotation layer
- **WHEN** user draws annotations (arrows, boxes, text, blur) on a version
- **THEN** the Fabric.js canvas state is serialized to JSON and stored as `annotationLayer` on that version
- **AND** the base image (`imageData`) is NOT modified
- **AND** annotations render as a composited overlay on top of the base image

#### Scenario: Toggle annotation visibility
- **WHEN** a version has an annotation layer
- **THEN** a toggle button SHALL be visible to show/hide annotations
- **AND** hiding annotations reveals the clean base image
- **AND** the toggle state is persisted as `annotationVisible` on the version

#### Scenario: Edit annotation layer in place
- **WHEN** user edits annotations on a version that already has an annotation layer
- **THEN** the existing `annotationLayer` JSON is updated in place
- **AND** no new Mark is created
- **AND** the Fabric.js state is restored for continued editing

#### Scenario: Export with annotations
- **WHEN** user exports a version with annotations visible
- **THEN** the base image and annotation layer are flattened into a single image for download
- **WHEN** user exports a version with annotations hidden
- **THEN** only the clean base image is exported

### Requirement: WebP Storage Format
The system SHALL store raster images in WebP format to reduce storage footprint, with PNG export support.

#### Scenario: Automatic WebP conversion
- **WHEN** a raster image is received from an AI model (PNG/JPEG)
- **THEN** the system converts it to WebP (quality 0.90) before storing
- **AND** the stored `mimeType` is `image/webp`

#### Scenario: PNG export
- **WHEN** user exports an image as PNG
- **THEN** the system converts the stored WebP to PNG via canvas rendering
- **AND** the downloaded file has a `.png` extension

#### Scenario: WebP export
- **WHEN** user exports an image as WebP
- **THEN** the stored WebP data is downloaded directly
- **AND** the downloaded file has a `.webp` extension

### Requirement: Version-Aware Export Naming
The system SHALL include the version's Roman numeral label in export filenames.

#### Scenario: Export filename format
- **WHEN** user downloads version 3 of a generation with prompt "sunset logo"
- **THEN** the filename SHALL be `sunset-logo-mark-iii.png` (or `.webp`)

### Requirement: Conversational Refinement History
The refinement panel SHALL display a mini conversation thread showing the chain of refinements applied to the current generation.

#### Scenario: Refinement thread display
- **WHEN** a generation has multiple refinement versions
- **THEN** the refinement panel shows each refinement prompt paired with its Mark label
- **AND** the thread is ordered chronologically (oldest first)

#### Scenario: Quick action refinement chips
- **WHEN** user views the refinement panel
- **THEN** pre-built action buttons are available (Simplify, Add Detail, Make Bolder, Make Lighter, Change Palette)
- **AND** clicking a chip submits the corresponding refinement prompt

### Requirement: History Migration
The system SHALL automatically migrate existing `GenerationHistoryItem[]` data to the new `Generation[]` format on first load.

#### Scenario: Migrate legacy history
- **WHEN** the app loads and detects old-format history in localStorage
- **THEN** each old item is wrapped in a Generation with one version (Mark I)
- **AND** existing PNG base64 is converted to WebP
- **AND** the migration runs once and updates the localStorage schema

### Requirement: Admin Firestore Persistence
Admin-level accounts SHALL persist generations to Firestore with image data in Firebase Storage. Non-admin accounts use localStorage only.

#### Scenario: Admin saves to Firestore
- **WHEN** an admin user generates or refines an image
- **THEN** the generation and version metadata are saved to Firestore
- **AND** image data is uploaded to Firebase Storage
- **AND** a Storage URL reference is stored in the Firestore document

#### Scenario: Non-admin uses localStorage
- **WHEN** a non-admin user generates or refines an image
- **THEN** the generation is stored in localStorage only
- **AND** no Firestore or Storage writes occur
