from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from pdf_editor import PDFTextEditor
import os
import tempfile
import base64

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = tempfile.gettempdir()
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

current_pdf_path = None
current_editor = None

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
    """Get all text blocks that can be edited"""
    if not current_editor:
        return jsonify({'error': 'No PDF loaded'}), 400
    
    blocks = current_editor.get_text_blocks(page_num)
    return jsonify({'blocks': blocks})

@app.route('/edit', methods=['POST'])
def edit_text():
    """Replace text at specific location"""
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
    
    # Save changes
    output_path = os.path.join(UPLOAD_FOLDER, 'edited.pdf')
    current_editor.save(output_path)
    
    # Reload the editor with the updated PDF
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
    app.run(port=5000, debug=True)
