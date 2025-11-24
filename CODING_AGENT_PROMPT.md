# Dekereke Sound File Association Tool - Development Prompt

## CRITICAL CLARIFICATIONS - Read First

**To prevent common misunderstandings, note these critical points:**

1. **NO Web Server:** Use pywebview's native API, NOT Flask/FastAPI. Load HTML as local files.

2. **UTF-16 is NOT UTF-8:** XML files are UTF-16 encoded. Do not default to UTF-8. Explicitly specify UTF-16.

3. **Workflow Order Matters:** Initial Setup → Steps 1-3 (read-only) → Post-Processing (file operations). Do not modify files during Steps 1-3.

4. **Leading Zeros MUST Preserve:** Reference "0021" is different from "21". Preserve exactly as written.

5. **Suffix Extraction:** Remove base filename (without extension) from full filename (without extension) to get suffix. Use longest matching base for overlapping cases. Confirm ambiguous interpretations with user before showing mapping UI.

6. **Settings Are Per-Project:** Each XML file has its own config file, not one global config.

7. **Queue vs Execute:** Steps 1-3 only QUEUE operations. Execution happens in Post-Processing after user confirms.

8. **Orphan Move Precedence:** If a file is marked for both "orphan move" and "rename", the orphan move wins. Don't try to rename files already moved to orphans folder.

9. **Audio Playback Optional:** Core functionality (matching/renaming) must work even if audio playback fails. Playback is preview-only.

10. **Case Sensitivity is User Choice:** Don't assume - ask user during Initial Setup and respect their choice throughout.

---

## Project Overview
Build a Python-based desktop application using `pywebview` to help linguists manage associations between audio recordings and database records in the Dekereke phonology database application. The tool identifies orphaned audio files and missing recordings, then provides an intuitive graphical interface for resolving these issues.

## Background: Dekereke Database Structure

### XML Data Format
Dekereke uses 16-bit UTF-encoded XML files with a specific structure:
- **Root element:** `<phon_data>`
- **Record element:** `<data_form>` (represents one row/record)
- **Field elements:** All daughters of `<data_form>` represent cells/fields
- **Unique identifier:** `<Reference>` element contains an ID number (e.g., "0012", "0021")
  - May have 1, 2, or more leading zeroes that MUST be preserved
  - Not enforced as unique by Dekereke - duplicates are possible
- **Sound file base:** `<SoundFile>` element contains the base filename for the record

### Critical XML Requirements
The XML declaration and structure must remain EXACTLY as found in the user's file:
- Every character must be preserved (quotes, whitespace, attributes, etc.)
- No reformatting or prettification
- **CRITICAL: Preserve UTF-16 encoding** - Do NOT change to UTF-8 or any other encoding
  - Dekereke requires `encoding="utf-16"` specifically
  - When reading: use UTF-16 encoding
  - When writing (for duplicate Reference fixes): save as UTF-16
  - Most libraries default to UTF-8 - explicitly specify UTF-16
- **Exception:** XML can be edited ONLY to fix duplicate Reference numbers (when user chooses to fix them)
  - When editing Reference values, preserve the exact XML formatting, declaration, and structure
  - Only modify the text content of `<Reference>` elements, nothing else
  - Automatically update associated sound filenames to match new Reference number
- Example of typical XML header:
```xml
<?xml version="1.0" encoding="utf-16"?>
<phon_data>
	<data_form>
		<Reference>0012</Reference>
		<Gloss>descend.INCMP</Gloss>
		<IndonesianGloss>turun</IndonesianGloss>
		<Category>DUPLICATE</Category>
		<Type />
```

### Sound File Naming Convention
Audio files are associated with specific fields in specific records using a base filename + suffix pattern:
- Base filename stored in `<SoundFile>` element (e.g., "0021_pig.wav")
- Suffixes (usually starting with hyphen) associate with specific fields
  - Example: "-phon" suffix associates with `<Phonetic>` field
  - Full filename: "0021_pig-phon.wav"
- Special case: No suffix (base filename only) associates with the whole record
- **Important:** Suffixes don't always follow conventions:
  - May not start with hyphen
  - Can include dots and underscores (Leipzig Glossing conventions)
  - Multiple dots in filenames are common (e.g., "0021_pig.plural-phon.wav")

### Linguistic Context
Users work with minority language documentation and may use glosses in various languages of wider communication (English, French, Thai, Arabic, etc.). Field names and glosses follow Leipzig Glossing conventions, which use dots and underscores extensively.

