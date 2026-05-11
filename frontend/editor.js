// ============================================
// PRODUCTION-READY PDF TEXT EDITOR
// Works on both localhost and Render.com
// ============================================

// Auto-detect API URL (works locally and on Render)
const API_URL = window.location.origin;

// Configuration
let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let editMode = false;
let activeEdits = {};
let currentPageBlocks = [];
let scale = 1.5; // Zoom level for better quality
let currentFileName = '';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// ============================================
// DOM ELEMENTS
// ============================================
const pdfUpload = document.getElementById('pdf-upload');
const editModeBtn = document.getElementById('edit-mode-btn');
const saveBtn = document.getElementById('save-btn');
const statusDiv = document.getElementById('status');
const container = document.getElementById('pdf-container');

// ============================================
// HELPER FUNCTIONS
// ============================================

function showStatus(message, isSaving = false) {
    statusDiv.textContent = message;
    if (isSaving) {
        statusDiv.classList.add('saving');
    } else {
        statusDiv.classList.remove('saving');
    }
    
    // Auto-clear status after 3 seconds for non-saving messages
    if (!isSaving) {
        setTimeout(() => {
            if (statusDiv.textContent === message) {
                statusDiv.textContent = 'Ready';
                statusDiv.classList.remove('saving');
            }
        }, 3000);
    }
}

function showError(message) {
    statusDiv.textContent = `❌ ${message}`;
    statusDiv.style.color = '#ff6b6b';
    setTimeout(() => {
        if (statusDiv.textContent === `❌ ${message}`) {
            statusDiv.textContent = 'Ready';
            statusDiv.style.color = '#4ecdc4';
        }
    }, 4000);
}

// ============================================
// PDF RENDERING FUNCTIONS
// ============================================

async function loadPage(pageNum) {
    if (!pdfDoc) return;
    
    container.innerHTML = '';
    showStatus('Loading page...');
    
    try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: scale });
        
        // Create wrapper for this page
        const wrapper = document.createElement('div');
        wrapper.className = 'pdf-page-wrapper';
        wrapper.style.position = 'relative';
        wrapper.style.marginBottom = '20px';
        
        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.display = 'block';
        
        // Render PDF page to canvas
        const context = canvas.getContext('2d');
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        
        await page.render(renderContext).promise;
        
        wrapper.appendChild(canvas);
        container.appendChild(wrapper);
        
        // Store wrapper reference for text layer
        window.currentWrapper = wrapper;
        window.currentViewport = viewport;
        
        showStatus(`Page ${pageNum} of ${totalPages} loaded`);
        
        // Load text blocks for this page
        await loadTextBlocks(pageNum);
        
    } catch (error) {
        console.error('Error loading page:', error);
        showError('Failed to load PDF page');
    }
}

