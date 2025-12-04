/**
 * Dekereke Sound File Association Tool - Frontend JavaScript
 * Communicates with Python backend via pywebview API
 */

// Global state
const state = {
    xmlPath: null,
    audioFolder: null,
    caseSensitive: false,
    suffixes: {},
    fieldNames: [],
    suffixMappings: {},
    conditionalRules: {},
    fieldGroups: {},  // groupName -> [fieldNames]
    operationQueue: [],
    currentScreen: 'setup',
    
    // Step 1 data
    excludedSuffixes: new Set(),  // Set of suffixes to exclude from unmatched files
    
    // Step 3 data
    datasheetData: null,
    visibleColumns: [],
    columnOrder: [],
    sortColumn: null,
    sortDirection: 'asc',
    filters: [],
    tentativeAssociations: {},  // {orphanedFile: {recordIdx, field, suffix, newName}}
    tentativeUnlinks: {},  // {originalFile: {recordIdx, field, suffix, unlinkTo}}
    savedForLater: new Set(),  // Set of filenames saved for later
    noLongerNeeded: new Set(),  // Set of filenames no longer needed
    activeModal: null,
    
    // Search
    searchResults: [],
    searchCurrentIndex: -1,
    
    // Audio playback
    autoPlayAudio: true,
    currentAudio: null,
    currentBlobUrl: null  // Track blob URLs for cleanup
};

// Wait for pywebview to be ready
window.addEventListener('pywebviewready', function() {
    console.log('pywebview ready');
    initializeApp();
});

// Initialize application
async function initializeApp() {
    setupEventListeners();
    await loadPreviousSettings();
    showScreen('setup');
}

// Load previous settings from backend
async function loadPreviousSettings() {
    try {
        const settings = await window.pywebview.api.get_initial_settings();
        
        if (settings) {
            // Restore case sensitivity
            if (settings.case_sensitive !== undefined) {
                state.caseSensitive = settings.case_sensitive;
                const radio = document.querySelector(`input[name="case-sensitive"][value="${settings.case_sensitive}"]`);
                if (radio) radio.checked = true;
            }
            
            // Restore suffix mappings
            if (settings.suffix_mappings && Object.keys(settings.suffix_mappings).length > 0) {
                state.suffixMappings = settings.suffix_mappings;
            }
            
            // Restore conditional rules
            if (settings.conditional_rules && Object.keys(settings.conditional_rules).length > 0) {
                state.conditionalRules = settings.conditional_rules;
            }
            
            // Restore field groups
            if (settings.field_groups && Object.keys(settings.field_groups).length > 0) {
                state.fieldGroups = settings.field_groups;
            }

            // Restore group filters
            if (settings.group_filters && Object.keys(settings.group_filters).length > 0) {
                state.groupFilters = settings.group_filters;
            }

            // Restore expectation modes (radio selections)
            if (settings.expectation_modes && Object.keys(settings.expectation_modes).length > 0) {
                state.expectationModes = settings.expectation_modes;
                // Apply to UI if already built
                for (const key in state.expectationModes) {
                    const value = state.expectationModes[key];
                    const radio = document.querySelector(`input[name="expect-${key}"][value="${value}"]`);
                    if (radio) radio.checked = true;
                }
            }
            
            // Restore datasheet filters
            if (settings.datasheet_filters) {
                state.filters = settings.datasheet_filters;
            }
            
            // Restore visible columns
            if (settings.visible_columns && settings.visible_columns.length > 0) {
                state.visibleColumns = settings.visible_columns;
                state.columnOrder = [...settings.visible_columns];
            }
            
            // Auto-load last XML if exists
            if (settings.last_xml_path) {
                await autoLoadXML(settings.last_xml_path);
            }
            
            // Auto-load last audio folder if exists
            if (settings.last_audio_folder) {
                await autoLoadAudioFolder(settings.last_audio_folder);
            }
            
            // If we have mappings loaded, refresh the tiles display
            if (Object.keys(state.suffixMappings).length > 0) {
                refreshMappingTiles();
            }
        }
    } catch (error) {
        console.error('Error loading previous settings:', error);
    }
}

// Auto-load XML file from previous session
async function autoLoadXML(xmlPath) {
    try {
        const result = await window.pywebview.api.parse_xml(xmlPath);
        
        if (result.success) {
            state.xmlPath = xmlPath;
            state.fieldNames = result.field_names;
            
            document.getElementById('xml-info').classList.remove('hidden');
            document.getElementById('xml-path').textContent = xmlPath;
            document.getElementById('xml-record-count').textContent = result.record_count;
            document.getElementById('xml-status').textContent = `XML: ${result.record_count} records`;
            
            if (Object.keys(result.duplicates).length > 0) {
                showDuplicateWarning(result.duplicates);
            }
            
            if (result.empty_soundfiles.length > 0) {
                showEmptySoundFileWarning(result.empty_soundfiles);
            }
            
            checkReadyForStep1();
        }
    } catch (error) {
        console.error('Error auto-loading XML:', error);
    }
}

// Auto-load audio folder from previous session
async function autoLoadAudioFolder(audioFolder) {
    try {
        const result = await window.pywebview.api.scan_audio_folder(audioFolder);
        
        if (result.success) {
            state.audioFolder = audioFolder;
            
            document.getElementById('audio-info').classList.remove('hidden');
            document.getElementById('audio-path').textContent = audioFolder;
            document.getElementById('audio-file-count').textContent = result.file_count;
            document.getElementById('audio-status').textContent = `Audio: ${result.file_count} files`;
            
            checkReadyForStep1();
        }
    } catch (error) {
        console.error('Error auto-loading audio folder:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const step = e.target.dataset.step;
            showScreen(step);
        });
    });

    // Initial Setup
    document.getElementById('btn-select-xml').addEventListener('click', selectXMLFile);
    document.getElementById('btn-select-audio').addEventListener('click', selectAudioFolder);
    document.getElementById('btn-proceed-to-step1').addEventListener('click', proceedToStep1);
    document.getElementById('btn-fill-soundfiles').addEventListener('click', showFillSoundFilesModal);
    document.getElementById('btn-skip-empty').addEventListener('click', skipEmptyRecords);
    document.getElementById('btn-fix-duplicates').addEventListener('click', showFixDuplicatesModal);
    document.getElementById('btn-skip-duplicates').addEventListener('click', skipDuplicates);

    // Case sensitivity
    document.querySelectorAll('input[name="case-sensitive"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.caseSensitive = e.target.value === 'true';
            window.pywebview.api.set_case_sensitivity(state.caseSensitive);
        });
    });

    // Step 1
    document.getElementById('btn-load-dekereke-settings').addEventListener('click', loadDekeRekeSettings);
    document.getElementById('btn-import-mappings').addEventListener('click', importMappings);
    document.getElementById('btn-export-mappings').addEventListener('click', exportMappings);
    document.getElementById('btn-copy-mappings').addEventListener('click', copyMappings);
    document.getElementById('btn-paste-mappings').addEventListener('click', pasteMappings);
    document.getElementById('btn-clear-mappings').addEventListener('click', clearMappings);
    document.getElementById('btn-inspect-suffixes').addEventListener('click', showInspectSuffixesModal);
    document.getElementById('btn-save-mappings').addEventListener('click', saveMappings);
    document.getElementById('btn-proceed-to-step2').addEventListener('click', () => {
        showScreen('step2');
        buildConditionsUI();
    });

    // Step 2
    document.getElementById('btn-import-conditions').addEventListener('click', importConditions);
    document.getElementById('btn-export-conditions').addEventListener('click', exportConditions);
    document.getElementById('btn-save-conditions').addEventListener('click', saveConditions);
    document.getElementById('btn-proceed-to-step3').addEventListener('click', () => showScreen('step3'));

    // Step 3 event listeners are set up in setupStep3EventListeners() when Step 3 loads

    // Review
    document.getElementById('btn-execute').addEventListener('click', showBackupWarning);
    document.getElementById('btn-back-to-step3').addEventListener('click', () => showScreen('step3'));
}

// Show screen
function showScreen(screenName) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    
    // Show selected screen
    const screen = document.getElementById(`${screenName}-screen`);
    if (screen) {
        screen.classList.add('active');
    }

    // Update navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.step === screenName) {
            btn.classList.add('active');
        }
    });
    
    // Load Step 3 data when navigating to it
    if (screenName === 'step3') {
        loadStep3Data();
    }
    
    state.currentScreen = screenName;
}// Select XML file
async function selectXMLFile() {
    showLoading('Selecting XML file...');
    
    try {
        const xmlPath = await window.pywebview.api.select_xml_file();
        
        if (xmlPath) {
            const result = await window.pywebview.api.parse_xml(xmlPath);
            
            if (result.success) {
                state.xmlPath = xmlPath;
                state.fieldNames = result.field_names;
                
                // Update UI
                document.getElementById('xml-info').classList.remove('hidden');
                document.getElementById('xml-path').textContent = xmlPath;
                document.getElementById('xml-record-count').textContent = result.record_count;
                document.getElementById('xml-status').textContent = `XML: ${result.record_count} records`;
                
                // Check for issues
                if (Object.keys(result.duplicates).length > 0) {
                    showDuplicateWarning(result.duplicates);
                }
                
                if (result.empty_soundfiles.length > 0) {
                    showEmptySoundFileWarning(result.empty_soundfiles);
                }
                
                checkReadyForStep1();
            } else {
                showError('Failed to parse XML: ' + result.error);
            }
        }
    } catch (error) {
        showError('Error selecting XML: ' + error);
    } finally {
        hideLoading();
    }
}

// Select audio folder
async function selectAudioFolder() {
    showLoading('Scanning audio folder...');
    
    try {
        const audioFolder = await window.pywebview.api.select_audio_folder();
        
        if (audioFolder) {
            const result = await window.pywebview.api.scan_audio_folder(audioFolder);
            
            if (result.success) {
                state.audioFolder = audioFolder;
                
                // Update UI
                document.getElementById('audio-info').classList.remove('hidden');
                document.getElementById('audio-path').textContent = audioFolder;
                document.getElementById('audio-file-count').textContent = result.file_count;
                document.getElementById('audio-status').textContent = `Audio: ${result.file_count} files`;
                
                checkReadyForStep1();
            } else {
                showError('Failed to scan audio folder: ' + result.error);
            }
        }
    } catch (error) {
        showError('Error selecting audio folder: ' + error);
    } finally {
        hideLoading();
    }
}

// Check if ready to proceed to Step 1
function checkReadyForStep1() {
    const btn = document.getElementById('btn-proceed-to-step1');
    if (state.xmlPath && state.audioFolder) {
        btn.disabled = false;
    }
}

// Proceed to Step 1
async function proceedToStep1() {
    showLoading('Extracting suffixes...');
    
    try {
        const result = await window.pywebview.api.extract_suffixes();
        
        if (result.success) {
            state.suffixes = result.suffixes;
            
            // Auto-map empty suffix to SoundFile (not user-configurable)
            if ('' in state.suffixes) {
                state.suffixMappings[''] = ['SoundFile'];
            }
            
            // Load excluded suffixes from settings
            try {
                const excludedList = await window.pywebview.api.get_excluded_suffixes();
                state.excludedSuffixes = new Set(excludedList || []);
            } catch (error) {
                console.log('Could not load excluded suffixes:', error);
                state.excludedSuffixes = new Set();
            }
            
            // Check for ambiguous cases
            if (result.ambiguous_cases && result.ambiguous_cases.length > 0) {
                showAmbiguousWarning(result.ambiguous_cases);
            }
            
            // Check for extension mismatches
            if (result.extension_mismatches && result.extension_mismatches.length > 0) {
                // Could show a warning here
                console.log('Extension mismatches:', result.extension_mismatches);
            }
            
            // Build mapping UI
            buildMappingUI();
            
            // Enable inspect suffixes button
            document.getElementById('btn-inspect-suffixes').disabled = false;
            
            // Enable navigation and show Step 1
            document.getElementById('nav-step1').disabled = false;
            showScreen('step1');
        } else {
            showError('Failed to extract suffixes: ' + result.error);
        }
    } catch (error) {
        showError('Error extracting suffixes: ' + error);
    } finally {
        hideLoading();
    }
}

// Build mapping UI
function buildMappingUI() {
    const suffixList = document.getElementById('suffix-list');
    const fieldList = document.getElementById('field-list');
    
    suffixList.innerHTML = '';
    fieldList.innerHTML = '';
    
    // Add suffixes (exclude empty suffix - auto-mapped to SoundFile)
    for (const suffix in state.suffixes) {
        if (suffix === '') continue;  // Skip empty suffix - auto-mapped
        
        const item = document.createElement('div');
        item.className = 'draggable-item droppable-item';
        item.draggable = true;
        item.dataset.suffix = suffix;
        
        const label = document.createElement('strong');
        label.textContent = suffix || '(no suffix)';
        item.appendChild(label);
        
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        
        // Click to inspect this suffix's files
        item.addEventListener('dblclick', () => {
            showSuffixFilesModal(suffix);
        });
        item.title = 'Double-click to inspect files with this suffix';
        
        suffixList.appendChild(item);
    }
    
    // Add fields (SoundFile is automatically mapped to empty suffix)
    const fields = [...state.fieldNames];
    for (const field of fields) {
        const item = document.createElement('div');
        item.className = 'draggable-item droppable-item';
        item.draggable = true;
        item.dataset.field = field;
        
        const label = document.createElement('strong');
        label.textContent = field;
        item.appendChild(label);
        
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        
        fieldList.appendChild(item);
    }
    
    // Refresh tiles from state
    refreshMappingTiles();
}

// Refresh mapping tiles from state (called after any mapping change)
function refreshMappingTiles() {
    // Clear all existing tiles
    document.querySelectorAll('.mapped-tile').forEach(tile => tile.remove());
    
    // Only proceed if suffix and field lists exist (i.e., XML has been loaded)
    const suffixList = document.getElementById('suffix-list');
    const fieldList = document.getElementById('field-list');
    if (!suffixList || !fieldList || suffixList.children.length === 0 || fieldList.children.length === 0) {
        // UI not built yet, skip rendering tiles
        return;
    }
    
    // Rebuild tiles from state.suffixMappings
    for (const suffix in state.suffixMappings) {
        const fields = state.suffixMappings[suffix];
        for (const field of fields) {
            // Find the suffix item (must be draggable-item, not a tile)
            const suffixItem = document.querySelector(`.draggable-item[data-suffix="${suffix}"]`);
            // Find the field item (must be draggable-item, not a tile)
            const fieldItem = Array.from(document.querySelectorAll('.draggable-item[data-field]')).find(
                el => el.dataset.field === field
            );
            
            if (!suffixItem || !fieldItem) {
                // Skip empty suffix (auto-mapped to SoundFile, not shown in UI)
                if (suffix === '' && field === 'SoundFile') {
                    continue;
                }
                console.warn(`Could not find items for mapping: ${suffix} -> ${field}`)
                continue;
            }
            
            // Create tile for field (showing suffix)
            const fieldTile = document.createElement('span');
            fieldTile.className = 'mapped-tile';
            fieldTile.dataset.suffix = suffix;
            fieldTile.dataset.field = field;
            fieldTile.textContent = suffix || '(no suffix)';
            fieldTile.title = 'Click to remove';
            fieldTile.addEventListener('click', function() {
                removeMapping(suffix, field);
            });
            fieldItem.appendChild(fieldTile);
            
            // Create tile for suffix (showing field)
            const suffixTile = document.createElement('span');
            suffixTile.className = 'mapped-tile';
            suffixTile.dataset.suffix = suffix;
            suffixTile.dataset.field = field;
            suffixTile.textContent = field;
            suffixTile.title = 'Click to remove';
            suffixTile.addEventListener('click', function() {
                removeMapping(suffix, field);
            });
            suffixItem.appendChild(suffixTile);
        }
    }
}

// Drag and drop handlers
let draggedElement = null;