## Technical Stack

### Required Technologies
- **Backend:** Python 3.8+
- **Desktop GUI:** `pywebview` (NOT Flask - native webview wrapper)
- **Frontend:** HTML/CSS/JavaScript (vanilla or lightweight framework)
- **XML Processing:** Use Python's `xml.etree.ElementTree` or `lxml` (preserve exact formatting)
- **Audio:** Python audio libraries for playback (e.g., `pygame`, `sounddevice`)

### Architecture Principles
- **Backend (Python):** All logic, file operations, XML parsing, data processing
- **Frontend (JavaScript/HTML):** UI only - expose Python functions to JavaScript via `pywebview.api`
- **Threading:** Background threads for file scanning, with progress indicators
- **Caching:** Cache parsed XML and file listings between runs

### CRITICAL: pywebview Architecture
**DO NOT create a Python web server (Flask, FastAPI, etc.) to serve the HTML/JS files.**

Instead, use pywebview's proper architecture:
- Load HTML directly from file or string using `webview.create_window(html=...)`
- Expose Python functions via `webview.api` class
- JavaScript calls Python functions directly through `window.pywebview.api.function_name()`
- No HTTP server, no localhost URLs, no network requests between UI and backend
- This avoids firewall issues and security concerns

Example structure:
```python
import webview

class Api:
    def get_records(self):
        # Python logic here
        return data

api = Api()
# Load from file path, NOT a URL
window = webview.create_window('App Name', 'index.html', js_api=api)
webview.start()
```

**IMPORTANT:** HTML/CSS/JS files should be bundled with the application as local files, not served over HTTP.

## Application Workflow

### Critical Workflow Order

**IMPORTANT:** The workflow must proceed in this exact order to prevent data corruption and ensure proper operation:

1. **Initial Setup** (happens first, before Steps 1-3)
   - User selects XML file
   - User selects audio folder
   - **Ask user about case sensitivity** for filename matching:
     - Show prominent dialog: "Is your file system case-sensitive?"
     - Default: Case-insensitive (most Windows users)
     - Explain the difference clearly so user understands the question
   - App parses XML (UTF-16) and caches all data
   - **Check for duplicate Reference numbers** → Show warning immediately
   - If duplicates found, offer user option to fix them NOW (before proceeding)
   - This prevents confusion during matching (Steps 3a/3b)
   - **Check for empty `<SoundFile>` elements:**
     - Warn user about records with empty `<SoundFile>` elements
     - For each empty `<SoundFile>`, offer options:
       - Manually enter the base filename (one at a time)
       - Auto-generate from formula (e.g., Reference + "_" + Gloss + ".wav")
       - Provide UI for easy formula building:
         - Dropdown to select fields (Reference, Gloss, any other field)
         - Text input for separators and literal text
         - Preview showing what would be generated for each record
         - Apply formula to all empty SoundFile elements at once
       - Skip this record (exclude from processing)
     - **IMPORTANT:** When auto-generating:
       - Replace spaces in field values with underscores (e.g., "big pig" → "big_pig")
       - Remove or replace special characters that are invalid in filenames
       - Show preview before applying so user can verify
       - Update XML `<SoundFile>` elements with generated values (UTF-16 encoding)
     - Make this process easy and fast (bulk operations where possible)
     - Records with empty `<SoundFile>` that user doesn't fix are skipped throughout

2. **Steps 1-3** (configuration and matching)
   - User completes Steps 1, 2, and 3 (detailed below)
   - NO file operations occur during these steps
   - All changes are queued only

3. **Change Queue Review & Application** (happens after Step 3 complete)
   - Show all queued operations for review
   - User confirms/modifies queue
   - Backup prompt
   - Apply all changes at once
   - Generate logs

### Three-Step Configuration Process

#### Step 1: Field-to-Suffix Mapping
**Data needed:** Parsed XML (from Initial Setup), audio folder scan
**Produces:** Suffix-to-field mappings (saved to config)
**File operations:** None (read-only scanning)

1. **Scan XML file** for all unique field names (daughters of `<data_form>`)
   - Use cached parsed XML from Initial Setup
   - Exclude `<Reference>` and `<SoundFile>` by default
   - Provide option to include them if user wants
   
2. **Extract base sound filenames** from `<SoundFile>` elements throughout the XML
   - Use cached XML data (no re-parsing needed)

