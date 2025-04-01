# Use an official Node.js runtime as the base image
FROM node:18-alpine

# Install Python and build dependencies
RUN apk update && apk add --no-cache \
    python3 \
    python3-pip \
    build-base \
    && python3 -m ensurepip --upgrade

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install the dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Expose the required port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
