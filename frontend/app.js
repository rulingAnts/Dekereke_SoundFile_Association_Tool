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
    operationQueue: [],
    currentScreen: 'setup'
};

// Wait for pywebview to be ready
window.addEventListener('pywebviewready', function() {
    console.log('pywebview ready');
    initializeApp();
});

// Initialize application
function initializeApp() {
    setupEventListeners();
    showScreen('setup');
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
    document.getElementById('btn-save-conditions').addEventListener('click', saveConditions);
    document.getElementById('btn-proceed-to-step3').addEventListener('click', () => showScreen('step3'));

    // Step 3
    document.getElementById('btn-accept-suggestions').addEventListener('click', acceptSuggestions);
    document.getElementById('btn-skip-to-manual').addEventListener('click', skipToManual);
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

    state.currentScreen = screenName;
}

// Select XML file
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
    
    // Create collapsible sections for each field
    fieldsWithMappings.forEach(field => {
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
        `;
        
        // Value input
        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.className = 'condition-value-input';
        valueInput.value = condition.value || '';
        valueInput.placeholder = 'value';
        
        // Show/hide value input based on operator
        const updateValueVisibility = () => {
            const needsValue = !['not_empty', 'empty'].includes(operatorSelect.value);
            valueInput.style.display = needsValue ? 'inline-block' : 'none';
        };
        updateValueVisibility();
        
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
        fieldSelect.addEventListener('change', (e) => {
            condition.field = e.target.value;
        });
        
        operatorSelect.addEventListener('change', (e) => {
            condition.operator = e.target.value;
            updateValueVisibility();
        });
        
        valueInput.addEventListener('input', (e) => {
            condition.value = e.target.value;
        });
        
        conditionDiv.appendChild(fieldSelect);
        conditionDiv.appendChild(document.createTextNode(' '));
        conditionDiv.appendChild(operatorSelect);
        conditionDiv.appendChild(document.createTextNode(' '));
        conditionDiv.appendChild(valueInput);
        conditionDiv.appendChild(document.createTextNode(' '));
        conditionDiv.appendChild(removeBtn);
        
        container.appendChild(conditionDiv);
    });
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

// Save conditions
async function saveConditions() {
    showLoading('Saving conditions...');
    
    try {
        // Collect expectation settings for each field
        const fieldsWithMappings = new Set();
        for (const suffix in state.suffixMappings) {
            state.suffixMappings[suffix].forEach(field => fieldsWithMappings.add(field));
        }
        
        fieldsWithMappings.forEach(field => {
            const selectedOption = document.querySelector(`input[name="expect-${field}"]:checked`);
            if (selectedOption) {
                const expectationType = selectedOption.value;
                
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
        
        // Enable Step 3 navigation
        document.getElementById('nav-step3').disabled = false;
        
        showSuccess('Conditions saved successfully');
    } catch (error) {
        showError('Error saving conditions: ' + error);
    } finally {
        hideLoading();
    }
}

// Accept suggestions
async function acceptSuggestions() {
    // Get checked suggestions
    const checkboxes = document.querySelectorAll('#suggested-matches-list input[type="checkbox"]:checked');
    
    checkboxes.forEach(checkbox => {
        const suggestion = JSON.parse(checkbox.dataset.suggestion);
        
        // Add to operation queue
        state.operationQueue.push({
            type: 'rename',
            old_filename: suggestion.orphan,
            new_filename: suggestion.expected.filename,
            reference: suggestion.expected.reference,
            field: suggestion.expected.field,
            reason: 'Fuzzy match accepted'
        });
    });
    
    // Move to manual matching
    skipToManual();
}

// Skip to manual matching
function skipToManual() {
    document.getElementById('step3a-container').classList.add('hidden');
    document.getElementById('step3b-container').classList.remove('hidden');
    
    // Build manual matching UI
    buildManualMatchingUI();
}

// Build manual matching UI
async function buildManualMatchingUI() {
    showLoading('Loading matching interface...');
    
    try {
        const result = await window.pywebview.api.identify_mismatches();
        
        if (result.success) {
            const missingList = document.getElementById('missing-files-list');
            const orphanedList = document.getElementById('orphaned-files-list');
            
            missingList.innerHTML = '';
            orphanedList.innerHTML = '';
            
            // Add missing files
            result.missing.forEach(item => {
                const div = document.createElement('div');
                div.className = 'match-item';
                div.dataset.filename = item.filename;
                div.innerHTML = `
                    <strong>${item.filename}</strong><br>
                    <small>Record ${item.reference} - ${item.field}</small>
                `;
                missingList.appendChild(div);
            });
            
            // Add orphaned files
            result.orphaned.forEach(filename => {
                const div = document.createElement('div');
                div.className = 'match-item';
                div.dataset.filename = filename;
                div.innerHTML = `<strong>${filename}</strong>`;
                div.draggable = true;
                
                div.addEventListener('dragstart', (e) => {
                    draggedElement = e.target;
                    e.dataTransfer.effectAllowed = 'move';
                });
                
                orphanedList.appendChild(div);
            });
        } else {
            showError('Error identifying mismatches: ' + result.error);
        }
    } catch (error) {
        showError('Error building matching UI: ' + error);
    } finally {
        hideLoading();
    }
}

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
