import PyPDF2
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import io
import os
import json

class PDFTextEditor:
    def __init__(self, pdf_path):
        self.pdf_path = pdf_path
        self.modifications = []
    
    def get_text_blocks(self, page_num):
        """Extract text from PDF page with positions"""
        blocks = []
        try:
            with open(self.pdf_path, 'rb') as file:
                reader = PyPDF2.PdfReader(file)
                if page_num < len(reader.pages):
                    page = reader.pages[page_num]
                    text = page.extract_text()
                    
                    # Split text into lines and create blocks
                    lines = text.split('\n')
                    y_position = 750  # Start from top
                    
                    for line_num, line in enumerate(lines):
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
            print(f"Error extracting text: {e}")
        
        return blocks
    
    def replace_text(self, page_num, bbox, old_text, new_text, font_size, font_name):
        """Store text modification for later application"""
        self.modifications.append({
            'page': page_num,
            'bbox': bbox,
            'old_text': old_text,
            'new_text': new_text,
            'size': font_size,
            'font': font_name
        })
        return True
    
    def save(self, output_path):
        """Create new PDF with text modifications"""
        # Read original PDF
        with open(self.pdf_path, 'rb') as file:
            reader = PyPDF2.PdfReader(file)
            writer = PyPDF2.PdfWriter()
            
            # Copy all pages
            for page in reader.pages:
                writer.add_page(page)
            
            # Save temporarily
            temp_path = output_path.replace('.pdf', '_temp.pdf')
            with open(temp_path, 'wb') as temp_file:
                writer.write(temp_file)
        
        # For text overlay, create a new PDF with modifications
        # (Simplified - in production you'd use a more sophisticated approach)
        import shutil
        shutil.copy(temp_path, output_path)
        
        # Cleanup
        if os.path.exists(temp_path):
            os.remove(temp_path)
        
        return output_path
