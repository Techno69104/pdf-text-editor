#!/bin/bash
# render-build.sh

# Install system dependencies for PyMuPDF
apt-get update
apt-get install -y python3-dev libjpeg-dev zlib1g-dev

# Install Python packages
pip install -r backend/requirements.txt
