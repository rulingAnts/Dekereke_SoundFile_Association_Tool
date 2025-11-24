"""
Test script for XML Parser
Tests UTF-16 parsing, field extraction, and Reference handling
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from xml_parser import DekeRekeXMLParser
import tempfile

def test_xml_parser():
    """Test XML parser with sample data"""
    
    # Create a sample XML file with UTF-16 encoding
    sample_xml = """<?xml version="1.0" encoding="utf-16"?>
<phon_data>
    <data_form>
        <Reference>0021</Reference>
        <Gloss>dog</Gloss>
        <Phonetic>wau</Phonetic>
        <SoundFile>0021_dog.wav</SoundFile>
    </data_form>
    <data_form>
        <Reference>0022</Reference>
        <Gloss>cat</Gloss>
        <Phonetic>miao</Phonetic>
        <SoundFile>0022_cat.wav</SoundFile>
    </data_form>
    <data_form>
        <Reference>0021</Reference>
        <Gloss>duplicate</Gloss>
        <Phonetic>test</Phonetic>
        <SoundFile></SoundFile>
    </data_form>
</phon_data>
"""
    
    # Create temporary file
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-16', suffix='.xml', delete=False) as f:
        f.write(sample_xml)
        temp_path = f.name
    
    try:
        print("Testing XML Parser...")
        print("-" * 50)
        
        # Test parsing
        parser = DekeRekeXMLParser(temp_path)
        success = parser.parse()
        
        print(f"✓ Parse successful: {success}")
        print(f"✓ Records found: {len(parser.records)}")
        
        # Test field extraction
        fields = parser.get_field_names()
        print(f"✓ Fields extracted: {fields}")
        
        # Test duplicate detection
        duplicates = parser.find_duplicate_references()
        print(f"✓ Duplicates found: {duplicates}")
        assert '0021' in duplicates, "Should detect duplicate Reference 0021"
        
        # Test empty soundfile detection
        empty = parser.find_empty_soundfiles()
        print(f"✓ Empty SoundFile elements: {empty}")
        assert len(empty) > 0, "Should detect empty SoundFile"
        
        # Test leading zero preservation
        record = parser.records[0]
        assert record['Reference'] == '0021', "Should preserve leading zeros"
        print(f"✓ Leading zeros preserved: {record['Reference']}")
        
        # Test SoundFile name generation
        template = "{Reference}_{Gloss}.wav"
        generated = parser.generate_soundfile_name(record, template)
        print(f"✓ Generated filename: {generated}")
        assert generated == "0021_dog.wav", "Should generate correct filename"
        
        print("-" * 50)
        print("All tests passed! ✓")
        
    finally:
        # Cleanup
        if os.path.exists(temp_path):
            os.remove(temp_path)

if __name__ == '__main__':
    test_xml_parser()
