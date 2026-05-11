from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
import os
import tempfile
import PyPDF2
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
    
    # Verify it's a valid PDF
    try:
        with open(current_pdf_path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            num_pages = len(reader.pages)
            return jsonify({'status': 'success', 'pages': num_pages})
    except Exception as e:
        return jsonify({'error': f'Invalid PDF: {str(e)}'}), 400

@app.route('/pages/<int:page_num>/text', methods=['GET'])
def get_text_blocks(page_num):
    if not current_pdf_path:
        return jsonify({'error': 'No PDF loaded'}), 400
    
    blocks = []
    try:
        with open(current_pdf_path, 'rb') as file:
            reader = PyPDF2.PdfReader(file)
            
            if page_num >= len(reader.pages):
                return jsonify({'error': 'Page not found'}), 404
            
            page = reader.pages[page_num]
            text = page.extract_text()
            
            if not text or text.strip() == '':
                return jsonify({'blocks': [], 'warning': 'No text found - PDF may be scanned'})
            
            # Split into lines and create blocks
            lines = text.split('\n')
            y_position = 100
            
            for i, line in enumerate(lines):
                if line.strip():
                    blocks.append({
                        "id": f"line_{i}",
                        "text": line.strip(),
                        "bbox": [50, y_position, 550, y_position - 20],
                        "size": 12,
                        "font": "Helvetica",
                        "page": page_num
                    })
                    y_position -= 25
            
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
    app.run(host='0.0.0.0', port=5000, debug=True)
