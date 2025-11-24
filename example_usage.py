"""
Example usage script for Dekereke Sound File Association Tool

This script demonstrates how the tool's components work together.
Note: This is a demonstration script - the actual application uses pywebview GUI.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from xml_parser import DekeRekeXMLParser
from audio_scanner import AudioFolderScanner
from settings_manager import SettingsManager
from file_operations import FileOperationsManager
import tempfile
import shutil

def create_sample_data():
    """Create sample XML and audio files for demonstration"""
    
    # Create temporary directories
    work_dir = tempfile.mkdtemp()
    audio_dir = os.path.join(work_dir, 'audio')
    os.makedirs(audio_dir)
    
    # Create sample XML file
    xml_content = """<?xml version="1.0" encoding="utf-16"?>
<phon_data>
    <data_form>
        <Reference>0021</Reference>
        <Gloss>dog</Gloss>
        <Phonetic>wau</Phonetic>
        <IndonesianGloss>anjing</IndonesianGloss>
        <SoundFile>0021_dog.wav</SoundFile>
    </data_form>
    <data_form>
        <Reference>0022</Reference>
        <Gloss>cat</Gloss>
        <Phonetic>miao</Phonetic>
        <IndonesianGloss>kucing</IndonesianGloss>
        <SoundFile>0022_cat.wav</SoundFile>
    </data_form>
    <data_form>
        <Reference>0023</Reference>
        <Gloss>bird</Gloss>
        <Phonetic>tweet</Phonetic>
        <IndonesianGloss>burung</IndonesianGloss>
        <SoundFile>0023_bird.wav</SoundFile>
    </data_form>