function handleDragStart(e) {
    draggedElement = e.target;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'copy';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'copy';
    e.target.classList.add('drag-over');
    return false;
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagagation();
    }
    e.target.classList.remove('drag-over');
    
    if (draggedElement) {
        const draggedSuffix = draggedElement.dataset.suffix;
        const draggedField = draggedElement.dataset.field;
        const target = e.target.classList.contains('droppable-item') ? e.target : e.target.closest('.droppable-item');
        
        if (!target) return false;
        
        const targetSuffix = target.dataset.suffix;
        const targetField = target.dataset.field;
        
        let suffix, field;
        
        // Determine what was dragged and where it was dropped
        if (draggedSuffix !== undefined && targetField !== undefined) {
            // Suffix dragged onto field
            suffix = draggedSuffix;
            field = targetField;
        } else if (draggedField !== undefined && targetSuffix !== undefined) {
            // Field dragged onto suffix
            suffix = targetSuffix;
            field = draggedField;
        } else {
            // Invalid drop (suffix on suffix or field on field)
            return false;
        }
        
        // Check if this field is already mapped to a different suffix
        // (Dekereke constraint: one field can only have one suffix)
        for (const existingSuffix in state.suffixMappings) {
            if (state.suffixMappings[existingSuffix].includes(field)) {
                if (existingSuffix === suffix) {
                    showError('This mapping already exists');
                    return false;
                } else {
                    const suffixDisplay = existingSuffix || '(no suffix)';
                    const newSuffixDisplay = suffix || '(no suffix)';
                    showError(`Field "${field}" is already mapped to suffix "${suffixDisplay}". Each field can only have one suffix. Remove the existing mapping first.`);
                    return false;
                }
            }
        }
        
        // Add mapping to state
        if (!state.suffixMappings[suffix]) {
            state.suffixMappings[suffix] = [];
        }
        state.suffixMappings[suffix].push(field);
        
        // Refresh UI from state
        refreshMappingTiles();
    }
    
    return false;
}

// Remove mapping
function removeMapping(suffix, field) {
    // Remove from state
    if (state.suffixMappings[suffix]) {
        state.suffixMappings[suffix] = state.suffixMappings[suffix].filter(f => f !== field);
        if (state.suffixMappings[suffix].length === 0) {
            delete state.suffixMappings[suffix];
        }
    }
    
    // Refresh UI from state
    refreshMappingTiles();
}

