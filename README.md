# Together AI Chatbot

A simple chatbot application that uses Together AI's API to generate responses. This application consists of a FastAPI backend and a simple HTML/TypeScript frontend.

## Setup

### Option 1: Using the Installation Script (Recommended)

Run the installation script to automatically install all dependencies in the correct order:

```bash
python install_dependencies.py
```

### Option 2: Manual Installation

1. Clone this repository
2. Install the required dependencies:

```bash
pip install -r requirements.txt
```

If you encounter dependency conflicts, you can try installing the dependencies manually in the following order:

```bash
pip install together>=0.2.11
pip install fastapi>=0.110.0 uvicorn>=0.27.1 python-multipart>=0.0.9
pip install pydantic>=2.10.0 typing-extensions>=4.10.0
pip install pydantic-ai>=0.0.5
```

> **Note:** When installing dependencies, make sure to use the commands exactly as shown above. Using commands like `pip install package==version` might create unwanted files named "=version" in your directory.

### Cleaning Up Unwanted Files

If you notice unwanted files (like files starting with "=") in your directory, you can run the cleanup script:

```bash
python cleanup.py
```

This script will automatically remove files starting with "=" and list any other suspicious files that might be unwanted.

### Setting up the API Key

Set your Together AI API key as an environment variable:

```bash
export TOGETHER_API_KEY="your_together_api_key"
```

Alternatively, you can edit the `together_model.py` file and replace `"your_key"` with your actual API key.

## Running the Application

To run the application, execute the following command:

```bash
python main.py
```

This will start the FastAPI server on http://0.0.0.0:8000. You can access the chatbot interface by opening this URL in your web browser.

## Customizing the Model

The chatbot uses the "microsoft/WizardLM-2-8x22B" model by default. You can customize the AI model used by the chatbot by modifying the `chat_completion` function in `together_model.py`.

```python
# In together_model.py
response = client.chat.completions.create(
    model="microsoft/WizardLM-2-8x22B",  # Change this to any model supported by Together
    # Other parameters...
)
```

For a list of available models, visit: https://api.together.ai/models

## Troubleshooting

### API Key Issues
If you encounter errors related to the API key, make sure your Together AI API key is correctly set as an environment variable or directly in the code.

### Dependency Conflicts
The project uses several packages that may have conflicting dependencies. If you encounter dependency conflicts, use the installation script or install the packages individually as shown in the Setup section.

### Response Structure Issues
The Together AI API response structure might change. The code includes error handling to manage potential changes in the response structure.

### Model Not Available Error
If you encounter a "model not available" error, check that the model specified in `together_model.py` is available on Together AI. You can view the list of supported models at https://api.together.ai/models.

### Unwanted Files
If you see files like "=0.0.5" in your directory, these are likely created by pip when using the `==` syntax. Run the cleanup script to remove these files:
```bash
python cleanup.py
```

## Files

- `main.py`: The FastAPI backend that handles chat requests and responses
- `together_model.py`: Contains the Together AI integration code
- `chat_app.html`: The HTML frontend for the chatbot
- `chat_app.ts`: The TypeScript code for the frontend
- `install_dependencies.py`: Script to install all required dependencies in the correct order
- `cleanup.py`: Script to remove unwanted files

## Dependencies

- FastAPI: Web framework for building APIs
- Uvicorn: ASGI server for running FastAPI
- Together: Python client for Together AI's API
- Pydantic: Data validation and settings management
- Pydantic-AI: Pydantic extensions for AI applications
- Python-multipart: Multipart form parser for FastAPI
- Typing-extensions: Backported typing features 