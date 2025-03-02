#!/usr/bin/env python3
"""
Installation script for the Together AI Chatbot dependencies.
This script will install all the required dependencies in the correct order.
"""

import subprocess
import sys
import os
import shutil
from pathlib import Path

def run_command(command):
    """Run a shell command and print the output."""
    print(f"Running: {command}")
    try:
        result = subprocess.run(command, shell=True, check=True, text=True, capture_output=True)
        if result.stdout:
            print(result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error: {e}")
        if e.stdout:
            print(e.stdout)
        if e.stderr:
            print(e.stderr)
        return False

def clean_unwanted_files():
    """Clean up any unwanted files that might have been created during installation."""
    current_dir = Path('.')
    for file in current_dir.glob('=*'):
        if file.is_file():
            print(f"Removing unwanted file: {file}")
            file.unlink()

def install_dependencies():
    """Install all required dependencies in the correct order."""
    print("Installing Together AI Chatbot dependencies...")
    
    # Install base packages
    packages = [
        "together>=0.2.11",
        "fastapi>=0.110.0",
        "uvicorn>=0.27.1",
        "python-multipart>=0.0.9",
        "typing-extensions>=4.10.0",
        "pydantic>=2.10.0",
    ]
    
    for package in packages:
        if not run_command(f"{sys.executable} -m pip install {package}"):
            print(f"Failed to install {package}")
            return False
    
    # Install pydantic-ai last to avoid dependency conflicts
    if not run_command(f"{sys.executable} -m pip install pydantic-ai>=0.0.5"):
        print("Failed to install pydantic-ai")
        return False
    
    # Clean up any unwanted files
    clean_unwanted_files()
    
    print("\nAll dependencies installed successfully!")
    return True

def check_together_api_key():
    """Check if the Together API key is set."""
    api_key = os.environ.get("TOGETHER_API_KEY")
    if not api_key:
        print("\nWARNING: TOGETHER_API_KEY environment variable is not set.")
        print("You need to set your Together API key to use the chatbot.")
        print("You can do this by running:")
        print("export TOGETHER_API_KEY='your_together_api_key'")
        print("\nAlternatively, you can edit the together_model.py file and replace 'your_key' with your actual API key.")
    else:
        print("\nTOGETHER_API_KEY environment variable is set.")

def main():
    """Main function."""
    print("Together AI Chatbot Setup")
    print("========================\n")
    
    # Clean up any existing unwanted files before installation
    clean_unwanted_files()
    
    if install_dependencies():
        check_together_api_key()
        
        print("\nSetup complete! You can now run the chatbot with:")
        print("python main.py")
        print("\nThe chatbot will use the 'microsoft/WizardLM-2-8x22B' model by default.")
    else:
        print("\nSetup failed. Please check the error messages above.")

if __name__ == "__main__":
    main() 