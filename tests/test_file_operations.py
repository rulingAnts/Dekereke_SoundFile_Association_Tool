"""
Test script for File Operations Manager
Tests file operations execution and logging
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from file_operations import FileOperationsManager
import tempfile
import shutil
import json

def test_file_operations():
    """Test file operations manager with sample operations"""
    
    # Create temporary directory with sample files
    temp_dir = tempfile.mkdtemp()
    
    try:
        print("Testing File Operations Manager...")
        print("-" * 50)
        
        # Create sample WAV files
        sample_files = [
            '0021_dog.wav',
            '0022_cat.wav',
            'orphan1.wav',
            'orphan2.wav'
        ]
        
        for filename in sample_files:
            filepath = os.path.join(temp_dir, filename)
            with open(filepath, 'w') as f:
                f.write('dummy audio data')
        
        # Initialize manager
        manager = FileOperationsManager(temp_dir)
        print(f"✓ Manager initialized for: {temp_dir}")
        
        # Create operation queue
        operations = [
            {
                'type': 'move_to_orphans',
                'filename': 'orphan1.wav',
                'reason': 'No matching record'
            },
            {
                'type': 'move_to_orphans',
                'filename': 'orphan2.wav',
                'reason': 'No matching record'
            },
            {
                'type': 'rename',
                'old_filename': '0021_dog.wav',
                'new_filename': '0021_canine.wav',
                'reference': '0021',
                'field': 'Phonetic',
                'reason': 'User matched'
            },
            {
                'type': 'mark_unrecorded',
                'reference': '0023',
                'field': 'Phonetic',
                'expected_filename': '0023_bird-phon.wav',
                'gloss': 'bird'
            }
        ]
        
        # Execute operations
        result = manager.execute_queue(operations)
        
        print(f"✓ Operations executed")
        print(f"  - Completed: {result['completed']}")
        print(f"  - Failed: {result['failed']}")
        print(f"  - Success: {result['success']}")
        
        assert result['success'], "Operations should succeed"
        assert result['completed'] == 3, "Should complete 3 file operations (2 moves + 1 rename)"
        
        # Verify orphans folder was created
        orphans_folder = os.path.join(temp_dir, 'orphans')
        assert os.path.exists(orphans_folder), "Orphans folder should be created"
        print(f"✓ Orphans folder created: {orphans_folder}")
        
        # Verify files were moved
        assert os.path.exists(os.path.join(orphans_folder, 'orphan1.wav')), "orphan1 should be moved"
        assert os.path.exists(os.path.join(orphans_folder, 'orphan2.wav')), "orphan2 should be moved"
        print(f"✓ Orphaned files moved to orphans folder")
        
        # Verify file was renamed
        assert os.path.exists(os.path.join(temp_dir, '0021_canine.wav')), "File should be renamed"
        assert not os.path.exists(os.path.join(temp_dir, '0021_dog.wav')), "Old filename should not exist"
        print(f"✓ File renamed successfully")
        
        # Verify logs were created
        markdown_log = os.path.join(temp_dir, 'soundfile_changes.md')
        json_log = os.path.join(temp_dir, 'soundfile_changes.json')
        unrecorded_log = os.path.join(temp_dir, 'unrecorded_fields.md')
        
        assert os.path.exists(markdown_log), "Markdown log should be created"
        assert os.path.exists(json_log), "JSON log should be created"
        assert os.path.exists(unrecorded_log), "Unrecorded log should be created"
        print(f"✓ All log files created")
        
        # Verify JSON log structure
        with open(json_log, 'r') as f:
            log_data = json.load(f)
            assert 'files' in log_data, "JSON log should have 'files' key"
            print(f"✓ JSON log has {len(log_data['files'])} file histories")
        
        # Verify markdown log content
        with open(markdown_log, 'r') as f:
            content = f.read()
            assert 'Renamed Files' in content, "Should log renamed files"
            assert 'Orphaned Files Moved' in content, "Should log orphaned files"
            print(f"✓ Markdown log contains correct sections")
        
        # Verify unrecorded log content
        with open(unrecorded_log, 'r') as f:
            content = f.read()
            assert 'Record 0023' in content, "Should list unrecorded record"
            assert 'bird' in content, "Should include gloss"
            print(f"✓ Unrecorded log contains to-do items")
        
        print("-" * 50)
        print("All tests passed! ✓")
        
    finally:
        # Cleanup
        shutil.rmtree(temp_dir)

if __name__ == '__main__':
    test_file_operations()
