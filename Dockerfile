# Multi-stage Dockerfile: build frontend, then run Node server

# --- Build frontend ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY yarn.lock* ./
# Install dependencies
RUN npm ci --silent || npm install --silent
# Copy source
COPY . .
# Build frontend
ARG VITE_SERVER_URL
ENV VITE_SERVER_URL=${VITE_SERVER_URL}
RUN npm run build --silent

# --- Production image ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=80
# Copy node modules needed for server runtime
COPY package.json package-lock.json* ./
RUN npm ci --only=production --silent || npm install --only=production --silent
# Copy built frontend
COPY --from=builder /app/dist ./dist
# Copy server code
COPY server ./server
# Copy migrations so runtime can run them
COPY db/migrations ./db/migrations
# Expose port
EXPOSE 80
# Start server (run migrations then start)
CMD ["npm", "start"]