// Load mappings from Dekereke settings file
async function loadDekeRekeSettings() {
    showLoading('Loading Dekereke settings...');
    
    try {
        const result = await window.pywebview.api.load_dekereke_settings();
        
        if (result.success) {
            // Update state with loaded mappings
            state.suffixMappings = result.mappings;
            
            // Refresh UI from state
            refreshMappingTiles();
            
            showSuccess(`Loaded ${result.count} suffix mappings from Dekereke settings`);
        } else {
            showError(result.error || 'Failed to load settings');
        }
    } catch (error) {
        showError('Error loading settings: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Export mappings to TSV text file
async function exportMappings() {
    showLoading('Exporting mappings...');
    
    try {
        if (Object.keys(state.suffixMappings).length === 0) {
            showError('No mappings to export');
            return;
        }
        
        const result = await window.pywebview.api.export_mappings(state.suffixMappings);
        
        if (result.success) {
            showSuccess('Mappings exported successfully');
        } else {
            showError(result.error || 'Failed to export mappings');
        }
    } catch (error) {
        showError('Error exporting mappings: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Import mappings from TSV text file
async function importMappings() {
    showLoading('Importing mappings...');
    
    try {
        const result = await window.pywebview.api.import_mappings();
        
        if (result.success) {
            // Update state with imported mappings
            state.suffixMappings = result.mappings;
            
            // Rebuild UI to reattach drag-drop listeners
            buildMappingUI();
            
            showSuccess(`Imported ${result.count} suffix mappings`);
        } else {
            if (result.error !== 'No file selected') {
                showError(result.error || 'Failed to import mappings');
            }
        }
    } catch (error) {
        showError('Error importing mappings: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Copy mappings to clipboard in TSV format
async function copyMappings() {
    try {
        if (Object.keys(state.suffixMappings).length === 0) {
            showError('No mappings to copy');
            return;
        }
        
        // Convert mappings to TSV format (field<tab>suffix)
        const lines = [];
        const emptySuffixLines = [];  // Store empty suffix mappings separately
        
        for (const suffix in state.suffixMappings) {
            const fields = state.suffixMappings[suffix];
            for (const field of fields) {
                const line = `${field}\t${suffix}`;
                if (suffix === '') {  // Empty suffix (SoundFile)
                    emptySuffixLines.push(line);
                } else {
                    lines.push(line);
                }
            }
        }
        
        // Sort non-empty suffix lines
        lines.sort();
        
        // Append empty suffix lines at the end
        emptySuffixLines.sort();
        lines.push(...emptySuffixLines);
        
        const tsvText = lines.join('\n');
        
        // Use native clipboard via Python backend
        const result = await window.pywebview.api.copy_to_clipboard(tsvText);
        
        if (result.success) {
            showSuccess('Mappings copied to clipboard');
        } else {
            showError(result.error || 'Failed to copy to clipboard');
        }
        
    } catch (error) {
        showError('Error copying mappings: ' + error.message);
    }
}

// Paste mappings from clipboard TSV format
async function pasteMappings() {
    showLoading('Pasting mappings...');
    
    try {
        // Read from clipboard using native Python backend
        const clipResult = await window.pywebview.api.paste_from_clipboard();
        
        if (!clipResult.success) {
            showError(clipResult.error || 'Failed to read from clipboard');
            return;
        }
        
        const tsvText = clipResult.text;
        
        if (!tsvText.trim()) {
            showError('Clipboard is empty');
            return;
        }
        
        // Parse TSV format (field<tab>suffix)
        const mappings = {};
        const lines = tsvText.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Skip completely empty lines
            if (line.trim() === '') {
                continue;
            }
            
            // Skip comments
            if (line.trim().startsWith('#')) {
                continue;
            }
            
            // Check if line contains a tab
            if (!line.includes('\t')) {
                showError(`Invalid format at line ${i + 1}: expected field<tab>suffix (no tab found)`);
                return;
            }
            
            const parts = line.split('\t');
            if (parts.length !== 2) {
                showError(`Invalid format at line ${i + 1}: expected field<tab>suffix (found ${parts.length} parts)`);
                return;
            }
            
            const field = parts[0].trim();
            const suffix = parts[1].trim();  // Allow empty suffix
            
            if (!field) {
                showError(`Empty field name at line ${i + 1}`);
                return;
            }
            
            // Check for duplicate field mappings (Dekereke constraint: one field = one suffix)
            for (const existingSuffix in mappings) {
                if (mappings[existingSuffix].includes(field)) {
                    const suffixDisplay = existingSuffix || '(no suffix)';
                    const newSuffixDisplay = suffix || '(no suffix)';
                    showError(`Line ${i + 1}: Field "${field}" is already mapped to suffix "${suffixDisplay}". Each field can only have one suffix. Only the first mapping will be kept.`);
                    return;
                }
            }
            
            // Build suffix -> [fields] mapping (suffix can be empty string)
            if (!mappings[suffix]) {
                mappings[suffix] = [];
            }
            if (!mappings[suffix].includes(field)) {
                mappings[suffix].push(field);
            }
        }
        
        if (Object.keys(mappings).length === 0) {
            showError('No valid mappings found in clipboard');
            return;
        }
        
        // Update state
        state.suffixMappings = mappings;
        
        // Rebuild UI to reattach drag-drop listeners
        buildMappingUI();
        
        // Save to persistent storage
        await window.pywebview.api.save_suffix_mappings(mappings);
        
        showSuccess(`Pasted ${Object.keys(mappings).length} suffix mappings`);
        
    } catch (error) {
        showError('Error pasting mappings: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Clear all mappings
async function clearMappings() {
    const confirmed = confirm('Are you sure you want to clear all mappings? This cannot be undone.');
    
    if (!confirmed) {
        return;
    }
    
    try {
        // Clear state
        state.suffixMappings = {};
        
        // Rebuild UI
        buildMappingUI();
        
        // Save to persistent storage
        await window.pywebview.api.save_suffix_mappings({});
        
        showSuccess('All mappings cleared');
        
    } catch (error) {
        showError('Error clearing mappings: ' + error.message);
    }
}

// Show inspect suffixes modal (overview of all suffixes)
function showInspectSuffixesModal() {
    if (!state.suffixes || Object.keys(state.suffixes).length === 0) {
        showError('No suffixes extracted yet. Please extract suffixes first.');
        return;
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px; max-height: 80vh;">
            <h3>🔍 Inspect Suffixes</h3>
            <p>Click any suffix to view and rename its files. Check "Exclude" to hide files with that suffix from the Unmatched pane.</p>
            <div style="max-height: 60vh; overflow-y: auto; margin: 1rem 0;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: #f3f4f6; position: sticky; top: 0;">
                            <th style="padding: 0.5rem; text-align: left; border-bottom: 2px solid #e5e7eb;">Suffix</th>
                            <th style="padding: 0.5rem; text-align: right; border-bottom: 2px solid #e5e7eb;">File Count</th>
                            <th style="padding: 0.5rem; text-align: center; border-bottom: 2px solid #e5e7eb;">Exclude</th>
                            <th style="padding: 0.5rem; text-align: center; border-bottom: 2px solid #e5e7eb;">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="suffix-inspect-list"></tbody>
                </table>
            </div>
            <div class="button-row">
                <button id="btn-re-extract" class="btn-secondary">Re-extract Suffixes</button>
                <button id="btn-close-inspect" class="btn-secondary">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const list = modal.querySelector('#suffix-inspect-list');
    
    // Sort suffixes by file count (descending), exclude empty suffix (auto-mapped)
    const sortedSuffixes = Object.entries(state.suffixes)
        .filter(([suffix]) => suffix !== '')  // Exclude empty suffix
        .sort((a, b) => b[1].length - a[1].length);
    
    sortedSuffixes.forEach(([suffix, files]) => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #e5e7eb';
        row.style.cursor = 'pointer';
        
        const suffixCell = document.createElement('td');
        suffixCell.style.padding = '0.5rem';
        suffixCell.textContent = suffix || '(no suffix)';
        suffixCell.style.fontFamily = 'monospace';
        
        const countCell = document.createElement('td');
        countCell.style.padding = '0.5rem';
        countCell.style.textAlign = 'right';
        countCell.textContent = files.length;
        
        const excludeCell = document.createElement('td');
        excludeCell.style.padding = '0.5rem';
        excludeCell.style.textAlign = 'center';
        
        const excludeCheckbox = document.createElement('input');
        excludeCheckbox.type = 'checkbox';
        excludeCheckbox.checked = state.excludedSuffixes.has(suffix);
        excludeCheckbox.style.width = '18px';
        excludeCheckbox.style.height = '18px';
        excludeCheckbox.style.cursor = 'pointer';
        excludeCheckbox.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        excludeCheckbox.addEventListener('change', async (e) => {
            if (e.target.checked) {
                state.excludedSuffixes.add(suffix);
            } else {
                state.excludedSuffixes.delete(suffix);
            }
            
            // Save to backend
            await window.pywebview.api.save_excluded_suffixes(Array.from(state.excludedSuffixes));
            
            // Update unmatched files if in Step 3
            if (state.datasheetData) {
                renderOrphanedFiles();
            }
        });
        
        excludeCell.appendChild(excludeCheckbox);
        
        const actionCell = document.createElement('td');
        actionCell.style.padding = '0.5rem';
        actionCell.style.textAlign = 'center';
        
        const viewBtn = document.createElement('button');
        viewBtn.textContent = 'View Files';
        viewBtn.className = 'btn-small btn-secondary';
        viewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showSuffixFilesModal(suffix);
        });
        
        actionCell.appendChild(viewBtn);
        
        row.appendChild(suffixCell);
        row.appendChild(countCell);
        row.appendChild(excludeCell);
        row.appendChild(actionCell);
        
        row.addEventListener('click', () => {
            showSuffixFilesModal(suffix);
        });
        
        row.addEventListener('mouseenter', () => row.style.background = '#f9fafb');
        row.addEventListener('mouseleave', () => row.style.background = 'white');
        
        list.appendChild(row);
    });
    
    modal.querySelector('#btn-re-extract').addEventListener('click', async () => {
        modal.remove();
        await proceedToStep1();
    });
    
    modal.querySelector('#btn-close-inspect').addEventListener('click', () => {
        modal.remove();
    });
}

// Show files for a specific suffix with rename capability
function showSuffixFilesModal(suffix) {
    if (!state.suffixes || !state.suffixes[suffix]) {
        showError('Suffix not found');
        return;
    }
    
    const files = state.suffixes[suffix];
    const displaySuffix = suffix || '(no suffix)';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px; max-height: 80vh;">
            <h3>Files with suffix: <code style="background: #f3f4f6; padding: 0.25rem 0.5rem; border-radius: 3px;">${displaySuffix}</code></h3>
            <p>${files.length} file(s)</p>
            <div style="max-height: 50vh; overflow-y: auto; margin: 1rem 0; border: 1px solid #e5e7eb; border-radius: 4px;">
                <div id="suffix-file-list"></div>
            </div>
            <div class="button-row">
                <button id="btn-close-suffix-files" class="btn-secondary">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const fileList = modal.querySelector('#suffix-file-list');
    
    files.forEach(filename => {
        const fileItem = document.createElement('div');
        fileItem.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; border-bottom: 1px solid #f3f4f6;';
        fileItem.dataset.filename = filename;
        
        const playBtn = document.createElement('button');
        playBtn.textContent = '▶';
        playBtn.className = 'btn-small btn-secondary';
        playBtn.style.minWidth = '0';
        playBtn.style.padding = '0.25rem 0.5rem';
        playBtn.addEventListener('click', () => {
            playAudioFile(filename);
        });
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = filename;
        nameSpan.style.flex = '1';
        nameSpan.style.fontFamily = 'monospace';
        nameSpan.style.fontSize = '0.9rem';
        
        const renameBtn = document.createElement('button');
        renameBtn.textContent = '✏️ Rename';
        renameBtn.className = 'btn-small btn-secondary';
        renameBtn.addEventListener('click', () => {
            showRenameFileDialog(filename, suffix);
        });
        
        fileItem.appendChild(playBtn);
        fileItem.appendChild(nameSpan);
        fileItem.appendChild(renameBtn);
        
        // Double-click to play
        fileItem.addEventListener('dblclick', () => {
            playAudioFile(filename);
        });
        
        fileItem.addEventListener('mouseenter', () => fileItem.style.background = '#f9fafb');
        fileItem.addEventListener('mouseleave', () => fileItem.style.background = 'white');
        
        fileList.appendChild(fileItem);
    });
    
    modal.querySelector('#btn-close-suffix-files').addEventListener('click', () => {
        modal.remove();
    });
}

// Show rename file dialog
function showRenameFileDialog(oldFilename, suffix) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <h3>Rename File</h3>
            <p>Current name: <code style="background: #f3f4f6; padding: 0.25rem 0.5rem;">${oldFilename}</code></p>
            <div style="margin: 1rem 0;">
                <label style="display: block; margin-bottom: 0.5rem; font-weight: 500;">New filename:</label>
                <input type="text" id="new-filename-input" value="${oldFilename}" 
                       style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 4px; font-family: monospace;">
                <p style="margin-top: 0.5rem; font-size: 0.85rem; color: #6b7280;">
                    Include the file extension (.wav, .mp3, etc.)
                </p>
            </div>
            <div class="button-row">
                <button id="btn-do-rename" class="btn-primary">Rename</button>
                <button id="btn-cancel-rename" class="btn-secondary">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const input = modal.querySelector('#new-filename-input');
    input.focus();
    input.select();
    
    const doRename = async () => {
        const newFilename = input.value.trim();
        
        if (!newFilename) {
            showError('Filename cannot be empty');
            return;
        }
        
        if (newFilename === oldFilename) {
            modal.remove();
            return;
        }
        
        showLoading('Renaming file...');
        
        try {
            const result = await window.pywebview.api.rename_audio_file(oldFilename, newFilename);
            
            if (result.success) {
                // Update state.suffixes
                if (state.suffixes[suffix]) {
                    const idx = state.suffixes[suffix].indexOf(oldFilename);
                    if (idx !== -1) {
                        state.suffixes[suffix][idx] = newFilename;
                    }
                }
                
                modal.remove();
                
                // Close parent modals and re-extract suffixes
                document.querySelectorAll('.modal').forEach(m => m.remove());
                
                showSuccess(`Renamed to ${newFilename}. Re-extracting suffixes...`);
                await proceedToStep1();
            } else {
                showError(result.error || 'Failed to rename file');
            }
        } catch (error) {
            showError('Error renaming file: ' + error);
        } finally {
            hideLoading();
        }
    };
    
    modal.querySelector('#btn-do-rename').addEventListener('click', doRename);
    modal.querySelector('#btn-cancel-rename').addEventListener('click', () => {
        modal.remove();
    });
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            doRename();
        } else if (e.key === 'Escape') {
            modal.remove();
        }
    });
}

// Save mappings
async function saveMappings() {
    // Ensure empty suffix is mapped to SoundFile
    if ('' in state.suffixes) {
        state.suffixMappings[''] = ['SoundFile'];
    }
    
    // Check for unmapped suffixes (excluding empty suffix)
    const unmappedSuffixes = [];
    for (const suffix in state.suffixes) {
        if (suffix === '') continue;  // Skip empty suffix - auto-mapped
        if (!state.suffixMappings[suffix] || state.suffixMappings[suffix].length === 0) {
            unmappedSuffixes.push(suffix || '(no suffix)');
        }
    }
    
    if (unmappedSuffixes.length > 0) {
        const confirmed = confirm(
            `⚠️ Warning: ${unmappedSuffixes.length} suffix(es) are not mapped to any field:\n\n` +
            unmappedSuffixes.join(', ') +
            `\n\nAll audio files with these suffixes will be treated as orphans and may be flagged as unexpected files.\n\n` +
            `Do you want to continue anyway?`
        );
        
        if (!confirmed) {
            return;
        }
    }
    
    showLoading('Saving mappings...');
    
    try {
        await window.pywebview.api.save_suffix_mappings(state.suffixMappings);
        
        // Enable Step 2 navigation
        document.getElementById('nav-step2').disabled = false;
        document.getElementById('btn-proceed-to-step2').disabled = false;
        
        showSuccess('Mappings saved successfully');
    } catch (error) {
        showError('Error saving mappings: ' + error);
    } finally {
        hideLoading();
    }
}

// Build conditions UI for Step 2
function buildConditionsUI() {
    const container = document.getElementById('conditions-container');
    container.innerHTML = '';
    
    // Get all fields that have suffix mappings
    const fieldsWithMappings = new Set();
    for (const suffix in state.suffixMappings) {
        const fields = state.suffixMappings[suffix];
        fields.forEach(field => fieldsWithMappings.add(field));
    }
    
    if (fieldsWithMappings.size === 0) {
        container.innerHTML = '<p class="help-text">No field mappings defined. Please complete Step 1 first.</p>';
        return;
    }
    
    // Add group management button
    const groupManagementDiv = document.createElement('div');
    groupManagementDiv.className = 'group-management';
    groupManagementDiv.innerHTML = `
        <button id="btn-manage-groups" class="btn-secondary">Manage Field Groups</button>
    `;
    container.appendChild(groupManagementDiv);
    
    document.getElementById('btn-manage-groups').addEventListener('click', () => showGroupManagementDialog(fieldsWithMappings));
    
    // Render groups first
    if (Object.keys(state.fieldGroups).length > 0) {
        const groupsHeader = document.createElement('h3');
        groupsHeader.textContent = 'Field Groups';
        groupsHeader.style.marginTop = '1.5rem';
        container.appendChild(groupsHeader);
        
        for (const groupName in state.fieldGroups) {
            renderGroupConditions(container, groupName, state.fieldGroups[groupName]);
        }
        
        const individualsHeader = document.createElement('h3');
        individualsHeader.textContent = 'Individual Fields';
        individualsHeader.style.marginTop = '1.5rem';
        container.appendChild(individualsHeader);
    }
    
    // Get fields not in any group
    const fieldsInGroups = new Set();
    for (const groupName in state.fieldGroups) {
        state.fieldGroups[groupName].forEach(field => fieldsInGroups.add(field));
    }
    
    const ungroupedFields = Array.from(fieldsWithMappings).filter(field => !fieldsInGroups.has(field));
    
    // Create collapsible sections for each ungrouped field
    ungroupedFields.forEach(field => {
        const fieldSection = document.createElement('div');
        fieldSection.className = 'condition-field-section';
        
        const header = document.createElement('div');
        header.className = 'condition-field-header';
        header.innerHTML = `
            <span class="toggle-icon">▶</span>
            <strong>${field}</strong>
            <span class="field-suffixes">${getSuffixesForField(field).join(', ')}</span>
        `;
        
        const content = document.createElement('div');
        content.className = 'condition-field-content hidden';
        
        // Default expectation option
        const defaultOption = document.createElement('div');
        defaultOption.className = 'condition-option';
        defaultOption.innerHTML = `
            <label>
                <input type="radio" name="expect-${field}" value="always" checked>
                Always expect recordings for this field
            </label>
        `;
        content.appendChild(defaultOption);
        
        // Only when field is non-empty
        const nonEmptyOption = document.createElement('div');
        nonEmptyOption.className = 'condition-option';
        nonEmptyOption.innerHTML = `
            <label>
                <input type="radio" name="expect-${field}" value="non-empty">
                Only expect when <strong>${field}</strong> field is non-empty
            </label>
        `;
        content.appendChild(nonEmptyOption);
        
        // Custom conditions
        const customOption = document.createElement('div');
        customOption.className = 'condition-option';
        customOption.innerHTML = `
            <label>
                <input type="radio" name="expect-${field}" value="custom">
                Custom conditions
            </label>
            <div class="custom-conditions-container hidden" data-field="${field}"></div>
        `;
        content.appendChild(customOption);
        
        // Toggle collapse/expand
        header.addEventListener('click', () => {
            const isHidden = content.classList.contains('hidden');
            content.classList.toggle('hidden');
            header.querySelector('.toggle-icon').textContent = isHidden ? '▼' : '▶';
        });
        
        // Show custom conditions builder when selected
        customOption.querySelector('input[type="radio"]').addEventListener('change', (e) => {
            if (e.target.checked) {
                const customContainer = customOption.querySelector('.custom-conditions-container');
                customContainer.classList.remove('hidden');
                if (customContainer.children.length === 0) {
                    buildCustomConditionsBuilder(customContainer, field);
                }
            }
        });
        
        // Hide custom conditions when other options selected
        [defaultOption, nonEmptyOption].forEach(option => {
            option.querySelector('input[type="radio"]').addEventListener('change', (e) => {
                if (e.target.checked) {
                    customOption.querySelector('.custom-conditions-container').classList.add('hidden');
                }
            });
        });
        
        fieldSection.appendChild(header);
        fieldSection.appendChild(content);
        container.appendChild(fieldSection);
    });

    // After building UI, apply persisted expectation modes (radio selections)
    applyExpectationModesToUI();
}

// Get suffixes mapped to a field
function getSuffixesForField(field) {
    const suffixes = [];
    for (const suffix in state.suffixMappings) {
        if (state.suffixMappings[suffix].includes(field)) {
            suffixes.push(suffix || '(no suffix)');
        }
    }
    return suffixes;
}

// Show group management dialog
function showGroupManagementDialog(fieldsWithMappings) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <h3>Manage Field Groups</h3>
            <div id="groups-list" style="margin-bottom: 1rem;"></div>
            <div style="margin-top: 1rem;">
                <h4>Create New Group</h4>
                <input type="text" id="new-group-name" placeholder="Group name" style="width: 100%; margin-bottom: 0.5rem;">
                <div id="group-fields-selection" style="max-height: 200px; overflow-y: auto; border: 1px solid #ccc; padding: 0.5rem; margin-bottom: 0.5rem;"></div>
                <button id="btn-create-group" class="btn-primary">Create Group</button>
            </div>
            <div class="button-row" style="margin-top: 1rem;">
                <button id="btn-close-groups" class="btn-secondary">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Render existing groups
    renderGroupsList();
    
    // Render field checkboxes
    const fieldsSelection = document.getElementById('group-fields-selection');
    Array.from(fieldsWithMappings).sort().forEach(field => {
        const checkbox = document.createElement('div');
        checkbox.innerHTML = `
            <label style="display: block; padding: 0.25rem;">
                <input type="checkbox" value="${field}" class="group-field-checkbox">
                ${field}
            </label>
        `;
        fieldsSelection.appendChild(checkbox);
    });
    
    // Create group button
    document.getElementById('btn-create-group').addEventListener('click', () => {
        const groupName = document.getElementById('new-group-name').value.trim();
        if (!groupName) {
            showError('Please enter a group name');
            return;
        }
        
        if (state.fieldGroups[groupName]) {
            showError('A group with this name already exists');
            return;
        }
        
        const selectedFields = Array.from(document.querySelectorAll('.group-field-checkbox:checked')).map(cb => cb.value);
        if (selectedFields.length === 0) {
            showError('Please select at least one field');
            return;
        }
        
        // Remove fields from other groups
        for (const otherGroup in state.fieldGroups) {
            state.fieldGroups[otherGroup] = state.fieldGroups[otherGroup].filter(f => !selectedFields.includes(f));
            if (state.fieldGroups[otherGroup].length === 0) {
                delete state.fieldGroups[otherGroup];
            }
        }
        
        state.fieldGroups[groupName] = selectedFields;
        saveFieldGroups();
        
        document.getElementById('new-group-name').value = '';
        document.querySelectorAll('.group-field-checkbox').forEach(cb => cb.checked = false);
        renderGroupsList();
        
        showSuccess(`Group "${groupName}" created`);
    });
    
    // Close button
    document.getElementById('btn-close-groups').addEventListener('click', () => {
        modal.remove();
        buildConditionsUI();  // Rebuild to show updated groups
    });
}

// Render list of existing groups
function renderGroupsList() {
    const groupsList = document.getElementById('groups-list');
    if (!groupsList) return;
    
    groupsList.innerHTML = '';
    
    if (Object.keys(state.fieldGroups).length === 0) {
        groupsList.innerHTML = '<p style="color: #666; font-style: italic;">No groups created yet</p>';
        return;
    }
    
    for (const groupName in state.fieldGroups) {
        const groupDiv = document.createElement('div');
        groupDiv.style.cssText = 'padding: 0.5rem; margin-bottom: 0.5rem; border: 1px solid #ddd; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;';
        groupDiv.innerHTML = `
            <div>
                <strong>${groupName}</strong><br>
                <small style="color: #666;">${state.fieldGroups[groupName].join(', ')}</small>
            </div>
            <button class="btn-danger" data-group="${groupName}">Delete</button>
        `;
        
        groupDiv.querySelector('button').addEventListener('click', (e) => {
            const group = e.target.dataset.group;
            if (confirm(`Delete group "${group}"?`)) {
                delete state.fieldGroups[group];
                delete state.conditionalRules[`__group__${group}`];
                saveFieldGroups();
                renderGroupsList();
                showSuccess(`Group "${group}" deleted`);
            }
        });
        
        groupsList.appendChild(groupDiv);
    }
}

// Save field groups to backend
async function saveFieldGroups() {
    try {
        await window.pywebview.api.save_field_groups(state.fieldGroups);
    } catch (error) {
        console.error('Error saving field groups:', error);
    }
}

// Render conditions section for a group
function renderGroupConditions(container, groupName, fields) {
    const groupKey = `__group__${groupName}`;
    
    const fieldSection = document.createElement('div');
    fieldSection.className = 'condition-field-section group-section';
    
    const header = document.createElement('div');
    header.className = 'condition-field-header';
    header.innerHTML = `
        <span class="toggle-icon">▶</span>
        <strong>📁 ${groupName}</strong>
        <span class="field-suffixes">${fields.join(', ')}</span>
    `;
    
    const content = document.createElement('div');
    content.className = 'condition-field-content hidden';
    
    // Default expectation option
    const defaultOption = document.createElement('div');
    defaultOption.className = 'condition-option';
    defaultOption.innerHTML = `
        <label>
            <input type="radio" name="expect-${groupKey}" value="always" checked>
            Always expect recordings for these fields
        </label>
    `;
    content.appendChild(defaultOption);
    
    // Only when field is non-empty
    const nonEmptyOption = document.createElement('div');
    nonEmptyOption.className = 'condition-option';
    nonEmptyOption.innerHTML = `
        <label>
            <input type="radio" name="expect-${groupKey}" value="non-empty">
            Only expect when any field in group is non-empty
        </label>
    `;
    content.appendChild(nonEmptyOption);
    
    // Custom conditions
    const customOption = document.createElement('div');
    customOption.className = 'condition-option';
    customOption.innerHTML = `
        <label>
            <input type="radio" name="expect-${groupKey}" value="custom">
            Custom conditions
        </label>
        <div class="custom-conditions-container hidden" data-field="${groupKey}"></div>
    `;
    content.appendChild(customOption);
    
    // Toggle collapse/expand
    header.addEventListener('click', () => {
        const isHidden = content.classList.contains('hidden');
        content.classList.toggle('hidden');
        header.querySelector('.toggle-icon').textContent = isHidden ? '▼' : '▶';
    });
    
    // Show custom conditions builder when selected
    customOption.querySelector('input[type="radio"]').addEventListener('change', (e) => {
        if (e.target.checked) {
            const customContainer = customOption.querySelector('.custom-conditions-container');
            customContainer.classList.remove('hidden');
            if (customContainer.children.length === 0) {
                buildCustomConditionsBuilder(customContainer, groupKey);
            }
        }
    });
    
    // Hide custom conditions when other options selected
    [defaultOption, nonEmptyOption].forEach(option => {
        option.querySelector('input[type="radio"]').addEventListener('change', (e) => {
            if (e.target.checked) {
                customOption.querySelector('.custom-conditions-container').classList.add('hidden');
            }
        });
    });
    
    fieldSection.appendChild(header);
    fieldSection.appendChild(content);
    container.appendChild(fieldSection);
    // Ensure expectation modes are applied when groups render
    applyExpectationModesToUI();
}

// Apply persisted expectation modes to the radios and custom builders
function applyExpectationModesToUI() {
    if (!state.expectationModes) return;
    for (const key in state.expectationModes) {
        const value = state.expectationModes[key];
        const radio = document.querySelector(`input[name="expect-${key}"][value="${value}"]`);
        if (radio) {
            radio.checked = true;
            // If custom mode, reveal and build the custom conditions UI if needed
            if (value === 'custom') {
                const container = document.querySelector(`.custom-conditions-container[data-field="${key}"]`);
                if (container) {
                    container.classList.remove('hidden');
                    if (container.children.length === 0) {
                        buildCustomConditionsBuilder(container, key);
                    }
                }
            }
        }
    }
}

// Build custom conditions builder with AND/OR logic
function buildCustomConditionsBuilder(container, targetField) {
    container.innerHTML = '';
    
    // Initialize rules if not exists
    if (!state.conditionalRules[targetField]) {
        state.conditionalRules[targetField] = {
            type: 'AND',
            conditions: []
        };
    }
    
    const rulesGroup = state.conditionalRules[targetField];
    
    // Group type selector (AND/OR)
    const groupTypeDiv = document.createElement('div');
    groupTypeDiv.className = 'condition-group-type';
    groupTypeDiv.innerHTML = `
        <label>Expect when 
            <select class="group-logic-selector">
                <option value="AND" ${rulesGroup.type === 'AND' ? 'selected' : ''}>ALL</option>
                <option value="OR" ${rulesGroup.type === 'OR' ? 'selected' : ''}>ANY</option>
            </select>
            of these conditions are true:
        </label>
    `;
    
    groupTypeDiv.querySelector('select').addEventListener('change', (e) => {
        state.conditionalRules[targetField].type = e.target.value;
    });
    
    container.appendChild(groupTypeDiv);
    
    // Conditions list
    const conditionsList = document.createElement('div');
    conditionsList.className = 'conditions-list';
    container.appendChild(conditionsList);
    
    // Render existing conditions
    renderConditions(conditionsList, targetField);
    
    // Add condition button
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-secondary btn-small';
    addBtn.textContent = '+ Add Condition';
    addBtn.type = 'button';
    addBtn.addEventListener('click', () => {
        addCondition(targetField);
        renderConditions(conditionsList, targetField);
    });
    container.appendChild(addBtn);
}

// Render conditions in the list
function renderConditions(container, targetField) {
    container.innerHTML = '';
    
    const rules = state.conditionalRules[targetField];
    if (!rules || !rules.conditions) return;
    
    rules.conditions.forEach((condition, index) => {
        const conditionDiv = document.createElement('div');
        conditionDiv.className = 'condition-rule';
        
        // Field selector
        const fieldSelect = document.createElement('select');
        fieldSelect.className = 'condition-field-select';
        fieldSelect.innerHTML = '<option value="">Select field...</option>';
        state.fieldNames.forEach(field => {
            const option = document.createElement('option');
            option.value = field;
            option.textContent = field;
            if (condition.field === field) option.selected = true;
            fieldSelect.appendChild(option);
        });
        
        // Operator selector
        const operatorSelect = document.createElement('select');
        operatorSelect.className = 'condition-operator-select';
        operatorSelect.innerHTML = `
            <option value="equals" ${condition.operator === 'equals' ? 'selected' : ''}>equals</option>
            <option value="not_equals" ${condition.operator === 'not_equals' ? 'selected' : ''}>does not equal</option>
            <option value="contains" ${condition.operator === 'contains' ? 'selected' : ''}>contains</option>
            <option value="not_empty" ${condition.operator === 'not_empty' ? 'selected' : ''}>is not empty</option>
            <option value="empty" ${condition.operator === 'empty' ? 'selected' : ''}>is empty</option>
            <option value="in_list" ${condition.operator === 'in_list' ? 'selected' : ''}>is in list</option>
            <option value="not_in_list" ${condition.operator === 'not_in_list' ? 'selected' : ''}>is not in list</option>
        `;
        
        // Value input (text)
        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.className = 'condition-value-input';
        valueInput.value = condition.value || '';
        valueInput.placeholder = 'value';
        
        // Multi-select for in_list/not_in_list
        const multiSelectContainer = document.createElement('div');
        multiSelectContainer.className = 'condition-multiselect-container';
        multiSelectContainer.style.display = 'none';
        
        // Show/hide appropriate input based on operator
        const updateInputVisibility = async () => {
            const operator = operatorSelect.value;
            const needsTextValue = !['not_empty', 'empty', 'in_list', 'not_in_list'].includes(operator);
            const needsListValue = ['in_list', 'not_in_list'].includes(operator);
            
            valueInput.style.display = needsTextValue ? 'inline-block' : 'none';
            multiSelectContainer.style.display = needsListValue ? 'block' : 'none';
            
            if (needsListValue && multiSelectContainer.children.length === 0) {
                await buildMultiSelect(multiSelectContainer, fieldSelect.value, condition);
            }
        };
        updateInputVisibility();
        
        // Remove button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-danger btn-small';
        removeBtn.textContent = '✕';
        removeBtn.type = 'button';
        removeBtn.addEventListener('click', () => {
            removeCondition(targetField, index);
            renderConditions(container, targetField);
        });
        
        // Update condition on change
        fieldSelect.addEventListener('change', async (e) => {
            condition.field = e.target.value;
            // Rebuild multiselect if operator is in_list/not_in_list
            if (['in_list', 'not_in_list'].includes(operatorSelect.value)) {
                multiSelectContainer.innerHTML = '';
                await buildMultiSelect(multiSelectContainer, e.target.value, condition);
            }
        });
        
        operatorSelect.addEventListener('change', async (e) => {
            condition.operator = e.target.value;
            await updateInputVisibility();
        });
        
        valueInput.addEventListener('input', (e) => {
            condition.value = e.target.value;
        });
        
        conditionDiv.appendChild(fieldSelect);
        conditionDiv.appendChild(document.createTextNode(' '));
        conditionDiv.appendChild(operatorSelect);
        conditionDiv.appendChild(document.createTextNode(' '));
        conditionDiv.appendChild(valueInput);
        conditionDiv.appendChild(multiSelectContainer);
        conditionDiv.appendChild(document.createTextNode(' '));
        conditionDiv.appendChild(removeBtn);
        
        container.appendChild(conditionDiv);
    });
}

// Build multi-select for in_list/not_in_list operators
async function buildMultiSelect(container, fieldName, condition) {
    if (!fieldName) {
        container.innerHTML = '<p class="help-text">Select a field first</p>';
        return;
    }
    
    try {
        // Get unique values for this field from the backend
        const result = await window.pywebview.api.get_field_values(fieldName);
        
        if (!result.success || !result.values || result.values.length === 0) {
            container.innerHTML = '<p class="help-text">No values found for this field</p>';
            return;
        }
        
        // Parse existing selected values
        let selectedValues = [];
        if (condition.value) {
            try {
                selectedValues = JSON.parse(condition.value);
                if (!Array.isArray(selectedValues)) {
                    selectedValues = [condition.value];
                }
            } catch {
                selectedValues = [condition.value];
            }
        }
        
        // Create checkbox list
        container.innerHTML = '';
        const checkboxList = document.createElement('div');
        checkboxList.className = 'checkbox-list';
        
        result.values.forEach(value => {
            const label = document.createElement('label');
            label.className = 'checkbox-label';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = value;
            checkbox.checked = selectedValues.includes(value);
            
            checkbox.addEventListener('change', () => {
                // Update condition value with selected items
                const selected = Array.from(checkboxList.querySelectorAll('input[type="checkbox"]:checked'))
                    .map(cb => cb.value);
                condition.value = JSON.stringify(selected);
            });
            
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(' ' + value));
            checkboxList.appendChild(label);
        });
        
        container.appendChild(checkboxList);
        
    } catch (error) {
        container.innerHTML = `<p class="help-text">Error loading values: ${error.message}</p>`;
    }
}

// Add a new condition
function addCondition(targetField) {
    if (!state.conditionalRules[targetField]) {
        state.conditionalRules[targetField] = {
            type: 'AND',
            conditions: []
        };
    }
    
    state.conditionalRules[targetField].conditions.push({
        field: '',
        operator: 'equals',
        value: ''
    });
}

// Remove a condition
function removeCondition(targetField, index) {
    if (state.conditionalRules[targetField] && state.conditionalRules[targetField].conditions) {
        state.conditionalRules[targetField].conditions.splice(index, 1);
    }
}

// Export conditions to JSON file
async function exportConditions() {
    showLoading('Exporting conditions...');
    
    try {
        if (Object.keys(state.conditionalRules).length === 0) {
            showError('No conditions to export');
            return;
        }
        
        const result = await window.pywebview.api.export_conditions(state.conditionalRules);
        
        if (result.success) {
            showSuccess('Conditions exported successfully');
        } else {
            showError(result.error || 'Failed to export conditions');
        }
    } catch (error) {
        showError('Error exporting conditions: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Import conditions from JSON file
async function importConditions() {
    showLoading('Importing conditions...');
    
    try {
        const result = await window.pywebview.api.import_conditions();
        
        if (result.success) {
            // Update state with imported conditions
            state.conditionalRules = result.conditions;
            
            // Rebuild UI to show imported conditions
            buildConditionsUI();
            
            showSuccess(`Imported ${result.count} conditional rule(s)`);
        } else {
            if (result.error !== 'No file selected') {
                showError(result.error || 'Failed to import conditions');
            }
        }
    } catch (error) {
        showError('Error importing conditions: ' + error.message);
    } finally {
        hideLoading();
    }
}

// Save conditions
async function saveConditions() {
    showLoading('Saving conditions...');
    
    try {
        // Collect expectation settings for each field
        const fieldsWithMappings = new Set();
        for (const suffix in state.suffixMappings) {
            state.suffixMappings[suffix].forEach(field => fieldsWithMappings.add(field));
        }
        
        // Build expectation modes map to persist radio selections
        const expectationModes = {};

        // Process groups
        for (const groupName in state.fieldGroups) {
            const groupKey = `__group__${groupName}`;
            const selectedOption = document.querySelector(`input[name="expect-${groupKey}"]:checked`);
            if (selectedOption) {
                const expectationType = selectedOption.value;
                expectationModes[groupKey] = expectationType;
                
                if (expectationType === 'always') {
                    delete state.conditionalRules[groupKey];
                } else if (expectationType === 'non-empty') {
                    // Create OR condition for any field in group being non-empty
                    state.conditionalRules[groupKey] = {
                        type: 'OR',
                        conditions: state.fieldGroups[groupName].map(field => ({
                            field: field,
                            operator: 'not_empty',
                            value: ''
                        }))
                    };
                }
                // For 'custom', rules are already in state.conditionalRules[groupKey]
            }
        }
        
        // Process individual fields
        fieldsWithMappings.forEach(field => {
            // Skip fields that are in groups
            let inGroup = false;
            for (const groupName in state.fieldGroups) {
                if (state.fieldGroups[groupName].includes(field)) {
                    inGroup = true;
                    break;
                }
            }
            if (inGroup) return;
            
            const selectedOption = document.querySelector(`input[name="expect-${field}"]:checked`);
            if (selectedOption) {
                const expectationType = selectedOption.value;
                expectationModes[field] = expectationType;
                
                if (expectationType === 'always') {
                    // Always expect - remove any custom rules
                    delete state.conditionalRules[field];
                } else if (expectationType === 'non-empty') {
                    // Only expect when field is non-empty
                    state.conditionalRules[field] = {
                        type: 'AND',
                        conditions: [{
                            field: field,
                            operator: 'not_empty',
                            value: ''
                        }]
                    };
                }
                // For 'custom', rules are already in state.conditionalRules[field]
            }
        });
        
        await window.pywebview.api.save_conditional_rules(state.conditionalRules);

        // Persist expectation modes (radio selections)
        state.expectationModes = expectationModes;
        await window.pywebview.api.save_expectation_modes(expectationModes);

        // Persist group filters applied to groups
        if (state.groupFilters) {
            await window.pywebview.api.save_group_filters(state.groupFilters);
        }
        
        // Enable Step 3 navigation
        document.getElementById('nav-step3').disabled = false;
        
        showSuccess('Conditions saved successfully');
    } catch (error) {
        showError('Error saving conditions: ' + error);
    } finally {
        hideLoading();
    }
}

// ========================================
// STEP 3: DATA SHEET MATCHING FUNCTIONS
// ========================================

// Load Step 3 data
async function loadStep3Data() {
    showLoading('Loading data sheet...');
    
    try {
        const result = await window.pywebview.api.get_datasheet_data();
        
        if (result.success) {
            state.datasheetData = result;
            
            // Initialize column visibility (show mapped fields by default)
            state.visibleColumns = ['Reference', ...result.mapped_fields];
            
            // Initialize column order from saved settings, or use default
            if (result.column_order && Array.isArray(result.column_order)) {
                state.columnOrder = result.column_order;
                // Update visibleColumns to match saved order (in case columns were added/removed)
                state.visibleColumns = state.columnOrder.filter(col => 
                    col === 'Reference' || result.mapped_fields.includes(col)
                );
            } else {
                // No saved order, use default
                state.columnOrder = [...state.visibleColumns];
            }
            
            // Set up event listeners for Step 3 (only once UI is ready)
            setupStep3EventListeners();
            
            // Load saved progress
            await loadStep3Progress();
            
            // Build data sheet
            buildDataSheet();
            renderOrphanedFiles();
            
            // Check for suggested matches
            checkSuggestedMatches();
        } else {
            showError('Error loading data sheet: ' + result.error);
        }
    } catch (error) {
        showError('Error loading Step 3: ' + error);
    } finally {
        hideLoading();
    }
}

// Set up Step 3 event listeners (called when Step 3 loads)
function setupStep3EventListeners() {
    // Remove any existing listeners to prevent duplicates
    const acceptBtn = document.getElementById('btn-accept-suggestions');
    const skipBtn = document.getElementById('btn-skip-suggestions');
    const columnBtn = document.getElementById('btn-column-settings');
    const filterBtn = document.getElementById('btn-toggle-filters');
    const clearBtn = document.getElementById('btn-clear-tentative');
    const exportBtn = document.getElementById('btn-export-progress');
    const importBtn = document.getElementById('btn-import-progress');
    const resetBtn = document.getElementById('btn-reset-progress');
    const applyFilterBtn = document.getElementById('btn-apply-filters');
    const clearFilterBtn = document.getElementById('btn-clear-filters');
    const autoPlayChk = document.getElementById('chk-auto-play');
    const reviewBtn = document.getElementById('btn-proceed-to-review');
    
    // Clone and replace to remove old listeners
    if (acceptBtn) {
        const newAcceptBtn = acceptBtn.cloneNode(true);
        acceptBtn.replaceWith(newAcceptBtn);
        newAcceptBtn.addEventListener('click', acceptSuggestions);
    }
    
    if (skipBtn) {
        const newSkipBtn = skipBtn.cloneNode(true);
        skipBtn.replaceWith(newSkipBtn);
        newSkipBtn.addEventListener('click', () => {
            document.getElementById('step3-suggested').classList.add('hidden');
        });
    }
    
    if (columnBtn) {
        const newColumnBtn = columnBtn.cloneNode(true);
        columnBtn.replaceWith(newColumnBtn);
        newColumnBtn.addEventListener('click', showColumnSettings);
    }
    
    if (filterBtn) {
        const newFilterBtn = filterBtn.cloneNode(true);
        filterBtn.replaceWith(newFilterBtn);
        newFilterBtn.addEventListener('click', toggleFilters);
    }
    
    if (clearBtn) {
        const newClearBtn = clearBtn.cloneNode(true);
        clearBtn.replaceWith(newClearBtn);
        newClearBtn.addEventListener('click', clearAllTentative);
    }
    
    if (exportBtn) {
        const newExportBtn = exportBtn.cloneNode(true);
        exportBtn.replaceWith(newExportBtn);
        newExportBtn.addEventListener('click', exportProgress);
    }
    
    if (importBtn) {
        const newImportBtn = importBtn.cloneNode(true);
        importBtn.replaceWith(newImportBtn);
        newImportBtn.addEventListener('click', importProgress);
    }
    
    if (resetBtn) {
        const newResetBtn = resetBtn.cloneNode(true);
        resetBtn.replaceWith(newResetBtn);
        newResetBtn.addEventListener('click', resetProgress);
    }
    
    if (applyFilterBtn) {
        const newApplyFilterBtn = applyFilterBtn.cloneNode(true);
        applyFilterBtn.replaceWith(newApplyFilterBtn);
        newApplyFilterBtn.addEventListener('click', applyFilters);
    }
    
    if (clearFilterBtn) {
        const newClearFilterBtn = clearFilterBtn.cloneNode(true);
        clearFilterBtn.replaceWith(newClearFilterBtn);
        newClearFilterBtn.addEventListener('click', clearFilters);
    }
    
    if (autoPlayChk) {
        const newAutoPlayChk = autoPlayChk.cloneNode(true);
        autoPlayChk.replaceWith(newAutoPlayChk);
        newAutoPlayChk.addEventListener('change', (e) => {
            state.autoPlayAudio = e.target.checked;
        });
        // Restore checked state
        newAutoPlayChk.checked = state.autoPlayAudio;
    }
    
    if (reviewBtn) {
        const newReviewBtn = reviewBtn.cloneNode(true);
        reviewBtn.replaceWith(newReviewBtn);
        newReviewBtn.addEventListener('click', () => showScreen('review'));
    }
    
    // Search functionality
    const searchFieldSelect = document.getElementById('search-field-select');
    const searchInput = document.getElementById('search-input');
    const searchPrevBtn = document.getElementById('btn-search-prev');
    const searchNextBtn = document.getElementById('btn-search-next');
    
    if (searchFieldSelect) {
        // Populate field options
        searchFieldSelect.innerHTML = '<option value="">All Fields</option>';
        if (state.datasheetData && state.datasheetData.field_names) {
            state.datasheetData.field_names.forEach(field => {
                const option = document.createElement('option');
                option.value = field;
                option.textContent = field;
                searchFieldSelect.appendChild(option);
            });
        }
        
        // Clone and replace to remove old listeners
        const newSearchFieldSelect = searchFieldSelect.cloneNode(true);
        searchFieldSelect.replaceWith(newSearchFieldSelect);
        newSearchFieldSelect.addEventListener('change', performSearch);
    }
    
    if (searchInput) {
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.replaceWith(newSearchInput);
        newSearchInput.addEventListener('input', performSearch);
        newSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (e.shiftKey) {
                    navigateSearchResults(-1);
                } else {
                    navigateSearchResults(1);
                }
            }
        });
    }
    
    if (searchPrevBtn) {
        const newSearchPrevBtn = searchPrevBtn.cloneNode(true);
        searchPrevBtn.replaceWith(newSearchPrevBtn);
        newSearchPrevBtn.addEventListener('click', () => navigateSearchResults(-1));
    }
    
    if (searchNextBtn) {
        const newSearchNextBtn = searchNextBtn.cloneNode(true);
        searchNextBtn.replaceWith(newSearchNextBtn);
        newSearchNextBtn.addEventListener('click', () => navigateSearchResults(1));
    }
}

// Perform search in datasheet
function performSearch() {
    const searchInput = document.getElementById('search-input');
    const searchFieldSelect = document.getElementById('search-field-select');
    const searchResultsInfo = document.getElementById('search-results-info');
    const searchPrevBtn = document.getElementById('btn-search-prev');
    const searchNextBtn = document.getElementById('btn-search-next');
    
    const searchTerm = searchInput.value.trim().toLowerCase();
    const searchField = searchFieldSelect.value;
    
    // Clear previous search highlighting
    document.querySelectorAll('.search-highlight').forEach(el => {
        el.classList.remove('search-highlight', 'search-current');
    });
    
    state.searchResults = [];
    state.searchCurrentIndex = -1;
    
    if (!searchTerm) {
        searchResultsInfo.textContent = '';
        searchPrevBtn.disabled = true;
        searchNextBtn.disabled = true;
        return;
    }
    
    if (!state.datasheetData) return;
    
    // Search through records
    const tbody = document.getElementById('datasheet-body');
    const rows = tbody.querySelectorAll('tr');
    
    rows.forEach((row, rowIndex) => {
        const cells = row.querySelectorAll('td');
        
        cells.forEach((cell, cellIndex) => {
            const field = state.columnOrder[cellIndex];
            
            // Skip if searching specific field and this isn't it
            if (searchField && field !== searchField) {
                return;
            }
            
            const cellText = cell.textContent.toLowerCase();
            
            if (cellText.includes(searchTerm)) {
                state.searchResults.push({ row: rowIndex, cell: cellIndex, element: cell });
                cell.classList.add('search-highlight');
            }
        });
    });
    
    // Update UI
    if (state.searchResults.length > 0) {
        searchResultsInfo.textContent = `${state.searchResults.length} result${state.searchResults.length !== 1 ? 's' : ''}`;
        searchPrevBtn.disabled = false;
        searchNextBtn.disabled = false;
        
        // Navigate to first result
        state.searchCurrentIndex = 0;
        scrollToSearchResult(state.searchCurrentIndex);
    } else {
        searchResultsInfo.textContent = 'No results';
        searchResultsInfo.style.color = '#dc2626';
        setTimeout(() => {
            searchResultsInfo.style.color = '#6b7280';
        }, 2000);
        searchPrevBtn.disabled = true;
        searchNextBtn.disabled = true;
    }
}

// Navigate through search results
function navigateSearchResults(direction) {
    if (state.searchResults.length === 0) return;
    
    // Remove current highlight
    if (state.searchCurrentIndex >= 0 && state.searchCurrentIndex < state.searchResults.length) {
        state.searchResults[state.searchCurrentIndex].element.classList.remove('search-current');
    }
    
    // Update index with wrapping
    state.searchCurrentIndex += direction;
    if (state.searchCurrentIndex < 0) {
        state.searchCurrentIndex = state.searchResults.length - 1;
    } else if (state.searchCurrentIndex >= state.searchResults.length) {
        state.searchCurrentIndex = 0;
    }
    
    // Scroll to and highlight current result
    scrollToSearchResult(state.searchCurrentIndex);
    
    // Update info
    const searchResultsInfo = document.getElementById('search-results-info');
    searchResultsInfo.textContent = `${state.searchCurrentIndex + 1} of ${state.searchResults.length}`;
}

// Scroll to specific search result
function scrollToSearchResult(index) {
    if (index < 0 || index >= state.searchResults.length) return;
    
    const result = state.searchResults[index];
    const cell = result.element;
    
    // Highlight current result
    cell.classList.add('search-current');
    
    // Scroll to row
    const row = cell.closest('tr');
    if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    // Scroll to column (horizontal scroll)
    const container = document.getElementById('datasheet-container');
    if (container && cell) {
        const cellRect = cell.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        // Check if cell is outside visible area
        if (cellRect.left < containerRect.left || cellRect.right > containerRect.right) {
            // Scroll horizontally to bring cell into view
            const scrollLeft = cell.offsetLeft - container.offsetLeft - (containerRect.width / 2) + (cellRect.width / 2);
            container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
        }
    }
}

// Build the data sheet table
function buildDataSheet() {
    if (!state.datasheetData) return;
    
    const thead = document.getElementById('datasheet-header');
    const tbody = document.getElementById('datasheet-body');
    
    thead.innerHTML = '';
    tbody.innerHTML = '';
    
    // Build header row
    const headerRow = document.createElement('tr');
    state.columnOrder.forEach((field, idx) => {
        const th = document.createElement('th');
        th.textContent = field;
        th.dataset.field = field;
        
        // Frozen Reference column
        if (field === 'Reference') {
            th.classList.add('frozen-col');
        }
        
        // Add sort indicator
        if (state.sortColumn === field) {
            th.classList.add(state.sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
        }
        
        // Click to sort
        th.addEventListener('click', () => sortByColumn(field));
        
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    
    // Get records (apply filters if any)
    let records = state.datasheetData.records.map((rec, idx) => ({...rec, _originalIndex: idx}));
    if (state.filters.length > 0) {
        records = applyFiltersToRecords(records);
    }
    
    // Apply sorting
    if (state.sortColumn) {
        records = sortRecords(records, state.sortColumn, state.sortDirection);
    }
    
    // Build data rows
    records.forEach((record, displayIdx) => {
        const tr = document.createElement('tr');
        const originalRecordIdx = record._originalIndex;  // Use original index for data lookups
        
        state.columnOrder.forEach(field => {
            const td = document.createElement('td');
            td.textContent = record[field] || '';
            td.dataset.recordIdx = originalRecordIdx;  // Store original index
            td.dataset.field = field;
            
            // Frozen Reference column
            if (field === 'Reference') {
                td.classList.add('frozen-col');
            }
            
            // Color coding for mapped fields (including SoundFile for empty suffix)
            const isMappedField = state.datasheetData.mapped_fields.includes(field);
            
            if (isMappedField) {
                const cellStatus = getCellStatus(originalRecordIdx, field);
                if (cellStatus.matched) {
                    if (cellStatus.tentative) {
                        td.classList.add('matched-tentative');
                    } else if (cellStatus.unexpected) {
                        td.classList.add('matched-unexpected');  // New class for unexpected files
                    } else {
                        td.classList.add('matched');
                    }
                } else if (cellStatus.expected) {
                    td.classList.add('missing');
                }
                
                // Click to show modal
                td.addEventListener('click', (e) => showCellModal(e, originalRecordIdx, field, cellStatus));
                
                // Double-click to play audio if enabled
                if (cellStatus.matched) {
                    td.addEventListener('dblclick', () => {
                        if (state.autoPlayAudio && cellStatus.files.length > 0) {
                            const file = cellStatus.files.find(f => f.matched);
                            if (file) {
                                playAudioFile(file.matched);
                            }
                        }
                    });
                }
                
                // Drag-and-drop only for non-SoundFile fields (or if user is associating with empty suffix)
                if (field !== 'SoundFile' || (field === 'SoundFile' && '' in state.suffixMappings)) {
                    td.addEventListener('dragover', handleDragOver);
                    td.addEventListener('drop', (e) => handleDrop(e, originalRecordIdx, field));
                    td.addEventListener('dragleave', handleDragLeave);
                }
            }
            
            tr.appendChild(td);
        });
        
        tbody.appendChild(tr);
    });
}

// Get cell status (matched, expected, tentative, unexpected)
function getCellStatus(recordIdx, field) {
    const result = {
        matched: false,
        expected: false,
        unexpected: false,
        tentative: false,
        files: []
    };
    
    // Special handling for SoundFile field with empty suffix
    if (field === 'SoundFile' && '' in state.suffixMappings) {
        const key = `${recordIdx}_SoundFile_`;
        
        // Check if matched (file exists)
        const matchedFile = state.datasheetData.matched_files[key];
        const expectedFile = state.datasheetData.expected_files[key];
        
        if (matchedFile) {
            // Check if it's being unlinked
            const isUnlinked = state.tentativeUnlinks[matchedFile];
            
            if (!isUnlinked) {
                result.matched = true;
                result.expected = !!expectedFile;
                result.unexpected = !expectedFile;  // Matched but not expected
                
                result.files.push({
                    suffix: '',
                    expected: expectedFile || matchedFile,
                    matched: matchedFile,
                    unexpected: !expectedFile
                });
            }
        } else if (expectedFile) {
            // Expected but not matched
            const isUnlinked = state.tentativeUnlinks[expectedFile];
            
            if (!isUnlinked) {
                result.expected = true;
                result.files.push({
                    suffix: '',
                    expected: expectedFile,
                    matched: null
                });
            }
        }
    }
    
    // Check each suffix associated with this field
    for (const suffix in state.suffixMappings) {
        if (state.suffixMappings[suffix].includes(field)) {
            const key = `${recordIdx}_${field}_${suffix}`;
            
            // Check if matched (file exists)
            const matchedFile = state.datasheetData.matched_files[key];
            const expectedFile = state.datasheetData.expected_files[key];
            
            if (matchedFile) {
                // Check if it's being unlinked
                const isUnlinked = state.tentativeUnlinks[matchedFile];
                
                if (!isUnlinked) {
                    result.matched = true;
                    result.expected = result.expected || !!expectedFile;
                    result.unexpected = result.unexpected || !expectedFile;  // Matched but not expected
                    
                    result.files.push({
                        suffix: suffix,
                        expected: expectedFile || matchedFile,
                        matched: matchedFile,
                        unexpected: !expectedFile
                    });
                }
            } else if (expectedFile) {
                // Expected but not matched
                const isUnlinked = state.tentativeUnlinks[expectedFile];
                
                if (!isUnlinked) {
                    result.expected = true;
                    result.files.push({
                        suffix: suffix,
                        expected: expectedFile,
                        matched: null
                    });
                }
            }
        }
    }
    
    // Check for tentative associations
    for (const orphanFile in state.tentativeAssociations) {
        const assoc = state.tentativeAssociations[orphanFile];
        if (assoc.recordIdx === recordIdx && assoc.field === field) {
            result.matched = true;
            result.tentative = true;
            result.files.push({
                suffix: assoc.suffix,
                expected: assoc.newName,
                matched: assoc.newName,
                tentative: true,
                originalFile: orphanFile
            });
        }
    }
    
    return result;
}

// Sort by column
function sortByColumn(field) {
    if (state.sortColumn === field) {
        // Toggle direction
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortColumn = field;
        state.sortDirection = 'asc';
    }
    
    buildDataSheet();
}

// Sort records helper
function sortRecords(records, field, direction) {
    return [...records].sort((a, b) => {
        const aVal = (a[field] || '').toString().toLowerCase();
        const bVal = (b[field] || '').toString().toLowerCase();
        
        if (direction === 'asc') {
            return aVal.localeCompare(bVal);
        } else {
            return bVal.localeCompare(aVal);
        }
    });
}

// Render orphaned files pane
function renderOrphanedFiles() {
    if (!state.datasheetData) return;
    
    const list = document.getElementById('orphaned-files-list');
    const savedList = document.getElementById('saved-files-list');
    const noLongerNeededList = document.getElementById('no-longer-needed-list');
    const countBadge = document.getElementById('orphaned-count');
    const savedCountBadge = document.getElementById('saved-count');
    const noLongerNeededCountBadge = document.getElementById('no-longer-needed-count');
    
    list.innerHTML = '';
    savedList.innerHTML = '';
    noLongerNeededList.innerHTML = '';
    
    let orphanedCount = 0;
    let savedCount = 0;
    let noLongerNeededCount = 0;
    
    state.datasheetData.orphaned_files.forEach(filename => {
        // Check if this file's suffix is excluded
        const fileSuffix = getFileSuffix(filename);
        if (fileSuffix !== null && state.excludedSuffixes.has(fileSuffix)) {
            return; // Skip excluded suffix files
        }
        
        // Skip if saved for later
        if (state.savedForLater.has(filename)) {
            savedCount++;
            const item = createOrphanedFileItem(filename, 'saved');
            savedList.appendChild(item);
            return;
        }
        
        // Skip if no longer needed
        if (state.noLongerNeeded.has(filename)) {
            noLongerNeededCount++;
            const item = createOrphanedFileItem(filename, 'noLongerNeeded');
            noLongerNeededList.appendChild(item);
            return;
        }
        
        const item = document.createElement('div');
        item.className = 'orphaned-file-item';
        item.draggable = true;
        item.dataset.filename = filename;
        
        // Check if tentatively associated
        const tentative = state.tentativeAssociations[filename];
        if (tentative) {
            item.classList.add('tentative');
            item.innerHTML = `
                <div class="new-name">${tentative.newName}</div>
                <div class="old-name">${filename}</div>
            `;
            item.title = `${filename} → ${tentative.newName}`;
        } else {
            item.textContent = filename;
            orphanedCount++;
        }
        
        // Drag events
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', filename);
            item.classList.add('dragging');
        });
        
        item.addEventListener('dragend', (e) => {
            item.classList.remove('dragging');
        });
        
        // Right-click context menu
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showOrphanContextMenu(e, filename, false);
        });
        
        // Click to show details if tentative, else play audio
        if (tentative) {
            item.addEventListener('click', () => showTentativeDetails(filename, tentative));
        } else {
            item.addEventListener('click', () => {
                if (state.autoPlayAudio) {
                    playAudioFile(filename);
                }
            });
        }
        
        list.appendChild(item);
    });
    
    // Add files that will be unlinked (they become orphaned and can be reassigned)
    for (const originalFile in state.tentativeUnlinks) {
        const unlink = state.tentativeUnlinks[originalFile];
        const item = document.createElement('div');
        item.className = 'orphaned-file-item tentative';
        item.draggable = true;  // Make draggable so it can be reassigned
        item.dataset.filename = originalFile;  // Use original filename for drag
        item.style.borderLeft = '3px solid #dc2626';
        item.innerHTML = `
            <div class="new-name">${unlink.unlinkTo} <small>(will be unlinked)</small></div>
            <div class="old-name">${originalFile}</div>
        `;
        item.title = `${originalFile} → ${unlink.unlinkTo} (unlinked) - Drag to reassign`;
        
        // Drag events to allow reassignment
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', originalFile);
            item.classList.add('dragging');
        });
        
        item.addEventListener('dragend', (e) => {
            item.classList.remove('dragging');
        });
        
        item.addEventListener('click', () => showUnlinkDetails(originalFile, unlink));
        
        list.appendChild(item);
    }
    
    countBadge.textContent = orphanedCount;
    savedCountBadge.textContent = savedCount;
    noLongerNeededCountBadge.textContent = noLongerNeededCount;
}

