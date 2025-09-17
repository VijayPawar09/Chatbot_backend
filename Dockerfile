# Use Node.js LTS
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Bundle app source
COPY . .

# Expose the app port
EXPOSE 3001

# Set environment variables
ENV NODE_ENV=production

# Run the application
CMD ["node", "server.js"]
