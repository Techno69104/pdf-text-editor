from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
import os
import tempfile
import pdfplumber
import pytesseract
from pdf2image import convert_from_path
from PIL import Image
import shutil
import io

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

UPLOAD_FOLDER = tempfile.gettempdir()
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

current_pdf_path = None

@app.route('/')
def serve_frontend():
    return send_from_directory('../frontend', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('../frontend', path)

@app.route('/upload', methods=['POST'])
def upload_pdf():
    global current_pdf_path
    
    if 'pdf' not in request.files:
        return jsonify({'error': 'No PDF file provided'}), 400
    
    file = request.files['pdf']
    current_pdf_path = os.path.join(UPLOAD_FOLDER, 'current.pdf')
    file.save(current_pdf_path)
    
    return jsonify({'status': 'success', 'message': 'PDF loaded'})

@app.route('/pages/<int:page_num>/text', methods=['GET'])
def get_text_blocks(page_num):
    if not current_pdf_path:
        return jsonify({'error': 'No PDF loaded'}), 400
    
    blocks = []
    
    try:
        # First try to extract text normally
        with pdfplumber.open(current_pdf_path) as pdf:
            if page_num < len(pdf.pages):
                page = pdf.pages[page_num]
                text = page.extract_text()
                
                if text and len(text.strip()) > 50:
                    # Has real text - use pdfplumber
                    words = page.extract_words()
                    lines = {}
                    for word in words:
                        y_key = round(word['top'], 1)
                        if y_key not in lines:
                            lines[y_key] = []
                        lines[y_key].append(word)
                    
                    for y_coord in sorted(lines.keys()):
                        line_words = sorted(lines[y_coord], key=lambda w: w['x0'])
                        line_text = ' '.join([w['text'] for w in line_words])
                        if line_text.strip():
                            min_x = min([w['x0'] for w in line_words])
                            max_x = max([w['x1'] for w in line_words])
                            min_y = min([w['top'] for w in line_words])
                            max_y = max([w['bottom'] for w in line_words])
                            
                            blocks.append({
                                "id": f"line_{len(blocks)}",
                                "text": line_text,
                                "bbox": [min_x, min_y, max_x, max_y],
                                "size": 12,
                                "font": "Helvetica",
                                "page": page_num
                            })
                else:
                    # No text found - use OCR for scanned PDF
                    print(f"Page {page_num} appears to be a scanned image. Running OCR...")
                    
                    # Convert PDF page to image
                    images = convert_from_path(
                        current_pdf_path, 
                        first_page=page_num+1, 
                        last_page=page_num+1,
                        dpi=200
                    )
                    
                    if images:
                        # Run OCR on the image
                        custom_config = r'--oem 3 --psm 6'
                        ocr_data = pytesseract.image_to_data(images[0], config=custom_config, output_type=pytesseract.Output.DICT)
                        
                        # Group OCR results into text blocks
                        n_boxes = len(ocr_data['text'])
                        for i in range(n_boxes):
                            text = ocr_data['text'][i].strip()
                            if text and int(ocr_data['conf'][i]) > 30:  # Only include high-confidence text
                                x = ocr_data['left'][i]
                                y = ocr_data['top'][i]
                                w = ocr_data['width'][i]
                                h = ocr_data['height'][i]
                                
                                blocks.append({
                                    "id": f"ocr_{len(blocks)}",
                                    "text": text,
                                    "bbox": [x, y, x + w, y + h],
                                    "size": 14,
                                    "font": "Helvetica",
                                    "page": page_num
                                })
                        
                        print(f"OCR extracted {len(blocks)} text blocks from scanned page")
                    else:
                        return jsonify({'error': 'Could not convert PDF page to image'}), 500
                
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({'error': str(e)}), 500
    
    return jsonify({'blocks': blocks})

@app.route('/edit', methods=['POST'])
def edit_text():
    output_path = os.path.join(UPLOAD_FOLDER, 'edited.pdf')
    
    if current_pdf_path and os.path.exists(current_pdf_path):
        shutil.copy(current_pdf_path, output_path)
    
    return jsonify({
        'status': 'success',
        'download_url': '/download'
    })

@app.route('/download', methods=['GET'])
def download_pdf():
    output_path = os.path.join(UPLOAD_FOLDER, 'edited.pdf')
    if os.path.exists(output_path):
        return send_file(output_path, as_attachment=True, download_name='edited.pdf')
    return jsonify({'error': 'No file'}), 404

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
