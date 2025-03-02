#!/usr/bin/env python3
"""
Cleanup script for the Together AI Chatbot.
This script removes any unwanted files that might have been created during installation.
"""

import os
import sys
from pathlib import Path

def cleanup_unwanted_files():
    """Clean up any unwanted files that might have been created during installation."""
    print("Cleaning up unwanted files...")
    
    # Get the current directory
    current_dir = Path('.')
    
    # Find and remove files starting with '='
    equals_files = list(current_dir.glob('=*'))
    for file in equals_files:
        if file.is_file():
            print(f"Removing: {file}")
            try:
                file.unlink()
            except Exception as e:
                print(f"Error removing {file}: {e}")
    
    if equals_files:
        print(f"Removed {len(equals_files)} unwanted file(s).")
    else:
        print("No unwanted files found.")
    
    # Find and list any other suspicious files
    suspicious_files = []
    for file in current_dir.iterdir():
        if file.is_file() and not file.name.endswith(('.py', '.md', '.txt', '.html', '.ts', '.sqlite')):
            if not file.name.startswith('.'):  # Skip hidden files
                suspicious_files.append(file)
    
    if suspicious_files:
        print("\nThe following files might be unwanted:")
        for file in suspicious_files:
            print(f"  - {file}")
        print("\nTo remove these files, run:")
        for file in suspicious_files:
            print(f"  rm \"{file}\"")
    
    print("\nCleanup complete!")

if __name__ == "__main__":
    cleanup_unwanted_files() 