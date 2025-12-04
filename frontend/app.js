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
    
    // Step 3 data
    datasheetData: null,
    visibleColumns: [],
    columnOrder: [],
    sortColumn: null,
    sortDirection: 'asc',
    filters: [],
    tentativeAssociations: {},  // {orphanedFile: {recordIdx, field, suffix, newName}}
    tentativeUnlinks: {},  // {originalFile: {recordIdx, field, suffix, unlinkTo}}
    activeModal: null,
    
    // Audio playback
    autoPlayAudio: true,
    currentAudio: null
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

    // Step 3
    document.getElementById('btn-accept-suggestions').addEventListener('click', acceptSuggestions);
    document.getElementById('btn-skip-suggestions').addEventListener('click', () => {
        document.getElementById('step3-suggested').classList.add('hidden');
    });
    document.getElementById('btn-column-settings').addEventListener('click', showColumnSettings);
    document.getElementById('btn-toggle-filters').addEventListener('click', toggleFilters);
    document.getElementById('btn-clear-tentative').addEventListener('click', clearAllTentative);
    document.getElementById('btn-apply-filters').addEventListener('click', applyFilters);
    document.getElementById('btn-clear-filters').addEventListener('click', clearFilters);
    document.getElementById('chk-auto-play').addEventListener('change', (e) => {
        state.autoPlayAudio = e.target.checked;
    });
    document.getElementById('btn-proceed-to-review').addEventListener('click', () => showScreen('review'));

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
    
    // Add suffixes
    for (const suffix in state.suffixes) {
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
        
        suffixList.appendChild(item);
    }
    
    // Add fields (including "whole record")
    const fields = ['Whole Record', ...state.fieldNames];
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
        e.stopPropagation();
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
        
        // Check if this mapping already exists
        if (state.suffixMappings[suffix] && state.suffixMappings[suffix].includes(field)) {
            showError('This mapping already exists');
            return false;
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

// Export mappings to JSON file
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

// Import mappings from JSON file
async function importMappings() {
    showLoading('Importing mappings...');
    
    try {
        const result = await window.pywebview.api.import_mappings();
        
        if (result.success) {
            // Update state with imported mappings
            state.suffixMappings = result.mappings;
            
            // Refresh UI from state
            refreshMappingTiles();
            
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

// Save mappings
async function saveMappings() {
    // Check for unmapped suffixes
    const unmappedSuffixes = [];
    for (const suffix in state.suffixes) {
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
            state.columnOrder = [...state.visibleColumns];
            
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
    let records = state.datasheetData.records;
    if (state.filters.length > 0) {
        records = applyFiltersToRecords(records);
    }
    
    // Apply sorting
    if (state.sortColumn) {
        records = sortRecords(records, state.sortColumn, state.sortDirection);
    }
    
    // Build data rows
    records.forEach((record, recordIdx) => {
        const tr = document.createElement('tr');
        
        state.columnOrder.forEach(field => {
            const td = document.createElement('td');
            td.textContent = record[field] || '';
            td.dataset.recordIdx = recordIdx;
            td.dataset.field = field;
            
            // Frozen Reference column
            if (field === 'Reference') {
                td.classList.add('frozen-col');
            }
            
            // Color coding for mapped fields (including SoundFile for empty suffix)
            const isMappedField = state.datasheetData.mapped_fields.includes(field);
            
            if (isMappedField) {
                const cellStatus = getCellStatus(recordIdx, field);
                if (cellStatus.matched) {
                    td.classList.add(cellStatus.tentative ? 'matched-tentative' : 'matched');
                } else if (cellStatus.expected) {
                    td.classList.add('missing');
                }
                
                // Click to show modal
                td.addEventListener('click', (e) => showCellModal(e, recordIdx, field, cellStatus));
                
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
                    td.addEventListener('drop', (e) => handleDrop(e, recordIdx, field));
                    td.addEventListener('dragleave', handleDragLeave);
                }
            }
            
            tr.appendChild(td);
        });
        
        tbody.appendChild(tr);
    });
}

// Get cell status (matched, expected, tentative)
function getCellStatus(recordIdx, field) {
    const result = {
        matched: false,
        expected: false,
        tentative: false,
        files: []
    };
    
    // Special handling for SoundFile field with empty suffix
    if (field === 'SoundFile' && '' in state.suffixMappings) {
        const key = `${recordIdx}_SoundFile_`;
        
        // Check if expected
        if (state.datasheetData.expected_files[key]) {
            const expectedFile = state.datasheetData.expected_files[key];
            
            // Check if it's being unlinked
            const isUnlinked = state.tentativeUnlinks[expectedFile];
            
            if (!isUnlinked) {
                result.expected = true;
                result.files.push({
                    suffix: '',
                    expected: expectedFile,
                    matched: state.datasheetData.matched_files[key] || null
                });
                
                // Check if matched
                if (state.datasheetData.matched_files[key]) {
                    result.matched = true;
                }
            }
        }
    }
    
    // Check each suffix associated with this field
    for (const suffix in state.suffixMappings) {
        if (state.suffixMappings[suffix].includes(field)) {
            const key = `${recordIdx}_${field}_${suffix}`;
            
            // Check if expected
            if (state.datasheetData.expected_files[key]) {
                const expectedFile = state.datasheetData.expected_files[key];
                
                // Check if it's being unlinked
                const isUnlinked = state.tentativeUnlinks[expectedFile];
                
                if (!isUnlinked) {
                    result.expected = true;
                    result.files.push({
                        suffix: suffix,
                        expected: expectedFile,
                        matched: state.datasheetData.matched_files[key] || null
                    });
                    
                    // Check if matched
                    if (state.datasheetData.matched_files[key]) {
                        result.matched = true;
                    }
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
    const countBadge = document.getElementById('orphaned-count');
    
    list.innerHTML = '';
    
    let orphanedCount = 0;
    
    state.datasheetData.orphaned_files.forEach(filename => {
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
        
        // Click to show details if tentative
        if (tentative) {
            item.addEventListener('click', () => showTentativeDetails(filename, tentative));
        } else {
            // Click to play audio
            item.addEventListener('click', () => {
                if (state.autoPlayAudio) {
                    playAudioFile(filename);
                }
            });
        }
        
        list.appendChild(item);
    });
    
    // Add files that will be unlinked (they become orphaned)
    for (const originalFile in state.tentativeUnlinks) {
        const unlink = state.tentativeUnlinks[originalFile];
        const item = document.createElement('div');
        item.className = 'orphaned-file-item tentative';
        item.style.borderLeft = '3px solid #dc2626';
        item.innerHTML = `
            <div class="new-name">${unlink.unlinkTo} <small>(will be unlinked)</small></div>
            <div class="old-name">${originalFile}</div>
        `;
        item.title = `${originalFile} → ${unlink.unlinkTo} (unlinked)`;
        
        item.addEventListener('click', () => showUnlinkDetails(originalFile, unlink));
        
        list.appendChild(item);
    }
    
    countBadge.textContent = orphanedCount;
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
        showError('No suffix mapping for this field');
        return;
    }
    
    // If multiple suffixes, show picker
    let selectedSuffix;
    if (suffixesForField.length === 1) {
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
            btn.textContent = suffix === '' ? '(no suffix - whole record)' : suffix;
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
            filesHTML += `
                <div class="cell-modal-file ${tentativeClass}">
                    <div style="flex: 1;">
                        <div>${fileInfo.matched}</div>
                        ${isExisting ? '<small style="color: #6b7280;">(existing)</small>' : '<small style="color: var(--primary-color);">(tentative)</small>'}
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
        buildDataSheet();
        renderOrphanedFiles();
        showSuccess('Cleared all tentative changes');
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
            <p>Show, hide, and reorder columns</p>
            <div id="column-list" style="margin: 1rem 0;"></div>
            <div class="button-row">
                <button id="btn-save-columns" class="btn-primary">Save</button>
                <button id="btn-cancel-columns" class="btn-secondary">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const columnList = modal.querySelector('#column-list');
    state.datasheetData.field_names.forEach(field => {
        const div = document.createElement('div');
        div.style.cssText = 'padding: 0.5rem; border: 1px solid #e5e7eb; margin-bottom: 0.25rem; display: flex; align-items: center; gap: 0.5rem;';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = state.visibleColumns.includes(field);
        checkbox.disabled = field === 'Reference';  // Can't hide Reference
        
        const label = document.createElement('span');
        label.textContent = field;
        
        div.appendChild(checkbox);
        div.appendChild(label);
        columnList.appendChild(div);
    });
    
    modal.querySelector('#btn-save-columns').addEventListener('click', async () => {
        const checkboxes = columnList.querySelectorAll('input[type="checkbox"]');
        state.visibleColumns = [];
        state.columnOrder = [];
        
        checkboxes.forEach((cb, idx) => {
            if (cb.checked) {
                const field = state.datasheetData.field_names[idx];
                state.visibleColumns.push(field);
                state.columnOrder.push(field);
            }
        });
        
        // Save to backend
        try {
            await window.pywebview.api.save_datasheet_settings(state.filters, state.visibleColumns);
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
    const fieldNames = ['Reference'];
    const mapped = new Set();
    for (const suffix in state.suffixMappings) state.suffixMappings[suffix].forEach(f => mapped.add(f));
    Array.from(mapped).sort().forEach(n => fieldNames.push(n));
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
    try {
        // Stop current audio if playing
        if (state.currentAudio) {
            state.currentAudio.pause();
            state.currentAudio = null;
        }
        
        // Request audio file from backend
        const result = await window.pywebview.api.get_audio_file_path(filename);
        
        if (result.success) {
            const url = result.url || encodeURI(`file://${result.path}`);
            const audio = new Audio(url);
            audio.preload = 'auto';
            state.currentAudio = audio;
            
            audio.play().catch(error => {
                console.error('Error playing audio:', error);
                showError(`Could not play audio file. URL: ${url}. Trying alternate method...`);
                // Fallback: request data URL and play
                fallbackPlayAudio(filename);
            });
            audio.addEventListener('error', (e) => {
                console.error('Audio element error', e);
                showError(`Audio element error. URL: ${url}. Trying alternate method...`);
                fallbackPlayAudio(filename);
            });
            
            audio.onended = () => {
                state.currentAudio = null;
            };
        } else {
            showError('Could not find audio file: ' + filename);
        }
    } catch (error) {
        console.error('Error playing audio:', error);
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

async function fallbackPlayAudio(filename) {
    try {
        const data = await window.pywebview.api.get_audio_data_url(filename);
        if (data && data.success && data.url) {
            const audio = new Audio(data.url);
            audio.preload = 'auto';
            state.currentAudio = audio;
            audio.play().catch(err => {
                console.error('Fallback audio play failed:', err);
                showError('Fallback audio play failed');
            });
            audio.onended = () => { state.currentAudio = null; };
        } else {
            showError('Unable to build audio data URL');
        }
    } catch (e) {
        console.error('Error in fallback audio:', e);
        showError('Error in fallback audio: ' + e.message);
    }
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