</phon_data>
"""
    
    xml_path = os.path.join(work_dir, 'sample_data.xml')
    with open(xml_path, 'w', encoding='utf-16') as f:
        f.write(xml_content)
    
    # Create sample audio files
    audio_files = [
        '0021_dog.wav',          # Base file
        '0021_dog-phon.wav',     # Phonetic recording
        '0022_cat.wav',          # Base file
        '0022_cat-phon.wav',     # Phonetic recording
        '0023_old_name.wav',     # Orphan (should be 0023_bird.wav)
        '0024_pig-phon.wav'      # Orphan (no matching record)
    ]
    
    for filename in audio_files:
        filepath = os.path.join(audio_dir, filename)
        with open(filepath, 'w') as f:
            f.write('dummy audio data')
    
    return work_dir, xml_path, audio_dir

def demonstrate_workflow():
    """Demonstrate the complete workflow"""
    
    print("=" * 70)
    print("Dekereke Sound File Association Tool - Workflow Demonstration")
    print("=" * 70)
    print()
    
    # Create sample data
    print("Creating sample data...")
    work_dir, xml_path, audio_dir = create_sample_data()
    print(f"✓ Sample XML: {xml_path}")
    print(f"✓ Audio folder: {audio_dir}")
    print()
    
    try:
        # Step 1: Parse XML
        print("STEP 1: Parse XML File")
        print("-" * 70)
        parser = DekeRekeXMLParser(xml_path)
        parser.parse()
        
        print(f"✓ Parsed {len(parser.records)} records")
        print(f"✓ Found fields: {parser.get_field_names()}")
        
        # Check for issues
        duplicates = parser.find_duplicate_references()
        if duplicates:
            print(f"⚠ Duplicate references: {duplicates}")
        else:
            print("✓ No duplicate references")
        
        empty_soundfiles = parser.find_empty_soundfiles()
        if empty_soundfiles:
            print(f"⚠ Empty SoundFile elements: {len(empty_soundfiles)}")
        else:
            print("✓ All SoundFile elements populated")
        print()
        
        # Step 2: Scan audio folder
        print("STEP 2: Scan Audio Folder")
        print("-" * 70)
        scanner = AudioFolderScanner(audio_dir, case_sensitive=False)
        scanner.scan()
        
        print(f"✓ Found {len(scanner.audio_files)} audio files:")
        for f in sorted(scanner.audio_files):
            print(f"  - {f}")
        print()
        
        # Step 3: Extract suffixes
        print("STEP 3: Extract Suffixes")
        print("-" * 70)
        base_filenames = [r['SoundFile'] for r in parser.records if r.get('SoundFile')]
        suffixes, ambiguous = scanner.extract_suffixes(base_filenames)
        
        print(f"✓ Found {len(suffixes)} unique suffixes:")
        for suffix, files in suffixes.items():
            print(f"  - '{suffix}': {len(files)} files")
        
        if ambiguous:
            print(f"⚠ {len(ambiguous)} ambiguous interpretations detected")
        print()
        
        # Step 4: Configure mappings
        print("STEP 4: Configure Suffix Mappings")
        print("-" * 70)
        suffix_mappings = {
            '': ['Whole Record'],
            '-phon': ['Phonetic']
        }
        print("✓ Suffix-to-field mappings:")
        for suffix, fields in suffix_mappings.items():
            suffix_display = suffix if suffix else '(no suffix)'
            print(f"  - {suffix_display} → {', '.join(fields)}")
        print()
        
        # Step 5: Identify mismatches
        print("STEP 5: Identify Mismatches")
        print("-" * 70)
        
        # Generate expected files
        expected_files = []
        for record in parser.records:
            base = record.get('SoundFile', '')
            if not base:
                continue
            
            base_name = base.rsplit('.', 1)[0]
            ref = record.get('Reference', '')
            
            for suffix, fields in suffix_mappings.items():
                expected_filename = base_name + suffix + '.wav'
                expected_files.append({
                    'filename': expected_filename,
                    'reference': ref,
                    'fields': fields
                })
        
        actual_files = set(scanner.audio_files)
        expected_names = {f['filename'] for f in expected_files}
        
        missing = [f for f in expected_files if f['filename'] not in actual_files]
        orphaned = [f for f in actual_files if f not in expected_names]
        
        print(f"✓ Expected {len(expected_files)} files total")
        print(f"⚠ Missing {len(missing)} files:")
        for m in missing:
            print(f"  - {m['filename']} (Record {m['reference']})")
        
        print(f"⚠ Found {len(orphaned)} orphaned files:")
        for o in orphaned:
            print(f"  - {o}")
        print()
        
        # Step 6: Execute operations
        print("STEP 6: Execute File Operations")
        print("-" * 70)
        
        # Queue operations
        operations = [
            {
                'type': 'rename',
                'old_filename': '0023_old_name.wav',
                'new_filename': '0023_bird.wav',
                'reference': '0023',
                'field': 'Whole Record',
                'reason': 'User matched'
            },
            {
                'type': 'move_to_orphans',
                'filename': '0024_pig-phon.wav',
                'reason': 'No matching record'
            }
        ]
        
        print(f"✓ Queued {len(operations)} operations:")
        for op in operations:
            if op['type'] == 'rename':
                print(f"  - Rename: {op['old_filename']} → {op['new_filename']}")
            elif op['type'] == 'move_to_orphans':
                print(f"  - Move to orphans: {op['filename']}")
        print()
        
        print("Executing operations...")
        file_ops = FileOperationsManager(audio_dir)
        result = file_ops.execute_queue(operations)
        
        if result['success']:
            print(f"✓ All operations completed successfully!")
            print(f"  - Completed: {result['completed']}")
            print(f"  - Failed: {result['failed']}")
        else:
            print(f"✗ Some operations failed")
            print(f"  - Completed: {result['completed']}")
            print(f"  - Failed: {result['failed']}")
        print()
        
        # Step 7: Review logs
        print("STEP 7: Review Generated Logs")
        print("-" * 70)
        
        markdown_log = os.path.join(audio_dir, 'soundfile_changes.md')
        json_log = os.path.join(audio_dir, 'soundfile_changes.json')
        
        if os.path.exists(markdown_log):
            print(f"✓ Markdown log created: {markdown_log}")
            with open(markdown_log, 'r') as f:
                print("\nLog contents:")
                print(f.read())
        
        if os.path.exists(json_log):
            print(f"✓ JSON log created: {json_log}")
        
        print()
        print("=" * 70)
        print("Demonstration Complete!")
        print("=" * 70)
        print()
        print("In the actual application, all of this would be done through")
        print("an intuitive graphical interface with drag-and-drop, audio")
        print("preview, and confirmation dialogs.")
        
    finally:
        # Cleanup
        print()
        print("Cleaning up temporary files...")
        shutil.rmtree(work_dir)
        print("✓ Done")

if __name__ == '__main__':
    demonstrate_workflow()
