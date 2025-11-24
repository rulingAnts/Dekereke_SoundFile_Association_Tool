"""
Test script for Settings Manager
Tests per-project settings persistence
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from settings_manager import SettingsManager
import tempfile
import json

def test_settings_manager():
    """Test settings manager with sample data"""
    
    # Create temporary XML file path
    with tempfile.NamedTemporaryFile(suffix='.xml', delete=False) as f:
        xml_path = f.name
    
    try:
        print("Testing Settings Manager...")
        print("-" * 50)
        
        # Test initialization
        manager = SettingsManager(xml_path)
        print(f"✓ Settings file path: {manager.settings_path}")
        assert manager.settings_path.endswith('_soundfile_config.json'), "Should have correct suffix"
        
        # Test default settings
        defaults = manager.settings
        print(f"✓ Default settings loaded: {list(defaults.keys())}")
        assert 'case_sensitive' in defaults, "Should have case_sensitive setting"
        assert defaults['case_sensitive'] == False, "Should default to case-insensitive"
        
        # Test saving settings
        manager.settings['suffix_mappings'] = {'-phon': ['Phonetic'], '-xbig': ['Xbig']}
        manager.settings['case_sensitive'] = True
        success = manager.save()
        print(f"✓ Settings saved: {success}")
        assert os.path.exists(manager.settings_path), "Settings file should exist"
        
        # Test loading settings
        manager2 = SettingsManager(xml_path)
        success = manager2.load()
        print(f"✓ Settings loaded: {success}")
        assert manager2.settings['case_sensitive'] == True, "Should load saved case sensitivity"
        assert '-phon' in manager2.settings['suffix_mappings'], "Should load saved mappings"
        print(f"✓ Loaded mappings: {manager2.settings['suffix_mappings']}")
        
        # Test merging with defaults (for new settings)
        assert 'include_empty_fields' in manager2.settings, "Should merge new defaults"
        
        # Test reset
        manager2.reset()
        print(f"✓ Settings reset")
        assert manager2.settings['case_sensitive'] == False, "Should reset to defaults"
        assert not os.path.exists(manager.settings_path), "Settings file should be deleted"
        
        print("-" * 50)
        print("All tests passed! ✓")
        
    finally:
        # Cleanup
        if os.path.exists(xml_path):
            os.remove(xml_path)
        config_path = xml_path.rsplit('.', 1)[0] + '_soundfile_config.json'
        if os.path.exists(config_path):
            os.remove(config_path)

if __name__ == '__main__':
    test_settings_manager()