// Helper function to get the suffix of a filename based on extracted suffixes
function getFileSuffix(filename) {
    if (!state.suffixes) return null;
    
    // Check each suffix to see if this file has it
    for (const suffix in state.suffixes) {
        if (state.suffixes[suffix].includes(filename)) {
            return suffix;
        }
    }
    
    return null;
}

// Helper function to create orphaned file item (used for saved list too)
function createOrphanedFileItem(filename, category) {
    const item = document.createElement('div');
    item.className = 'orphaned-file-item';
    item.draggable = category !== 'noLongerNeeded';  // No longer needed files can't be dragged
    item.dataset.filename = filename;
    item.textContent = filename;
    
    // Drag events
    item.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', filename);
        item.classList.add('dragging');
    });
    
    item.addEventListener('dragend', (e) => {
        item.classList.remove('dragging');
    });
    
    // Right-click context menu
    item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showOrphanContextMenu(e, filename, category);
    });
    
    // Click to play audio
    item.addEventListener('click', () => {
        if (state.autoPlayAudio) {
            playAudioFile(filename);
        }
    });
    
    return item;
}

// Show context menu for orphaned files
function showOrphanContextMenu(e, filename, category) {
    // Remove any existing context menu
    const existing = document.querySelector('.context-menu');
    if (existing) existing.remove();
    
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.position = 'fixed';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.style.background = 'white';
    menu.style.border = '1px solid #d1d5db';
    menu.style.borderRadius = '4px';
    menu.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
    menu.style.zIndex = '10000';
    menu.style.minWidth = '180px';
    
    const playOption = document.createElement('div');
    playOption.className = 'context-menu-item';
    playOption.textContent = '▶ Play';
    playOption.style.padding = '0.5rem 1rem';
    playOption.style.cursor = 'pointer';
    playOption.addEventListener('click', () => {
        playAudioFile(filename);
        menu.remove();
    });
    playOption.addEventListener('mouseenter', () => playOption.style.background = '#f3f4f6');
    playOption.addEventListener('mouseleave', () => playOption.style.background = 'white');
    
    // Save for Later option
    const saveOption = document.createElement('div');
    saveOption.className = 'context-menu-item';
    saveOption.style.padding = '0.5rem 1rem';
    saveOption.style.cursor = 'pointer';
    
    if (category === 'saved') {
        saveOption.textContent = '↩ Return to Unmatched';
        saveOption.addEventListener('click', () => {
            state.savedForLater.delete(filename);
            saveStep3Progress();
            renderOrphanedFiles();
            menu.remove();
        });
    } else if (category === 'noLongerNeeded') {
        saveOption.textContent = '↩ Return to Unmatched';
        saveOption.addEventListener('click', () => {
            state.noLongerNeeded.delete(filename);
            saveStep3Progress();
            renderOrphanedFiles();
            menu.remove();
        });
    } else {
        saveOption.textContent = '💾 Save for Later';
        saveOption.addEventListener('click', () => {
            state.savedForLater.add(filename);
            saveStep3Progress();
            renderOrphanedFiles();
            menu.remove();
        });
    }
    saveOption.addEventListener('mouseenter', () => saveOption.style.background = '#f3f4f6');
    saveOption.addEventListener('mouseleave', () => saveOption.style.background = 'white');
    
    // No Longer Needed option (only show for unmatched and saved files)
    if (category !== 'noLongerNeeded') {
        const noLongerNeededOption = document.createElement('div');
        noLongerNeededOption.className = 'context-menu-item';
        noLongerNeededOption.textContent = '🗑️ No Longer Needed';
        noLongerNeededOption.style.padding = '0.5rem 1rem';
        noLongerNeededOption.style.cursor = 'pointer';
        noLongerNeededOption.addEventListener('click', () => {
            // Remove from saved if it's there
            state.savedForLater.delete(filename);
            // Add to no longer needed
            state.noLongerNeeded.add(filename);
            saveStep3Progress();
            renderOrphanedFiles();
            menu.remove();
        });
        noLongerNeededOption.addEventListener('mouseenter', () => noLongerNeededOption.style.background = '#f3f4f6');
        noLongerNeededOption.addEventListener('mouseleave', () => noLongerNeededOption.style.background = 'white');
        
        menu.appendChild(playOption);
        menu.appendChild(saveOption);
        menu.appendChild(noLongerNeededOption);
    } else {
        menu.appendChild(playOption);
        menu.appendChild(saveOption);
    }
    
    document.body.appendChild(menu);
    
    // Close menu when clicking elsewhere
    setTimeout(() => {
        document.addEventListener('click', function closeMenu() {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        });
    }, 100);
}

