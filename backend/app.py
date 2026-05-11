from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
import os
import tempfile
import pdfplumber
import shutil
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import io

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

UPLOAD_FOLDER = tempfile.gettempdir()
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

current_pdf_path = None
current_page_count = 0

@app.route('/')
def serve_frontend():
    return send_from_directory('../frontend', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('../frontend', path)

@app.route('/upload', methods=['POST'])
def upload_pdf():
    global current_pdf_path, current_page_count
    
    if 'pdf' not in request.files:
        return jsonify({'error': 'No PDF file provided'}), 400
    
    file = request.files['pdf']
    current_pdf_path = os.path.join(UPLOAD_FOLDER, 'current.pdf')
    file.save(current_pdf_path)
    
    # Get page count
    with pdfplumber.open(current_pdf_path) as pdf:
        current_page_count = len(pdf.pages)
    
    return jsonify({'status': 'success', 'pages': current_page_count})

@app.route('/pages/<int:page_num>/text', methods=['GET'])
def get_text_blocks(page_num):
    if not current_pdf_path:
        return jsonify({'error': 'No PDF loaded'}), 400
    
    blocks = []
    try:
        with pdfplumber.open(current_pdf_path) as pdf:
            if page_num >= len(pdf.pages):
                return jsonify({'error': 'Page not found'}), 404
            
            page = pdf.pages[page_num]
            
            # Get characters with precise positions
            chars = page.chars
            
            # Group characters into words and lines
            lines = {}
            for char in chars:
                y_key = round(char['top'], 2)
                if y_key not in lines:
                    lines[y_key] = []
                lines[y_key].append(char)
            
            # Process each line
            for y_coord in sorted(lines.keys()):
                line_chars = sorted(lines[y_coord], key=lambda c: c['x0'])
                
                # Group into words based on spacing
                words = []
                current_word = []
                last_x_end = None
                
                for char in line_chars:
                    if last_x_end is not None and (char['x0'] - last_x_end) > char.get('size', 12) * 0.3:
                        # Space detected - save current word
                        if current_word:
                            words.append(current_word)
                            current_word = []
                    current_word.append(char)
                    last_x_end = char['x1']
                
                if current_word:
                    words.append(current_word)
                
                # Create text blocks for each word
                for word_chars in words:
                    if word_chars:
                        word_text = ''.join([c['text'] for c in word_chars])
                        if word_text.strip():
                            min_x = min([c['x0'] for c in word_chars])
                            max_x = max([c['x1'] for c in word_chars])
                            min_y = min([c['top'] for c in word_chars])
                            max_y = max([c['bottom'] for c in word_chars])
                            
                            blocks.append({
                                "id": f"b_{len(blocks)}",
                                "text": word_text,
                                "bbox": [min_x, min_y, max_x, max_y],
                                "size": word_chars[0].get('size', 12),
                                "font": word_chars[0].get('fontname', 'Helvetica'),
                                "page": page_num
                            })
            
            # Also add full lines for easier editing
            line_blocks = []
            for y_coord in sorted(lines.keys()):
                line_chars = sorted(lines[y_coord], key=lambda c: c['x0'])
                if line_chars:
                    line_text = ''.join([c['text'] for c in line_chars])
                    if line_text.strip():
                        min_x = min([c['x0'] for c in line_chars])
                        max_x = max([c['x1'] for c in line_chars])
                        min_y = min([c['top'] for c in line_chars])
                        max_y = max([c['bottom'] for c in line_chars])
                        
                        line_blocks.append({
                            "id": f"line_{len(line_blocks)}",
                            "text": line_text,
                            "bbox": [min_x, min_y, max_x, max_y],
                            "size": line_chars[0].get('size', 12),
                            "font": line_chars[0].get('fontname', 'Helvetica'),
                            "page": page_num
                        })
            
            # Use line blocks for better editing experience
            blocks = line_blocks if line_blocks else blocks
            
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
