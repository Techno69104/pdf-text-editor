from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from pdf_editor import PDFTextEditor
import os
import tempfile

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

UPLOAD_FOLDER = tempfile.gettempdir()
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

current_pdf_path = None
current_editor = None

# Serve frontend files
@app.route('/')
def serve_frontend():
    return send_from_directory('../frontend', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('../frontend', path)

@app.route('/upload', methods=['POST'])
def upload_pdf():
    global current_pdf_path, current_editor
    
    if 'pdf' not in request.files:
        return jsonify({'error': 'No PDF file provided'}), 400
    
    file = request.files['pdf']
    current_pdf_path = os.path.join(UPLOAD_FOLDER, 'current.pdf')
    file.save(current_pdf_path)
    current_editor = PDFTextEditor(current_pdf_path)
    
    return jsonify({'status': 'success', 'message': 'PDF loaded'})

@app.route('/pages/<int:page_num>/text', methods=['GET'])
def get_text_blocks(page_num):
    if not current_editor:
        return jsonify({'error': 'No PDF loaded'}), 400
    
    blocks = current_editor.get_text_blocks(page_num)
    return jsonify({'blocks': blocks})

@app.route('/edit', methods=['POST'])
def edit_text():
    if not current_editor:
        return jsonify({'error': 'No PDF loaded'}), 400
    
    data = request.json
    success = current_editor.replace_text(
        page_num=data['page'],
        bbox=data['bbox'],
        old_text=data['old_text'],
        new_text=data['new_text'],
        font_size=data['size'],
        font_name=data.get('font', 'helv')
    )
    
    output_path = os.path.join(UPLOAD_FOLDER, 'edited.pdf')
    current_editor.save(output_path)
    current_editor = PDFTextEditor(output_path)
    
    return jsonify({
        'status': 'success',
        'download_url': '/download'
    })

@app.route('/download', methods=['GET'])
def download_pdf():
    output_path = os.path.join(UPLOAD_FOLDER, 'edited.pdf')
    return send_file(output_path, as_attachment=True, download_name='edited.pdf')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