// Handle drag over cell
function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drop-target');
}

// Handle drag leave cell
function handleDragLeave(e) {
    e.currentTarget.classList.remove('drop-target');
}

// Handle drop on cell
async function handleDrop(e, recordIdx, field) {
    e.preventDefault();
    e.currentTarget.classList.remove('drop-target');
    
    const orphanFile = e.dataTransfer.getData('text/plain');
    if (!orphanFile) return;
    
    // If this file is marked for unlink, cancel the unlink (we're reassigning it)
    if (state.tentativeUnlinks[orphanFile]) {
        delete state.tentativeUnlinks[orphanFile];
        showSuccess(`Cancelled unlink for ${orphanFile} - reassigning to new location`);
    }
    
    // Get record
    const record = state.datasheetData.records[recordIdx];
    const baseFilename = record.SoundFile;
    
    if (!baseFilename) {
        showError('Record has no base filename');
        return;
    }
    
    // Determine which suffix to use
    const suffixesForField = [];
    
    // Special case: if dropping on SoundFile field and empty suffix exists
    if (field === 'SoundFile' && '' in state.suffixMappings) {
        suffixesForField.push('');
    }
    
    // Check other suffix mappings for this field
    for (const suffix in state.suffixMappings) {
        if (state.suffixMappings[suffix].includes(field)) {
            suffixesForField.push(suffix);
        }
    }
    
    if (suffixesForField.length === 0) {
        // No suffix mapping exists for this field - offer to create one
        const shouldCreate = await showCreateSuffixMappingDialog(orphanFile, field);
        if (!shouldCreate) return;
        
        selectedSuffix = shouldCreate.suffix;
        
        // Add the new mapping
        if (!state.suffixMappings[selectedSuffix]) {
            state.suffixMappings[selectedSuffix] = [];
        }
        state.suffixMappings[selectedSuffix].push(field);
        
        // Save mappings
        try {
            await window.pywebview.api.save_suffix_mappings(state.suffixMappings);
        } catch (error) {
            showError('Error saving suffix mapping: ' + error.message);
            return;
        }
    } else if (suffixesForField.length === 1) {
        selectedSuffix = suffixesForField[0];
    } else {
        selectedSuffix = await showSuffixPicker(suffixesForField, field);
        if (!selectedSuffix) return;
    }
    
    // Calculate new name
    const baseName = baseFilename.rsplit('.', 1)[0];
    const ext = baseFilename.includes('.') ? '.' + baseFilename.split('.').pop() : '.wav';
    const newName = baseName + selectedSuffix + ext;
    
    // Create tentative association
    state.tentativeAssociations[orphanFile] = {
        recordIdx: recordIdx,
        field: field,
        suffix: selectedSuffix,
        newName: newName,
        oldName: orphanFile
    };
    
    // Save progress
    await saveStep3Progress();
    
    // Refresh UI
    buildDataSheet();
    renderOrphanedFiles();
    
    showSuccess(`Tentatively associated ${orphanFile} → ${newName}`);
}

