FROM node:bookworm-slim AS build

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json (if exists)
COPY package*.json ./

# Install dependencies including types
RUN npm install 

# Copy the rest of the application code
COPY . .

# If your project needs to be built (e.g., TypeScript), run the build command
RUN npm run build

FROM node:bookworm-slim

WORKDIR /app

# Install required tools (git, wget, bash)
RUN apt-get update && apt-get upgrade -y && apt-get install libatk-bridge2.0-0 libasound2 libgtk-3-0 libnss3 libx11-xcb1 xdg-utils wget fonts-liberation libcurl4 libvulkan1 -y

RUN wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
RUN dpkg -i google-chrome-stable_current_amd64.deb && apt-get -f install

COPY --from=build /app/dist .

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "app.cjs"]
