#!/usr/bin/env python3
"""
Formal Methods Server for Prismer Academic Sandbox

A lightweight HTTP API for theorem proving and formal verification,
supporting Lean 4, Coq, and Z3.

Endpoints:
- POST /lean/check     - Type-check Lean 4 code
- POST /lean/run       - Run Lean 4 code
- POST /coq/check      - Check Coq proof
- POST /coq/compile    - Compile Coq file
- POST /z3/solve       - Solve Z3 SMT formula
- GET  /health         - Health check
- GET  /status         - Check available provers

Usage:
    python prover-server.py [--port 8081] [--host 0.0.0.0]
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
import threading

# ============================================================================
# Configuration
# ============================================================================

OUTPUT_DIR = Path("/home/user/output/proofs")
CACHE_DIR = Path("/home/user/cache/provers")
MAX_TIMEOUT = 60  # seconds

# Prover paths
LEAN_PATH = os.environ.get("LEAN_PATH", "/home/user/.elan/bin/lean")
LAKE_PATH = os.environ.get("LAKE_PATH", "/home/user/.elan/bin/lake")
COQC_PATH = os.environ.get("COQC_PATH", "/usr/bin/coqc")
COQTOP_PATH = os.environ.get("COQTOP_PATH", "/usr/bin/coqtop")

# ============================================================================
# Lean 4 Prover
# ============================================================================

class Lean4Prover:
    """Lean 4 theorem prover interface."""
    
    def __init__(self):
        self.lean_path = LEAN_PATH
        self.lake_path = LAKE_PATH
        self.available = self._check_available()
    
    def _check_available(self) -> bool:
        """Check if Lean 4 is available."""
        try:
            result = subprocess.run(
                [self.lean_path, "--version"],
                capture_output=True,
                text=True,
                timeout=10
            )
            return result.returncode == 0
        except:
            return False
    
    def get_version(self) -> str:
        """Get Lean version."""
        try:
            result = subprocess.run(
                [self.lean_path, "--version"],
                capture_output=True,
                text=True,
                timeout=10
            )
            return result.stdout.strip()
        except:
            return "unknown"
    
    def check(self, code: str, filename: str = "Main.lean") -> Dict[str, Any]:
        """Type-check Lean 4 code."""
        work_dir = CACHE_DIR / f"lean_{hashlib.md5(code.encode()).hexdigest()[:12]}"
        work_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            # Write Lean file
            lean_file = work_dir / filename
            lean_file.write_text(code, encoding='utf-8')
            
            # Run lean
            result = subprocess.run(
                [self.lean_path, str(lean_file)],
                capture_output=True,
                text=True,
                timeout=MAX_TIMEOUT,
                cwd=work_dir
            )
            
            success = result.returncode == 0
            
            return {
                "success": success,
                "output": result.stdout,
                "errors": result.stderr if not success else "",
                "returncode": result.returncode,
            }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "errors": f"Timeout after {MAX_TIMEOUT} seconds",
            }
        except Exception as e:
            return {
                "success": False,
                "errors": str(e),
            }
    
    def run(self, code: str, filename: str = "Main.lean") -> Dict[str, Any]:
        """Run Lean 4 code and capture output."""
        # Add #eval directive if not present for running
        if "#eval" not in code and "main" not in code.lower():
            # Just check the code
            return self.check(code, filename)
        
        return self.check(code, filename)

# ============================================================================
# Coq Prover
# ============================================================================

class CoqProver:
    """Coq proof assistant interface."""
    
    def __init__(self):
        self.coqc_path = COQC_PATH
        self.coqtop_path = COQTOP_PATH
        self.available = self._check_available()
    
    def _check_available(self) -> bool:
        """Check if Coq is available."""
        try:
            result = subprocess.run(
                [self.coqc_path, "--version"],
                capture_output=True,
                text=True,
                timeout=10
            )
            return result.returncode == 0
        except:
            return False
    
    def get_version(self) -> str:
        """Get Coq version."""
        try:
            result = subprocess.run(
                [self.coqc_path, "--version"],
                capture_output=True,
                text=True,
                timeout=10
            )
            return result.stdout.strip().split('\n')[0]
        except:
            return "unknown"
    
    def check(self, code: str, filename: str = "proof.v") -> Dict[str, Any]:
        """Check Coq proof."""
        work_dir = CACHE_DIR / f"coq_{hashlib.md5(code.encode()).hexdigest()[:12]}"
        work_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            # Write Coq file
            coq_file = work_dir / filename
            coq_file.write_text(code, encoding='utf-8')
            
            # Run coqc
            result = subprocess.run(
                [self.coqc_path, str(coq_file)],
                capture_output=True,
                text=True,
                timeout=MAX_TIMEOUT,
                cwd=work_dir
            )
            
            success = result.returncode == 0
            
            # Check for compiled output
            vo_file = work_dir / filename.replace('.v', '.vo')
            compiled = vo_file.exists()
            
            return {
                "success": success,
                "compiled": compiled,
                "output": result.stdout,
                "errors": result.stderr if not success else "",
                "returncode": result.returncode,
            }
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "errors": f"Timeout after {MAX_TIMEOUT} seconds",
            }
        except Exception as e:
            return {
                "success": False,
                "errors": str(e),
            }
    
    def compile(self, code: str, filename: str = "proof.v") -> Dict[str, Any]:
        """Compile Coq file to .vo."""
        return self.check(code, filename)

# ============================================================================
# Z3 Solver
# ============================================================================

class Z3Solver:
    """Z3 SMT solver interface."""
    
    def __init__(self):
        self.available = self._check_available()
    
    def _check_available(self) -> bool:
        """Check if Z3 is available."""
        try:
            import z3
            return True
        except:
            return False
    
    def get_version(self) -> str:
        """Get Z3 version."""
        try:
            import z3
            return z3.get_version_string()
        except:
            return "unknown"
    
    def solve(self, formula: str, format: str = "smt2") -> Dict[str, Any]:
        """Solve SMT formula."""
        try:
            import z3
            
            if format == "smt2":
                # Parse SMT-LIB2 format
                solver = z3.Solver()
                solver.from_string(formula)
                
                result = solver.check()
                
                if result == z3.sat:
                    model = solver.model()
                    model_str = str(model)
                    return {
                        "success": True,
                        "result": "sat",
                        "model": model_str,
                    }
                elif result == z3.unsat:
                    return {
                        "success": True,
                        "result": "unsat",
                        "model": None,
                    }
                else:
                    return {
                        "success": True,
                        "result": "unknown",
                        "model": None,
                    }
            elif format == "python":
                # Execute Python Z3 code
                local_vars = {"z3": z3}
                exec(formula, {"z3": z3}, local_vars)
                
                # Try to get result from common variable names
                result = local_vars.get("result", local_vars.get("model", "No result variable found"))
                
                return {
                    "success": True,
                    "result": str(result),
                }
            else:
                return {
                    "success": False,
                    "errors": f"Unknown format: {format}. Use 'smt2' or 'python'",
                }
        except Exception as e:
            return {
                "success": False,
                "errors": str(e),
            }

# ============================================================================
# HTTP Server
# ============================================================================

class ProverHandler(BaseHTTPRequestHandler):
    """HTTP request handler for Prover API."""
    
    lean = Lean4Prover()
    coq = CoqProver()
    z3 = Z3Solver()
    
    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()
    
    def do_GET(self):
        """Handle GET requests."""
        path = self.path.split('?')[0]
        
        if path == "/health":
            self.send_json({"status": "ok", "service": "prover-server"})
        elif path == "/status":
            self.send_json({
                "provers": {
                    "lean4": {
                        "available": self.lean.available,
                        "version": self.lean.get_version() if self.lean.available else None,
                    },
                    "coq": {
                        "available": self.coq.available,
                        "version": self.coq.get_version() if self.coq.available else None,
                    },
                    "z3": {
                        "available": self.z3.available,
                        "version": self.z3.get_version() if self.z3.available else None,
                    },
                }
            })
        else:
            self.send_error_json(404, "Not found")
    
    def do_POST(self):
        """Handle POST requests."""
        path = self.path.split('?')[0]
        
        # Read body
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        
        try:
            data = json.loads(body.decode('utf-8'))
        except json.JSONDecodeError:
            self.send_error_json(400, "Invalid JSON")
            return
        
        # Route to handlers
        if path == "/lean/check":
            self.handle_lean_check(data)
        elif path == "/lean/run":
            self.handle_lean_run(data)
        elif path == "/coq/check":
            self.handle_coq_check(data)
        elif path == "/coq/compile":
            self.handle_coq_compile(data)
        elif path == "/z3/solve":
            self.handle_z3_solve(data)
        else:
            self.send_error_json(404, "Not found")
    
    def handle_lean_check(self, data: Dict[str, Any]):
        """Handle Lean 4 type checking."""
        code = data.get("code")
        if not code:
            self.send_error_json(400, "Missing 'code' field")
            return
        
        if not self.lean.available:
            self.send_error_json(503, "Lean 4 is not available")
            return
        
        result = self.lean.check(code, data.get("filename", "Main.lean"))
        self.send_json(result)
    
    def handle_lean_run(self, data: Dict[str, Any]):
        """Handle Lean 4 execution."""
        code = data.get("code")
        if not code:
            self.send_error_json(400, "Missing 'code' field")
            return
        
        if not self.lean.available:
            self.send_error_json(503, "Lean 4 is not available")
            return
        
        result = self.lean.run(code, data.get("filename", "Main.lean"))
        self.send_json(result)
    
    def handle_coq_check(self, data: Dict[str, Any]):
        """Handle Coq proof checking."""
        code = data.get("code")
        if not code:
            self.send_error_json(400, "Missing 'code' field")
            return
        
        if not self.coq.available:
            self.send_error_json(503, "Coq is not available")
            return
        
        result = self.coq.check(code, data.get("filename", "proof.v"))
        self.send_json(result)
    
    def handle_coq_compile(self, data: Dict[str, Any]):
        """Handle Coq compilation."""
        code = data.get("code")
        if not code:
            self.send_error_json(400, "Missing 'code' field")
            return
        
        if not self.coq.available:
            self.send_error_json(503, "Coq is not available")
            return
        
        result = self.coq.compile(code, data.get("filename", "proof.v"))
        self.send_json(result)
    
    def handle_z3_solve(self, data: Dict[str, Any]):
        """Handle Z3 SMT solving."""
        formula = data.get("formula") or data.get("code")
        if not formula:
            self.send_error_json(400, "Missing 'formula' or 'code' field")
            return
        
        if not self.z3.available:
            self.send_error_json(503, "Z3 is not available")
            return
        
        result = self.z3.solve(formula, data.get("format", "smt2"))
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
        print(f"[prover-server] {self.address_string()} - {format % args}")

# ============================================================================
# Main
# ============================================================================

def run_server(host: str = "0.0.0.0", port: int = 8081):
    """Start the Prover server."""
    # Ensure directories exist
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    
    server = HTTPServer((host, port), ProverHandler)
    print(f"[prover-server] Starting on http://{host}:{port}")
    print(f"[prover-server] Endpoints:")
    print(f"  POST /lean/check   - Type-check Lean 4 code")
    print(f"  POST /lean/run     - Run Lean 4 code")
    print(f"  POST /coq/check    - Check Coq proof")
    print(f"  POST /coq/compile  - Compile Coq file")
    print(f"  POST /z3/solve     - Solve Z3 SMT formula")
    print(f"  GET  /health       - Health check")
    print(f"  GET  /status       - Check available provers")
    
    # Check prover availability
    handler = ProverHandler
    print(f"\n[prover-server] Prover status:")
    print(f"  Lean 4: {'available' if handler.lean.available else 'NOT available'}")
    print(f"  Coq:    {'available' if handler.coq.available else 'NOT available'}")
    print(f"  Z3:     {'available' if handler.z3.available else 'NOT available'}")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[prover-server] Shutting down...")
        server.shutdown()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Formal Methods Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8081, help="Port to listen on")
    args = parser.parse_args()
    
    run_server(args.host, args.port)
