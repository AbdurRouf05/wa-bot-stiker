FROM node:20-slim

# Install system dependencies (FFmpeg for stickers)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    imagemagick \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libwebp-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

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
