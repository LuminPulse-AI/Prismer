#!/usr/bin/env python3
"""
LaTeX Compilation Server for Prismer Academic Sandbox

A lightweight HTTP API for LaTeX document compilation,
designed to integrate with frontend editors like Monaco.

Endpoints:
- POST /compile      - Compile LaTeX to PDF
- POST /preview      - Compile and return base64 PDF
- GET  /health       - Health check
- GET  /templates    - List available templates

Usage:
    python latex-server.py [--port 8080] [--host 0.0.0.0]
"""

import os
import sys
import json
import base64
import shutil
import hashlib
import tempfile
import subprocess
import argparse
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import threading
import time

# ============================================================================
# Configuration
# ============================================================================

OUTPUT_DIR = Path("/home/user/output/reports")
TEMPLATE_DIR = Path("/home/user/.config/latex-templates")
CACHE_DIR = Path("/home/user/cache/latex")
MAX_COMPILE_TIME = 120  # seconds
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

# Supported LaTeX engines
ENGINES = {
    "pdflatex": "pdflatex",
    "xelatex": "xelatex",
    "lualatex": "lualatex",
}

# Default LaTeX templates
TEMPLATES = {
    "article": r"""\documentclass[12pt]{article}
\usepackage[utf8]{inputenc}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{hyperref}

\title{Your Title}
\author{Your Name}
\date{\today}

\begin{document}
\maketitle

\section{Introduction}
Your content here.

\end{document}
""",
    "article-zh": r"""\documentclass[12pt]{article}
\usepackage{ctex}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{hyperref}

\title{标题}
\author{作者}
\date{\today}

\begin{document}
\maketitle

\section{引言}
正文内容。

\end{document}
""",
    "beamer": r"""\documentclass{beamer}
\usetheme{Madrid}
\usepackage[utf8]{inputenc}
\usepackage{amsmath}

\title{Presentation Title}
\author{Your Name}
\date{\today}

\begin{document}

\begin{frame}
\titlepage
\end{frame}

\begin{frame}{Outline}
\tableofcontents
\end{frame}

\section{Introduction}
\begin{frame}{Introduction}
Your content here.
\end{frame}

\end{document}
""",
    "ieee": r"""\documentclass[conference]{IEEEtran}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{cite}

\begin{document}

\title{Paper Title}
\author{
\IEEEauthorblockN{Author Name}
\IEEEauthorblockA{Institution\\
Email: author@example.com}
}

\maketitle

\begin{abstract}
Abstract text here.
\end{abstract}

\section{Introduction}
Introduction text.

\bibliographystyle{IEEEtran}
\bibliography{references}

\end{document}
""",
}

# ============================================================================
# LaTeX Compiler
# ============================================================================

class LaTeXCompiler:
    """Handles LaTeX document compilation."""
    
    def __init__(self, work_dir: Optional[Path] = None):
        self.work_dir = work_dir or CACHE_DIR
        self.work_dir.mkdir(parents=True, exist_ok=True)
    
    def compile(
        self,
        content: str,
        filename: str = "document",
        engine: str = "pdflatex",
        bibliography: Optional[str] = None,
        assets: Optional[Dict[str, bytes]] = None,
        runs: int = 2,
    ) -> Dict[str, Any]:
        """
        Compile LaTeX document.
        
        Returns:
            {
                "success": bool,
                "pdf_path": str,
                "pdf_base64": str,
                "log": str,
                "errors": list,
                "warnings": list,
            }
        """
        # Create temporary directory
        compile_id = hashlib.md5(f"{content}{datetime.now().isoformat()}".encode()).hexdigest()[:12]
        compile_dir = self.work_dir / compile_id
        compile_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            # Write main tex file
            tex_file = compile_dir / f"{filename}.tex"
            tex_file.write_text(content, encoding='utf-8')
            
            # Write bibliography if provided
            if bibliography:
                bib_file = compile_dir / f"{filename}.bib"
                bib_file.write_text(bibliography, encoding='utf-8')
            
            # Write additional assets
            if assets:
                for name, data in assets.items():
                    asset_path = compile_dir / name
                    asset_path.parent.mkdir(parents=True, exist_ok=True)
                    asset_path.write_bytes(data)
            
            # Get engine command
            engine_cmd = ENGINES.get(engine, "pdflatex")
            
            # Compile
            log_content = ""
            errors = []
            warnings = []
            
            for run_num in range(runs):
                result = subprocess.run(
                    [
                        engine_cmd,
                        "-interaction=nonstopmode",
                        "-file-line-error",
                        f"{filename}.tex"
                    ],
                    cwd=compile_dir,
                    capture_output=True,
                    text=True,
                    timeout=MAX_COMPILE_TIME,
                )
                log_content = result.stdout + result.stderr
                
                # Run biber/bibtex if bibliography provided
                if bibliography and run_num == 0:
                    subprocess.run(
                        ["biber", filename],
                        cwd=compile_dir,
                        capture_output=True,
                        timeout=60,
                    )
            
            # Parse log for errors and warnings
            for line in log_content.split('\n'):
                if '! ' in line or 'Error:' in line.lower():
                    errors.append(line.strip())
                elif 'Warning:' in line:
                    warnings.append(line.strip())
            
            # Check if PDF was generated
            pdf_file = compile_dir / f"{filename}.pdf"
            if pdf_file.exists():
                # Copy to output directory
                output_path = OUTPUT_DIR / f"{filename}_{compile_id}.pdf"
                OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
                shutil.copy(pdf_file, output_path)
                
                # Read PDF as base64
                pdf_base64 = base64.b64encode(pdf_file.read_bytes()).decode('utf-8')
                
                return {
                    "success": True,
                    "pdf_path": str(output_path),
                    "pdf_base64": pdf_base64,
                    "log": log_content[-5000:],  # Last 5000 chars
                    "errors": errors[-10:],
                    "warnings": warnings[-20:],
                    "compile_id": compile_id,
                }
            else:
                return {
                    "success": False,
                    "pdf_path": None,
                    "pdf_base64": None,
                    "log": log_content[-5000:],
                    "errors": errors or ["PDF not generated"],
                    "warnings": warnings,
                    "compile_id": compile_id,
                }
                
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": f"Compilation timeout ({MAX_COMPILE_TIME}s)",
                "errors": [f"Compilation timeout after {MAX_COMPILE_TIME} seconds"],
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "errors": [str(e)],
            }
        finally:
            # Cleanup (keep for debugging if needed)
            # shutil.rmtree(compile_dir, ignore_errors=True)
            pass