async function loadTextBlocks(pageNum) {
    try {
        const response = await fetch(`${API_URL}/pages/${pageNum}/text`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        currentPageBlocks = data.blocks || [];
        renderTextOverlay();
        
    } catch (error) {
        console.error('Error loading text blocks:', error);
        // Don't show error to user - text layer is optional
        currentPageBlocks = [];
        renderTextOverlay();
    }
}

function renderTextOverlay() {
    const wrapper = window.currentWrapper;
    if (!wrapper) return;
    
    // Remove existing text layer
    const existingLayer = wrapper.querySelector('.text-layer');
    if (existingLayer) existingLayer.remove();
    
    if (currentPageBlocks.length === 0) {
        // No editable text found
        if (editMode) {
            const noTextMsg = document.createElement('div');
            noTextMsg.className = 'text-layer';
            noTextMsg.style.position = 'absolute';
            noTextMsg.style.top = '50%';
            noTextMsg.style.left = '50%';
            noTextMsg.style.transform = 'translate(-50%, -50%)';
            noTextMsg.style.color = '#e94560';
            noTextMsg.style.background = 'rgba(0,0,0,0.7)';
            noTextMsg.style.padding = '10px 20px';
            noTextMsg.style.borderRadius = '8px';
            noTextMsg.style.fontSize = '14px';
            noTextMsg.style.whiteSpace = 'nowrap';
            noTextMsg.innerHTML = '⚠️ No editable text found on this page';
            wrapper.appendChild(noTextMsg);
        }
        return;
    }
    
    // Create new text layer
    const textLayer = document.createElement('div');
    textLayer.className = 'text-layer';
    textLayer.style.position = 'absolute';
    textLayer.style.top = '0';
    textLayer.style.left = '0';
    textLayer.style.width = '100%';
    textLayer.style.height = '100%';
    textLayer.style.pointerEvents = editMode ? 'auto' : 'none';
    
    currentPageBlocks.forEach((block, index) => {
        const textDiv = document.createElement('div');
        textDiv.className = 'editable-text';
        textDiv.setAttribute('data-id', block.id);
        textDiv.setAttribute('data-bbox', JSON.stringify(block.bbox));
        textDiv.setAttribute('data-original-text', block.text);
        textDiv.setAttribute('data-size', block.size);
        textDiv.setAttribute('data-font', block.font || 'helv');
        textDiv.setAttribute('data-page', block.page);
        
        // Position using bbox coordinates
        // Note: PDF coordinates are from bottom-left, need to convert for CSS
        const viewport = window.currentViewport;
        const x = block.bbox[0];
        const y = viewport.height - block.bbox[3]; // Convert from bottom-left to top-left
        const width = block.bbox[2] - block.bbox[0];
        const height = block.bbox[3] - block.bbox[1];
        
        textDiv.style.position = 'absolute';
        textDiv.style.left = `${x}px`;
        textDiv.style.top = `${y}px`;
        textDiv.style.width = `${width}px`;
        textDiv.style.height = `${height}px`;
        textDiv.style.fontSize = `${block.size}px`;
        textDiv.style.lineHeight = `${block.size}px`;
        textDiv.style.fontFamily = block.font === 'bold' ? 'Arial Black, sans-serif' : 'Arial, sans-serif';
        textDiv.style.fontWeight = block.flags === 2**0 ? 'bold' : 'normal';
        textDiv.style.fontStyle = block.flags === 2**1 ? 'italic' : 'normal';
        
        // Display text
        textDiv.innerHTML = block.text;
        
        // Make editable in edit mode
        if (editMode) {
            textDiv.contentEditable = 'true';
            textDiv.setAttribute('data-original-text', block.text);
            
            // Handle text editing
            textDiv.addEventListener('blur', async (e) => {
                const newText = e.target.innerText.trim();
                const oldText = e.target.getAttribute('data-original-text');
                
                if (newText !== oldText && newText !== '') {
                    // Store edit
                    activeEdits[block.id] = {
                        id: block.id,
                        page: block.page,
                        bbox: block.bbox,
                        old_text: oldText,
                        new_text: newText,
                        size: block.size,
                        font: block.font
                    };
                    
                    // Visual feedback
                    textDiv.style.background = 'rgba(78, 205, 196, 0.2)';
                    textDiv.style.outline = '2px solid #4ecdc4';
                    
                    showStatus(`✏️ Text changed. Click "Save Changes" to apply.`);
                    
                    // Update stored original text
                    textDiv.setAttribute('data-original-text', newText);
                } else if (newText === '') {
                    // Restore original if empty
                    textDiv.innerHTML = oldText;
                    showStatus('⚠️ Text cannot be empty');
                }
            });
            
            // Handle Enter key (create new line instead of submitting)
            textDiv.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    document.execCommand('insertLineBreak');
                }
            });
            
            // Highlight on hover
            textDiv.addEventListener('mouseenter', () => {
                if (!textDiv.classList.contains('editing')) {
                    textDiv.style.outline = '1px dashed #e94560';
                }
            });
            
            textDiv.addEventListener('mouseleave', () => {
                if (!textDiv.classList.contains('editing')) {
                    textDiv.style.outline = 'none';
                }
            });
        }
        
        textLayer.appendChild(textDiv);
    });
    
    wrapper.appendChild(textLayer);
    
    if (editMode && currentPageBlocks.length > 0) {
        showStatus(`✅ ${currentPageBlocks.length} text blocks ready for editing`);
    }
}

