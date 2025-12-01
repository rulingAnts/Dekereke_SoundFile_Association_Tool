"""
Main Application for Dekereke Sound File Association Tool
Uses pywebview for desktop GUI with Python backend
"""

import webview
import os
import json
from typing import Dict, List, Optional, Any
from datetime import datetime
import uuid
import shutil
import xml.etree.ElementTree as ET

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
        
    def select_xml_file(self) -> Optional[str]:
        """Open file dialog to select XML file"""
        result = webview.windows[0].create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=False,
            file_types=('XML Files (*.xml)',)
        )
        
        if result and len(result) > 0:
            self.xml_path = result[0]
            return self.xml_path
        return None
    
    def select_audio_folder(self) -> Optional[str]:
        """Open folder dialog to select audio folder"""
        result = webview.windows[0].create_file_dialog(
            webview.FOLDER_DIALOG
        )
        
        if result and len(result) > 0:
            self.audio_folder = result[0]
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
        """Set case sensitivity for file matching"""
        self.case_sensitive = case_sensitive
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
    
    def export_mappings(self, mappings: Dict[str, List[str]]) -> Dict[str, Any]:
        """
        Export field-to-suffix mappings to JSON file
        
        Args:
            mappings: dict of suffix -> list of field names
            
        Returns:
            {'success': bool, 'error': str (if failure)}
        """
        try:
            # Open save dialog
            result = webview.windows[0].create_file_dialog(
                webview.SAVE_DIALOG,
                save_filename='dekereke-mappings.json',
                file_types=('JSON Files (*.json)',)
            )
            
            if not result:
                return {'success': False, 'error': 'No file selected'}
            
            save_path = result
            
            # Create export data
            export_data = {
                'version': '1.0',
                'timestamp': datetime.now().isoformat(),
                'mappings': mappings
            }
            
            # Write to file
            with open(save_path, 'w', encoding='utf-8') as f:
                json.dump(export_data, f, indent=2, ensure_ascii=False)
            
            return {'success': True, 'path': save_path}
            
        except Exception as e:
            return {'success': False, 'error': f'Error exporting mappings: {str(e)}'}
    
    def import_mappings(self) -> Dict[str, Any]:
        """
        Import field-to-suffix mappings from JSON file
        
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
                file_types=('JSON Files (*.json)',)
            )
            
            if not result or len(result) == 0:
                return {'success': False, 'error': 'No file selected'}
            
            import_path = result[0]
            
            # Read and parse JSON
            with open(import_path, 'r', encoding='utf-8') as f:
                import_data = json.load(f)
            
            # Validate structure
            if 'mappings' not in import_data or not isinstance(import_data['mappings'], dict):
                return {'success': False, 'error': 'Invalid mapping file format'}
            
            mappings = import_data['mappings']
            
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
            
        except json.JSONDecodeError as e:
            return {'success': False, 'error': f'Invalid JSON format: {str(e)}'}
        except Exception as e:
            return {'success': False, 'error': f'Error importing mappings: {str(e)}'}
    
    def get_settings(self) -> Dict[str, Any]:
        """Get current settings"""
        if self.settings_manager:
            return self.settings_manager.settings
        return {}
    
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
    
    webview.start()


if __name__ == '__main__':
    main()
