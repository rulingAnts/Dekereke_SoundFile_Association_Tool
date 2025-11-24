#!/usr/bin/env python3
"""
Test runner for Dekereke Sound File Association Tool
Runs all tests and reports results
"""

import sys
import os
import importlib.util
from pathlib import Path

def run_test(test_path):
    """Run a single test file"""
    test_name = test_path.stem
    
    try:
        # Load the test module
        spec = importlib.util.spec_from_file_location(test_name, test_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        
        return True
    except Exception as e:
        print(f"✗ Test failed: {test_name}")
        print(f"  Error: {e}")
        return False

def main():
    """Run all tests"""
    tests_dir = Path(__file__).parent / 'tests'
    test_files = sorted(tests_dir.glob('test_*.py'))
    
    if not test_files:
        print("No test files found!")
        return 1
    
    print("=" * 60)
    print("Running Dekereke Sound File Association Tool Tests")
    print("=" * 60)
    print()
    
    passed = 0
    failed = 0
    
    for test_file in test_files:
        print(f"Running {test_file.name}...")
        if run_test(test_file):
            passed += 1
        else:
            failed += 1
        print()
    
    print("=" * 60)
    print(f"Test Results: {passed} passed, {failed} failed")
    print("=" * 60)
    
    return 0 if failed == 0 else 1

if __name__ == '__main__':
    sys.exit(main())
