"""
File Operations Manager for Dekereke Sound File Association Tool
Handles execution of queued file operations with logging
"""

import os
import shutil
import json
from datetime import datetime
from typing import List, Dict, Any
import uuid


class FileOperationsManager:
    """Manages file operations (rename, move) with logging"""
    
    def __init__(self, audio_folder: str):
        self.audio_folder = audio_folder
        self.orphans_folder = os.path.join(audio_folder, 'orphans')
        
        # Log file paths
        self.markdown_log = os.path.join(audio_folder, 'soundfile_changes.md')
        self.json_log = os.path.join(audio_folder, 'soundfile_changes.json')
        self.unrecorded_log = os.path.join(audio_folder, 'unrecorded_fields.md')
        
        # Load existing JSON log if it exists
        self.file_history = self._load_json_log()
    
    def execute_queue(self, operations: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Execute all queued operations in the correct order
        
        Order:
        1. Create orphans folder
        2. Move orphaned files
        3. Rename files
        4. Generate logs
        
        Returns:
            {
                'success': bool,
                'completed': int,
                'failed': int,
                'errors': list,
                'log_files': dict
            }
        """
        completed = 0
        failed = 0
        errors = []
        
        # Separate operations by type
        moves = [op for op in operations if op.get('type') == 'move_to_orphans']
        renames = [op for op in operations if op.get('type') == 'rename']
        unrecorded = [op for op in operations if op.get('type') == 'mark_unrecorded']
        
        # 1. Create orphans folder
        if moves:
            if not self._create_orphans_folder():
                return {
                    'success': False,
                    'error': 'Failed to create orphans folder'
                }
        
        # 2. Move orphaned files
        for op in moves:
            try:
                self._move_to_orphans(op)
                completed += 1
            except Exception as e:
                failed += 1
                errors.append({
                    'operation': op,
                    'error': str(e)
                })
        
        # 3. Rename files
        for op in renames:
            try:
                # Check if file was already moved
                old_path = os.path.join(self.audio_folder, op['old_filename'])
                if not os.path.exists(old_path):
                    # Skip - file was moved to orphans
                    continue
                
                self._rename_file(op)
                completed += 1
            except Exception as e:
                failed += 1
                errors.append({
                    'operation': op,
                    'error': str(e)
                })
        
        # 4. Generate logs
        self._write_markdown_log(moves + renames, unrecorded)
        self._save_json_log()
        self._write_unrecorded_log(unrecorded)
        
        # Copy JSON log to orphans folder
        if os.path.exists(self.orphans_folder):
            orphan_json_log = os.path.join(self.orphans_folder, 'soundfile_changes.json')
            shutil.copy2(self.json_log, orphan_json_log)
        
        return {
            'success': failed == 0,
            'completed': completed,
            'failed': failed,
            'errors': errors,
            'log_files': {
                'markdown': self.markdown_log,
                'json': self.json_log,
                'unrecorded': self.unrecorded_log
            }
        }
    
    def _create_orphans_folder(self) -> bool:
        """Create orphans folder if it doesn't exist"""
        try:
            if not os.path.exists(self.orphans_folder):
                os.makedirs(self.orphans_folder)
            return True
        except Exception as e:
            print(f"Error creating orphans folder: {e}")
            return False
    
    def _move_to_orphans(self, operation: Dict[str, Any]):
        """Move a file to the orphans folder"""
        filename = operation['filename']
        old_path = os.path.join(self.audio_folder, filename)
        new_path = os.path.join(self.orphans_folder, filename)
        
        # Check for name conflicts
        if os.path.exists(new_path):
            raise FileExistsError(f"File already exists in orphans: {filename}")
        
        shutil.move(old_path, new_path)
        
        # Update file history
        file_id = self._get_or_create_file_id(filename)
        self.file_history[file_id]['current_path'] = new_path
        self.file_history[file_id]['history'].append({
            'timestamp': datetime.now().isoformat(),
            'operation': 'move_to_orphans',
            'old_path': old_path,
            'new_path': new_path,
            'reason': operation.get('reason', 'no_matching_record')
        })
    
    def _rename_file(self, operation: Dict[str, Any]):
        """Rename a file"""
        old_filename = operation['old_filename']
        new_filename = operation['new_filename']
        
        old_path = os.path.join(self.audio_folder, old_filename)
        new_path = os.path.join(self.audio_folder, new_filename)
        
        # Check for name conflicts
        if os.path.exists(new_path):
            raise FileExistsError(f"Target file already exists: {new_filename}")
        
        os.rename(old_path, new_path)
        
        # Update file history
        file_id = self._get_or_create_file_id(old_filename)
        self.file_history[file_id]['current_path'] = new_path
        self.file_history[file_id]['history'].append({
            'timestamp': datetime.now().isoformat(),
            'operation': 'rename',
            'old_path': old_path,
            'new_path': new_path,
            'reason': 'linked_to_record',
            'record_reference': operation.get('reference', ''),
            'field_name': operation.get('field', '')
        })
    
    def _get_or_create_file_id(self, filename: str) -> str:
        """Get existing file ID or create a new one"""
        # Search for existing file
        for file_id, file_data in self.file_history.items():
            if os.path.basename(file_data['current_path']) == filename:
                return file_id
        
        # Create new file ID
        file_id = str(uuid.uuid4())
        self.file_history[file_id] = {
            'current_path': os.path.join(self.audio_folder, filename),
            'history': []
        }
        return file_id
    
    def _load_json_log(self) -> Dict[str, Any]:
        """Load existing JSON log"""
        if os.path.exists(self.json_log):
            try:
                with open(self.json_log, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    return data.get('files', {})
            except Exception as e:
                print(f"Error loading JSON log: {e}")
        
        return {}
    
    def _save_json_log(self):
        """Save JSON log"""
        try:
            with open(self.json_log, 'w', encoding='utf-8') as f:
                json.dump({'files': self.file_history}, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error saving JSON log: {e}")
    
    def _write_markdown_log(self, operations: List[Dict], unrecorded: List[Dict]):
        """Write human-readable markdown log"""
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # Append mode
        mode = 'a' if os.path.exists(self.markdown_log) else 'w'
        
        with open(self.markdown_log, mode, encoding='utf-8') as f:
            f.write(f"\n## {timestamp}\n\n")
            
            # Renamed files
            renames = [op for op in operations if op.get('type') == 'rename']
            if renames:
                f.write("### Renamed Files\n")
                for op in renames:
                    f.write(f"- `{op['old_filename']}` → `{op['new_filename']}`\n")
                    f.write(f"  - Linked to Record {op.get('reference', 'N/A')}, field {op.get('field', 'N/A')}\n")
                    f.write(f"  - Reason: {op.get('reason', 'User matched')}\n")
                f.write("\n")
            
            # Orphaned files
            moves = [op for op in operations if op.get('type') == 'move_to_orphans']
            if moves:
                f.write("### Orphaned Files Moved\n")
                for op in moves:
                    f.write(f"- `{op['filename']}` → `orphans/{op['filename']}`\n")
                    f.write(f"  - Reason: {op.get('reason', 'No matching record found')}\n")
                f.write("\n")
    
    def _write_unrecorded_log(self, unrecorded: List[Dict]):
        """Write unrecorded fields to-do list"""
        if not unrecorded:
            return
        
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        with open(self.unrecorded_log, 'w', encoding='utf-8') as f:
            f.write("# Unrecorded Fields To-Do List\n")
            f.write(f"Generated: {timestamp}\n\n")
            
            # Group by record
            by_record = {}
            for item in unrecorded:
                ref = item.get('reference', 'Unknown')
                if ref not in by_record:
                    by_record[ref] = {
                        'gloss': item.get('gloss', ''),
                        'fields': []
                    }
                by_record[ref]['fields'].append({
                    'field': item.get('field', ''),
                    'expected': item.get('expected_filename', '')
                })
            
            for ref, data in sorted(by_record.items()):
                gloss = data['gloss']
                f.write(f"## Record {ref}")
                if gloss:
                    f.write(f" - \"{gloss}\"")
                f.write("\n")
                
                for field_info in data['fields']:
                    f.write(f"- [ ] {field_info['field']} (expected: {field_info['expected']})\n")
                
                f.write("\n")