3. **Scan audio folder** for all WAV files and identify suffixes:
   - **File extension handling:**
     - Accept both `.wav` and `.WAV` (case-insensitive extension matching)
     - If `<SoundFile>` has `.wav` but actual file is `.WAV` (or vice versa), warn user
     - Offer to auto-fix extension case mismatches in bulk
   - Compare actual filenames against base filenames (respecting case sensitivity setting from Initial Setup)
   - Extract the portion between base filename and `.wav`/`.WAV` extension
   - **IMPORTANT: Suffix extraction logic:**
     - If base is "0021_pig.wav" and actual file is "0021_pig-phon.wav", suffix is "-phon"
     - Remove the base filename INCLUDING its extension from the actual filename, then remove the actual file's extension
     - Example: "0021_pig-phon.wav" → remove "0021_pig" → "-phon.wav" → remove ".wav" → suffix is "-phon"
     - Empty suffix means the file exactly matches the base filename
   - **Handle overlapping base filenames (CRITICAL):**
     - If multiple base filenames could match the same audio file, use **longest matching base filename**
     - Example scenario:
       - Bases: "0021_pig.wav" and "0021_piggy.wav"
       - Actual file: "0021_piggy-phon.wav"
       - Could be: base "0021_pig" + suffix "gy-phon" OR base "0021_piggy" + suffix "-phon"
       - **Choose: base "0021_piggy" + suffix "-phon"** (longest match)
     - **Detect ambiguous cases:**
       - When a file matches multiple bases, flag it as potentially ambiguous
       - If any ambiguous cases found, show **confirmation dialog** before proceeding to Step 1 mapping UI:
         - List all ambiguous files with their assigned interpretation
         - Example: "`0021_piggy-phon.wav` → base: `0021_piggy.wav`, suffix: `-phon` (could also be base: `0021_pig.wav`, suffix: `gy-phon`)"
         - Allow user to change the interpretation if wrong
         - User must confirm/correct all ambiguous cases before proceeding
       - This happens BEFORE showing the suffix-to-field mapping UI
   - Handle other edge cases:
     - If base "0021_pig.wav" exists AND "0021_piggy.wav" exists in `<SoundFile>` elements, treat both as separate base files
     - **Warn user** about suffixes that don't start with hyphen
   - Add "no suffix" option if base filenames (without suffixes) exist in audio folder

4. **Present matching UI:**
   - Left column: List of all found suffixes (including "no suffix/whole record")
   - Right column: List of all field names (plus "whole record" option)
   - Allow drag-and-drop or selection to map suffixes to fields
   - One suffix can map to multiple fields
   - Some suffixes may remain unmapped (orphaned)
   - Default: "no suffix" → "whole record"

#### Step 2: Conditional Expectations
**Data needed:** Field list from Step 1, suffix mappings from Step 1
**Produces:** Conditional rules (saved to config)
**File operations:** None

For each field that has a suffix mapping, allow user to define when a recording is expected:

1. **Condition Builder UI:**
   - Field selector (choose which field to evaluate)
   - Operator: Non-empty, Empty, Equals, Contains, Does not contain, Regex match
   - Value input (for Equals/Contains/Regex)
   - Boolean logic: AND, OR, NOT groupings (nested)
   - Can compare field to literal values or other fields

2. **Example use case:**
   - "Only expect `<Xbig>` field audio if `<Category>` does not contain 'Noun'"
   - "Expect `<Phonetic>` audio for all records where `<Phonetic>` is non-empty"

3. **Default behavior:**
   - Global setting: "Include empty fields" (default: yes)
     - If yes: Expect audio for all records, even if field is empty
     - If no: Only expect audio for records where field is non-empty
     - Rationale: Users often record before transcribing, so empty fields may still have audio
   - "Non-empty" definition: Field exists and contains non-whitespace characters
   - Individual conditions override this default for specific fields
   - Example: User can set condition "Only expect `<ToneFrame>` audio if `<Category>` = 'Noun'" to avoid false "missing file" warnings for Verbs

#### Step 3: Identify Mismatches and Queue Changes
**Data needed:** Parsed XML, suffix mappings (Step 1), conditional rules (Step 2), current audio folder state
**Produces:** Queue of file operations (renames, orphan moves, unrecorded markings)
**File operations:** None yet - only queuing

**CRITICAL:** This step only QUEUES operations. NO actual file changes occur until Post-Processing.

