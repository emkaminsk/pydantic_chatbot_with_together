import os
import json
from typing import Dict, List, Optional, Any, Union

from together import Together

# Get API key from environment variable
api_key = os.getenv("TOGETHER_API_KEY")  # Together.ai is a good option for accessing various LLMs
if not api_key:
    api_key = "your_key"  # Replace with your actual API key for production

# Initialize the Together client
client = Together(api_key=api_key)

def extract_content_from_response(response):
    """
    Safely extract content from a Together API response.
    
    Args:
        response: The response from the Together API
        
    Returns:
        str: The extracted content or an error message
    """
    try:
        # Try to access as a dictionary
        if isinstance(response, dict):
            if 'choices' in response and response['choices']:
                if 'message' in response['choices'][0]:
                    if 'content' in response['choices'][0]['message']:
                        return response['choices'][0]['message']['content']
        
        # Try to access as an object with attributes
        try:
            # Use getattr to avoid direct attribute access that might cause linter errors
            choices = getattr(response, 'choices', None)
            if choices and len(choices) > 0:
                message = getattr(choices[0], 'message', None)
                if message:
                    content = getattr(message, 'content', None)
                    if content:
                        return content
        except (AttributeError, IndexError, TypeError):
            pass
        
        # Try to convert to dictionary if it's an object
        try:
            response_dict = vars(response)  # Use vars() instead of __dict__
            if 'choices' in response_dict and response_dict['choices']:
                choice = response_dict['choices'][0]
                if isinstance(choice, dict) and 'message' in choice:
                    if 'content' in choice['message']:
                        return choice['message']['content']
        except (AttributeError, IndexError, TypeError):
            pass
        
        return "Could not extract content from response."
    except Exception as e:
        print(f"Error extracting content: {e}")
        return f"Error: {str(e)}"

def generate_story():
    """Generate a short story about forbidden romance between two dogs."""
    try:
        # Create a chat completion request
        response = client.chat.completions.create(
            model="microsoft/WizardLM-2-8x22B",  # Specify the model
            messages=[
                {"role": "user", "content": "Write a short two paragraph story about forbidden romance between two dogs"}
            ],
            max_tokens=1500,
            temperature=1.2,
            top_p=0.9,
            top_k=40,
            repetition_penalty=1.0,
            stream=False,  # Set stream to False to get a complete response
        )
        
        return extract_content_from_response(response)
    except Exception as e:
        print(f"Error generating story: {e}")
        return f"Error generating story: {str(e)}"

def chat_completion(prompt: str, message_history=None) -> str:
    """
    Generate a chat completion using Together AI.
    
    Args:
        prompt (str): The user's prompt
        message_history (list, optional): List of previous messages
        
    Returns:
        str: The model's response
    """
    try:
        messages = []
        
        # Add system prompt
        system_prompt = {
            "role": "system",
            "content": "You are a chatbot. You must strictly follow the game rules that are provided in the first user prompt. Always answer in the language of the prompt. If no specific game rules or language requirements are provided in the first prompt, maintain a helpful and respectful conversation in the language of the current prompt."
        }
        messages.append(system_prompt)
        
        # Add message history if provided
        if message_history:
            for msg in message_history:
                if hasattr(msg, 'parts') and msg.parts:
                    part = msg.parts[0]
                    if hasattr(part, 'content'):
                        role = "user" if msg.__class__.__name__ == "ModelRequest" else "assistant"
                        messages.append({"role": role, "content": part.content})
        
        # Add the current prompt
        messages.append({"role": "user", "content": prompt})
        
        # Create a chat completion request
        response = client.chat.completions.create(
            model="microsoft/WizardLM-2-8x22B",  # Using the same model as generate_story
            messages=messages,
            max_tokens=1000,
            temperature=0.7,
            top_p=0.9,
            top_k=40,
            repetition_penalty=1.0,
            stream=False,  # Set stream to False to get a complete response
        )
        
        return extract_content_from_response(response)
    except Exception as e:
        print(f"Error in chat_completion: {e}")
        return f"An error occurred: {str(e)}" 
