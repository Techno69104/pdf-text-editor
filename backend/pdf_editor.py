import fitz  # PyMuPDF
import os
import uuid

class PDFTextEditor:
    def __init__(self, pdf_path):
        self.doc = fitz.open(pdf_path)
    
    def get_text_blocks(self, page_num):
        """Extract all text blocks with their positions and properties"""
        page = self.doc[page_num]
        blocks = page.get_text("dict")["blocks"]
        text_items = []
        
        for block in blocks:
            if "lines" in block:
                for line in block["lines"]:
                    for span in line["spans"]:
                        if span["text"].strip():
                            text_items.append({
                                "id": str(uuid.uuid4())[:8],
                                "text": span["text"],
                                "bbox": span["bbox"],  # [x0, y0, x1, y1]
                                "size": span["size"],
                                "font": span["font"],
                                "flags": span["flags"],  # bold/italic
                                "color": span["color"],
                                "page": page_num
                            })
        return text_items
    
    def replace_text(self, page_num, bbox, old_text, new_text, font_size, font_name):
        """Replace text at specific position with new content"""
        page = self.doc[page_num]
        
        # Create rectangle from bbox
        rect = fitz.Rect(bbox)
        
        # Add redaction annotation (marks text to remove)
        page.add_redact_annot(rect, text="")
        
        # Apply redaction (removes the old text)
        page.apply_redactions()
        
        # Insert new text at same position
        page.insert_text(
            (rect.x0, rect.y0),  # position
            new_text,
            fontsize=font_size,
            fontname=font_name or "helv",  # fallback to Helvetica
            color=(0, 0, 0)  # black
        )
        
        return True
    
    def save(self, output_path):
        """Save the modified PDF"""
        self.doc.save(output_path)
        return output_path
