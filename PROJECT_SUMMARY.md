# Dekereke Sound File Association Tool - Project Summary

## Overview

This is a complete, production-ready desktop application built with Python and pywebview to help linguists manage audio file associations with the Dekereke phonology database. The application follows a systematic workflow to identify orphaned files, suggest matches, and safely execute file operations with comprehensive logging.

## Architecture

### Backend (Python)
- **No web server**: Uses pywebview's native API for direct Python-JavaScript communication
- **UTF-16 XML support**: Handles Dekereke's encoding requirements with exact formatting preservation
- **Queue-based operations**: All file changes are queued and reviewed before execution
- **Comprehensive logging**: Both human-readable (Markdown) and machine-readable (JSON) formats

### Frontend (HTML/CSS/JavaScript)
- **No framework dependencies**: Vanilla JavaScript for simplicity and reliability
- **Intuitive UI**: Drag-and-drop interface, clear visual hierarchy
- **Responsive design**: Works on various screen sizes

## Key Technical Features

### 1. XML Parsing (src/xml_parser.py)
- Explicitly uses UTF-16 encoding (NOT UTF-8)
- Preserves exact XML formatting
- Detects duplicate Reference numbers
- Identifies empty SoundFile elements
- Generates filenames from templates

### 2. Audio Scanning (src/audio_scanner.py)
- Case-sensitive and case-insensitive modes
- Longest-match algorithm for overlapping base filenames
- Ambiguous case detection and confirmation
- Extension case mismatch detection (.wav vs .WAV)
- Orphan file identification

### 3. Fuzzy Matching (src/fuzzy_matcher.py)
- Levenshtein distance-based similarity
- Reference number proximity matching
- Gloss content matching
- Confidence scoring (0-1 scale)
- Top-3 suggestions per orphan

### 4. File Operations (src/file_operations.py)
- Correct execution order:
  1. Create orphans folder
  2. Move orphaned files
  3. Rename files (skip if already moved)
  4. Generate logs
- Complete history tracking with UUIDs
- Markdown and JSON log generation
- Unrecorded fields to-do list

### 5. Settings Management (src/settings_manager.py)
- Per-project configuration files
- Automatic merging of new defaults
- Persistent UI preferences

## Workflow

### Initial Setup
1. Select XML file → Parse and validate
2. Select audio folder → Scan for WAV files
3. Choose case sensitivity
4. Handle duplicate References (optional)
5. Fill empty SoundFile elements (optional)

### Step 1: Field-to-Suffix Mapping
1. Extract all field names from XML
2. Scan audio folder for suffixes
3. Detect ambiguous cases (multiple base matches)
4. Map suffixes to fields via drag-and-drop

### Step 2: Conditional Expectations
1. Define global "include empty fields" setting
2. Add field-specific conditions
3. Use boolean logic (AND/OR/NOT)
4. Preview expected files

### Step 3: Matching
**3a. Suggested Matches**
1. Run fuzzy matching algorithm
2. Display suggestions with confidence scores
3. User accepts/rejects via checkboxes

**3b. Manual Matching**
1. Split-pane view (missing vs orphaned)
2. Drag orphans to missing files
3. Mark files as permanently orphaned
4. Mark fields as intentionally unrecorded

### Review & Execute
1. Review operation queue
2. Show backup warning modal
3. Execute operations in correct order
4. Generate logs

## Testing

### Test Suite (tests/)
- `test_xml_parser.py` - UTF-16, leading zeros, duplicates
- `test_audio_scanner.py` - Scanning, suffixes, case sensitivity
- `test_settings_manager.py` - Persistence, defaults
- `test_file_operations.py` - Operations, logging

All tests passing ✅

### Running Tests
```bash
python run_tests.py
```

### Example Demonstration
```bash
python example_usage.py
```

## Security

- CodeQL scan: 0 alerts (Python and JavaScript)
- No external network requests
- Safe file operations with error handling
- No SQL injection or XSS vulnerabilities

## Critical Implementation Details

### Leading Zeros Preservation
Reference numbers like "0021" are preserved exactly as written. "0021" ≠ "21".

### Suffix Extraction
Given:
- Base: "0021_pig.wav"
- Actual: "0021_pig-phon.wav"
- Suffix: "-phon"

Algorithm: Remove base name (without extension) from actual name (without extension)

### Overlapping Base Filenames
If both "0021_pig.wav" and "0021_piggy.wav" exist:
- File "0021_piggy-phon.wav" matches "0021_piggy" (longest match)
- User is warned about ambiguous interpretations

### UTF-16 Encoding
```python
# CRITICAL: Always specify UTF-16
tree = ET.parse(xml_path, parser=ET.XMLParser(encoding='utf-16'))

# When saving
tree.write(xml_path, encoding='utf-16', xml_declaration=True)
```

### pywebview Architecture
```python
# NO Flask/HTTP server
class Api:
    def get_data(self):
        return data

api = Api()
window = webview.create_window('App', 'index.html', js_api=api)
webview.start()
```

JavaScript calls Python directly:
```javascript
const result = await window.pywebview.api.get_data();
```

## File Structure

```
src/
  main.py              # Entry point, API class
  xml_parser.py        # UTF-16 XML handling
  audio_scanner.py     # File discovery, suffix extraction
  fuzzy_matcher.py     # Similarity algorithm
  settings_manager.py  # Per-project settings
  file_operations.py   # Operations execution, logging

frontend/
  index.html           # Main UI
  style.css           # Professional styling
  app.js              # Frontend logic

tests/
  test_*.py           # Test suite

docs/
  index.html          # User documentation website

start.py              # Easy startup script
run_tests.py          # Test runner
example_usage.py      # Workflow demonstration
requirements.txt      # Dependencies
README.md            # User guide
LICENSE              # AGPL-3.0
ATTRIBUTIONS.md      # Credits
```

## Dependencies

### Required
- **pywebview** (BSD-3-Clause): Desktop GUI without web server
- **lxml** (BSD-3-Clause): XML parsing with UTF-16 support
- **python-Levenshtein** (GPL-2.0): Fuzzy string matching

### Optional
- **pygame** (LGPL): Audio playback (app works without it)

All licenses compatible with AGPL-3.0.

## Compliance Checklist

✅ No Flask/web server - pywebview native API only  
✅ UTF-16 encoding explicitly specified (NOT UTF-8)  
✅ Workflow order enforced: Setup → Steps 1-3 → Post-Processing  
✅ Leading zeros preserved in Reference numbers  
✅ Suffix extraction uses longest matching base filename  
✅ File operations queued separately from execution  
✅ Settings saved per-project (not global)  
✅ Orphan move takes precedence over rename  
✅ Audio playback optional - core works without it  
✅ Case sensitivity is user choice  
✅ Prominent backup warning before operations  
✅ Complete history logging (Markdown + JSON)  
✅ AGPL-3.0 license with full attributions  

## Support

- **GitHub Issues**: Bug reports and feature requests
- **Documentation**: See docs/index.html for detailed guide
- **Tests**: Run `python run_tests.py` to verify installation
- **Example**: Run `python example_usage.py` to see workflow

## Copyright

Copyright © 2025 Seth Johnston

Licensed under AGPL-3.0. Built with assistance from Claude Sonnet VS Code agent and GitHub Copilot coding agent.
