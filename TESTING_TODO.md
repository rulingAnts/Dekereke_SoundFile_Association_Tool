# Testing and Troubleshooting TODO

## Items to Test Later

### 1. Auto-Generation of Empty SoundFile Elements
**Status:** Not yet tested (manual entry was used instead)

**Test Steps:**
1. Open the XML file in a text editor
2. Manually clear 2-3 `<SoundFile>` values (make them empty: `<SoundFile></SoundFile>`)
3. Save the XML file
4. Reload the XML in the app (may need to restart)
5. Click "Fill SoundFile Elements" button
6. In the modal, verify the preview shows correct generated filenames (e.g., `0670_gloss.wav`)
7. Click "Apply Auto-Generation"
8. Verify success message appears
9. Check the XML file to confirm `<SoundFile>` elements were updated with generated names
10. Verify UTF-16 encoding was preserved (file should still open correctly in the app)

**What to Verify:**
- [ ] Preview generation shows correct format based on template
- [ ] Auto-generation successfully updates XML
- [ ] XML file maintains UTF-16 encoding
- [ ] Generated filenames follow expected pattern (Reference_Gloss.wav format)
- [ ] Special characters in Gloss are handled properly (sanitized)

### 2. Audio Folder Scanning
**Status:** Not tested

**Test Steps:**
1. Click "Select Audio Folder" and choose a folder with .wav files
2. Verify the scan completes and shows file count
3. Check that the list of audio files is populated

**What to Verify:**
- [ ] Scans recursively through subdirectories
- [ ] Detects all .wav files
- [ ] Shows accurate file count
- [ ] Handles large folders efficiently

### 3. Conditional Expectations (Field-to-Suffix Mapping)
**Status:** Not tested

**Test Steps:**
1. Configure field-to-suffix mappings (e.g., `Phonemic` → `_ph.wav`, `Phonetic` → `_pt.wav`)
2. Save mapping configuration
3. Run "Find Mismatches" or validation
4. Verify expectations are correctly applied

**What to Verify:**
- [ ] Mappings are saved correctly
- [ ] Multiple fields can be mapped
- [ ] Suffixes are detected correctly in audio filenames
- [ ] Mismatches are identified when expected suffix is missing

### 4. Duplicate Reference Detection
**Status:** Not tested

**Test Steps:**
1. Check if XML has duplicate `<Reference>` IDs
2. Click "Fix Duplicate References" button
3. Verify duplicates are handled appropriately

**What to Verify:**
- [ ] Duplicates are detected correctly
- [ ] Fix operation preserves data integrity
- [ ] UTF-16 encoding maintained after fixes

### 5. Mismatch Detection and Resolution
**Status:** Not tested

**Test Steps:**
1. Ensure audio folder is scanned
2. Ensure conditional expectations are configured
3. Click "Find Mismatches" (or equivalent button)
4. Review mismatch results
5. Test mismatch resolution options

**What to Verify:**
- [ ] Detects when SoundFile doesn't match expected pattern
- [ ] Detects when SoundFile references non-existent audio file
- [ ] Provides appropriate resolution options
- [ ] Can update XML to fix mismatches

### 6. Audio Playback
**Status:** Not tested

**Test Steps:**
1. Ensure pygame is installed
2. Try playing an audio file from the interface
3. Verify playback controls work

**What to Verify:**
- [ ] Audio plays correctly
- [ ] Handles missing files gracefully
- [ ] Stop/pause controls work (if implemented)

---

## Known Issues to Address

1. **Method naming inconsistency**: Fixed `get_record()` calls to use `records[idx]` directly
   - ✅ Fixed in `get_empty_soundfile_records()`
   - ✅ Fixed in `preview_soundfile_generation()`
   - ✅ Fixed in `auto_generate_soundfiles()`

---

## Testing Priority Order

1. **High Priority:**
   - Auto-generation of empty SoundFile elements
   - Audio folder scanning
   - Conditional expectations setup

2. **Medium Priority:**
   - Mismatch detection
   - Duplicate reference handling

3. **Low Priority:**
   - Audio playback (optional feature)
