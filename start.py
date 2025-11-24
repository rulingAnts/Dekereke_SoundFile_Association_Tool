#!/usr/bin/env python3
"""
Startup script for Dekereke Sound File Association Tool
Checks dependencies and launches the application
"""

import sys
import subprocess
from pathlib import Path

def check_python_version():
    """Check if Python version is adequate"""
    if sys.version_info < (3, 8):
        print("ERROR: Python 3.8 or higher is required")
        print(f"Current version: {sys.version}")
        return False
    return True

def check_dependencies():
    """Check if required dependencies are installed"""
    required = {
        'webview': 'pywebview',
        'lxml': 'lxml',
        'Levenshtein': 'python-Levenshtein'
    }
    
    missing = []
    for module, package in required.items():
        try:
            __import__(module)
        except ImportError:
            missing.append(package)
    
    if missing:
        print("ERROR: Missing required dependencies:")
        for pkg in missing:
            print(f"  - {pkg}")
        print("\nPlease install dependencies:")
        print("  pip install -r requirements.txt")
        return False
    
    return True

def check_optional_dependencies():
    """Check optional dependencies and warn if missing"""
    optional = {
        'pygame': 'Audio playback (optional)'
    }
    
    for module, description in optional.items():
        try:
            __import__(module)
        except ImportError:
            print(f"Note: {module} not installed - {description}")

def main():
    """Main startup routine"""
    print("=" * 60)
    print("Dekereke Sound File Association Tool")
    print("=" * 60)
    print()
    
    # Check Python version
    if not check_python_version():
        return 1
    
    # Check dependencies
    if not check_dependencies():
        return 1
    
    # Check optional dependencies
    check_optional_dependencies()
    
    print()
    print("Starting application...")
    print("-" * 60)
    print()
    
    # Launch the application
    src_dir = Path(__file__).parent / 'src'
    main_py = src_dir / 'main.py'
    
    try:
        # Change to src directory and run main.py
        import os
        os.chdir(src_dir)
        
        # Import and run
        sys.path.insert(0, str(src_dir))
        import main
        main.main()
        
    except KeyboardInterrupt:
        print("\nApplication closed by user")
        return 0
    except Exception as e:
        print(f"\nERROR: Failed to start application")
        print(f"  {type(e).__name__}: {e}")
        return 1
    
    return 0

if __name__ == '__main__':
    sys.exit(main())
