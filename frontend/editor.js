// ============================================
// PRODUCTION-READY PDF TEXT EDITOR
// With Proper Text Extraction & Positioning
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
        wrapper.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
        
        // Create canvas
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.display = 'block';
        canvas.style.backgroundColor = 'white';
        
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
        showStatus('Extracting text from PDF...');
        const response = await fetch(`${API_URL}/pages/${pageNum}/text`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        currentPageBlocks = data.blocks || [];
        
        console.log(`Found ${currentPageBlocks.length} text blocks`);
        if (currentPageBlocks.length > 0) {
            console.log('Sample block:', currentPageBlocks[0]);
            showStatus(`Found ${currentPageBlocks.length} text blocks! Turn on Edit Mode to edit.`);
        } else {
            showStatus('⚠️ No text found. Your PDF might be a scanned image.');
        }
        
        renderTextOverlay();
        
    } catch (error) {
        console.error('Error loading text blocks:', error);
        currentPageBlocks = [];
        renderTextOverlay();
        showStatus('Error extracting text. Try a different PDF.');
    }
}

function renderTextOverlay() {
    const wrapper = window.currentWrapper;
    if (!wrapper) return;
    
    // Remove existing text layer
    const existingLayer = wrapper.querySelector('.text-layer');
    if (existingLayer) existingLayer.remove();
    
    if (!currentPageBlocks || currentPageBlocks.length === 0) {
        const noTextMsg = document.createElement('div');
        noTextMsg.className = 'text-layer';
        noTextMsg.style.position = 'absolute';
        noTextMsg.style.top = '50%';
        noTextMsg.style.left = '50%';
        noTextMsg.style.transform = 'translate(-50%, -50%)';
        noTextMsg.style.color = '#e94560';
        noTextMsg.style.background = 'rgba(0,0,0,0.8)';
        noTextMsg.style.padding = '15px 25px';
        noTextMsg.style.borderRadius = '8px';
        noTextMsg.style.fontSize = '14px';
        noTextMsg.style.zIndex = '1000';
        noTextMsg.style.whiteSpace = 'nowrap';
        noTextMsg.style.fontWeight = 'bold';
        noTextMsg.innerHTML = '⚠️ No editable text found - This PDF may be a scanned image';
        wrapper.appendChild(noTextMsg);
        return;
    }
    
    const textLayer = document.createElement('div');
    textLayer.className = 'text-layer';
    textLayer.style.position = 'absolute';
    textLayer.style.top = '0';
    textLayer.style.left = '0';
    textLayer.style.width = '100%';
    textLayer.style.height = '100%';
    textLayer.style.pointerEvents = editMode ? 'auto' : 'none';
    
    const canvas = wrapper.querySelector('canvas');
    const canvasRect = canvas.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    
    // Calculate scale between PDF coordinates and canvas
    const scaleX = canvas.width / 612; // PDF standard width is 612 points
    const scaleY = canvas.height / 792; // PDF standard height is 792 points
    
    currentPageBlocks.forEach((block, idx) => {
        const textDiv = document.createElement('div');
        textDiv.className = 'editable-text';
        textDiv.setAttribute('data-id', block.id);
        textDiv.setAttribute('data-original-text', block.text);
        textDiv.setAttribute('data-bbox', JSON.stringify(block.bbox));
        
        // Position using bbox with proper scaling
        const x = block.bbox[0] * scaleX;
        const y = block.bbox[1] * scaleY;
        const width = (block.bbox[2] - block.bbox[0]) * scaleX;
        const height = (block.bbox[3] - block.bbox[1]) * scaleY;
        
        textDiv.style.position = 'absolute';
        textDiv.style.left = `${x}px`;
        textDiv.style.top = `${y}px`;
        textDiv.style.width = `${Math.max(width, 50)}px`;
        textDiv.style.height = `${Math.max(height, 20)}px`;
        textDiv.style.fontSize = `${Math.max(block.size * scaleY, 10)}px`;
        textDiv.style.fontFamily = 'Arial, sans-serif';
        textDiv.style.lineHeight = `${block.size * scaleY}px`;
        textDiv.style.color = '#000000';
        textDiv.style.backgroundColor = editMode ? 'rgba(233, 69, 96, 0.15)' : 'transparent';
        textDiv.style.border = editMode ? '1px dashed #e94560' : 'none';
        textDiv.style.borderRadius = '3px';
        textDiv.style.padding = '2px 4px';
        textDiv.style.margin = '-2px -4px';
        textDiv.style.whiteSpace = 'pre-wrap';
        textDiv.style.wordBreak = 'break-word';
        textDiv.style.overflow = 'auto';
        textDiv.style.cursor = editMode ? 'text' : 'default';
        textDiv.style.transition = 'all 0.2s ease';
        
        textDiv.innerHTML = block.text;
        
        if (editMode) {
            textDiv.contentEditable = 'true';
            
            textDiv.addEventListener('mouseenter', () => {
                textDiv.style.backgroundColor = 'rgba(233, 69, 96, 0.3)';
                textDiv.style.border = '2px solid #e94560';
                textDiv.style.transform = 'scale(1.01)';
                textDiv.style.zIndex = '100';
            });
            
            textDiv.addEventListener('mouseleave', () => {
                if (!textDiv.classList.contains('editing')) {
                    textDiv.style.backgroundColor = 'rgba(233, 69, 96, 0.15)';
                    textDiv.style.border = '1px dashed #e94560';
                    textDiv.style.transform = 'scale(1)';
                }
            });
            
            textDiv.addEventListener('focus', () => {
                textDiv.classList.add('editing');
                textDiv.style.backgroundColor = '#ffffff';
                textDiv.style.border = '2px solid #4ecdc4';
                textDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                textDiv.style.zIndex = '101';
            });
            
            textDiv.addEventListener('blur', async (e) => {
                textDiv.classList.remove('editing');
                const newText = e.target.innerText.trim();
                const oldText = e.target.getAttribute('data-original-text');
                
                if (newText !== oldText && newText !== '') {
                    activeEdits[block.id] = {
                        id: block.id,
                        page: block.page,
                        bbox: block.bbox,
                        old_text: oldText,
                        new_text: newText,
                        size: block.size,
                        font: block.font
                    };
                    textDiv.style.backgroundColor = 'rgba(78, 205, 196, 0.3)';
                    textDiv.style.border = '2px solid #4ecdc4';
                    
                    const oldPreview = oldText.substring(0, 30);
                    const newPreview = newText.substring(0, 30);
                    showStatus(`✓ Changed: "${oldPreview}${oldText.length > 30 ? '...' : ''}" → "${newPreview}${newText.length > 30 ? '...' : ''}"`);
                    
                    // Update stored text
                    e.target.setAttribute('data-original-text', newText);
                } else {
                    textDiv.style.backgroundColor = 'rgba(233, 69, 96, 0.15)';
                    textDiv.style.border = '1px dashed #e94560';
                }
            });
            
            textDiv.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    document.execCommand('insertLineBreak');
                }
            });
        }
        
        textLayer.appendChild(textDiv);
    });
    
    wrapper.appendChild(textLayer);
    
    if (editMode && currentPageBlocks.length > 0) {
        showStatus(`✅ ${currentPageBlocks.length} text blocks found! Click any blue-highlighted text to edit.`);
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
    nav.style.padding = '10px 20px';
    nav.style.background = 'rgba(22, 30, 53, 0.95)';
    nav.style.borderRadius = '40px';
    nav.style.backdropFilter = 'blur(10px)';
    nav.style.position = 'sticky';
    nav.style.top = '70px';
    nav.style.zIndex = '999';
    
    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '◀ Previous';
    prevBtn.style.padding = '8px 16px';
    prevBtn.style.background = '#0f3460';
    prevBtn.style.border = 'none';
    prevBtn.style.color = 'white';
    prevBtn.style.borderRadius = '6px';
    prevBtn.style.cursor = 'pointer';
    prevBtn.style.fontSize = '14px';
    prevBtn.style.transition = 'all 0.2s';
    prevBtn.onmouseenter = () => prevBtn.style.background = '#e94560';
    prevBtn.onmouseleave = () => prevBtn.style.background = '#0f3460';
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
    pageDisplay.style.fontSize = '14px';
    
    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = 'Next ▶';
    nextBtn.style.padding = '8px 16px';
    nextBtn.style.background = '#0f3460';
    nextBtn.style.border = 'none';
    nextBtn.style.color = 'white';
    nextBtn.style.borderRadius = '6px';
    nextBtn.style.cursor = 'pointer';
    nextBtn.style.fontSize = '14px';
    nextBtn.style.transition = 'all 0.2s';
    nextBtn.onmouseenter = () => nextBtn.style.background = '#e94560';
    nextBtn.onmouseleave = () => nextBtn.style.background = '#0f3460';
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
        prevBtn.style.cursor = currentPage === 1 ? 'not-allowed' : 'pointer';
        nextBtn.style.cursor = currentPage === totalPages ? 'not-allowed' : 'pointer';
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
        showStatus('✏️ EDIT MODE ACTIVE - Click any blue-highlighted text to edit it');
        
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
    document.body.style.transition = 'opacity 0.2s';
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
    
    // Escape to exit edit mode
    if (e.key === 'Escape' && editMode) {
        editModeBtn.click();
    }
    
    // Arrow keys for page navigation
    if (pdfDoc) {
        if (e.key === 'ArrowLeft' && currentPage > 1) {
            currentPage--;
            loadPage(currentPage);
            const pageDisplay = document.querySelector('#page-display');
            if (pageDisplay) pageDisplay.textContent = `Page ${currentPage} of ${totalPages}`;
        } else if (e.key === 'ArrowRight' && currentPage < totalPages) {
            currentPage++;
            loadPage(currentPage);
            const pageDisplay = document.querySelector('#page-display');
            if (pageDisplay) pageDisplay.textContent = `Page ${currentPage} of ${totalPages}`;
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

// Add some CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes saveSuccess {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); background: #4ecdc4; }
        100% { transform: scale(1); }
    }
    .save-success {
        animation: saveSuccess 0.5s ease;
    }
    .editable-text::-webkit-scrollbar {
        width: 4px;
        height: 4px;
    }
    .editable-text::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 2px;
    }
    .editable-text::-webkit-scrollbar-thumb {
        background: #e94560;
        border-radius: 2px;
    }
`;
document.head.appendChild(style);
