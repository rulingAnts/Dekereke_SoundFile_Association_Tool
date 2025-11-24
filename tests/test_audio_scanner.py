"""
Test script for Audio Scanner
Tests audio file discovery and suffix extraction
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from audio_scanner import AudioFolderScanner
import tempfile
import shutil

def test_audio_scanner():
    """Test audio scanner with sample files"""
    
    # Create temporary directory with sample files
    temp_dir = tempfile.mkdtemp()
    
    try:
        print("Testing Audio Scanner...")
        print("-" * 50)
        
        # Create sample WAV files
        sample_files = [
            '0021_dog.wav',
            '0021_dog-phon.wav',
            '0021_dog-xbig.wav',
            '0022_cat.WAV',  # Different case extension
            '0022_cat-phon.wav',
            '0023_pig-phon.wav',
            '0023_piggy-phon.wav',  # Overlapping base
            'orphan_file.wav'
        ]
        
        for filename in sample_files:
            filepath = os.path.join(temp_dir, filename)
            with open(filepath, 'w') as f:
                f.write('dummy audio data')
        
        # Test case-insensitive scanning
        scanner = AudioFolderScanner(temp_dir, case_sensitive=False)
        success = scanner.scan()
        
        print(f"✓ Scan successful: {success}")
        print(f"✓ Files found: {len(scanner.audio_files)}")
        assert len(scanner.audio_files) == 8, "Should find all 8 WAV files"
        
        # Test suffix extraction with base filenames
        base_filenames = [
            '0021_dog.wav',
            '0022_cat.WAV',
            '0023_pig.wav',
            '0023_piggy.wav'
        ]
        
        suffixes, ambiguous = scanner.extract_suffixes(base_filenames)
        print(f"✓ Suffixes extracted: {list(suffixes.keys())}")
        print(f"✓ Ambiguous cases: {len(ambiguous)}")
        
        # Verify suffix extraction
        assert '' in suffixes, "Should find empty suffix (base files)"
        assert '-phon' in suffixes, "Should find -phon suffix"
        assert '-xbig' in suffixes, "Should find -xbig suffix"
        
        # Test orphaned file detection
        orphans = scanner.get_orphaned_files(base_filenames)
        print(f"✓ Orphaned files: {orphans}")
        assert 'orphan_file.wav' in orphans, "Should detect orphan file"
        
        # Test extension mismatch detection
        mismatches = scanner.check_extension_mismatches(base_filenames)
        print(f"✓ Extension mismatches: {len(mismatches)}")
        
        # Test case-sensitive mode
        scanner_cs = AudioFolderScanner(temp_dir, case_sensitive=True)
        scanner_cs.scan()
        suffixes_cs, _ = scanner_cs.extract_suffixes(base_filenames)
        print(f"✓ Case-sensitive suffixes: {list(suffixes_cs.keys())}")
        
        print("-" * 50)
        print("All tests passed! ✓")
        
    finally:
        # Cleanup
        shutil.rmtree(temp_dir)

if __name__ == '__main__':
    test_audio_scanner()
