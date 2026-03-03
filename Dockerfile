# Use lightweight Nginx to serve static files
FROM nginx:alpine

# Copy your website into Nginx web root
COPY . /usr/share/nginx/html

# Expose web port
EXPOSE 80

# Run Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]