"""
Main Application for Dekereke Sound File Association Tool
Uses pywebview for desktop GUI with Python backend
"""

import webview
import os
import json
from typing import Dict, List, Optional, Any
from urllib.parse import quote
from datetime import datetime
import uuid
import shutil
import xml.etree.ElementTree as ET
import base64
import pyperclip

from xml_parser import DekeRekeXMLParser
from audio_scanner import AudioFolderScanner
from fuzzy_matcher import FuzzyMatcher
from settings_manager import SettingsManager
from file_operations import FileOperationsManager


class DekeRekeAPI:
    """API class exposed to JavaScript frontend via pywebview"""
    
    def __init__(self):
        self.xml_parser = None
        self.audio_scanner = None
        self.fuzzy_matcher = None
        self.settings_manager = None
        self.file_ops = None
        
        self.xml_path = None
        self.audio_folder = None
        self.case_sensitive = False
        
        # State
        self.suffix_mappings = {}  # suffix -> [field_names]
        self.conditional_rules = {}  # field_name -> rules
        self.operation_queue = []  # list of operations to execute
        
        # Cache empty soundfile info
        self.empty_soundfile_indices = []
        
        # App-level settings file
        self.app_settings_path = os.path.join(os.path.expanduser('~'), '.dekereke_app_settings.json')
        self.app_settings = self._load_app_settings()
    
    def _load_app_settings(self) -> Dict[str, Any]:
        """Load app-level settings from user's home directory"""
        defaults = {
            'last_xml_path': None,
            'last_audio_folder': None,
            'case_sensitive': False,
            'suffix_mappings': {},
            'conditional_rules': {},
            'field_groups': {},
            'group_filters': {},
            'expectation_modes': {}
        }
        
        try:
            if os.path.exists(self.app_settings_path):
                with open(self.app_settings_path, 'r', encoding='utf-8') as f:
                    loaded = json.load(f)
                    defaults.update(loaded)
        except Exception as e:
            print(f"Error loading app settings: {e}")
        
        return defaults
    
    def _save_app_settings(self):
        """Save app-level settings to user's home directory"""
        try:
            self.app_settings['last_xml_path'] = self.xml_path
            self.app_settings['last_audio_folder'] = self.audio_folder
            self.app_settings['case_sensitive'] = self.case_sensitive
            self.app_settings['suffix_mappings'] = self.suffix_mappings
            self.app_settings['conditional_rules'] = self.conditional_rules
            
            with open(self.app_settings_path, 'w', encoding='utf-8') as f:
                json.dump(self.app_settings, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error saving app settings: {e}")
    
    def get_initial_settings(self) -> Dict[str, Any]:
        """Get initial settings to populate UI on startup"""
        return {
            'last_xml_path': self.app_settings.get('last_xml_path'),
            'last_audio_folder': self.app_settings.get('last_audio_folder'),
            'case_sensitive': self.app_settings.get('case_sensitive', False),
            'suffix_mappings': self.app_settings.get('suffix_mappings', {}),
            'conditional_rules': self.app_settings.get('conditional_rules', {}),
            'field_groups': self.app_settings.get('field_groups', {}),
            'group_filters': self.app_settings.get('group_filters', {}),
            'expectation_modes': self.app_settings.get('expectation_modes', {}),
            'datasheet_filters': self.app_settings.get('datasheet_filters', []),
            'visible_columns': self.app_settings.get('visible_columns', [])
        }
        
    def select_xml_file(self) -> Optional[str]:
        """Open file dialog to select XML file"""
        result = webview.windows[0].create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=False,
            file_types=('XML Files (*.xml)',)
        )
        
        if result and len(result) > 0:
            self.xml_path = result[0]
            self._save_app_settings()
            return self.xml_path
        return None
    
    def select_audio_folder(self) -> Optional[str]:
        """Open folder dialog to select audio folder"""
        result = webview.windows[0].create_file_dialog(
            webview.FOLDER_DIALOG
        )
        
        if result and len(result) > 0:
            self.audio_folder = result[0]
            self._save_app_settings()
            return self.audio_folder
        return None
    
    def parse_xml(self, xml_path: str) -> Dict[str, Any]:
        """
        Parse XML file and return basic info
        
        Returns:
            {
                'success': bool,
                'record_count': int,
                'field_names': list,
                'duplicates': dict,
                'empty_soundfiles': list,
                'error': str (if failed)
            }
        """
        try:
            self.xml_path = xml_path
            self.xml_parser = DekeRekeXMLParser(xml_path)
            
            if not self.xml_parser.parse():
                return {'success': False, 'error': 'Failed to parse XML file'}
            
            # Check for issues
            duplicates = self.xml_parser.find_duplicate_references()
            empty_soundfiles = self.xml_parser.find_empty_soundfiles()
            
            # Cache the empty soundfiles for later
            self.empty_soundfile_indices = empty_soundfiles
            
            # Load settings for this project
            self.settings_manager = SettingsManager(xml_path)
            self.settings_manager.load()
            
            # Restore suffix mappings and conditional rules from app settings
            self.suffix_mappings = self.app_settings.get('suffix_mappings', {})
            self.conditional_rules = self.app_settings.get('conditional_rules', {})
            # Restore field groups and group filters (used in expectations)
            # Field groups are accessed via self.app_settings in expectation checks
            # Group filters are provided to frontend via get_initial_settings
            
            return {
                'success': True,
                'record_count': len(self.xml_parser.records),
                'field_names': self.xml_parser.get_field_names(),
                'duplicates': duplicates,
                'empty_soundfiles': empty_soundfiles
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def set_case_sensitivity(self, case_sensitive: bool):
        """Set case sensitivity for matching"""
        self.case_sensitive = case_sensitive
        self._save_app_settings()
        if self.settings_manager:
            self.settings_manager.settings['case_sensitive'] = case_sensitive
            self.settings_manager.save()
    
    def scan_audio_folder(self, audio_folder: str) -> Dict[str, Any]:
        """
        Scan audio folder and return file list
        
        Returns:
            {
                'success': bool,
                'file_count': int,
                'files': list,
                'error': str (if failed)
            }
        """
        try:
            self.audio_folder = audio_folder
            self.audio_scanner = AudioFolderScanner(audio_folder, self.case_sensitive)
            
            if not self.audio_scanner.scan():
                return {'success': False, 'error': 'Failed to scan audio folder'}
            
            return {
                'success': True,
                'file_count': len(self.audio_scanner.audio_files),
                'files': self.audio_scanner.audio_files
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def extract_suffixes(self) -> Dict[str, Any]:
        """
        Extract suffixes from audio files based on SoundFile elements
        
        Returns:
            {
                'success': bool,
                'suffixes': dict (suffix -> file list),
                'ambiguous_cases': list,
                'extension_mismatches': list,
                'error': str (if failed)
            }
        """
        try:
            if not self.xml_parser or not self.audio_scanner:
                return {'success': False, 'error': 'XML or audio folder not loaded'}
            
            # Get base filenames from XML
            base_filenames = []
            for record in self.xml_parser.records:
                soundfile = record.get('SoundFile', '').strip()
                if soundfile:
                    base_filenames.append(soundfile)
            
            # Extract suffixes
            suffixes, ambiguous = self.audio_scanner.extract_suffixes(base_filenames)
            
            # Check for extension mismatches
            ext_mismatches = self.audio_scanner.check_extension_mismatches(base_filenames)
            
            return {
                'success': True,
                'suffixes': {k: v for k, v in suffixes.items()},
                'ambiguous_cases': ambiguous,
                'extension_mismatches': ext_mismatches
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def save_suffix_mappings(self, mappings: Dict[str, List[str]]):
        """
        Save suffix-to-field mappings
        
        Args:
            mappings: dict of suffix -> list of field names
        """
        self.suffix_mappings = mappings
        if self.settings_manager:
            self.settings_manager.settings['suffix_mappings'] = mappings
            self.settings_manager.save()
        self._save_app_settings()
    
    def load_dekereke_settings(self) -> Dict[str, Any]:
        """
        Load field-to-suffix mappings from Dekereke user settings XML file
        
        Returns:
            {
                'success': bool,
                'mappings': dict of suffix -> [field_names],
                'error': str (if failure)
            }
        """
        try:
            # Open file dialog
            result = webview.windows[0].create_file_dialog(
                webview.OPEN_DIALOG,
                allow_multiple=False,
                file_types=('XML Files (*.xml)',)
            )
            
            if not result or len(result) == 0:
                return {'success': False, 'error': 'No file selected'}
            
            settings_path = result[0]
            
            # Parse the XML file (UTF-16 encoding)
            tree = ET.parse(settings_path)
            root = tree.getroot()
            
            # Find column_to_sound_file_suffix_mappings section
            mappings_elem = root.find('column_to_sound_file_suffix_mappings')
            if mappings_elem is None:
                return {'success': False, 'error': 'No suffix mappings found in settings file'}
            
            # Parse mappings (format: "ColumnName\tsuffix")
            # We need to invert: suffix -> [column_names]
            suffix_to_fields = {}
            
            for mapping_elem in mappings_elem.findall('column_to_sound_file_suffix_mapping'):
                mapping_text = mapping_elem.text
                if mapping_text and '\t' in mapping_text:
                    parts = mapping_text.split('\t')
                    if len(parts) == 2:
                        field_name = parts[0].strip()
                        suffix = parts[1].strip()
                        
                        # Add to our inverted mapping
                        if suffix not in suffix_to_fields:
                            suffix_to_fields[suffix] = []
                        if field_name not in suffix_to_fields[suffix]:
                            suffix_to_fields[suffix].append(field_name)
            
            if not suffix_to_fields:
                return {'success': False, 'error': 'No valid mappings found in settings file'}
            
            # Save to our state
            self.suffix_mappings = suffix_to_fields
            if self.settings_manager:
                self.settings_manager.settings['suffix_mappings'] = suffix_to_fields
                self.settings_manager.save()
            
            return {
                'success': True,
                'mappings': suffix_to_fields,
                'count': len(suffix_to_fields)
            }
            
        except ET.ParseError as e:
            return {'success': False, 'error': f'XML parsing error: {str(e)}'}
        except Exception as e:
            return {'success': False, 'error': f'Error loading settings: {str(e)}'}
    
    def save_conditional_rules(self, rules: Dict[str, Any]):
        """
        Save conditional expectation rules
        
        Args:
            rules: dict of field_name -> rule definition
        """
        self.conditional_rules = rules
        if self.settings_manager:
            self.settings_manager.settings['conditional_rules'] = rules
            self.settings_manager.save()
        self._save_app_settings()
    
    def save_field_groups(self, groups: Dict[str, List[str]]):
        """
        Save field groups
        
        Args:
            groups: dict of group_name -> list of field names
        """
        self.app_settings['field_groups'] = groups
        self._save_app_settings()

    def save_group_filters(self, groups_filters: Dict[str, Any]):
        """
        Save filter conditions applied to groups

        Args:
            groups_filters: dict of group_name -> filter definition(s)
        """
        self.app_settings['group_filters'] = groups_filters
        self._save_app_settings()

    def save_expectation_modes(self, modes: Dict[str, str]):
        """
        Persist selected expectation mode per field/group.

        Args:
            modes: dict mapping field name or group key (e.g., __group__X) to one of
                   'always' | 'non-empty' | 'custom'
        """
        self.app_settings['expectation_modes'] = modes
        self._save_app_settings()
    
    def save_datasheet_settings(self, filters: List, visible_columns: List[str]):
        """
        Save data sheet settings (filters and visible columns)
        
        Args:
            filters: list of filter conditions
            visible_columns: list of visible column names
        """
        self.app_settings['datasheet_filters'] = filters
        self.app_settings['visible_columns'] = visible_columns
        self._save_app_settings()
    
    def get_audio_file_path(self, filename: str) -> Dict[str, Any]:
        """
        Get the full path to an audio file
        
        Args:
            filename: name of the audio file
            
        Returns:
            {'success': bool, 'path': str, 'error': str}
        """
        try:
            if not self.audio_folder:
                return {'success': False, 'error': 'No audio folder selected'}
            
            file_path = os.path.join(self.audio_folder, filename)
            
            if not os.path.exists(file_path):
                return {'success': False, 'error': 'File not found'}
            
            # Build a properly encoded file URL for WebView/HTML5 Audio
            # Use three slashes for absolute paths (file:///Users/...)
            encoded_path = quote(file_path)
            file_url = f"file:///{encoded_path.lstrip('/')}"
            return {'success': True, 'path': file_path, 'url': file_url}
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_audio_data_url(self, filename: str) -> Dict[str, Any]:
        """
        Return audio file as raw bytes for blob URL creation (more efficient than base64)
        Returns base64 as fallback for pywebview compatibility
        """
        try:
            if not self.audio_folder:
                return {'success': False, 'error': 'No audio folder selected'}

            file_path = os.path.join(self.audio_folder, filename)
            if not os.path.exists(file_path):
                return {'success': False, 'error': 'File not found'}

            # Detect MIME type from extension
            ext = os.path.splitext(filename)[1].lower()
            mime_map = {
                '.wav': 'audio/wav',
                '.mp3': 'audio/mpeg',
                '.m4a': 'audio/mp4',
                '.aac': 'audio/aac',
                '.aiff': 'audio/aiff',
                '.aif': 'audio/aiff',
                '.flac': 'audio/flac',
                '.ogg': 'audio/ogg',
            }
            mime = mime_map.get(ext, 'audio/wav')

            # Read file bytes
            with open(file_path, 'rb') as f:
                file_bytes = f.read()
            
            # Return both base64 (for fallback) and raw bytes (pywebview converts to JS ArrayBuffer)
            b64 = base64.b64encode(file_bytes).decode('ascii')
            
            return {
                'success': True,
                'bytes': list(file_bytes),  # Convert to list for JSON serialization
                'mime': mime,
                'size': len(file_bytes),
                'base64': b64  # Fallback for older pywebview versions
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_datasheet_data(self) -> Dict[str, Any]:
        """
        Get all data needed for Step 3 data sheet view
        
        Returns:
            {
                'success': bool,
                'records': list of dicts with all field values,
                'field_names': list of all fields,
                'mapped_fields': list of fields with suffix associations,
                'matched_files': dict mapping (record_idx, field, suffix) to filename,
                'expected_files': dict mapping (record_idx, field, suffix) to expected filename,
                'orphaned_files': list of unmatched filenames,
                'error': str (if failed)
            }
        """
        try:
            if not self.xml_parser or not self.audio_scanner:
                return {'success': False, 'error': 'XML or audio folder not loaded'}
            
            # Get all records
            records = []
            for record in self.xml_parser.records:
                records.append(dict(record))
            
            # Get field names
            field_names = self.xml_parser.field_names
            
            # Get fields with mappings
            mapped_fields = set()
            for suffix, fields in self.suffix_mappings.items():
                mapped_fields.update(fields)
            
            # Always include SoundFile if there's an empty suffix mapping
            if '' in self.suffix_mappings:
                mapped_fields.add('SoundFile')
            
            mapped_fields = sorted(list(mapped_fields))
            
            # Build matched files dict: (record_idx, field, suffix) -> filename
            matched_files = {}
            expected_files = {}
            
            for idx, record in enumerate(self.xml_parser.records):
                base_filename = record.get('SoundFile', '').strip()
                if not base_filename:
                    continue
                
                base_name = base_filename.rsplit('.', 1)[0]
                ext = '.wav'
                if '.' in base_filename:
                    ext = '.' + base_filename.rsplit('.', 1)[1]
                
                # Check each suffix mapping
                for suffix, field_names_for_suffix in self.suffix_mappings.items():
                    for field_name in field_names_for_suffix:
                        # Generate expected filename
                        expected_filename = base_name + suffix + ext
                        
                        # Check if recording should be expected
                        if self._should_expect_recording_for_field_or_group(record, field_name):
                            expected_files[(idx, field_name, suffix)] = expected_filename
                            
                            # Check if file exists
                            if expected_filename in self.audio_scanner.audio_files:
                                matched_files[(idx, field_name, suffix)] = expected_filename
                        else:
                            # Not expected, but check if file exists anyway (would be "unexpected")
                            if expected_filename in self.audio_scanner.audio_files:
                                matched_files[(idx, field_name, suffix)] = expected_filename
                
                # Also check SoundFile field for empty suffix (whole record)
                if '' in self.suffix_mappings:
                    # Empty suffix means the base filename itself
                    if base_filename in self.audio_scanner.audio_files:
                        matched_files[(idx, 'SoundFile', '')] = base_filename
                        expected_files[(idx, 'SoundFile', '')] = base_filename
                    else:
                        # Expected but not found
                        expected_files[(idx, 'SoundFile', '')] = base_filename
            
            # Find orphaned files (files that don't match ANY record+suffix combination)
            all_matched = set(matched_files.values())
            orphaned_files = [f for f in self.audio_scanner.audio_files if f not in all_matched]
            
            # Debug: ensure all values are JSON serializable
            result = {
                'success': True,
                'records': records,
                'field_names': list(field_names),  # Ensure it's a list
                'mapped_fields': mapped_fields,  # Already converted to list at line 424
                'matched_files': {f"{k[0]}_{k[1]}_{k[2]}": v for k, v in matched_files.items()},
                'expected_files': {f"{k[0]}_{k[1]}_{k[2]}": v for k, v in expected_files.items()},
                'orphaned_files': sorted(orphaned_files)
            }
            
            print(f"DEBUG: Returning datasheet data:")
            print(f"  - records: {len(records)}")
            print(f"  - field_names type: {type(result['field_names'])}, len: {len(result['field_names'])}")
            print(f"  - mapped_fields type: {type(result['mapped_fields'])}, value: {result['mapped_fields']}")
            print(f"  - matched_files: {len(result['matched_files'])}")
            print(f"  - orphaned_files: {len(result['orphaned_files'])}")
            
            return result
            
        except Exception as e:
            import traceback
            print(f"ERROR in get_datasheet_data: {e}")
            print(traceback.format_exc())
            return {'success': False, 'error': str(e)}
    
    def _should_expect_recording_for_field_or_group(self, record: Dict[str, str], field_name: str) -> bool:
        """
        Check if recording should be expected for this field/group in this record
        """
        # Check if field is in a group
        group_key = None
        for group_name, fields in self.app_settings.get('field_groups', {}).items():
            if field_name in fields:
                group_key = f"__group__{group_name}"
                break
        
        # Get rules for field or group
        rules_key = group_key if group_key else field_name
        rules = self.conditional_rules.get(rules_key, {})
        
        if not rules:
            # No rules = always expect
            return True
        
        # Evaluate conditions
        return self._evaluate_conditions(record, rules)
    
    def _evaluate_conditions(self, record: Dict[str, str], rules: Dict[str, Any]) -> bool:
        """Evaluate conditional rules for a record"""
        if not rules or 'conditions' not in rules:
            return True
        
        conditions = rules['conditions']
        logic_type = rules.get('type', 'AND')
        
        results = []
        for condition in conditions:
            field = condition.get('field', '')
            operator = condition.get('operator', '')
            value = condition.get('value', '')
            
            field_value = record.get(field, '').strip()
            
            if operator == 'equals':
                results.append(field_value == value)
            elif operator == 'not_equals':
                results.append(field_value != value)
            elif operator == 'contains':
                results.append(value.lower() in field_value.lower())
            elif operator == 'not_empty':
                results.append(bool(field_value))
            elif operator == 'empty':
                results.append(not field_value)
            elif operator == 'in_list':
                value_list = condition.get('values', [])
                results.append(field_value in value_list)
            elif operator == 'not_in_list':
                value_list = condition.get('values', [])
                results.append(field_value not in value_list)
        
        if logic_type == 'AND':
            return all(results) if results else True
        else:  # OR
            return any(results) if results else True
    
    def export_mappings(self, mappings: Dict[str, List[str]]) -> Dict[str, Any]:
        """
        Export field-to-suffix mappings to TSV text file (field<tab>suffix format)
        
        Args:
            mappings: dict of suffix -> list of field names
            
        Returns:
            {'success': bool, 'error': str (if failure)}
        """
        try:
            # Open save dialog
            result = webview.windows[0].create_file_dialog(
                webview.SAVE_DIALOG,
                save_filename='dekereke-mappings.txt',
                file_types=('Text Files (*.txt)',)
            )
            
            if not result:
                return {'success': False, 'error': 'No file selected'}
            
            save_path = result
            
            # Convert mappings to TSV format (field<tab>suffix)
            # mappings is suffix -> [field1, field2, ...]
            lines = []
            empty_suffix_lines = []  # Store empty suffix mappings separately
            
            for suffix, fields in mappings.items():
                for field in fields:
                    line = f"{field}\t{suffix}"
                    if suffix == '':  # Empty suffix (Whole Record)
                        empty_suffix_lines.append(line)
                    else:
                        lines.append(line)
            
            # Sort non-empty suffix lines
            lines.sort()
            
            # Append empty suffix lines at the end
            lines.extend(sorted(empty_suffix_lines))
            
            # Write to file
            with open(save_path, 'w', encoding='utf-8') as f:
                f.write('\n'.join(lines))
                if lines:  # Add trailing newline if not empty
                    f.write('\n')
            
            return {'success': True, 'path': save_path}
            
        except Exception as e:
            return {'success': False, 'error': f'Error exporting mappings: {str(e)}'}
    
    def copy_to_clipboard(self, text: str) -> Dict[str, Any]:
        """
        Copy text to system clipboard using native clipboard access
        
        Args:
            text: Text to copy to clipboard
            
        Returns:
            {'success': bool, 'error': str (if failure)}
        """
        try:
            pyperclip.copy(text)
            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': f'Failed to copy to clipboard: {str(e)}'}
    
    def paste_from_clipboard(self) -> Dict[str, Any]:
        """
        Get text from system clipboard using native clipboard access
        
        Returns:
            {'success': bool, 'text': str, 'error': str (if failure)}
        """
        try:
            text = pyperclip.paste()
            return {'success': True, 'text': text}
        except Exception as e:
            return {'success': False, 'error': f'Failed to read from clipboard: {str(e)}'}
    
    def import_mappings(self) -> Dict[str, Any]:
        """
        Import field-to-suffix mappings from TSV text file or legacy JSON file
        Supports both TSV (field<tab>suffix format) and JSON formats
        
        Returns:
            {
                'success': bool,
                'mappings': dict of suffix -> [field_names],
                'error': str (if failure)
            }
        """
        try:
            # Open file dialog
            result = webview.windows[0].create_file_dialog(
                webview.OPEN_DIALOG,
                allow_multiple=False,
                file_types=('Text Files (*.txt)', 'JSON Files (*.json)', 'All Files (*.*)')
            )
            
            if not result or len(result) == 0:
                return {'success': False, 'error': 'No file selected'}
            
            import_path = result[0]
            
            # Read file content
            with open(import_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            mappings = {}
            
            # Try JSON format first (legacy support)
            try:
                import_data = json.loads(content)
                if 'mappings' in import_data and isinstance(import_data['mappings'], dict):
                    # Valid JSON format
                    mappings = import_data['mappings']
                else:
                    # Invalid JSON structure, try TSV
                    raise ValueError('Invalid JSON structure')
            except (json.JSONDecodeError, ValueError):
                # Not JSON or invalid JSON, parse as TSV format
                lines = content.split('\n')
                for line_num, line in enumerate(lines, 1):
                    line = line.rstrip('\r')
                    
                    # Skip completely empty lines
                    if not line.strip():
                        continue
                    
                    # Skip comments
                    if line.strip().startswith('#'):
                        continue
                    
                    # Check for tab separator
                    if '\t' not in line:
                        return {
                            'success': False,
                            'error': f'Invalid format at line {line_num}: expected field<tab>suffix (no tab found)'
                        }
                    
                    parts = line.split('\t')
                    if len(parts) != 2:
                        return {
                            'success': False,
                            'error': f'Invalid format at line {line_num}: expected field<tab>suffix (found {len(parts)} parts)'
                        }
                    
                    field, suffix = parts
                    field = field.strip()
                    suffix = suffix.strip()  # Allow empty suffix
                    
                    if not field:
                        return {
                            'success': False,
                            'error': f'Empty field name at line {line_num}'
                        }
                    
                    # Check for duplicate field mappings (Dekereke constraint: one field = one suffix)
                    for existing_suffix, existing_fields in mappings.items():
                        if field in existing_fields:
                            suffix_display = existing_suffix if existing_suffix else '(no suffix)'
                            new_suffix_display = suffix if suffix else '(no suffix)'
                            return {
                                'success': False,
                                'error': f'Line {line_num}: Field "{field}" is already mapped to suffix "{suffix_display}". Each field can only have one suffix.'
                            }
                    
                    # Build suffix -> [fields] mapping (suffix can be empty string)
                    if suffix not in mappings:
                        mappings[suffix] = []
                    if field not in mappings[suffix]:
                        mappings[suffix].append(field)
            
            # Update state
            self.suffix_mappings = mappings
            if self.settings_manager:
                self.settings_manager.settings['suffix_mappings'] = mappings
                self.settings_manager.save()
            
            return {
                'success': True,
                'mappings': mappings,
                'count': len(mappings)
            }
            
        except Exception as e:
            return {'success': False, 'error': f'Error importing mappings: {str(e)}'}
    
    def get_settings(self) -> Dict[str, Any]:
        """Get current settings"""
        if self.settings_manager:
            return self.settings_manager.settings
        return {}
    
    def export_conditions(self, conditions: Dict[str, Any]) -> Dict[str, Any]:
        """
        Export conditional rules to JSON file
        
        Args:
            conditions: dict of field_name -> rule definition
            
        Returns:
            {'success': bool, 'error': str (if failure)}
        """
        try:
            # Open save dialog
            result = webview.windows[0].create_file_dialog(
                webview.SAVE_DIALOG,
                save_filename='dekereke-conditions.json',
                file_types=('JSON Files (*.json)',)
            )
            
            if not result:
                return {'success': False, 'error': 'No file selected'}
            
            save_path = result
            
            # Create export data
            export_data = {
                'version': '1.0',
                'timestamp': datetime.now().isoformat(),
                'conditions': conditions
            }
            
            # Write to file
            with open(save_path, 'w', encoding='utf-8') as f:
                json.dump(export_data, f, indent=2, ensure_ascii=False)
            
            return {'success': True, 'path': save_path}
            
        except Exception as e:
            return {'success': False, 'error': f'Error exporting conditions: {str(e)}'}
    
    def import_conditions(self) -> Dict[str, Any]:
        """
        Import conditional rules from JSON file
        
        Returns:
            {
                'success': bool,
                'conditions': dict of field_name -> rule definition,
                'error': str (if failure)
            }
        """
        try:
            # Open file dialog
            result = webview.windows[0].create_file_dialog(
                webview.OPEN_DIALOG,
                allow_multiple=False,
                file_types=('JSON Files (*.json)',)
            )
            
            if not result or len(result) == 0:
                return {'success': False, 'error': 'No file selected'}
            
            import_path = result[0]
            
            # Read and parse JSON
            with open(import_path, 'r', encoding='utf-8') as f:
                import_data = json.load(f)
            
            # Validate structure
            if 'conditions' not in import_data or not isinstance(import_data['conditions'], dict):
                return {'success': False, 'error': 'Invalid conditions file format'}
            
            conditions = import_data['conditions']
            
            # Update state
            self.conditional_rules = conditions
            if self.settings_manager:
                self.settings_manager.settings['conditional_rules'] = conditions
                self.settings_manager.save()
            self._save_app_settings()
            
            return {
                'success': True,
                'conditions': conditions,
                'count': len(conditions)
            }
            
        except json.JSONDecodeError as e:
            return {'success': False, 'error': f'Invalid JSON format: {str(e)}'}
        except Exception as e:
            return {'success': False, 'error': f'Error importing conditions: {str(e)}'}
    
    def get_field_values(self, field_name: str) -> Dict[str, Any]:
        """
        Get unique non-empty values for a specific field
        
        Args:
            field_name: Name of the field to get values for
            
        Returns:
            {
                'success': bool,
                'values': list of unique values,
                'error': str (if failure)
            }
        """
        try:
            if not self.xml_parser:
                return {'success': False, 'error': 'No XML file loaded'}
            
            # Collect unique non-empty values
            values = set()
            for record in self.xml_parser.records:
                value = record.get(field_name, '').strip()
                if value:  # Only include non-empty values
                    values.add(value)
            
            # Sort alphabetically
            sorted_values = sorted(list(values))
            
            return {
                'success': True,
                'values': sorted_values,
                'count': len(sorted_values)
            }
            
        except Exception as e:
            return {'success': False, 'error': f'Error getting field values: {str(e)}'}
    
    def generate_expected_files(self) -> List[Dict[str, Any]]:
        """
        Generate list of expected files based on mappings and rules
        
        Returns:
            List of expected file dictionaries with record and field info
        """
        expected = []
        
        if not self.xml_parser:
            return expected
        
        for record in self.xml_parser.records:
            base_filename = record.get('SoundFile', '').strip()
            if not base_filename:
                continue
            
            reference = record.get('Reference', '')
            
            # For each suffix mapping
            for suffix, field_names in self.suffix_mappings.items():
                for field_name in field_names:
                    # Check if this field should have a recording for this record
                    if self._should_expect_recording(record, field_name):
                        # Build expected filename
                        base_name = base_filename.rsplit('.', 1)[0]  # Remove extension
                        ext = '.wav'  # Default extension
                        if '.' in base_filename:
                            ext = '.' + base_filename.rsplit('.', 1)[1]
                        
                        expected_filename = base_name + suffix + ext
                        
                        expected.append({
                            'filename': expected_filename,
                            'reference': reference,
                            'field': field_name,
                            'suffix': suffix,
                            'record_index': self.xml_parser.records.index(record),
                            'gloss': record.get('Gloss', ''),
                            'phonetic': record.get('Phonetic', '')
                        })
        
        return expected
    
    def _should_expect_recording(self, record: Dict[str, str], field_name: str) -> bool:
        """
        Check if a recording should be expected for this field in this record
        based on conditional rules
        """
        # Get rules for this field
        rules = self.conditional_rules.get(field_name, {})
        
        if not rules:
            # No specific rules - use global setting
            include_empty = self.settings_manager.settings.get('include_empty_fields', True)
            if include_empty:
                return True
            else:
                # Only expect if field is non-empty
                field_value = record.get(field_name, '').strip()
                return bool(field_value)
        
        # Evaluate rules (simplified for now)
        # TODO: Implement full boolean logic evaluation
        return True
    
    def identify_mismatches(self) -> Dict[str, Any]:
        """
        Identify missing and orphaned files
        
        Returns:
            {
                'missing': list of expected files not found,
                'orphaned': list of found files not expected
            }
        """
        try:
            expected_files = self.generate_expected_files()
            
            # Get actual files
            actual_files = set(self.audio_scanner.audio_files)
            
            # Find missing
            missing = []
            for exp in expected_files:
                if exp['filename'] not in actual_files:
                    missing.append(exp)
            
            # Find orphaned (simplified - full logic in fuzzy_matcher)
            expected_names = {exp['filename'] for exp in expected_files}
            orphaned = [f for f in actual_files if f not in expected_names]
            
            return {
                'success': True,
                'missing': missing,
                'orphaned': orphaned
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def run_fuzzy_matching(self, missing: List[Dict], orphaned: List[str]) -> List[Dict]:
        """
        Run fuzzy matching algorithm to suggest matches
        
        Returns:
            List of suggested matches with confidence scores
        """
        self.fuzzy_matcher = FuzzyMatcher()
        suggestions = self.fuzzy_matcher.find_matches(missing, orphaned, self.xml_parser.records)
        return suggestions
    
    def add_to_queue(self, operation: Dict[str, Any]):
        """Add an operation to the queue"""
        operation['id'] = str(uuid.uuid4())
        self.operation_queue.append(operation)
    
    def get_operation_queue(self) -> List[Dict[str, Any]]:
        """Get current operation queue"""
        return self.operation_queue
    
    def clear_queue(self):
        """Clear operation queue"""
        self.operation_queue = []
    
    def execute_operations(self) -> Dict[str, Any]:
        """
        Execute all queued file operations
        
        Returns:
            {
                'success': bool,
                'completed': int,
                'failed': int,
                'errors': list,
                'log_files': dict
            }
        """
        try:
            self.file_ops = FileOperationsManager(self.audio_folder)
            result = self.file_ops.execute_queue(self.operation_queue)
            
            # Clear queue after execution
            if result['success']:
                self.operation_queue = []
            
            return result
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def create_backup(self, backup_folder: str) -> Dict[str, Any]:
        """Create backup of audio folder"""
        try:
            if not os.path.exists(self.audio_folder):
                return {'success': False, 'error': 'Audio folder does not exist'}
            
            # Copy entire audio folder
            shutil.copytree(self.audio_folder, backup_folder)
            
            return {
                'success': True,
                'message': f'Backup created at {backup_folder}'
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def create_backup_with_dialog(self) -> Dict[str, Any]:
        """Create backup of audio folder with folder selection dialog"""
        try:
            if not self.audio_folder:
                return {'success': False, 'error': 'No audio folder selected'}
            
            if not os.path.exists(self.audio_folder):
                return {'success': False, 'error': 'Audio folder does not exist'}
            
            # Open folder dialog for backup location
            result = webview.windows[0].create_file_dialog(
                webview.FOLDER_DIALOG
            )
            
            if not result or len(result) == 0:
                return {'success': False, 'error': 'No folder selected'}
            
            backup_parent = result[0]
            
            # Create timestamped backup folder name
            audio_folder_name = os.path.basename(self.audio_folder)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_folder = os.path.join(backup_parent, f'{audio_folder_name}_backup_{timestamp}')
            
            # Copy entire audio folder
            shutil.copytree(self.audio_folder, backup_folder)
            
            return {
                'success': True,
                'backup_path': backup_folder
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_empty_soundfile_records(self) -> List[Dict[str, Any]]:
        """Get records with empty SoundFile elements"""
        try:
            print("get_empty_soundfile_records called")
            print(f"xml_parser exists: {self.xml_parser is not None}")
            print(f"Cached empty indices: {self.empty_soundfile_indices}")
            
            if not self.xml_parser:
                print("ERROR: No XML parser initialized")
                return []
            
            # Use cached indices if available, otherwise scan
            if self.empty_soundfile_indices:
                empty_indices = self.empty_soundfile_indices
            else:
                empty_indices = self.xml_parser.find_empty_soundfiles()
                
            print(f"Found {len(empty_indices)} empty soundfiles at indices: {empty_indices}")
            
            records = []
            
            for idx in empty_indices:
                if 0 <= idx < len(self.xml_parser.records):
                    record = self.xml_parser.records[idx].copy()
                    record['index'] = idx
                    records.append(record)
                    print(f"  Record {idx}: {record.get('Reference', '?')} - {record.get('Gloss', '?')}")
                else:
                    print(f"  WARNING: Index {idx} out of range (total records: {len(self.xml_parser.records)})")
            
            print(f"Returning {len(records)} records")
            return records
            
        except Exception as e:
            print(f"ERROR in get_empty_soundfile_records: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def preview_soundfile_generation(self, template: str) -> List[Dict[str, Any]]:
        """Preview what auto-generation would produce"""
        try:
            print(f"Preview requested with template: {template}")
            
            if not self.xml_parser:
                print("ERROR: No XML parser initialized")
                return []
            
            empty_indices = self.xml_parser.find_empty_soundfiles()
            print(f"Found {len(empty_indices)} empty soundfiles: {empty_indices}")
            
            previews = []
            
            for idx in empty_indices:
                if 0 <= idx < len(self.xml_parser.records):
                    record = self.xml_parser.records[idx]
                    generated = self.xml_parser.generate_soundfile_name(record, template)
                    print(f"  Record {idx}: {record.get('Reference', '?')} -> {generated}")
                    previews.append({
                        'index': idx,
                        'record': record.get('Reference', str(idx)),
                        'generated': generated
                    })
                else:
                    print(f"  WARNING: Index {idx} out of range")
            
            print(f"Returning {len(previews)} previews")
            return previews
            
        except Exception as e:
            print(f"ERROR in preview_soundfile_generation: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def auto_generate_soundfiles(self, template: str) -> Dict[str, Any]:
        """Auto-generate SoundFile values using template"""
        try:
            if not self.xml_parser:
                return {'success': False, 'error': 'No XML file loaded'}
            
            empty_indices = self.xml_parser.find_empty_soundfiles()
            count = 0
            
            for idx in empty_indices:
                if 0 <= idx < len(self.xml_parser.records):
                    record = self.xml_parser.records[idx]
                    generated = self.xml_parser.generate_soundfile_name(record, template)
                    # Sanitize filename: replace spaces with underscores, remove invalid chars
                    generated = generated.replace(' ', '_')
                    generated = ''.join(c for c in generated if c.isalnum() or c in '._-')
                    
                    if self.xml_parser.update_soundfile(idx, generated):
                        count += 1
            
            # Save XML
            if count > 0:
                self.xml_parser.save()
            
            return {
                'success': True,
                'count': count
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def update_soundfiles_manual(self, entries: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Update SoundFile values manually"""
        try:
            if not self.xml_parser:
                return {'success': False, 'error': 'No XML file loaded'}
            
            count = 0
            
            for entry in entries:
                idx = entry.get('index')
                soundfile = entry.get('soundfile', '').strip()
                
                if idx is not None and soundfile:
                    # Sanitize filename
                    soundfile = soundfile.replace(' ', '_')
                    soundfile = ''.join(c for c in soundfile if c.isalnum() or c in '._-')
                    
                    if self.xml_parser.update_soundfile(idx, soundfile):
                        count += 1
            
            # Save XML
            if count > 0:
                self.xml_parser.save()
            
            return {
                'success': True,
                'count': count
            }
            
        except Exception as e:
            return {'success': False, 'error': str(e)}


def main():
    """Main entry point for the application"""
    api = DekeRekeAPI()
    
    # Get the path to the HTML file
    html_path = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'index.html')
    
    # Create window with the API
    window = webview.create_window(
        'Dekereke Sound File Association Tool',
        html_path,
        js_api=api,
        width=1200,
        height=800,
        resizable=True
    )
    
    # Start with debug mode enabled to show console output in terminal
    webview.start(debug=True)


if __name__ == '__main__':
    main()
