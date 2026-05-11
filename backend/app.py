from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
import os
import tempfile
import pdfplumber
import shutil
import json

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
    if not current_pdf_path or not os.path.exists(current_pdf_path):
        return jsonify({'error': 'No PDF loaded'}), 400
    
    blocks = []
    try:
        with pdfplumber.open(current_pdf_path) as pdf:
            if page_num < len(pdf.pages):
                page = pdf.pages[page_num]
                
                # Extract words with their positions
                words = page.extract_words(
                    keep_blank_chars=False,
                    use_text_flow=True,
                    extra_attrs=['fontname', 'size']
                )
                
                # Group words into lines (same Y coordinate)
                lines = {}
                for word in words:
                    y_key = round(word['top'], 1)  # Round to handle minor variations
                    if y_key not in lines:
                        lines[y_key] = []
                    lines[y_key].append(word)
                
                # Create text blocks from lines
                block_id = 0
                for y_coord in sorted(lines.keys()):
                    line_words = sorted(lines[y_coord], key=lambda w: w['x0'])
                    line_text = ' '.join([w['text'] for w in line_words])
                    
                    if line_text.strip():
                        # Get bounding box for the entire line
                        min_x = min([w['x0'] for w in line_words])
                        max_x = max([w['x1'] for w in line_words])
                        min_y = min([w['top'] for w in line_words])
                        max_y = max([w['bottom'] for w in line_words])
                        
                        blocks.append({
                            "id": f"block_{page_num}_{block_id}",
                            "text": line_text,
                            "bbox": [min_x, min_y, max_x, max_y],
                            "size": line_words[0].get('size', 12),
                            "font": line_words[0].get('fontname', 'Helvetica'),
                            "page": page_num
                        })
                        block_id += 1
                
                print(f"Extracted {len(blocks)} text blocks from page {page_num}")
                
    except Exception as e:
        print(f"Error extracting text: {e}")
        return jsonify({'error': str(e)}), 500
    
    return jsonify({'blocks': blocks})

@app.route('/edit', methods=['POST'])
def edit_text():
    data = request.json
    
    # Create modified PDF (simplified - for demo)
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
    else:
        return jsonify({'error': 'No edited PDF available'}), 404

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
