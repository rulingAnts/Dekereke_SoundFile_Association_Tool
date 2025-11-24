"""
Settings Manager for Dekereke Sound File Association Tool
Manages per-project settings persistence
"""

import json
import os
from typing import Dict, Any


class SettingsManager:
    """Manages settings for a specific project (XML file)"""
    
    def __init__(self, xml_path: str):
        self.xml_path = xml_path
        self.settings_path = self._get_settings_path(xml_path)
        self.settings = self._get_default_settings()
    
    @staticmethod
    def _get_settings_path(xml_path: str) -> str:
        """Get settings file path for an XML file"""
        base_name = os.path.splitext(xml_path)[0]
        return f"{base_name}_soundfile_config.json"
    
    @staticmethod
    def _get_default_settings() -> Dict[str, Any]:
        """Get default settings"""
        return {
            'xml_path': '',
            'audio_folder': '',
            'case_sensitive': False,
            'include_empty_fields': True,
            'suffix_mappings': {},
            'conditional_rules': {},
            'orphans_folder': 'orphans',
            'ui_preferences': {
                'display_fields': ['Reference', 'Phonetic', 'Gloss']
            }
        }
    
    def load(self) -> bool:
        """Load settings from file"""
        try:
            if os.path.exists(self.settings_path):
                with open(self.settings_path, 'r', encoding='utf-8') as f:
                    loaded_settings = json.load(f)
                    # Merge with defaults to handle new settings
                    self.settings.update(loaded_settings)
                return True
            return False
        except Exception as e:
            print(f"Error loading settings: {e}")
            return False
    
    def save(self) -> bool:
        """Save settings to file"""
        try:
            with open(self.settings_path, 'w', encoding='utf-8') as f:
                json.dump(self.settings, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            print(f"Error saving settings: {e}")
            return False
    
    def reset(self):
        """Reset settings to defaults"""
        self.settings = self._get_default_settings()
        if os.path.exists(self.settings_path):
            os.remove(self.settings_path)
