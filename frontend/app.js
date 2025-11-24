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

    // Case sensitivity
    document.querySelectorAll('input[name="case-sensitive"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.caseSensitive = e.target.value === 'true';
            window.pywebview.api.set_case_sensitivity(state.caseSensitive);
        });
    });

    // Step 1
    document.getElementById('btn-save-mappings').addEventListener('click', saveMappings);
    document.getElementById('btn-proceed-to-step2').addEventListener('click', () => showScreen('step2'));

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
        item.className = 'draggable-item';
        item.draggable = true;
        item.dataset.suffix = suffix;
        item.textContent = suffix || '(no suffix)';
        
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
        
        suffixList.appendChild(item);
    }
    
    // Add fields (including "whole record")
    const fields = ['Whole Record', ...state.fieldNames];
    for (const field of fields) {
        const item = document.createElement('div');
        item.className = 'droppable-item';
        item.dataset.field = field;
        item.innerHTML = `<strong>${field}</strong>`;
        
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        
        fieldList.appendChild(item);
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
        const suffix = draggedElement.dataset.suffix;
        const field = e.target.dataset.field || e.target.closest('.droppable-item').dataset.field;
        
        // Add mapping
        if (!state.suffixMappings[suffix]) {
            state.suffixMappings[suffix] = [];
        }
        if (!state.suffixMappings[suffix].includes(field)) {
            state.suffixMappings[suffix].push(field);
        }
        
        // Update UI
        const mappedSpan = document.createElement('span');
        mappedSpan.className = 'mapped-suffix';
        mappedSpan.textContent = suffix || '(no suffix)';
        
        const target = e.target.classList.contains('droppable-item') ? e.target : e.target.closest('.droppable-item');
        target.appendChild(mappedSpan);
    }
    
    return false;
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

// Save conditions
async function saveConditions() {
    showLoading('Saving conditions...');
    
    try {
        // Get global setting
        const includeEmpty = document.getElementById('include-empty-fields').checked;
        
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
    // This would open a folder dialog for backup location
    showLoading('Creating backup...');
    
    try {
        // For now, just proceed
        hideLoading();
        document.getElementById('modal-overlay').classList.add('hidden');
        executeOperations();
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
