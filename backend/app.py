from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
import os
import tempfile
import PyPDF2
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import io
import shutil

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

UPLOAD_FOLDER = tempfile.gettempdir()
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

current_pdf_path = None
modifications = []

@app.route('/')
def serve_frontend():
    return send_from_directory('../frontend', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('../frontend', path)

@app.route('/upload', methods=['POST'])
def upload_pdf():
    global current_pdf_path, modifications
    
    if 'pdf' not in request.files:
        return jsonify({'error': 'No PDF file provided'}), 400
    
    file = request.files['pdf']
    current_pdf_path = os.path.join(UPLOAD_FOLDER, 'current.pdf')
    file.save(current_pdf_path)
    modifications = []
    
    return jsonify({'status': 'success', 'message': 'PDF loaded'})

@app.route('/pages/<int:page_num>/text', methods=['GET'])
def get_text_blocks(page_num):
    if not current_pdf_path or not os.path.exists(current_pdf_path):
        return jsonify({'error': 'No PDF loaded'}), 400
    
    blocks = []
    try:
        with open(current_pdf_path, 'rb') as file:
            reader = PyPDF2.PdfReader(file)
            if page_num < len(reader.pages):
                page = reader.pages[page_num]
                text = page.extract_text()
                
                # Create text blocks from lines
                lines = text.split('\n')
                y_position = 750
                
                for line_num, line in enumerate(lines[:50]):  # Limit to 50 lines
                    if line.strip():
                        blocks.append({
                            "id": f"block_{page_num}_{line_num}",
                            "text": line.strip(),
                            "bbox": [50, y_position, 550, y_position - 20],
                            "size": 12,
                            "font": "Helvetica",
                            "page": page_num
                        })
                        y_position -= 25
    except Exception as e:
        print(f"Error: {e}")
    
    return jsonify({'blocks': blocks})

@app.route('/edit', methods=['POST'])
def edit_text():
    global modifications
    
    data = request.json
    modifications.append({
        'page': data['page'],
        'old_text': data['old_text'],
        'new_text': data['new_text']
    })
    
    # Create modified PDF
    output_path = os.path.join(UPLOAD_FOLDER, 'edited.pdf')
    
    # Copy original to output
    if os.path.exists(current_pdf_path):
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
