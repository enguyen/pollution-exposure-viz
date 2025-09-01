#!/usr/bin/env python3
"""
Simple HTTP server for serving the PM2.5 exposure analysis web interface.
Serves static files from the frontend directory and assets.json from the root.
"""

import http.server
import socketserver
import os
import json
from pathlib import Path
from urllib.parse import urlparse, unquote

class PM25Handler(http.server.SimpleHTTPRequestHandler):
    """Custom handler for serving the PM2.5 exposure analysis app."""
    
    def __init__(self, *args, **kwargs):
        # Set the directory to serve files from
        self.directory = os.getcwd()
        super().__init__(*args, **kwargs)
    
    def end_headers(self):
        # Add CORS headers for development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()
    
    def do_GET(self):
        """Handle GET requests with custom routing."""
        parsed_path = urlparse(self.path)
        path = unquote(parsed_path.path)
        
        # Remove leading slash
        if path.startswith('/'):
            path = path[1:]
        
        # Routing logic
        if path == '' or path == 'index.html':
            # Serve main page
            self.serve_file('frontend/index.html', 'text/html')
        
        elif path == 'assets.json':
            # Serve assets data
            self.serve_file('assets.json', 'application/json')
        
        elif path.startswith('frontend/'):
            # Serve frontend files
            self.serve_file(path)
        
        elif path.startswith('processed/'):
            # Serve processed exposure rasters
            self.serve_file(path, 'image/tiff')
        
        elif path.startswith('overlays/'):
            # Serve PNG overlay files
            self.serve_file(path, 'image/png')
        
        elif path.startswith('raw_data/'):
            # Serve raw JSON data files
            self.serve_file(path, 'application/json')
        
        elif path == 'favicon.ico':
            # Serve favicon from frontend directory
            self.serve_file('frontend/favicon.ico', 'image/x-icon')
        
        else:
            # Try to serve file directly
            self.serve_file(path)
    
    def serve_file(self, file_path, content_type=None):
        """Serve a file with appropriate content type."""
        full_path = os.path.join(self.directory, file_path)
        
        if not os.path.exists(full_path):
            self.send_error(404, f"File not found: {file_path}")
            return
        
        # Determine content type
        if content_type is None:
            if file_path.endswith('.html'):
                content_type = 'text/html'
            elif file_path.endswith('.js'):
                content_type = 'application/javascript'
            elif file_path.endswith('.css'):
                content_type = 'text/css'
            elif file_path.endswith('.json'):
                content_type = 'application/json'
            elif file_path.endswith('.tiff') or file_path.endswith('.tif'):
                content_type = 'image/tiff'
            elif file_path.endswith('.png'):
                content_type = 'image/png'
            else:
                content_type = 'application/octet-stream'
        
        try:
            with open(full_path, 'rb') as f:
                self.send_response(200)
                self.send_header('Content-type', content_type)
                self.send_header('Content-Length', str(os.path.getsize(full_path)))
                self.end_headers()
                self.wfile.write(f.read())
                
        except IOError:
            self.send_error(500, f"Error reading file: {file_path}")
    
    def log_message(self, format, *args):
        """Custom log format."""
        print(f"[{self.date_time_string()}] {format % args}")


def main():
    """Start the HTTP server."""
    PORT = 8000
    
    # Check if required files exist
    required_files = ['assets.json', 'frontend/index.html']
    for file_path in required_files:
        if not os.path.exists(file_path):
            print(f"ERROR: Required file not found: {file_path}")
            print("\nMake sure you've:")
            print("1. Processed your GeoTIFF files to create assets.json")
            print("2. Created the frontend directory with index.html")
            return 1
    
    # Display startup information
    print("=" * 60)
    print("PM2.5 Population Exposure Analysis Server")
    print("=" * 60)
    
    # Check assets data
    try:
        with open('assets.json', 'r') as f:
            assets_data = json.load(f)
            total_assets = assets_data['metadata']['total_assets']
            countries = assets_data['metadata']['countries']
            print(f"Assets loaded: {total_assets}")
            print(f"Countries: {', '.join(countries)}")
            print(f"Data version: {assets_data['metadata'].get('data_version', 'unknown')}")
    except Exception as e:
        print(f"Warning: Could not read assets.json: {e}")
    
    print("-" * 60)
    print(f"Starting server on port {PORT}")
    print(f"Access the application at: http://localhost:{PORT}")
    print("-" * 60)
    
    # Start server
    try:
        with socketserver.TCPServer(("", PORT), PM25Handler) as httpd:
            httpd.serve_forever()
            
    except KeyboardInterrupt:
        print("\nShutting down server...")
        return 0
    except OSError as e:
        if e.errno == 48:  # Address already in use
            print(f"ERROR: Port {PORT} is already in use.")
            print(f"Try a different port or stop the existing server.")
            return 1
        else:
            print(f"ERROR: {e}")
            return 1


if __name__ == '__main__':
    exit(main())