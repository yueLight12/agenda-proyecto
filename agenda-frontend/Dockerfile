FROM node:20-slim

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .

# VITE_API_URL debe estar presente en build time: Vite lo incrusta en el
# bundle al compilar, no lo lee en runtime como sí hace en modo dev.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

EXPOSE 5173

CMD ["npm", "run", "preview", "--", "--host"]
