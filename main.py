from __future__ import annotations as _annotations

import asyncio
import json
import sqlite3
import sys
from collections.abc import AsyncIterator
from concurrent.futures.thread import ThreadPoolExecutor
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import partial
from pathlib import Path
from typing import Annotated, Any, Callable, Dict, Literal, TypeVar, List, Optional

# Check for required packages and provide helpful error messages
try:
    import fastapi
    from fastapi import Depends, Request
    from fastapi.responses import FileResponse, Response, StreamingResponse
    from typing_extensions import LiteralString, ParamSpec, TypedDict
except ImportError as e:
    print(f"Error importing required packages: {e}")
    print("Please install the required packages using:")
    print("pip install fastapi uvicorn typing-extensions")
    sys.exit(1)

try:
    from pydantic_ai.messages import (
        ModelMessage,
        ModelMessagesTypeAdapter,
        ModelRequest,
        ModelResponse,
        TextPart,
        UserPromptPart,
    )
except ImportError as e:
    print(f"Error importing pydantic_ai: {e}")
    print("Please install pydantic-ai using:")
    print("pip install pydantic-ai")
    sys.exit(1)

try:
    from together_model import chat_completion
except ImportError as e:
    print(f"Error importing together_model: {e}")
    print("Make sure together_model.py is in the same directory as main.py")
    sys.exit(1)

THIS_DIR = Path(__file__).parent


@asynccontextmanager
async def lifespan(_app: fastapi.FastAPI):
    async with Database.connect() as db:
        yield {'db': db}


app = fastapi.FastAPI(lifespan=lifespan)


@app.get('/')
async def index() -> FileResponse:
    return FileResponse((THIS_DIR / 'chat_app.html'), media_type='text/html')


@app.get('/favicon.ico')
async def favicon() -> FileResponse:
    return FileResponse((THIS_DIR / 'favicon.ico'), media_type='image/x-icon')


@app.get('/chat_app.ts')
async def main_ts() -> FileResponse:
    """Get the raw typescript code, it's compiled in the browser, forgive me."""
    return FileResponse((THIS_DIR / 'chat_app.ts'), media_type='text/plain')


async def get_db(request: Request) -> Database:
    return request.state.db


@app.get('/chat/')
async def get_chat(database: Database = Depends(get_db)) -> Response:
    msgs = await database.get_messages()
    return Response(
        b'\n'.join(json.dumps(to_chat_message(m)).encode('utf-8') for m in msgs),
        media_type='text/plain',
    )


@app.post('/reset-chat/')
async def reset_chat(database: Database = Depends(get_db)) -> Response:
    """Reset the chat history by clearing all messages from the database."""
    try:
        await database.clear_messages()
        return Response(
            json.dumps({"status": "success", "message": "Chat history cleared"}).encode('utf-8'),
            media_type='application/json',
        )
    except Exception as e:
        return Response(
            json.dumps({"status": "error", "message": str(e)}).encode('utf-8'),
            status_code=500,
            media_type='application/json',
        )


class ChatMessage(TypedDict):
    """Format of messages sent to the browser."""

    role: Literal['user', 'model']
    timestamp: str
    content: str


def to_chat_message(m: ModelMessage) -> ChatMessage:
    first_part = m.parts[0]
    if isinstance(m, ModelRequest):
        if isinstance(first_part, UserPromptPart):
            assert isinstance(first_part.content, str)
            return {
                'role': 'user',
                'timestamp': first_part.timestamp.isoformat(),
                'content': first_part.content,
            }
    elif isinstance(m, ModelResponse):
        if isinstance(first_part, TextPart):
            return {
                'role': 'model',
                'timestamp': m.timestamp.isoformat(),
                'content': first_part.content,
            }
    raise ValueError(f'Unexpected message type for chat app: {m}')