// ============================================
// SAVE FUNCTIONALITY
// ============================================

async function saveChanges() {
    if (Object.keys(activeEdits).length === 0) {
        showStatus('No changes to save');
        return;
    }
    
    showStatus(`💾 Saving ${Object.keys(activeEdits).length} change(s)...`, true);
    saveBtn.disabled = true;
    saveBtn.style.opacity = '0.5';
    
    try {
        // Save each edit sequentially
        for (const [id, edit] of Object.entries(activeEdits)) {
            const response = await fetch(`${API_URL}/edit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    page: edit.page,
                    bbox: edit.bbox,
                    old_text: edit.old_text,
                    new_text: edit.new_text,
                    size: edit.size,
                    font: edit.font
                })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to save edit ${id}`);
            }
        }
        
        // Download the edited PDF
        const downloadResponse = await fetch(`${API_URL}/download`);
        
        if (!downloadResponse.ok) {
            throw new Error('Failed to download edited PDF');
        }
        
        const blob = await downloadResponse.blob();
        const url = URL.createObjectURL(blob);
        
        // Reload PDF to show changes
        const loadingTask = pdfjsLib.getDocument(url);
        pdfDoc = await loadingTask.promise;
        totalPages = pdfDoc.numPages;
        
        // Reload current page
        await loadPage(currentPage);
        
        // Clear active edits
        activeEdits = {};
        
        // Trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = `edited_${currentFileName || 'document'}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showStatus('✅ Changes saved and PDF downloaded!');
        
        // Success animation
        saveBtn.classList.add('save-success');
        setTimeout(() => {
            saveBtn.classList.remove('save-success');
        }, 500);
        
    } catch (error) {
        console.error('Save error:', error);
        showError(`Save failed: ${error.message}`);
    } finally {
        saveBtn.disabled = false;
        saveBtn.style.opacity = '1';
    }
}

// ============================================
// PAGE NAVIGATION
// ============================================

function addPageNavigation() {
    // Remove existing nav if present
    const existingNav = document.querySelector('.page-nav');
    if (existingNav) existingNav.remove();
    
    // Create navigation bar
    const nav = document.createElement('div');
    nav.className = 'page-nav';
    nav.style.display = 'flex';
    nav.style.justifyContent = 'center';
    nav.style.alignItems = 'center';
    nav.style.gap = '15px';
    nav.style.margin = '20px auto';
    nav.style.padding = '10px';
    nav.style.background = 'rgba(22, 30, 53, 0.95)';
    nav.style.borderRadius = '40px';
    nav.style.backdropFilter = 'blur(10px)';
    
    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '◀ Previous';
    prevBtn.style.padding = '8px 16px';
    prevBtn.style.background = '#0f3460';
    prevBtn.style.border = 'none';
    prevBtn.style.color = 'white';
    prevBtn.style.borderRadius = '6px';
    prevBtn.style.cursor = 'pointer';
    prevBtn.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            loadPage(currentPage);
            updateNavDisplay();
        }
    };
    
    const pageDisplay = document.createElement('span');
    pageDisplay.id = 'page-display';
    pageDisplay.style.color = 'white';
    pageDisplay.style.fontWeight = 'bold';
    
    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = 'Next ▶';
    nextBtn.style.padding = '8px 16px';
    nextBtn.style.background = '#0f3460';
    nextBtn.style.border = 'none';
    nextBtn.style.color = 'white';
    nextBtn.style.borderRadius = '6px';
    nextBtn.style.cursor = 'pointer';
    nextBtn.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadPage(currentPage);
            updateNavDisplay();
        }
    };
    
    nav.appendChild(prevBtn);
    nav.appendChild(pageDisplay);
    nav.appendChild(nextBtn);
    
    container.parentNode.insertBefore(nav, container);
    
    function updateNavDisplay() {
        pageDisplay.textContent = `Page ${currentPage} of ${totalPages}`;
        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage === totalPages;
        prevBtn.style.opacity = currentPage === 1 ? '0.5' : '1';
        nextBtn.style.opacity = currentPage === totalPages ? '0.5' : '1';
    }
    
    updateNavDisplay();
}

