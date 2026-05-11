let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let editMode = false;
let activeEdits = {};
let currentPageBlocks = [];

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

document.getElementById('pdf-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('pdf', file);
    
    showStatus('Uploading...');
    
    const response = await fetch('/upload', { method: 'POST', body: formData });
    if (response.ok) {
        const arrayBuffer = await file.arrayBuffer();
        pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        totalPages = pdfDoc.numPages;
        await loadPage(1);
        await loadTextBlocks(1);
        showStatus('PDF loaded. Click "Edit Text Mode" to start editing!');
    }
});

document.getElementById('edit-mode-btn').addEventListener('click', () => {
    editMode = !editMode;
    document.getElementById('edit-mode-btn').classList.toggle('active', editMode);
    document.getElementById('save-btn').style.display = editMode ? 'inline-block' : 'none';
    
    const message = editMode ? 'Edit mode ON - Click any text to edit it' : 'Edit mode OFF';
    showStatus(message);
    
    if (!editMode) {
        // Exit editing mode - remove all editing overlays
        document.querySelectorAll('.editable-text').forEach(el => {
            if (!el.classList.contains('editing')) {
                // Keep non-editing ones
            }
        });
    }
});

document.getElementById('save-btn').addEventListener('click', async () => {
    showStatus('Saving changes...', 'saving');
    
    for (const [id, edit] of Object.entries(activeEdits)) {
        await fetch('/edit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                page: edit.page,
                bbox: edit.bbox,
                old_text: edit.old_text,
                new_text: edit.new_text,
                size: edit.size,
                font: edit.font
            })
        });
    }
    
    // Reload PDF to show changes
    const downloadResponse = await fetch('/download');
    const blob = await downloadResponse.blob();
    const url = URL.createObjectURL(blob);
    const loadingTask = pdfjsLib.getDocument(url);
    pdfDoc = await loadingTask.promise;
    await loadPage(currentPage);
    activeEdits = {};
    showStatus('Changes saved!');
});

async function loadPage(pageNum) {
    const container = document.getElementById('pdf-container');
    container.innerHTML = '';
    
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 });
    
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-page-wrapper';
    wrapper.style.position = 'relative';
    
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    
    await page.render({ canvasContext: context, viewport }).promise;
    
    wrapper.appendChild(canvas);
    container.appendChild(wrapper);
    
    // Store wrapper reference for text layer
    window.currentWrapper = wrapper;
}

async function loadTextBlocks(pageNum) {
    const response = await fetch(`/pages/${pageNum}/text`);
    const data = await response.json();
    currentPageBlocks = data.blocks;
    renderTextOverlay();
}

function renderTextOverlay() {
    const wrapper = window.currentWrapper;
    if (!wrapper) return;
    
    // Remove existing text layer
    const existingLayer = wrapper.querySelector('.text-layer');
    if (existingLayer) existingLayer.remove();
    
    // Create new text layer
    const textLayer = document.createElement('div');
    textLayer.className = 'text-layer';
    textLayer.style.position = 'absolute';
    textLayer.style.top = '0';
    textLayer.style.left = '0';
    textLayer.style.width = '100%';
    textLayer.style.height = '100%';
    
    currentPageBlocks.forEach(block => {
        const textDiv = document.createElement('div');
        textDiv.className = 'editable-text';
        textDiv.setAttribute('data-id', block.id);
        textDiv.setAttribute('data-bbox', JSON.stringify(block.bbox));
        textDiv.setAttribute('data-text', block.text);
        textDiv.setAttribute('data-size', block.size);
        textDiv.setAttribute('data-font', block.font);
        textDiv.setAttribute('data-page', block.page);
        
        // Position absolutely using bbox coordinates
        // Note: PDF coordinates are from bottom-left, need to convert
        textDiv.style.position = 'absolute';
        textDiv.style.left = block.bbox[0] + 'px';
        textDiv.style.bottom = block.bbox[1] + 'px'; // PDF y from bottom
        textDiv.style.width = (block.bbox[2] - block.bbox[0]) + 'px';
        textDiv.style.height = (block.bbox[3] - block.bbox[1]) + 'px';
        textDiv.style.fontSize = block.size + 'px';
        textDiv.style.lineHeight = block.size + 'px';
        
        textDiv.innerHTML = block.text;
        
        if (editMode) {
            textDiv.contentEditable = true;
            textDiv.addEventListener('blur', (e) => {
                const newText = e.target.innerText;
                if (newText !== block.text) {
                    activeEdits[block.id] = {
                        ...block,
                        old_text: block.text,
                        new_text: newText
                    };
                    showStatus('Edit saved. Click "Save Changes" to apply to PDF.');
                }
            });
        }
        
        textLayer.appendChild(textDiv);
    });
    
    wrapper.appendChild(textLayer);
}

function showStatus(message, className = '') {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = `status ${className}`;
    setTimeout(() => {
        if (statusDiv.textContent === message) {
            statusDiv.className = 'status';
        }
    }, 3000);
}