@app.post('/chat/')
async def post_chat(
    prompt: Annotated[str, fastapi.Form()],
    model: Annotated[str, fastapi.Form()],
    edit_timestamp: Annotated[Optional[str], fastapi.Form()] = None,
    database: Database = Depends(get_db)
) -> StreamingResponse:
    async def stream_messages():
        """Streams new line delimited JSON `Message`s to the client."""
        timestamp = datetime.now(tz=timezone.utc)
        
        # Only stream the user prompt if this is not an edit
        if not edit_timestamp:
            user_message = {
                'role': 'user',
                'timestamp': timestamp.isoformat(),
                'content': prompt,
            }
            yield json.dumps(user_message).encode('utf-8') + b'\n'
        
        # Get the chat history up to the edited message if edit_timestamp is provided
        messages = await database.get_chat_history(edit_timestamp)
        
        # Create a user prompt part with the current prompt
        user_prompt_part = UserPromptPart(content=prompt, timestamp=timestamp)
        
        # Create a ModelRequest for the user prompt
        user_request = ModelRequest(parts=[user_prompt_part])
        
        try:
            # Get response from Together AI model
            loop = asyncio.get_event_loop()
            with ThreadPoolExecutor() as executor:
                response_text = await loop.run_in_executor(
                    executor, 
                    partial(chat_completion, prompt, messages, model)
                )
            
            # Create a text part with the response
            response_timestamp = datetime.now(tz=timezone.utc)
            text_part = TextPart(content=str(response_text))
            
            # Create a ModelResponse for the AI response
            model_response = ModelResponse(parts=[text_part])
            
            # Stream the model response to the client
            model_message = {
                'role': 'model',
                'timestamp': response_timestamp.isoformat(),
                'content': response_text,
            }
            yield json.dumps(model_message).encode('utf-8') + b'\n'
            
            # Store the messages in a simple format that can be easily retrieved
            user_dict = {
                "role": "user",
                "timestamp": timestamp.isoformat(),
                "content": prompt
            }
            
            response_dict = {
                "role": "model",
                "timestamp": response_timestamp.isoformat(),
                "content": str(response_text)
            }
            
            # Add new messages to the database
            messages_json = json.dumps([user_dict, response_dict]).encode('utf-8')
            await database.add_messages(messages_json)
        except Exception as e:
            # Handle any errors that occur during the API call
            error_timestamp = datetime.now(tz=timezone.utc)
            error_message = {
                'role': 'model',
                'timestamp': error_timestamp.isoformat(),
                'content': f"An error occurred: {str(e)}\n\nPlease check your API key and connection.",
            }
            yield json.dumps(error_message).encode('utf-8') + b'\n'

    return StreamingResponse(stream_messages(), media_type='text/plain')


@app.get('/models/')
async def get_models() -> Response:
    """Get the list of available models from models.txt."""
    try:
        models_file = THIS_DIR / 'models.txt'
        with open(models_file, 'r') as f:
            models = [line.strip() for line in f if line.strip()]
        return Response(
            json.dumps({"models": models}).encode('utf-8'),
            media_type='application/json',
        )
    except Exception as e:
        return Response(
            json.dumps({"status": "error", "message": str(e)}).encode('utf-8'),
            status_code=500,
            media_type='application/json',
        )


P = ParamSpec('P')
R = TypeVar('R')