# ============================================================================
# HTTP Server
# ============================================================================

class LaTeXHandler(BaseHTTPRequestHandler):
    """HTTP request handler for LaTeX API."""
    
    compiler = LaTeXCompiler()
    
    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()
    
    def do_GET(self):
        """Handle GET requests."""
        parsed = urlparse(self.path)
        path = parsed.path
        
        if path == "/health":
            self.send_json({"status": "ok", "service": "latex-server"})
        elif path == "/templates":
            self.send_json({
                "templates": list(TEMPLATES.keys()),
                "engines": list(ENGINES.keys()),
            })
        elif path.startswith("/template/"):
            template_name = path.split("/")[-1]
            if template_name in TEMPLATES:
                self.send_json({
                    "name": template_name,
                    "content": TEMPLATES[template_name],
                })
            else:
                self.send_error_json(404, f"Template '{template_name}' not found")
        else:
            self.send_error_json(404, "Not found")
    
    def do_POST(self):
        """Handle POST requests."""
        parsed = urlparse(self.path)
        path = parsed.path
        
        # Read body
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > MAX_FILE_SIZE:
            self.send_error_json(413, "Request too large")
            return
        
        body = self.rfile.read(content_length)
        
        try:
            data = json.loads(body.decode('utf-8'))
        except json.JSONDecodeError:
            self.send_error_json(400, "Invalid JSON")
            return
        
        if path == "/compile":
            self.handle_compile(data)
        elif path == "/preview":
            self.handle_preview(data)
        else:
            self.send_error_json(404, "Not found")
    
    def handle_compile(self, data: Dict[str, Any]):
        """Handle /compile endpoint."""
        content = data.get("content")
        if not content:
            self.send_error_json(400, "Missing 'content' field")
            return
        
        result = self.compiler.compile(
            content=content,
            filename=data.get("filename", "document"),
            engine=data.get("engine", "pdflatex"),
            bibliography=data.get("bibliography"),
            runs=data.get("runs", 2),
        )
        
        # Don't include base64 in compile response (too large)
        result_without_pdf = {k: v for k, v in result.items() if k != "pdf_base64"}
        self.send_json(result_without_pdf)
    
    def handle_preview(self, data: Dict[str, Any]):
        """Handle /preview endpoint - returns base64 PDF."""
        content = data.get("content")
        if not content:
            self.send_error_json(400, "Missing 'content' field")
            return
        
        result = self.compiler.compile(
            content=content,
            filename=data.get("filename", "preview"),
            engine=data.get("engine", "pdflatex"),
            bibliography=data.get("bibliography"),
            runs=data.get("runs", 1),  # Single run for preview
        )
        
        self.send_json(result)
    
    def send_json(self, data: Dict[str, Any], status: int = 200):
        """Send JSON response."""
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
    
    def send_error_json(self, status: int, message: str):
        """Send error JSON response."""
        self.send_json({"error": message}, status)
    
    def send_cors_headers(self):
        """Add CORS headers."""
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
    
    def log_message(self, format, *args):
        """Custom log format."""
        print(f"[latex-server] {self.address_string()} - {format % args}")

# ============================================================================
# Main
# ============================================================================

def run_server(host: str = "0.0.0.0", port: int = 8080):
    """Start the LaTeX server."""
    # Ensure directories exist
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    
    server = HTTPServer((host, port), LaTeXHandler)
    print(f"[latex-server] Starting on http://{host}:{port}")
    print(f"[latex-server] Endpoints:")
    print(f"  POST /compile  - Compile LaTeX to PDF")
    print(f"  POST /preview  - Compile and return base64 PDF")
    print(f"  GET  /health   - Health check")
    print(f"  GET  /templates - List templates")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[latex-server] Shutting down...")
        server.shutdown()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LaTeX Compilation Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8080, help="Port to listen on")
    args = parser.parse_args()
    
    run_server(args.host, args.port)
