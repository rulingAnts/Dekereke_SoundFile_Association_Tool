# Dekereke Sound File Association Tool

A comprehensive Python-based desktop application for linguists working with the Dekereke phonology database. This tool helps manage audio file associations, identify orphaned recordings, and maintain database-audio file synchronization.

## Features

- **UTF-16 XML Support**: Properly handles Dekereke's UTF-16 encoded XML files
- **Intelligent Suffix Matching**: Maps audio file suffixes to database fields
- **Fuzzy Matching**: Automatically suggests matches for orphaned files
- **Conditional Expectations**: Define when recordings are expected based on field values
- **Safe File Operations**: Queue-based operations with backup warnings
- **Comprehensive Logging**: Both human-readable (Markdown) and machine-readable (JSON) logs
- **Case Sensitivity Control**: User-configurable for different file systems
- **Duplicate Detection**: Identifies and helps fix duplicate Reference numbers

## Requirements

- Python 3.8 or higher
- macOS (primary), Windows (compatible)
- Audio files in WAV format

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/rulingAnts/Dekereke_SoundFile_Association_Tool.git
   cd Dekereke_SoundFile_Association_Tool
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the application:**
   ```bash
   cd src
   python main.py
   ```

## Usage

### Initial Setup

1. **Select XML File**: Choose your Dekereke XML database file
2. **Select Audio Folder**: Choose the folder containing your WAV files
3. **Set Case Sensitivity**: Choose whether your file system is case-sensitive
4. **Handle Warnings**: Address any duplicate Reference numbers or empty SoundFile elements

### Step 1: Field-to-Suffix Mapping

Map audio file suffixes (e.g., "-phon", "-xbig") to database fields. Drag suffixes from the left column to fields on the right.

### Step 2: Conditional Expectations

Define when recordings are expected for each field. For example:
- Only expect `<Phonetic>` audio if the Phonetic field is non-empty
- Only expect `<Xbig>` audio if Category is not "Noun"

### Step 3: Matching

**Step 3a - Suggested Matches**: Review automatically suggested matches with confidence scores. Check boxes to accept matches.

**Step 3b - Manual Matching**: Drag orphaned files to missing expected files to create matches. Mark files as permanently orphaned or intentionally unrecorded.

### Review & Execute

Review all queued operations, create a backup, and execute file operations.

## File Operations

The tool performs operations in this order:
1. Create orphans folder
2. Move orphaned files to orphans folder
3. Rename files to link them to records
4. Generate logs

All operations are logged in:
- `soundfile_changes.md` - Human-readable log
- `soundfile_changes.json` - Machine-readable log with complete history
- `unrecorded_fields.md` - To-do list of missing recordings

## Settings

Settings are saved per-project in a file named `<xml_filename>_soundfile_config.json`. Settings include:
- Suffix-to-field mappings
- Conditional rules
- Case sensitivity preference
- UI preferences

## Critical Notes

- **UTF-16 Encoding**: The XML files must be UTF-16 encoded (not UTF-8)
- **Leading Zeros**: Reference numbers preserve leading zeros (e.g., "0021" ≠ "21")
- **No Auto-Changes**: The tool never modifies files without user confirmation
- **Backup Recommended**: Always create a backup before executing file operations

## Troubleshooting

**Audio playback not working**: The core functionality (matching and renaming) works without audio playback. Playback is optional for preview.

**XML parsing fails**: Ensure your XML file is UTF-16 encoded and has the correct structure with `<phon_data>` root element.

**Permission errors**: Ensure you have write permissions for the audio folder.

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). See [LICENSE](LICENSE) for details.

## Attributions

See [ATTRIBUTIONS.md](ATTRIBUTIONS.md) for complete credits and third-party licenses.

## Contributing

This is a specialized tool for linguistic research. If you find bugs or have suggestions, please open an issue on GitHub.

## Support

For questions or issues:
- Open an issue on GitHub
- See the [documentation](docs/index.html) for detailed usage instructions

---

**Copyright © 2025 Seth Johnston**

Built with assistance from Claude Sonnet VS Code agent and GitHub Copilot coding agent.
