#!/bin/bash

# Install system dependencies for OCR
apt-get update
apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    poppler-utils \
    python3-dev \
    libjpeg-dev \
    zlib1g-dev

# Install Python packages
pip install -r backend/requirements.txt