1. **Generate expected files list:**
   - For each record in cached XML, apply suffix mappings and conditional rules
   - Build list of files that should exist
   - Preserve leading zeroes in Reference numbers
   - **Use current state of audio folder** (before any renames)

2. **Compare with actual audio folder:**
   - Scan audio folder again (get fresh snapshot)
   - **Missing files:** Expected files that don't exist in current folder state
   - **Orphaned files:** Existing files that don't match any expected file

3. **Two-Step Matching Process:**

   **Step 3a: Suggested Matches Review**
   - Run fuzzy matching algorithm:
     - Calculate similarity based on:
       - Reference number proximity (accounting for leading zeroes)
       - Levenshtein distance on filenames
       - Field content matching (especially `<Gloss>`)
     - Rank matches by confidence score
   - Display all suggested matches in a list/table:
     - Show: Orphaned filename (current name), proposed record (Reference, Gloss), proposed field, expected filename (new name), confidence score
     - Each suggestion has a checkbox (checked by default for high-confidence matches)
     - User can uncheck suggestions they don't want to apply
     - User can adjust/edit suggestions before confirming
     - Include audio preview for each suggestion
   - User reviews and confirms which suggestions to accept
   - **QUEUE these rename operations** (don't execute yet)
   - Proceed to Step 3b with approved matches

   **Step 3b: Two-Pane Matching Interface**
   - **IMPORTANT:** Still working with original filenames - no renames have occurred yet
   - Display shows what files WILL be after operations applied
   
   - **Split-pane view (default):**
     - Left pane: Missing files (expected but not found)
       - Show: Reference, `<Phonetic>` (if exists), `<Gloss>` (if exists), field name, expected filename
       - Allow user to customize which fields to display
       - **Show approved matches from Step 3a as already linked** (with visual indicator)
       - These show the EXPECTED filename that orphan will be renamed to
     - Right pane: Orphaned files (found but not expected)
       - Show: Current filename (original name in audio folder)
       - Exclude files already queued for linking in Step 3a
       - Show fuzzy match suggestions ranked by confidence for remaining orphans
     - Users can:
       - Unlink previously approved matches (returns to orphan list, removes from queue)
       - Drag orphaned file from right to missing file on left to create new link
       - Each link adds a rename operation to the queue
       - Manually adjust any linkages (updates queue)
   
   - **Confidence/similarity view (alternative):**
     - Sorted list of all potential matches (including approved ones)
     - Show confidence score, both sides of match, linked status
     - Allow filtering and sorting
     - Toggle between views as needed

4. **Additional Linking Actions:**
   - **Preview:** Show full record details and play audio for any selected match (using current filename)
   - **Queue all operations** (don't execute immediately)
   - Allow marking file as "permanently orphaned" → queues move to orphans folder
   - Allow marking missing recording as "intentionally unrecorded" → excludes from reports
   - Batch operations: Select multiple items for same action (all added to queue)

5. **At end of Step 3:**
   - All user decisions converted to queued operations
   - No files have been renamed or moved yet
   - Queue contains:
     - Rename operations (orphan current name → expected name)
     - Move operations (orphans → orphans folder)
     - Exclusion markers (don't report as missing)

### Post-Processing (Happens AFTER Step 3 Complete)

**CRITICAL ORDER:** Execute operations in this sequence to prevent file conflicts:

#### Change Queue Review
**Before applying any changes:**
1. Show all queued operations in order they'll be executed:
   - Renames (orphan → expected name)
   - Moves to orphans folder
   - Items marked as unrecorded (for reporting only)
2. Allow user to review and modify queue
3. **Detect potential conflicts:**
   - Check if any target filename already exists
   - Check if two operations try to create same filename
   - Show warnings and require resolution before proceeding
4. **CRITICAL: Backup Warning Modal**
   - Show prominent modal dialog strongly recommending backup
   - Message should emphasize: "STRONGLY RECOMMENDED: Create a backup copy of your audio folder before proceeding. File operations cannot be automatically undone."
   - Provide three options:
     - "Create Backup Now" (opens folder selector, copies entire audio folder)
     - "I Already Have a Backup" (proceeds to confirmation)
     - "Cancel" (returns to Step 3b for more edits)
   - Modal should be attention-grabbing (warning colors, clear typography)
   - Don't allow proceeding without explicit acknowledgment
5. User confirms to proceed with file operations

#### Execute File Operations (All at Once)
**Order of execution:**
1. **First: Create orphans folder** (if doesn't exist)
   - Default location: `<audio_folder>/orphans/`
   - Or user-specified location from settings
2. **Second: Move orphaned files** to orphans folder
   - This clears space for renames that might need those names
   - Preserve original filename when moving (just change directory)
3. **Third: Rename files** to link them to records
   - Execute in order to avoid filename conflicts
   - Only rename files still in main audio folder (not those already moved to orphans)
   - If conflict detected, abort and show error
4. **Fourth: Copy JSON history** to orphans folder
5. **Generate logs** for all operations completed

**CRITICAL:** During rename operations, make sure the file still exists at its expected location before attempting rename. If a file was queued for both rename and orphan-move, the orphan-move (step 2) takes precedence and the rename should be skipped.

#### XML Modifications (If Duplicate References Were Fixed)
- **Timing:** These should have been done during Initial Setup, before Steps 1-3
- If XML was modified during Initial Setup:
  - Changes were already saved with UTF-16 encoding
  - Sound files that matched old Reference numbers were already renamed
  - No further XML modifications needed here
- **IMPORTANT:** Do NOT modify XML during Post-Processing
  - The XML shown to users in Step 3 should reflect current state (including any fixes from Initial Setup)
  - If user manually changes a Reference during duplicate fixing, update XML immediately, not during Post-Processing

#### Logging System
**Generated during file operations execution:**

**Human-readable log (Markdown):**
- File: `soundfile_changes.md` (append if exists)
- Write entries as operations are executed
- Format:
```markdown
## 2025-11-24 14:32:15

### Renamed Files
- `0021_pig-phon.wav` → `0021_pork-phon.wav`
  - Linked to Record 0021, field Phonetic
  - Reason: Gloss changed from "pig" to "pork"

### Orphaned Files Moved
- `0034_old-phon.wav` → `orphans/0034_old-phon.wav`
  - Reason: No matching record found
```

**Machine-readable log (JSON):**
- File: `soundfile_changes.json`
- Update as operations are executed
- Structure: Array of file history objects
- Each file gets a unique ID that persists through renames
- Format:
```json
{
  "files": [
    {
      "file_id": "uuid-1234",
      "current_path": "audio/0021_pork-phon.wav",
      "history": [
        {
          "timestamp": "2025-11-24T14:32:15Z",
          "operation": "rename",
          "old_path": "audio/0021_pig-phon.wav",
          "new_path": "audio/0021_pork-phon.wav",
          "reason": "linked_to_record",
          "record_reference": "0021",
          "field_name": "Phonetic"
        }
      ]
    },
    {
      "file_id": "uuid-5678",
      "current_path": "orphans/0034_old-phon.wav",
      "history": [
        {
          "timestamp": "2025-11-24T14:33:02Z",
          "operation": "move_to_orphans",
          "old_path": "audio/0034_old-phon.wav",
          "new_path": "orphans/0034_old-phon.wav",
          "reason": "no_matching_record"
        }
      ]
    }
  ]
}
```
- Copy to orphans folder so orphaned files maintain history

#### Unrecorded List Generation
**Generated after all file operations complete:**

Generate a to-do list of records/fields that need recordings:
- File: `unrecorded_fields.md`
- Include only items user didn't mark as "intentionally unrecorded"
- Format:
```markdown
# Unrecorded Fields To-Do List
Generated: 2025-11-24 14:35:00

## Record 0025 - "dog"
- [ ] Phonetic (expected: 0025_dog-phon.wav)
- [ ] Xbig (expected: 0025_dog-xbig.wav)

## Record 0031 - "cat"
- [ ] Phonetic (expected: 0031_cat-phon.wav)
```

## Persistence & Settings

### Project Settings File
- File: `<xml_filename>_soundfile_config.json` (stored alongside XML file)
- Example: If XML is `/data/mydata.xml`, config is `/data/mydata_soundfile_config.json`
- Contains:
  - Field-to-suffix mappings from Step 1
  - Conditional rules from Step 2
  - Last used XML path and audio folder path
  - UI preferences (which fields to display in results)
  - Case sensitivity setting
  - "Include empty fields" global setting
  - Orphans folder location (if customized)

### Settings Management
- Auto-save settings after each step completion
- On startup: Load settings if found for selected XML file
- Provide "Reset to defaults" button to clear all settings for current project
- If user selects different XML file: Ask whether to keep current settings or load settings for new file (or use defaults if none exist)
- **IMPORTANT:** Settings are per-project (per XML file), not global

### Session Persistence
- Remember last XML file and audio folder paths
- Restore on next app launch

## User Interface Requirements

### Overall Design
- Clean, professional interface suitable for academic/linguistic work
- Responsive layout that works on various screen sizes
- Clear visual hierarchy and intuitive navigation

### Key UI Components

**Main Window:**
- Menu bar: File (Open XML, Select Audio Folder, Backup, Exit), Settings (Reset, Preferences), Help
- Status bar: Current XML file, audio folder, record count, file count
- Progress indicators for long operations

**Step 1 - Mapping Interface:**
- Two-column layout with drag-and-drop
- Visual feedback for mapped/unmapped items
- Counter showing how many suffixes remain unmapped
- Warning icons for suffixes without hyphens

**Step 2 - Conditions Builder:**
- Collapsible sections per field
- Visual representation of AND/OR/NOT logic
- "Add condition" and "Add group" buttons
- Test button to preview how many records match conditions

**Step 3a - Suggested Matches Review:**
- Table/list view of all fuzzy match suggestions
- Checkboxes for batch acceptance/rejection
- Confidence score indicators (color-coded)
- Audio preview for each suggestion
- Edit/adjust capability before confirmation
- "Accept selected" and "Skip to manual matching" buttons

**Step 3b - Manual Matching Interface:**
- Toggle between split-pane and confidence views
- Visual indicators for already-linked items (from Step 3a)
- Ability to unlink and re-link any match
- Search/filter functionality
- Batch operations (mark multiple as orphaned/unrecorded)
- Audio player widget with play/pause, scrubbing, time display
- Record detail panel showing all fields
- Drag-and-drop zones with clear visual feedback

**Change Queue Review:**
- Table view of pending operations
- Undo/redo individual changes
- Conflict detection and warnings
- **Prominent backup warning modal** with three options:
  - Create backup now (with folder picker)
  - Confirm existing backup
  - Cancel to make more edits
- Batch apply confirmation dialog

## Edge Cases & Error Handling

### Duplicate Reference Numbers
**Timing: Handle during Initial Setup, before Steps 1-3**
- Detect duplicate Reference numbers when first parsing XML
- Show warning dialog immediately
- Offer user option to fix duplicates now:
  - Show list of duplicate References with their records
  - Allow user to assign new Reference numbers
  - Preserve exact XML formatting (declaration, whitespace, structure)
  - Only modify the text content of the `<Reference>` element
  - Save XML with UTF-16 encoding
  - Automatically rename any associated sound files that already match old Reference
  - Do this BEFORE Steps 1-3 so suffix detection works correctly
- If user declines to fix: Treat as separate records throughout (show index/distinguisher in UI)

### Filename Conflicts During Execution
**Timing: Check during Change Queue Review, before execution**
- Before executing queue, verify no target filename already exists
- If conflict found:
  - Show warning to user
  - Allow manual resolution (pick different name, skip operation, etc.)
  - Don't proceed until resolved
- During execution, if unexpected conflict occurs:
  - Halt operations
  - Show detailed error
  - Provide rollback option if possible

### Multiple Potential Matches
- Show all ranked by confidence score
- Require manual selection
- Allow "none of these" option

### Invalid Paths Between Sessions
- If saved XML file path or audio folder path no longer exists:
  - Show warning dialog on startup
  - Prompt user to locate the correct folder/file
  - Update saved settings with new path

### Cancellation During Long Operations
- Allow user to cancel during:
  - Initial XML parsing (safe - no changes made)
  - Audio folder scanning (safe - no changes made)
  - Fuzzy matching calculation (safe - no changes made)
  - **File operations execution (DANGEROUS):**
    - Show strong warning: "Canceling during file operations may leave audio folder in inconsistent state"
    - Recommend completing operations or using backup to restore
    - If user insists on canceling:
      - Stop after current file operation completes (don't leave half-renamed file)
      - Log which operations completed and which didn't
      - Show detailed status report
- Provide progress indicators for all long-running operations

### File System Issues
- Handle locked files gracefully
- Validate write permissions before operations
- Provide clear error messages with recovery suggestions

### Large Databases
- Target: 2000-5000 records with ~12 files each (24,000-60,000 files)
- Use background threading for file scanning
- Cache parsed data in memory
- Show progress indicators for long operations
- **No pagination** - load all results but optimize rendering

### XML Parsing
- **CRITICAL: Use UTF-16 encoding for all XML operations**
  - Specify `encoding='utf-16'` explicitly when opening files
  - Do NOT allow default UTF-8 encoding
  - When writing (for duplicate Reference fixes), save as UTF-16
- Handle malformed XML gracefully
- Preserve exact formatting on read
- Preserve exact formatting when writing (for duplicate Reference fixes only)
- Validate structure (check for `<phon_data>` root, `<data_form>` records)

### Audio Files
- Support 16-bit, 24-bit, and 32-bit WAV files
- Handle playback errors gracefully (show error message, don't crash)
- Don't validate audio encoding or sample rate - only work with filenames/existence
- Provide playback controls in matching UI
- **IMPORTANT:** Audio playback is for preview only during matching
  - Don't require audio playback to work for core functionality
  - If audio library fails to load, show warning but allow app to continue
  - Core file matching/renaming should work even if playback doesn't

## Development Priorities

### Phase 1 - Core Functionality (MVP)
1. XML parsing and field extraction
2. Audio folder scanning and suffix detection
3. Step 1: Field-to-suffix mapping UI
4. Step 3: Basic mismatch detection and display
5. Simple linking/renaming functionality
6. Basic logging

### Phase 2 - Advanced Features
1. Step 2: Conditional expectations builder
2. Fuzzy matching algorithm
3. Drag-and-drop interface refinements
4. Audio playback with scrubbing
5. Change queue system
6. Backup functionality

### Phase 3 - Polish & Performance
1. Settings persistence
2. Duplicate Reference handling
3. Performance optimization for large databases
4. Comprehensive error handling
5. User preferences and customization
6. Documentation and licensing:
   - **README.md** with setup instructions, dependencies, usage guide
   - **LICENSE** file (AGPL 3.0)
   - **ATTRIBUTIONS.md** file listing:
     - Copyright Seth Johnston 2025
     - Claude Sonnet VS Code agent contribution
     - GitHub Copilot coding agent contribution
     - All third-party libraries used with their licenses
   - **docs/** folder containing:
     - User-facing website (HTML/CSS)
     - Extensive documentation
     - Dummy download links (placeholder for future releases)
     - Screenshots and usage examples

## Testing Requirements
- Test with databases of varying sizes (100, 1000, 5000 records)
- Test with various suffix patterns (with/without hyphens, dots, underscores)
- Test with duplicate Reference numbers
- Test with missing/corrupted audio files
- Test XML preservation (verify no changes to source XML)
- Test leading zero preservation in Reference numbers
- Test on macOS (primary target platform)

## Success Criteria
- User can complete full workflow (Steps 1-3) without crashes
- All file renames are accurately logged
- XML file remains completely unchanged
- Performance acceptable with 5000 records × 12 files
- Intuitive UI requiring minimal training
- All orphaned files and missing recordings correctly identified

## Future Enhancements (Not Required Now)
- Undo functionality reading from JSON logs
- Semantic similarity matching for glosses
- Batch editing of multiple records
- Export/import of settings configurations
- Support for other audio formats beyond WAV
- Direct editing of XML from within app
- Collaborative features for teams

---

## Important Reminders
1. **UTF-16 encoding is mandatory** - explicitly specify UTF-16 for all XML read/write operations (do NOT use UTF-8)
2. **XML editing limited** - only modify `<Reference>` element text content to fix duplicates; preserve exact formatting
3. **Preserve leading zeroes** in Reference numbers throughout
4. **Case sensitivity** - ask user during Initial Setup, make question prominent and clear
5. **Handle empty `<SoundFile>` elements** - offer manual entry, auto-generation, or skip; make process easy
6. **File extensions case-insensitive** - accept .wav and .WAV, warn about mismatches, offer auto-fix
7. **Two-step matching** - (3a) suggested matches review with checkboxes, then (3b) two-pane manual matching
8. **Python for logic**, JavaScript for UI only
9. **No HTTP server** - use pywebview's direct API, not Flask/web server
10. **All matches need user review** - suggest but don't auto-apply without confirmation
11. **Prominent backup warning modal** - strongly recommend backup before any file operations, with option to create backup from within app
12. **Allow cancellation** - all long operations should be cancelable with appropriate warnings for dangerous operations
13. **Complete history logging** for every file operation
14. **Full documentation required** - README, AGPL 3.0 LICENSE, ATTRIBUTIONS, and docs/ website