// ============================================
// FILE UPLOAD HANDLER
// ============================================

pdfUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validate file type
    if (file.type !== 'application/pdf') {
        showError('Please upload a valid PDF file');
        return;
    }
    
    // Validate file size (max 10MB for free tier)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        showError('File too large. Maximum size is 10MB for free tier');
        return;
    }
    
    currentFileName = file.name.replace('.pdf', '');
    
    showStatus('📤 Uploading PDF...', true);
    
    const formData = new FormData();
    formData.append('pdf', file);
    
    try {
        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Upload failed: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.status === 'success') {
            // Load PDF with pdf.js
            const arrayBuffer = await file.arrayBuffer();
            pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            totalPages = pdfDoc.numPages;
            currentPage = 1;
            
            await loadPage(currentPage);
            addPageNavigation();
            
            showStatus(`✅ PDF loaded: ${file.name} (${totalPages} page${totalPages > 1 ? 's' : ''})`);
            editModeBtn.disabled = false;
            editModeBtn.style.opacity = '1';
        } else {
            throw new Error(result.message || 'Upload failed');
        }
        
    } catch (error) {
        console.error('Upload error:', error);
        showError(`Upload failed: ${error.message}`);
        editModeBtn.disabled = true;
        editModeBtn.style.opacity = '0.5';
    }
});

// ============================================
// EDIT MODE TOGGLE
// ============================================

editModeBtn.addEventListener('click', () => {
    if (!pdfDoc) {
        showError('Please upload a PDF first');
        return;
    }
    
    editMode = !editMode;
    
    if (editMode) {
        editModeBtn.classList.add('active');
        saveBtn.style.display = 'inline-block';
        showStatus('✏️ EDIT MODE ACTIVE - Click any text to edit it');
        
        // Refresh text layer with edit mode enabled
        if (currentPageBlocks.length > 0) {
            renderTextOverlay();
        } else {
            loadTextBlocks(currentPage);
        }
    } else {
        editModeBtn.classList.remove('active');
        saveBtn.style.display = 'none';
        showStatus('Edit mode disabled');
        
        // Refresh text layer without edit mode
        renderTextOverlay();
    }
});

// ============================================
// SAVE BUTTON HANDLER
// ============================================

saveBtn.addEventListener('click', saveChanges);

// ============================================
// DRAG AND DROP SUPPORT
// ============================================

// Prevent default drag behaviors
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Highlight drop zone when dragging over
['dragenter', 'dragover'].forEach(eventName => {
    document.body.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, unhighlight, false);
});

function highlight(e) {
    document.body.style.opacity = '0.8';
}

function unhighlight(e) {
    document.body.style.opacity = '1';
}

// Handle dropped files
document.body.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    
    if (files.length > 0 && files[0].type === 'application/pdf') {
        pdfUpload.files = files;
        // Trigger change event
        const event = new Event('change', { bubbles: true });
        pdfUpload.dispatchEvent(event);
    } else {
        showError('Please drop a valid PDF file');
    }
});

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

document.addEventListener('keydown', (e) => {
    // Ctrl+E to toggle edit mode
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        editModeBtn.click();
    }
    
    // Ctrl+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (editMode && Object.keys(activeEdits).length > 0) {
            saveChanges();
        }
    }
    
    // Arrow keys for page navigation
    if (pdfDoc) {
        if (e.key === 'ArrowLeft' && currentPage > 1) {
            currentPage--;
            loadPage(currentPage);
        } else if (e.key === 'ArrowRight' && currentPage < totalPages) {
            currentPage++;
            loadPage(currentPage);
        }
    }
});

// ============================================
// INITIALIZATION
// ============================================

// Disable edit mode button until PDF is loaded
editModeBtn.disabled = true;
editModeBtn.style.opacity = '0.5';
saveBtn.style.display = 'none';

console.log('PDF Text Editor initialized');
console.log(`API URL: ${API_URL}`);
showStatus('Ready - Upload a PDF to start editing');