@dataclass
class Database:
    """Rudimentary database to store chat messages in SQLite.

    The SQLite standard library package is synchronous, so we
    use a thread pool executor to run queries asynchronously.
    """

    con: sqlite3.Connection
    _loop: asyncio.AbstractEventLoop
    _executor: ThreadPoolExecutor

    @classmethod
    @asynccontextmanager
    async def connect(
        cls, file: Path = THIS_DIR / '.chat_app_messages.sqlite'
    ) -> AsyncIterator[Database]:
        loop = asyncio.get_event_loop()
        executor = ThreadPoolExecutor(max_workers=1)
        con = await loop.run_in_executor(executor, cls._connect, file)
        slf = cls(con, loop, executor)
        try:
            yield slf
        finally:
            await slf._asyncify(con.close)

    @staticmethod
    def _connect(file: Path) -> sqlite3.Connection:
        con = sqlite3.connect(str(file))
        cur = con.cursor()
        cur.execute(
            'CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, message_list TEXT);'
        )
        con.commit()
        return con

    async def add_messages(self, messages: bytes):
        await self._asyncify(
            self._execute,
            'INSERT INTO messages (message_list) VALUES (?);',
            messages,
            commit=True,
        )
        await self._asyncify(self.con.commit)

    async def get_chat_history(self, edit_timestamp: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get chat history in a format suitable for the Together API."""
        c = await self._asyncify(
            self._execute, 'SELECT message_list FROM messages ORDER BY id'
        )
        rows = await self._asyncify(c.fetchall)
        
        messages = []
        for row in rows:
            try:
                msg_list = json.loads(row[0])
                for msg in msg_list:
                    if isinstance(msg, dict) and 'role' in msg and 'content' in msg:
                        messages.append(msg)
                        # If we reach the edited message, stop including further messages
                        if edit_timestamp and msg.get('timestamp') == edit_timestamp:
                            break
            except (json.JSONDecodeError, IndexError, KeyError) as e:
                print(f"Error parsing message: {e}")
        
        return messages

    async def get_messages(self) -> list[ModelMessage]:
        """Get messages in a format suitable for the frontend."""
        c = await self._asyncify(
            self._execute, 'SELECT message_list FROM messages ORDER BY id'
        )
        rows = await self._asyncify(c.fetchall)
        
        all_messages = []
        for row in rows:
            try:
                msg_list = json.loads(row[0])
                for msg in msg_list:
                    if isinstance(msg, dict) and 'role' in msg and 'content' in msg:
                        all_messages.append(msg)
            except (json.JSONDecodeError, IndexError, KeyError) as e:
                print(f"Error parsing message: {e}")
        
        # Convert to ModelMessage objects
        result = []
        for msg in all_messages:
            try:
                if msg['role'] == 'user':
                    timestamp = datetime.fromisoformat(msg['timestamp']) if 'timestamp' in msg else datetime.now(tz=timezone.utc)
                    user_prompt = UserPromptPart(content=msg['content'], timestamp=timestamp)
                    result.append(ModelRequest(parts=[user_prompt]))
                elif msg['role'] == 'model':
                    timestamp = datetime.fromisoformat(msg['timestamp']) if 'timestamp' in msg else datetime.now(tz=timezone.utc)
                    text_part = TextPart(content=msg['content'])
                    result.append(ModelResponse(parts=[text_part], timestamp=timestamp))
            except (KeyError, ValueError) as e:
                print(f"Error converting message: {e}")
        
        return result

    async def clear_messages(self):
        """Clear all messages from the database."""
        await self._asyncify(
            self._execute,
            'DELETE FROM messages;',
            commit=True,
        )
        await self._asyncify(self.con.commit)

    def _execute(
        self, sql: LiteralString, *args: Any, commit: bool = False
    ) -> sqlite3.Cursor:
        cur = self.con.cursor()
        cur.execute(sql, args)
        if commit:
            self.con.commit()
        return cur

    async def _asyncify(
        self, func: Callable[P, R], *args: P.args, **kwargs: P.kwargs
    ) -> R:
        return await self._loop.run_in_executor(  # type: ignore
            self._executor,
            partial(func, **kwargs),
            *args,  # type: ignore
        )


if __name__ == '__main__':
    try:
        import uvicorn
    except ImportError:
        print("Error: uvicorn is not installed.")
        print("Please install uvicorn using:")
        print("pip install uvicorn")
        sys.exit(1)

    print("Starting the chatbot server...")
    print("Make sure you have set your Together API key as an environment variable:")
    print("export TOGETHER_API_KEY='your_together_api_key'")
    print("Or update the together_model.py file with your API key.")
    
    uvicorn.run(
        'main:app', host="0.0.0.0", port=8000
    )