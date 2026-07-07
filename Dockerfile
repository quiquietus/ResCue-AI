# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set working directory in the container
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install them
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy the PyTorch model
COPY resnet50_disaster.pth /app/resnet50_disaster.pth

# Copy the backend code
COPY backend/ /app/backend/

# Hugging Face Spaces requires running on port 7860
ENV PORT=7860
# Tell the backend where to find the model inside the container
ENV MODEL_PATH=/app/resnet50_disaster.pth

# Command to run the FastAPI server
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860"]
