"""
Audio Folder Scanner for Dekereke Sound File Association Tool
Handles audio file discovery and suffix extraction
"""

import os
from typing import List, Dict, Tuple, Set, Optional


class AudioFolderScanner:
    """Scanner for audio folder to identify files and suffixes"""
    
    def __init__(self, audio_folder: str, case_sensitive: bool = False):
        self.audio_folder = audio_folder
        self.case_sensitive = case_sensitive
        self.audio_files = []
        self.suffixes = {}  # suffix -> list of files with that suffix
        
    def scan(self) -> bool:
        """Scan audio folder for WAV files"""
        try:
            self.audio_files = []
            
            if not os.path.exists(self.audio_folder):
                print(f"Audio folder does not exist: {self.audio_folder}")
                return False
            
            # Find all .wav files (case-insensitive for extension)
            for filename in os.listdir(self.audio_folder):
                if filename.lower().endswith('.wav'):
                    full_path = os.path.join(self.audio_folder, filename)
                    if os.path.isfile(full_path):
                        self.audio_files.append(filename)
            
            return True
            
        except Exception as e:
            print(f"Error scanning audio folder: {e}")
            return False
    
    def extract_suffixes(self, base_filenames: List[str]) -> Dict[str, List[str]]:
        """
        Extract suffixes from audio files based on base filenames
        
        Args:
            base_filenames: List of base filenames from <SoundFile> elements
        
        Returns:
            Dictionary mapping suffix -> list of audio files with that suffix
        """
        self.suffixes = {}
        ambiguous_cases = []
        
        for audio_file in self.audio_files:
            # Try to match against base filenames
            matches = self._find_matching_bases(audio_file, base_filenames)
            
            if len(matches) == 0:
                # No matching base - this is an orphan
                continue
            
            if len(matches) > 1:
                # Multiple potential bases - use longest match
                matches.sort(key=lambda x: len(x), reverse=True)
                best_match = matches[0]
                
                # Record as ambiguous if there are other interpretations
                if len(matches[0]) != len(matches[1]):
                    ambiguous_cases.append({
                        'file': audio_file,
                        'chosen_base': best_match,
                        'alternatives': matches[1:]
                    })
            else:
                best_match = matches[0]
            
            # Extract suffix
            suffix = self._extract_suffix(audio_file, best_match)
            
            if suffix not in self.suffixes:
                self.suffixes[suffix] = []
            self.suffixes[suffix].append(audio_file)
        
        return self.suffixes, ambiguous_cases
    
    def _find_matching_bases(self, audio_file: str, base_filenames: List[str]) -> List[str]:
        """Find all base filenames that could match the audio file"""
        matches = []
        
        # Remove extension from audio file
        audio_name = self._remove_extension(audio_file)
        
        for base in base_filenames:
            base_name = self._remove_extension(base)
            
            # Check if audio file starts with this base
            if self._starts_with(audio_name, base_name):
                matches.append(base_name)
        
        return matches
    
    def _extract_suffix(self, audio_file: str, base_name: str) -> str:
        """
        Extract suffix from audio file given a base name
        
        Example:
            audio_file: "0021_pig-phon.wav"
            base_name: "0021_pig"
            returns: "-phon"
        """
        audio_name = self._remove_extension(audio_file)
        
        if self.case_sensitive:
            if audio_name.startswith(base_name):
                return audio_name[len(base_name):]
        else:
            if audio_name.lower().startswith(base_name.lower()):
                return audio_name[len(base_name):]
        
        return ""
    
    def _starts_with(self, text: str, prefix: str) -> bool:
        """Check if text starts with prefix (respecting case sensitivity)"""
        if self.case_sensitive:
            return text.startswith(prefix)
        else:
            return text.lower().startswith(prefix.lower())
    
    @staticmethod
    def _remove_extension(filename: str) -> str:
        """Remove .wav or .WAV extension from filename"""
        if filename.lower().endswith('.wav'):
            return filename[:-4]
        return filename
    
    def get_orphaned_files(self, base_filenames: List[str]) -> List[str]:
        """Get list of audio files that don't match any base filename"""
        orphans = []
        
        for audio_file in self.audio_files:
            matches = self._find_matching_bases(audio_file, base_filenames)
            if len(matches) == 0:
                orphans.append(audio_file)
        
        return orphans
    
    def check_extension_mismatches(self, base_filenames: List[str]) -> List[Tuple[str, str]]:
        """
        Check for extension case mismatches between base filenames and actual files
        
        Returns:
            List of tuples (base_filename, actual_filename) where extensions differ in case
        """
        mismatches = []
        
        for base in base_filenames:
            base_name = self._remove_extension(base)
            base_ext = base[len(base_name):] if len(base) > len(base_name) else '.wav'
            
            # Find matching audio file
            for audio_file in self.audio_files:
                audio_name = self._remove_extension(audio_file)
                audio_ext = audio_file[len(audio_name):]
                
                if self._starts_with(audio_name, base_name):
                    # Check if extensions differ in case
                    if base_ext != audio_ext and base_ext.lower() == audio_ext.lower():
                        mismatches.append((base, audio_file))
                        break
        
        return mismatches
