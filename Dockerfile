# Use a stable Node.js version
FROM node:20-bullseye-slim

# Set working directory
WORKDIR /app

# Install required dependencies for node-canvas and node-gyp
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    make \
    g++ \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

# Set Python path for npm (node-gyp dependency)
RUN npm config set python $(which python3)

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the remaining application files
COPY . .

# Set the default command
CMD ["node", "server.js"]