// Show suffix picker modal
function showSuffixPicker(suffixes, field) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <h3>Select Suffix</h3>
                <p>Multiple suffixes are mapped to <strong>${field}</strong>. Which one should be used?</p>
                <div id="suffix-options" style="display: flex; flex-direction: column; gap: 0.5rem; margin: 1rem 0;"></div>
                <div class="button-row">
                    <button id="btn-cancel-suffix" class="btn-secondary">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const optionsDiv = modal.querySelector('#suffix-options');
        suffixes.forEach(suffix => {
            const btn = document.createElement('button');
            btn.className = 'btn-primary';
            btn.textContent = suffix === '' ? '(no suffix - SoundFile)' : suffix;
            btn.addEventListener('click', () => {
                modal.remove();
                resolve(suffix);
            });
            optionsDiv.appendChild(btn);
        });
        
        modal.querySelector('#btn-cancel-suffix').addEventListener('click', () => {
            modal.remove();
            resolve(null);
        });
    });
}

// Show dialog to create new suffix mapping
function showCreateSuffixMappingDialog(orphanFile, field) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        
        // Extract suffix from orphan filename
        const record = state.datasheetData.records.find(r => orphanFile.startsWith(r.SoundFile.split('.')[0]));
        const suggestedSuffix = record ? orphanFile.replace(record.SoundFile.split('.')[0], '').replace(/\.(wav|WAV)$/i, '') : '';
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <h3>⚠️ Create New Suffix Mapping</h3>
                <p style="color: #dc2626; font-weight: 600; margin: 1rem 0;">
                    WARNING: The field <strong>"${field}"</strong> does not currently have any suffix mappings.
                </p>
                <p style="margin: 1rem 0;">
                    File: <strong>${orphanFile}</strong><br>
                    You are about to create a new suffix mapping for this field.
                </p>
                <div style="margin: 1rem 0;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600;">
                        Enter suffix (including any dashes, underscores, etc.):
                    </label>
                    <input type="text" id="new-suffix-input" value="${suggestedSuffix}" 
                           style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 4px;"
                           placeholder="e.g., -phon or _alt">
                </div>
                <div id="suffix-warning" style="display: none; padding: 1rem; background: #fef3c7; border-left: 4px solid #f59e0b; margin: 1rem 0;">
                </div>
                <div class="button-row">
                    <button id="btn-create-mapping" class="btn-primary">Create Mapping</button>
                    <button id="btn-cancel-mapping" class="btn-secondary">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        const input = modal.querySelector('#new-suffix-input');
        const warningDiv = modal.querySelector('#suffix-warning');
        const createBtn = modal.querySelector('#btn-create-mapping');
        
        // Check for existing suffix mappings
        function checkSuffix() {
            const suffix = input.value.trim();
            
            if (suffix === '') {
                warningDiv.style.display = 'none';
                return;
            }
            
            if (state.suffixMappings[suffix]) {
                const existingFields = state.suffixMappings[suffix];
                warningDiv.style.display = 'block';
                warningDiv.innerHTML = `
                    <strong>⚠️ WARNING:</strong> This suffix is already mapped to: 
                    <strong>${existingFields.join(', ')}</strong>
                    <br><br>
                    If you continue, this suffix will associate sound files with <strong>BOTH</strong> 
                    "${field}" AND "${existingFields.join('", "')}" in all records.
                    <br><br>
                    <strong>Are you absolutely sure you want to do this?</strong>
                `;
            } else {
                warningDiv.style.display = 'none';
            }
        }
        
        input.addEventListener('input', checkSuffix);
        input.addEventListener('focus', () => input.select());
        checkSuffix();
        
        // Focus input
        setTimeout(() => input.focus(), 100);
        
        createBtn.addEventListener('click', () => {
            const suffix = input.value.trim();
            
            if (!suffix && suffix !== '') {
                showError('Please enter a suffix');
                return;
            }
            
            // Final confirmation if suffix already exists
            if (state.suffixMappings[suffix]) {
                const confirmed = confirm(
                    `⚠️ FINAL WARNING ⚠️\n\n` +
                    `The suffix "${suffix}" is already mapped to: ${state.suffixMappings[suffix].join(', ')}\n\n` +
                    `This means sound files with this suffix will associate with MULTIPLE fields:\n` +
                    `- ${state.suffixMappings[suffix].join('\n- ')}\n` +
                    `- ${field}\n\n` +
                    `Do you understand and want to proceed?`
                );
                
                if (!confirmed) {
                    return;
                }
            }
            
            modal.remove();
            resolve({ suffix });
        });
        
        modal.querySelector('#btn-cancel-mapping').addEventListener('click', () => {
            modal.remove();
            resolve(null);
        });
    });
}

// Show cell modal (speech balloon)
function showCellModal(e, recordIdx, field, cellStatus) {
    // Close existing modal
    if (state.activeModal) {
        state.activeModal.remove();
        state.activeModal = null;
    }
    
    const modal = document.createElement('div');
    modal.className = 'cell-modal';
    
    // Position modal next to cell
    const rect = e.currentTarget.getBoundingClientRect();
    const spaceOnRight = window.innerWidth - rect.right;
    
    if (spaceOnRight > 300) {
        modal.classList.add('right');
        modal.style.left = (rect.right + 10) + 'px';
    } else {
        modal.classList.add('left');
        modal.style.left = (rect.left - 260) + 'px';
    }
    modal.style.top = rect.top + 'px';
    
    // Build modal content
    let filesHTML = '';
    cellStatus.files.forEach(fileInfo => {
        if (fileInfo.matched) {
            const tentativeClass = fileInfo.tentative ? 'tentative' : '';
            const isExisting = !fileInfo.tentative;
            const statusLabel = fileInfo.unexpected ? 
                '<small style="color: #d97706;">(unexpected)</small>' : 
                (isExisting ? '<small style="color: #6b7280;">(existing)</small>' : '<small style="color: var(--primary-color);">(tentative)</small>');
            
            filesHTML += `
                <div class="cell-modal-file ${tentativeClass}">
                    <div style="flex: 1;">
                        <div>${fileInfo.matched}</div>
                        ${statusLabel}
                    </div>
                    <div style="display: flex; gap: 0.25rem;">
                        <button class="btn-small btn-secondary" onclick="playAudioFile('${fileInfo.matched}')">▶</button>
                        ${fileInfo.tentative ? 
                            '<button class="btn-danger btn-small" onclick="removeTentative(\'' + fileInfo.originalFile + '\')">Remove</button>' : 
                            '<button class="btn-danger btn-small" onclick="unlinkExistingFile(\'' + fileInfo.matched + '\', ' + recordIdx + ', \'' + field + '\', \'' + fileInfo.suffix + '\')">Unlink</button>'}
                    </div>
                </div>
            `;
        } else if (fileInfo.expected) {
            filesHTML += `
                <div class="cell-modal-file missing">
                    <span>${fileInfo.expected} (missing)</span>
                </div>
            `;
        }
    });
    
    modal.innerHTML = `
        <div class="cell-modal-header">
            <strong>${field}</strong>
            <button class="cell-modal-close">&times;</button>
        </div>
        <div class="cell-modal-files">
            ${filesHTML || '<p style="color: #6b7280; font-size: 0.875rem;">No files associated</p>'}
        </div>
    `;
    
    document.body.appendChild(modal);
    state.activeModal = modal;
    
    // Close button
    modal.querySelector('.cell-modal-close').addEventListener('click', () => {
        modal.remove();
        state.activeModal = null;
    });
    
    // Close when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closeModal(e) {
            if (!modal.contains(e.target) && !e.target.closest('.datasheet-table td')) {
                modal.remove();
                state.activeModal = null;
                document.removeEventListener('click', closeModal);
            }
        });
    }, 100);
}

// Remove tentative association
window.removeTentative = function(orphanFile) {
    delete state.tentativeAssociations[orphanFile];
    
    // Save progress
    saveStep3Progress();
    
    // Close modal
    if (state.activeModal) {
        state.activeModal.remove();
        state.activeModal = null;
    }
    
    // Refresh UI
    buildDataSheet();
    renderOrphanedFiles();
    
    showSuccess('Removed tentative association');
};

// Show tentative details
function showTentativeDetails(filename, tentative) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <h3>Tentative Association</h3>
            <div style="margin: 1rem 0;">
                <p><strong>Original:</strong> ${tentative.oldName}</p>
                <p><strong>New Name:</strong> ${tentative.newName}</p>
                <p><strong>Record:</strong> ${state.datasheetData.records[tentative.recordIdx].Reference}</p>
                <p><strong>Field:</strong> ${tentative.field}</p>
                <p><strong>Suffix:</strong> ${tentative.suffix || '(no suffix)'}</p>
            </div>
            <div class="button-row">
                <button id="btn-play-file" class="btn-secondary">▶ Play</button>
                <button id="btn-remove-tentative" class="btn-danger">Remove Association</button>
                <button id="btn-close-tentative" class="btn-secondary">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('#btn-play-file').addEventListener('click', () => {
        playAudioFile(tentative.oldName);
    });
    
    modal.querySelector('#btn-remove-tentative').addEventListener('click', () => {
        delete state.tentativeAssociations[filename];
        saveStep3Progress();
        modal.remove();
        buildDataSheet();
        renderOrphanedFiles();
        showSuccess('Removed tentative association');
    });
    
    modal.querySelector('#btn-close-tentative').addEventListener('click', () => {
        modal.remove();
    });
}

// Show unlink details
function showUnlinkDetails(filename, unlink) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <h3>⚠️ Tentative Unlink</h3>
            <div style="margin: 1rem 0;">
                <p><strong>Original:</strong> ${unlink.originalName}</p>
                <p><strong>Will Rename To:</strong> ${unlink.unlinkTo}</p>
                <p><strong>Record:</strong> ${state.datasheetData.records[unlink.recordIdx].Reference}</p>
                <p><strong>Field:</strong> ${unlink.field}</p>
                <p><strong>Suffix:</strong> ${unlink.suffix || '(no suffix)'}</p>
                <hr style="margin: 1rem 0;">
                <p style="color: #dc2626;">This will break the existing association.</p>
            </div>
            <div class="button-row">
                <button id="btn-play-unlink" class="btn-secondary">▶ Play</button>
                <button id="btn-cancel-unlink" class="btn-danger">Cancel Unlink</button>
                <button id="btn-close-unlink" class="btn-secondary">Close</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('#btn-play-unlink').addEventListener('click', () => {
        playAudioFile(unlink.originalName);
    });
    
    modal.querySelector('#btn-cancel-unlink').addEventListener('click', () => {
        delete state.tentativeUnlinks[filename];
        saveStep3Progress();
        modal.remove();
        buildDataSheet();
        renderOrphanedFiles();
        showSuccess('Cancelled unlink');
    });
    
    modal.querySelector('#btn-close-unlink').addEventListener('click', () => {
        modal.remove();
    });
}

// Clear all tentative associations
function clearAllTentative() {
    const hasAssociations = Object.keys(state.tentativeAssociations).length > 0;
    const hasUnlinks = Object.keys(state.tentativeUnlinks).length > 0;
    
    if (!hasAssociations && !hasUnlinks) {
        showError('No tentative changes to clear');
        return;
    }
    
    const message = [];
    if (hasAssociations) message.push(`${Object.keys(state.tentativeAssociations).length} association(s)`);
    if (hasUnlinks) message.push(`${Object.keys(state.tentativeUnlinks).length} unlink(s)`);
    
    if (confirm(`Clear all tentative changes? (${message.join(' and ')})`)) {
        state.tentativeAssociations = {};
        state.tentativeUnlinks = {};
        saveStep3Progress();
        buildDataSheet();
        renderOrphanedFiles();
        showSuccess('Cleared all tentative changes');
    }
}

// Save Step 3 progress to backend
async function saveStep3Progress() {
    if (!state.datasheetData) return;
    
    const progress = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        xmlPath: state.xmlPath,
        audioFolder: state.audioFolder,
        tentativeAssociations: state.tentativeAssociations,
        tentativeUnlinks: state.tentativeUnlinks,
        savedForLater: Array.from(state.savedForLater),
        noLongerNeeded: Array.from(state.noLongerNeeded)
    };
    
    try {
        const result = await window.pywebview.api.save_step3_progress(progress);
        if (!result.success) {
            console.error('Failed to save progress:', result.error);
        }
    } catch (error) {
        console.error('Error saving progress:', error);
    }
}

