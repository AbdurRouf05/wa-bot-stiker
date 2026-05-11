FROM node:20

# Install system dependencies (FFmpeg for stickers & ImageMagick)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    imagemagick \
    libwebp-dev \
    git \
    python3 \
    python3-pip \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    build-essential \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
RUN pip3 install --no-cache-dir opencv-contrib-python-headless numpy --break-system-packages

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy dependency files first for caching
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install

# Copy the rest of the app
COPY . .

# Expose port (Koyeb/Render will use this)
EXPOSE 3000

# Start command
CMD ["node", "index.js"]
