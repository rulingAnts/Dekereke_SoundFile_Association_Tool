"""
XML Parser for Dekereke Sound File Association Tool
Handles UTF-16 encoded XML files with exact formatting preservation
"""

import xml.etree.ElementTree as ET
from typing import List, Dict, Optional, Tuple
import os


class DekeRekeXMLParser:
    """Parser for Dekereke phonology database XML files"""
    
    def __init__(self, xml_path: str):
        self.xml_path = xml_path
        self.tree = None
        self.root = None
        self.records = []
        self.field_names = set()
        
    def parse(self) -> bool:
        """Parse XML file with UTF-16 encoding"""
        try:
            # CRITICAL: Use UTF-16 encoding explicitly
            self.tree = ET.parse(self.xml_path, parser=ET.XMLParser(encoding='utf-16'))
            self.root = self.tree.getroot()
            
            # Validate structure
            if self.root.tag != 'phon_data':
                raise ValueError(f"Invalid XML structure: expected root element 'phon_data', got '{self.root.tag}'")
            
            # Extract records
            self._extract_records()
            return True
            
        except Exception as e:
            print(f"Error parsing XML: {e}")
            return False
    
    def _extract_records(self):
        """Extract all data_form records and field names"""
        self.records = []
        self.field_names = set()
        
        for data_form in self.root.findall('data_form'):
            record = {}
            for field in data_form:
                field_name = field.tag
                field_value = field.text if field.text is not None else ""
                record[field_name] = field_value
                self.field_names.add(field_name)
            
            self.records.append(record)
    
    def get_field_names(self, exclude_default: bool = True) -> List[str]:
        """Get all unique field names from the XML"""
        fields = self.field_names.copy()
        
        if exclude_default:
            # Exclude Reference and SoundFile by default
            fields.discard('Reference')
            fields.discard('SoundFile')
        
        return sorted(list(fields))
    
    def get_records(self) -> List[Dict[str, str]]:
        """Get all records"""
        return self.records
    
    def find_duplicate_references(self) -> Dict[str, List[int]]:
        """Find duplicate Reference numbers and their record indices"""
        ref_map = {}
        
        for idx, record in enumerate(self.records):
            ref = record.get('Reference', '')
            if ref:
                if ref not in ref_map:
                    ref_map[ref] = []
                ref_map[ref].append(idx)
        
        # Return only duplicates
        duplicates = {ref: indices for ref, indices in ref_map.items() if len(indices) > 1}
        return duplicates
    
    def find_empty_soundfiles(self) -> List[int]:
        """Find records with empty SoundFile elements"""
        empty_indices = []
        
        for idx, record in enumerate(self.records):
            soundfile = record.get('SoundFile', '').strip()
            if not soundfile:
                empty_indices.append(idx)
        
        return empty_indices
    
    def update_reference(self, record_index: int, new_reference: str) -> bool:
        """
        Update a Reference value in the XML
        CRITICAL: Preserves exact XML formatting, only modifies Reference text content
        """
        try:
            data_forms = self.root.findall('data_form')
            if record_index >= len(data_forms):
                return False
            
            data_form = data_forms[record_index]
            ref_element = data_form.find('Reference')
            
            if ref_element is not None:
                ref_element.text = new_reference
                self.records[record_index]['Reference'] = new_reference
                return True
            
            return False
            
        except Exception as e:
            print(f"Error updating reference: {e}")
            return False
    
    def update_soundfile(self, record_index: int, new_soundfile: str) -> bool:
        """Update a SoundFile value in the XML"""
        try:
            data_forms = self.root.findall('data_form')
            if record_index >= len(data_forms):
                return False
            
            data_form = data_forms[record_index]
            soundfile_element = data_form.find('SoundFile')
            
            if soundfile_element is not None:
                soundfile_element.text = new_soundfile
                self.records[record_index]['SoundFile'] = new_soundfile
                return True
            
            return False
            
        except Exception as e:
            print(f"Error updating soundfile: {e}")
            return False
    
    def save(self) -> bool:
        """
        Save XML file with UTF-16 encoding
        CRITICAL: Preserves exact XML formatting
        """
        try:
            # Write with UTF-16 encoding explicitly
            self.tree.write(
                self.xml_path,
                encoding='utf-16',
                xml_declaration=True,
                method='xml'
            )
            return True
            
        except Exception as e:
            print(f"Error saving XML: {e}")
            return False
    
    def generate_soundfile_name(self, record: Dict[str, str], template: str) -> str:
        """
        Generate a SoundFile name from a template
        Template uses field names in curly braces: {Reference}_{Gloss}.wav
        Replaces spaces with underscores and removes invalid filename characters
        """
        result = template
        
        for field_name, field_value in record.items():
            placeholder = f"{{{field_name}}}"
            if placeholder in result:
                # Clean the value
                clean_value = self._clean_for_filename(field_value)
                result = result.replace(placeholder, clean_value)
        
        return result
    
    @staticmethod
    def _clean_for_filename(value: str) -> str:
        """Clean a field value for use in a filename"""
        # Replace spaces with underscores
        value = value.replace(' ', '_')
        
        # Remove or replace invalid characters
        invalid_chars = '<>:"/\\|?*'
        for char in invalid_chars:
            value = value.replace(char, '')
        
        return value