// Load Step 3 progress from backend
async function loadStep3Progress() {
    try {
        const result = await window.pywebview.api.load_step3_progress();
        if (!result.success || !result.progress) {
            return;
        }
        
        const progress = result.progress;
        
        // Validate progress matches current XML/audio
        if (progress.xmlPath !== state.xmlPath || progress.audioFolder !== state.audioFolder) {
            console.warn('Progress is from different XML/audio folder, not loading');
            return;
        }
        
        // Restore state
        state.tentativeAssociations = progress.tentativeAssociations || {};
        state.tentativeUnlinks = progress.tentativeUnlinks || {};
        state.savedForLater = new Set(progress.savedForLater || []);
        state.noLongerNeeded = new Set(progress.noLongerNeeded || []);
        
        // Refresh UI
        buildDataSheet();
        renderOrphanedFiles();
        
        const totalChanges = Object.keys(state.tentativeAssociations).length + 
                            Object.keys(state.tentativeUnlinks).length;
        if (totalChanges > 0) {
            showInfo(`Loaded ${totalChanges} tentative change(s) from previous session`);
        }
    } catch (error) {
        console.error('Error loading progress:', error);
    }
}

// Export progress to JSON file
async function exportProgress() {
    if (!state.datasheetData) {
        showError('No datasheet loaded');
        return;
    }
    
    const progress = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        xmlPath: state.xmlPath,
        audioFolder: state.audioFolder,
        tentativeAssociations: state.tentativeAssociations,
        tentativeUnlinks: state.tentativeUnlinks,
        savedForLater: Array.from(state.savedForLater),
        noLongerNeeded: Array.from(state.noLongerNeeded)
    };
    
    try {
        const result = await window.pywebview.api.export_step3_progress(progress);
        if (result.success) {
            showSuccess(`Progress exported to ${result.path}`);
        } else {
            showError(result.error || 'Failed to export progress');
        }
    } catch (error) {
        showError(`Error exporting progress: ${error.message}`);
    }
}

// Import progress from JSON file
async function importProgress() {
    if (!state.datasheetData) {
        showError('Load a datasheet first');
        return;
    }
    
    try {
        const result = await window.pywebview.api.import_step3_progress();
        if (!result.success) {
            if (result.error !== 'No file selected') {
                showError(result.error || 'Failed to import progress');
            }
            return;
        }
        
        const progress = result.progress;
        
        // Validate version
        if (progress.version !== '1.0') {
            showError('Unsupported progress file version');
            return;
        }
        
        // Warn if XML/audio paths don't match
        if (progress.xmlPath !== state.xmlPath || progress.audioFolder !== state.audioFolder) {
            if (!confirm('Warning: This progress file is from a different XML or audio folder. Import anyway?')) {
                return;
            }
        }
        
        // Restore state
        state.tentativeAssociations = progress.tentativeAssociations || {};
        state.tentativeUnlinks = progress.tentativeUnlinks || {};
        state.savedForLater = new Set(progress.savedForLater || []);
        state.noLongerNeeded = new Set(progress.noLongerNeeded || []);
        
        // Save to settings
        await saveStep3Progress();
        
        // Refresh UI
        buildDataSheet();
        renderOrphanedFiles();
        
        const totalChanges = Object.keys(state.tentativeAssociations).length + 
                            Object.keys(state.tentativeUnlinks).length;
        showSuccess(`Imported ${totalChanges} tentative change(s)`);
    } catch (error) {
        showError(`Error importing progress: ${error.message}`);
    }
}

// Reset all Step 3 progress
async function resetProgress() {
    if (!state.datasheetData) {
        showError('No datasheet loaded');
        return;
    }
    
    const hasAssociations = Object.keys(state.tentativeAssociations).length > 0;
    const hasUnlinks = Object.keys(state.tentativeUnlinks).length > 0;
    const hasSaved = state.savedForLater.size > 0;
    const hasNoLongerNeeded = state.noLongerNeeded.size > 0;
    
    if (!hasAssociations && !hasUnlinks && !hasSaved && !hasNoLongerNeeded) {
        showError('No progress to reset');
        return;
    }
    
    const message = [];
    if (hasAssociations) message.push(`${Object.keys(state.tentativeAssociations).length} association(s)`);
    if (hasUnlinks) message.push(`${Object.keys(state.tentativeUnlinks).length} unlink(s)`);
    if (hasSaved) message.push(`${state.savedForLater.size} saved file(s)`);
    if (hasNoLongerNeeded) message.push(`${state.noLongerNeeded.size} no longer needed file(s)`);
    
    if (confirm(`Reset all progress? This will clear: ${message.join(', ')}. This cannot be undone.`)) {
        state.tentativeAssociations = {};
        state.tentativeUnlinks = {};
        state.savedForLater = new Set();
        state.noLongerNeeded = new Set();
        
        await saveStep3Progress();
        
        buildDataSheet();
        renderOrphanedFiles();
        showSuccess('Progress reset');
    }
}

// Column settings modal
function showColumnSettings() {
    if (!state.datasheetData) return;
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <h3>Column Settings</h3>
            <p>Show, hide, and reorder columns. Reference is always visible and first.</p>
            <div id="column-list" style="margin: 1rem 0;"></div>
            <div class="button-row">
                <button id="btn-save-columns" class="btn-primary">Save</button>
                <button id="btn-cancel-columns" class="btn-secondary">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const columnList = modal.querySelector('#column-list');
    
    // Build ordered list from current columnOrder, ensuring all fields are included
    const orderedFields = [...state.columnOrder];
    state.datasheetData.field_names.forEach(field => {
        if (!orderedFields.includes(field)) {
            orderedFields.push(field);
        }
    });
    
    orderedFields.forEach((field, idx) => {
        const div = document.createElement('div');
        div.className = 'column-setting-row';
        div.style.cssText = 'padding: 0.5rem; border: 1px solid #e5e7eb; margin-bottom: 0.25rem; display: flex; align-items: center; gap: 0.5rem; background: white; cursor: move;';
        div.dataset.field = field;
        
        // Make rows draggable (except Reference)
        if (field !== 'Reference') {
            div.draggable = true;
            
            div.addEventListener('dragstart', (e) => {
                div.style.opacity = '0.5';
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', field);
            });
            
            div.addEventListener('dragend', (e) => {
                div.style.opacity = '1';
            });
            
            div.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                // Don't allow dropping above Reference
                const rows = Array.from(columnList.querySelectorAll('.column-setting-row'));
                const targetIdx = rows.indexOf(div);
                if (targetIdx > 0) {
                    div.style.borderTop = '2px solid #3b82f6';
                }
            });
            
            div.addEventListener('dragleave', (e) => {
                div.style.borderTop = '1px solid #e5e7eb';
            });
            
            div.addEventListener('drop', (e) => {
                e.preventDefault();
                div.style.borderTop = '1px solid #e5e7eb';
                
                const draggedField = e.dataTransfer.getData('text/plain');
                const draggedRow = columnList.querySelector(`[data-field="${draggedField}"]`);
                
                if (draggedRow && draggedRow !== div) {
                    const rows = Array.from(columnList.querySelectorAll('.column-setting-row'));
                    const draggedIdx = rows.indexOf(draggedRow);
                    const targetIdx = rows.indexOf(div);
                    
                    // Don't allow dropping above Reference
                    if (targetIdx > 0) {
                        if (draggedIdx < targetIdx) {
                            columnList.insertBefore(draggedRow, div.nextSibling);
                        } else {
                            columnList.insertBefore(draggedRow, div);
                        }
                    }
                }
            });
            
            // Drag handle icon
            const dragHandle = document.createElement('span');
            dragHandle.textContent = '☰';
            dragHandle.style.cssText = 'color: #9ca3af; cursor: move;';
            div.appendChild(dragHandle);
        } else {
            // Reference row not draggable
            div.style.cursor = 'default';
            const spacer = document.createElement('div');
            spacer.style.width = '20px';
            div.appendChild(spacer);
        }
        
        // Visibility checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = state.visibleColumns.includes(field);
        checkbox.disabled = field === 'Reference';  // Reference always visible
        checkbox.style.cursor = field === 'Reference' ? 'default' : 'pointer';
        
        const label = document.createElement('span');
        label.textContent = field;
        label.style.flex = '1';
        
        div.appendChild(checkbox);
        div.appendChild(label);
        columnList.appendChild(div);
    });
    
    modal.querySelector('#btn-save-columns').addEventListener('click', async () => {
        const rows = columnList.querySelectorAll('.column-setting-row');
        const newColumnOrder = [];
        const newVisibleColumns = [];
        
        rows.forEach((row) => {
            const field = row.dataset.field;
            newColumnOrder.push(field);
            const checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox && checkbox.checked) {
                newVisibleColumns.push(field);
            }
        });
        
        // Update state with new order
        state.columnOrder = newColumnOrder;
        state.visibleColumns = newVisibleColumns;
        
        // Save to backend
        try {
            await window.pywebview.api.save_datasheet_settings(state.filters, state.visibleColumns, state.columnOrder);
        } catch (error) {
            console.error('Error saving column settings:', error);
        }
        
        modal.remove();
        buildDataSheet();
    });
    
    modal.querySelector('#btn-cancel-columns').addEventListener('click', () => {
        modal.remove();
    });
}

// Toggle filters pane
function toggleFilters() {
    const filterPane = document.getElementById('filter-pane');
    filterPane.classList.toggle('hidden');
    if (!filterPane.classList.contains('hidden')) {
        renderFiltersUI();
    }
}

// Apply filters
async function applyFilters() {
    // Collect filters from UI
    const rows = document.querySelectorAll('#filter-conditions .filter-row');
    const filters = [];
    rows.forEach(row => {
        const target = row.querySelector('.filter-target').value;
        const name = row.querySelector('.filter-name').value;
        const operator = row.querySelector('.filter-operator').value;
        const valueInput = row.querySelector('.filter-value');
        const value = valueInput ? valueInput.value : '';
        filters.push({ target, name, operator, value });
    });
    state.filters = filters;
    
    // Save filters to backend
    try {
        await window.pywebview.api.save_datasheet_settings(state.filters, state.visibleColumns);
    } catch (error) {
        console.error('Error saving filters:', error);
    }
    
    // Rebuild the sheet
    buildDataSheet();
}

// Clear filters
async function clearFilters() {
    state.filters = [];
    
    // Save cleared filters
    try {
        await window.pywebview.api.save_datasheet_settings(state.filters, state.visible_columns);
    } catch (error) {
        console.error('Error saving filters:', error);
    }
    
    // Clear UI
    const container = document.getElementById('filter-conditions');
    if (container) container.innerHTML = '';
    
    buildDataSheet();
}

// Apply filters to records
function applyFiltersToRecords(records) {
    const filters = state.filters || [];
    if (!filters.length) return records;
    const caseSensitive = !!state.caseSensitive;
    
    function matchValue(val, operator, target) {
        const v = val ?? '';
        const t = target ?? '';
        const VV = caseSensitive ? v : String(v).toLowerCase();
        const TT = caseSensitive ? t : String(t).toLowerCase();
        switch (operator) {
            case 'equals': return VV === TT;
            case 'not_equals': return VV !== TT;
            case 'contains': return TT.includes(VV);
            case 'not_contains': return !TT.includes(VV);
            case 'empty': return (TT === '' || TT == null);
            case 'not_empty': return !(TT === '' || TT == null);
            case 'in_list': {
                const list = (v || '').split(',').map(s => caseSensitive ? s.trim() : s.trim().toLowerCase());
                return list.includes(TT);
            }
            case 'not_in_list': {
                const list = (v || '').split(',').map(s => caseSensitive ? s.trim() : s.trim().toLowerCase());
                return !list.includes(TT);
            }
            default: return true;
        }
    }
    
    return records.filter(rec => {
        return filters.every(f => {
            if (f.target === 'group') {
                const fields = state.fieldGroups?.[f.name] || [];
                // Group filter matches if ANY field in group satisfies condition
                return fields.some(fn => matchValue(f.value, f.operator, rec[fn]));
            } else {
                return matchValue(f.value, f.operator, rec[f.name]);
            }
        });
    });
}

function renderFiltersUI() {
    const container = document.getElementById('filter-conditions');
    if (!container) return;
    container.innerHTML = '';
    const filters = state.filters || [];
    filters.forEach(f => container.appendChild(createFilterRow(f)));
    if (filters.length === 0) {
        container.appendChild(createFilterRow());
    }
}

function addFilterRow() {
    const container = document.getElementById('filter-conditions');
    if (!container) return;
    container.appendChild(createFilterRow());
}

function createFilterRow(prefill) {
    const row = document.createElement('div');
    row.className = 'filter-row';
    
    const targetSel = document.createElement('select');
    targetSel.className = 'filter-target';
    ['field','group'].forEach(opt => {
        const o = document.createElement('option'); o.value = opt; o.textContent = opt === 'field' ? 'Field' : 'Group';
        targetSel.appendChild(o);
    });
    
    const nameSel = document.createElement('select');
    nameSel.className = 'filter-name';
    
    // Get ALL fields from datasheet, not just mapped ones
    const fieldNames = state.datasheetData && state.datasheetData.field_names ? 
        [...state.datasheetData.field_names] : 
        ['Reference'];
    
    const groupNames = Object.keys(state.fieldGroups || {});
    
    function populateNames() {
        nameSel.innerHTML = '';
        const list = targetSel.value === 'group' ? groupNames : fieldNames;
        list.forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; nameSel.appendChild(o); });
    }
    populateNames();
    targetSel.addEventListener('change', populateNames);
    
    const opSel = document.createElement('select');
    opSel.className = 'filter-operator';
    ['equals','not_equals','contains','not_contains','empty','not_empty','in_list','not_in_list'].forEach(op => {
        const o = document.createElement('option'); o.value = op; o.textContent = op.replace('_',' '); opSel.appendChild(o);
    });
    
    const val = document.createElement('input');
    val.type = 'text'; val.placeholder = 'value (comma-separated for lists)'; val.className = 'filter-value';
    
    const rm = document.createElement('button'); rm.className = 'btn-small btn-secondary'; rm.textContent = 'Remove'; rm.addEventListener('click', () => row.remove());
    
    if (prefill) {
        targetSel.value = prefill.target || 'field';
        populateNames();
        nameSel.value = prefill.name || nameSel.value;
        opSel.value = prefill.operator || 'equals';
        val.value = prefill.value || '';
    }
    
    row.appendChild(targetSel);
    row.appendChild(nameSel);
    row.appendChild(opSel);
    row.appendChild(val);
    row.appendChild(rm);
    return row;
}

// Check for suggested matches
async function checkSuggestedMatches() {
    // TODO: Implement fuzzy matching
    // For now, hide suggested section
    document.getElementById('step3-suggested').classList.add('hidden');
}

// Accept suggestions
async function acceptSuggestions() {
    // Get checked suggestions
    const checkboxes = document.querySelectorAll('#suggested-matches-list input[type="checkbox"]:checked');
    
    checkboxes.forEach(checkbox => {
        const suggestion = JSON.parse(checkbox.dataset.suggestion);
        
        // Add as tentative association
        state.tentativeAssociations[suggestion.orphan] = {
            recordIdx: suggestion.recordIdx,
            field: suggestion.field,
            suffix: suggestion.suffix,
            newName: suggestion.expected.filename,
            oldName: suggestion.orphan
        };
    });
    
    // Save progress
    await saveStep3Progress();
    
    // Hide suggested section
    document.getElementById('step3-suggested').classList.add('hidden');
    
    // Refresh UI
    buildDataSheet();
    renderOrphanedFiles();
}

// Helper function for rsplit (like Python)
String.prototype.rsplit = function(sep, maxsplit) {
    const split = this.split(sep);
    return maxsplit ? [split.slice(0, -maxsplit).join(sep)].concat(split.slice(-maxsplit)) : split;
};

// Play audio file
window.playAudioFile = async function(filename) {
    console.log('[playAudioFile] Starting playback for:', filename);
    try {
        // Stop current audio if playing
        if (state.currentAudio) {
            console.log('[playAudioFile] Stopping current audio');
            state.currentAudio.pause();
            state.currentAudio = null;
        }
        
        // Clean up previous blob URLs to prevent memory leaks
        if (state.currentBlobUrl) {
            URL.revokeObjectURL(state.currentBlobUrl);
            state.currentBlobUrl = null;
        }
        
        // Get audio data from backend
        console.log('[playAudioFile] Requesting audio data from backend');
        const result = await window.pywebview.api.get_audio_data_url(filename);
        console.log('[playAudioFile] Backend response received, size:', result?.size || 0);
        
        if (result && result.success) {
            let audioUrl;
            
            // Try to create blob URL from byte array (more efficient)
            if (result.bytes && result.mime) {
                console.log('[playAudioFile] Creating blob URL from bytes');
                try {
                    const uint8Array = new Uint8Array(result.bytes);
                    const blob = new Blob([uint8Array], { type: result.mime });
                    audioUrl = URL.createObjectURL(blob);
                    state.currentBlobUrl = audioUrl;
                    console.log('[playAudioFile] Blob URL created successfully');
                } catch (blobError) {
                    console.warn('[playAudioFile] Blob creation failed, falling back to base64:', blobError);
                    audioUrl = `data:${result.mime};base64,${result.base64}`;
                }
            } else if (result.base64) {
                // Fallback to base64 data URL
                console.log('[playAudioFile] Using base64 data URL (fallback)');
                audioUrl = `data:${result.mime};base64,${result.base64}`;
            } else {
                throw new Error('No audio data received from backend');
            }
            
            console.log('[playAudioFile] Creating audio element');
            const audio = new Audio(audioUrl);
            audio.preload = 'auto';
            state.currentAudio = audio;
            
            audio.addEventListener('error', (e) => {
                console.error('[playAudioFile] Audio element error', e);
                showError(`Could not play audio file: ${filename}`);
            });
            
            audio.play().catch(error => {
                console.error('[playAudioFile] Error playing audio:', error);
                showError(`Could not play audio file: ${filename}`);
            });
            
            audio.onended = () => {
                console.log('[playAudioFile] Audio playback ended');
                state.currentAudio = null;
                // Clean up blob URL
                if (state.currentBlobUrl) {
                    URL.revokeObjectURL(state.currentBlobUrl);
                    state.currentBlobUrl = null;
                }
            };
        } else {
            console.error('[playAudioFile] Backend returned error:', result?.error || 'Invalid response');
            showError('Could not load audio file: ' + filename);
        }
    } catch (error) {
        console.error('[playAudioFile] Exception:', error);
        showError('Error playing audio: ' + error.message);
    }
};

// Unlink existing file with confirmation
window.unlinkExistingFile = async function(filename, recordIdx, field, suffix) {
    // Close existing modal
    if (state.activeModal) {
        state.activeModal.remove();
        state.activeModal = null;
    }
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <h3>⚠️ Unlink Existing Association</h3>
            <div style="margin: 1rem 0;">
                <p style="color: #dc2626; font-weight: 600;">WARNING: This will break an existing soundfile association!</p>
                <p><strong>File:</strong> ${filename}</p>
                <p><strong>Record:</strong> ${state.datasheetData.records[recordIdx].Reference}</p>
                <p><strong>Field:</strong> ${field}</p>
                <p><strong>Suffix:</strong> ${suffix || '(no suffix)'}</p>
                <hr style="margin: 1rem 0;">
                <p>The file will be renamed to include "_UNLINKED" in its name, breaking the association.</p>
                <p style="margin-top: 1rem;"><strong>Type "UNLINK" to confirm:</strong></p>
                <input type="text" id="unlink-confirm-input" style="width: 100%; padding: 0.5rem; border: 2px solid #dc2626; border-radius: 4px; font-weight: 600;" placeholder="Type UNLINK">
            </div>
            <div class="button-row">
                <button id="btn-confirm-unlink" class="btn-danger" disabled>Unlink</button>
                <button id="btn-cancel-unlink" class="btn-secondary">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const input = modal.querySelector('#unlink-confirm-input');
    const confirmBtn = modal.querySelector('#btn-confirm-unlink');
    
    // Enable button when user types UNLINK
    input.addEventListener('input', (e) => {
        confirmBtn.disabled = e.target.value.trim().toUpperCase() !== 'UNLINK';
    });
    
    // Focus input
    setTimeout(() => input.focus(), 100);
    
    confirmBtn.addEventListener('click', () => {
        // Generate unlinked name
        const baseName = filename.rsplit('.', 1)[0];
        const ext = filename.includes('.') ? '.' + filename.split('.').pop() : '';
        const timestamp = Date.now();
        const unlinkedName = `${baseName}_UNLINKED_${timestamp}${ext}`;
        
        // Add to tentative unlinks
        state.tentativeUnlinks[filename] = {
            recordIdx: recordIdx,
            field: field,
            suffix: suffix,
            unlinkTo: unlinkedName,
            originalName: filename
        };
        
        // Save progress
        saveStep3Progress();
        
        modal.remove();
        buildDataSheet();
        renderOrphanedFiles();
        
        showSuccess(`Will unlink ${filename} → ${unlinkedName}`);
    });
    
    modal.querySelector('#btn-cancel-unlink').addEventListener('click', () => {
        modal.remove();
    });
};

// Show duplicate warning
function showDuplicateWarning(duplicates) {
    const warning = document.getElementById('duplicate-warning');
    const list = document.getElementById('duplicate-list');
    
    list.innerHTML = '<ul>';
    for (const [ref, indices] of Object.entries(duplicates)) {
        list.innerHTML += `<li>Reference "${ref}" appears ${indices.length} times</li>`;
    }
    list.innerHTML += '</ul>';
    
    warning.classList.remove('hidden');
}

// Show empty soundfile warning
function showEmptySoundFileWarning(emptyIndices) {
    const warning = document.getElementById('empty-soundfile-warning');
    const list = document.getElementById('empty-soundfile-list');
    
    list.innerHTML = `<p>${emptyIndices.length} records have empty SoundFile elements.</p>`;
    
    warning.classList.remove('hidden');
}

// Show ambiguous warning
function showAmbiguousWarning(ambiguousCases) {
    const warning = document.getElementById('ambiguous-warning');
    const list = document.getElementById('ambiguous-list');
    
    list.innerHTML = '<ul>';
    ambiguousCases.forEach(item => {
        list.innerHTML += `<li><strong>${item.file}</strong> → base: ${item.chosen_base}</li>`;
    });
    list.innerHTML += '</ul>';
    
    warning.classList.remove('hidden');
}

// Show backup warning modal
function showBackupWarning() {
    const modal = document.getElementById('modal-overlay');
    const modalBody = document.getElementById('modal-body');
    
    modalBody.innerHTML = `
        <h2>⚠️ Create Backup Before Proceeding</h2>
        <p><strong>STRONGLY RECOMMENDED:</strong> Create a backup copy of your audio folder before proceeding.</p>
        <p>File operations cannot be automatically undone.</p>
        <div class="button-row">
            <button id="btn-create-backup" class="btn-warning">Create Backup Now</button>
            <button id="btn-have-backup" class="btn-primary">I Already Have a Backup</button>
            <button id="btn-cancel-backup" class="btn-secondary">Cancel</button>
        </div>
    `;
    
    modal.classList.remove('hidden');
    
    document.getElementById('btn-create-backup').addEventListener('click', createBackup);
    document.getElementById('btn-have-backup').addEventListener('click', () => {
        modal.classList.add('hidden');
        executeOperations();
    });
    document.getElementById('btn-cancel-backup').addEventListener('click', () => {
        modal.classList.add('hidden');
    });
}

// Create backup
async function createBackup() {
    showLoading('Creating backup...');
    
    try {
        const result = await window.pywebview.api.create_backup_with_dialog();
        
        hideLoading();
        
        if (result.success) {
            showSuccess('Backup created successfully at: ' + result.backup_path);
            document.getElementById('modal-overlay').classList.add('hidden');
            executeOperations();
        } else {
            if (result.error !== 'No folder selected') {
                showError('Error creating backup: ' + result.error);
            }
        }
    } catch (error) {
        showError('Error creating backup: ' + error);
        hideLoading();
    }
}

// Execute operations
async function executeOperations() {
    showLoading('Executing file operations...');
    
    try {
        const result = await window.pywebview.api.execute_operations();
        
        if (result.success) {
            showSuccess(`Operations completed successfully!\n${result.completed} operations completed.`);
            
            // Clear queue
            state.operationQueue = [];
        } else {
            showError(`Some operations failed:\n${result.failed} failed\n${result.completed} succeeded`);
        }
    } catch (error) {
        showError('Error executing operations: ' + error);
    } finally {
        hideLoading();
    }
}

// Utility functions
function showLoading(message = 'Processing...') {
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('loading-text').textContent = message;
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

function showError(message) {
    alert('Error: ' + message);
}

function showSuccess(message) {
    alert(message);
}

// Handle empty SoundFile elements
let emptyRecordsData = [];

function showFillSoundFilesModal() {
    const modal = document.getElementById('modal-overlay');
    const modalBody = document.getElementById('modal-body');
    
    showLoading('Loading empty records...');
    
    // Get records with empty SoundFile elements
    window.pywebview.api.get_empty_soundfile_records().then(records => {
        hideLoading();
        console.log('Received empty records:', records);
        emptyRecordsData = records;
        
        if (!records || records.length === 0) {
            modalBody.innerHTML = `
                <h3>No Empty SoundFile Elements</h3>
                <p>No records with empty SoundFile elements were found, or they couldn't be retrieved.</p>
                <div class="button-row">
                    <button onclick="closeModal()" class="btn-secondary">Close</button>
                </div>
            `;
            modal.classList.remove('hidden');
            return;
        }
        
        modalBody.innerHTML = `
            <h3>Fill Empty SoundFile Elements</h3>
            <p>Choose how to fill ${records.length} empty SoundFile element(s):</p>
            
            <div style="margin: 20px 0;">
                <h4>Auto-Generate Formula:</h4>
                <div style="margin: 10px 0;">
                    <label>Template:</label>
                    <select id="soundfile-template" style="width: 100%; padding: 5px; margin: 5px 0;">
                        <option value="{Reference}_{Gloss}.wav">Reference_Gloss.wav</option>
                        <option value="{Reference}_{Phonetic}.wav">Reference_Phonetic.wav</option>
                        <option value="{Reference}.wav">Reference.wav</option>
                        <option value="custom">Custom...</option>
                    </select>
                </div>
                <div id="custom-template-div" style="display: none; margin: 10px 0;">
                    <label>Custom Template:</label>
                    <input type="text" id="custom-template" 
                           placeholder="Use {FieldName} for field values"
                           style="width: 100%; padding: 5px;">
                    <small>Available fields: ${Object.keys(records[0] || {}).filter(k => k !== 'index').join(', ')}</small>
                </div>
                <button onclick="previewSoundFileGeneration()" class="btn-secondary" style="margin: 10px 0;">Preview</button>
                <div id="soundfile-preview" style="max-height: 200px; overflow-y: auto; margin: 10px 0;"></div>
            </div>
            
            <div class="button-row">
                <button onclick="applyAutoGeneration()" class="btn-primary">Apply Auto-Generation</button>
                <button onclick="showManualEntry()" class="btn-secondary">Manual Entry</button>
                <button onclick="closeModal()" class="btn-secondary">Cancel</button>
            </div>
        `;
        
        // Template change handler
        document.getElementById('soundfile-template').addEventListener('change', function(e) {
            const customDiv = document.getElementById('custom-template-div');
            if (e.target.value === 'custom') {
                customDiv.style.display = 'block';
            } else {
                customDiv.style.display = 'none';
            }
        });
        
        modal.classList.remove('hidden');
    }).catch(error => {
        hideLoading();
        console.error('Error loading empty records:', error);
        showError('Error loading empty records: ' + error);
    });
}

function previewSoundFileGeneration() {
    const templateSelect = document.getElementById('soundfile-template');
    let template = templateSelect.value;
    
    if (template === 'custom') {
        template = document.getElementById('custom-template').value;
        if (!template) {
            showError('Please enter a custom template');
            return;
        }
    }
    
    console.log('Generating preview with template:', template);
    console.log('Empty records data:', emptyRecordsData);
    
    if (!emptyRecordsData || emptyRecordsData.length === 0) {
        const previewDiv = document.getElementById('soundfile-preview');
        previewDiv.innerHTML = '<p style="color: red;">No empty records found.</p>';
        return;
    }
    
    // Generate preview locally using the records we already have
    const previewDiv = document.getElementById('soundfile-preview');
    const previews = emptyRecordsData.slice(0, 10).map(record => {
        let generated = template;
        // Replace {FieldName} placeholders with actual values
        for (const [key, value] of Object.entries(record)) {
            if (key !== 'index') {
                const placeholder = `{${key}}`;
                if (generated.includes(placeholder)) {
                    // Clean the value: replace spaces with underscores
                    const cleanValue = (value || '').replace(/\s+/g, '_');
                    generated = generated.replace(new RegExp(`\\{${key}\\}`, 'g'), cleanValue);
                }
            }
        }
        return {
            index: record.index,
            reference: record.Reference || record.index,
            generated: generated
        };
    });
    
    previewDiv.innerHTML = '<h5>Preview (first 10):</h5><ul>' +
        previews.map(p => 
            `<li>Record ${p.reference}: <strong>${p.generated}</strong></li>`
        ).join('') +
        (emptyRecordsData.length > 10 ? `<li><em>...and ${emptyRecordsData.length - 10} more</em></li>` : '') +
        '</ul>';
}

async function applyAutoGeneration() {
    const templateSelect = document.getElementById('soundfile-template');
    let template = templateSelect.value;
    
    if (template === 'custom') {
        template = document.getElementById('custom-template').value;
        if (!template) {
            showError('Please enter a custom template');
            return;
        }
    }
    
    showLoading('Generating SoundFile values...');
    
    try {
        const result = await window.pywebview.api.auto_generate_soundfiles(template);
        hideLoading();
        closeModal();
        
        if (result.success) {
            showSuccess(`Generated ${result.count} SoundFile values`);
            document.getElementById('empty-soundfile-warning').classList.add('hidden');
            checkCanProceed();
        } else {
            showError('Error generating SoundFiles: ' + result.error);
        }
    } catch (error) {
        hideLoading();
        showError('Error: ' + error);
    }
}

function showManualEntry() {
    const modalBody = document.getElementById('modal-body');
    
    modalBody.innerHTML = `
        <h3>Manual Entry for Empty SoundFile Elements</h3>
        <p>Enter SoundFile values for each record:</p>
        <div id="manual-entry-list" style="max-height: 400px; overflow-y: auto;">
            ${emptyRecordsData.map((record, idx) => `
                <div style="margin: 15px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                    <strong>Record ${record.index}:</strong> ${record.Reference || ''} - ${record.Gloss || ''}
                    <br>
                    <input type="text" id="manual-sf-${idx}" 
                           placeholder="Enter filename (e.g., ${record.Reference}_${record.Gloss || 'word'}.wav)"
                           style="width: 100%; padding: 5px; margin-top: 5px;">
                </div>
            `).join('')}
        </div>
        <div class="button-row">
            <button onclick="applyManualEntry()" class="btn-primary">Apply</button>
            <button onclick="showFillSoundFilesModal()" class="btn-secondary">Back</button>
            <button onclick="closeModal()" class="btn-secondary">Cancel</button>
        </div>
    `;
}

async function applyManualEntry() {
    const entries = [];
    
    emptyRecordsData.forEach((record, idx) => {
        const input = document.getElementById(`manual-sf-${idx}`);
        if (input && input.value.trim()) {
            entries.push({
                index: record.index,
                soundfile: input.value.trim()
            });
        }
    });
    
    if (entries.length === 0) {
        showError('Please enter at least one SoundFile value');
        return;
    }
    
    showLoading('Updating SoundFile values...');
    
    try {
        const result = await window.pywebview.api.update_soundfiles_manual(entries);
        hideLoading();
        closeModal();
        
        if (result.success) {
            showSuccess(`Updated ${result.count} SoundFile values`);
            document.getElementById('empty-soundfile-warning').classList.add('hidden');
            checkCanProceed();
        } else {
            showError('Error updating SoundFiles: ' + result.error);
        }
    } catch (error) {
        hideLoading();
        showError('Error: ' + error);
    }
}

function skipEmptyRecords() {
    if (confirm('Skip records with empty SoundFile elements? They will be excluded from processing.')) {
        document.getElementById('empty-soundfile-warning').classList.add('hidden');
        checkCanProceed();
    }
}

function showFixDuplicatesModal() {
    showError('Duplicate fixing functionality not yet implemented. Please continue anyway or fix duplicates manually in the XML.');
}

function skipDuplicates() {
    if (confirm('Continue with duplicate Reference numbers? They will be treated as separate records.')) {
        document.getElementById('duplicate-warning').classList.add('hidden');
        checkCanProceed();
    }
}

function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
}

function checkCanProceed() {
    const hasXML = state.xmlPath !== null;
    const hasAudio = state.audioFolder !== null;
    const noWarnings = document.querySelectorAll('.warning-box:not(.hidden)').length === 0;
    
    const proceedBtn = document.getElementById('btn-proceed-to-step1');
    proceedBtn.disabled = !(hasXML && hasAudio && noWarnings);
}
