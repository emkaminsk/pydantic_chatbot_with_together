// BIG FAT WARNING: to avoid the complexity of npm, this typescript is compiled in the browser
// there's currently no static type checking

// @ts-ignore - Ignore module resolution errors for ESM imports
import { marked } from 'https://cdnjs.cloudflare.com/ajax/libs/marked/15.0.0/lib/marked.esm.js'
// @ts-ignore - Ignore module resolution errors for ESM imports
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.es.min.js'

const convElement = document.getElementById('conversation')
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement
const spinner = document.getElementById('spinner')
const resetButton = document.getElementById('reset-button')

// Function to auto-resize textarea
function autoResizeTextarea(textarea: HTMLTextAreaElement) {
  // Reset height to allow shrinking
  textarea.style.height = 'auto'
  // Set new height based on scroll height
  const newHeight = Math.min(textarea.scrollHeight, 200) // Max height of 200px
  textarea.style.height = `${newHeight}px`
}

// Add input event listener for auto-resizing
if (promptInput) {
  // Initial resize
  autoResizeTextarea(promptInput)
  
  // Listen for input events
  promptInput.addEventListener('input', () => {
    autoResizeTextarea(promptInput)
  })
  
  // Handle Enter key for submission (Shift+Enter for new line)
  promptInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const form = promptInput.closest('form')
      if (form) {
        const submitEvent = new SubmitEvent('submit', {
          bubbles: true,
          cancelable: true
        })
        form.dispatchEvent(submitEvent)
      }
    }
  })
}

// Configure marked for better rendering
marked.setOptions({
  breaks: true,
  gfm: true,
  headerIds: false,
  mangle: false
})

// Custom renderer to enhance AI responses
const renderer = new marked.Renderer()

// Enhance blockquote rendering
renderer.blockquote = (quote) => {
  return `<blockquote class="ai-quote">${quote}</blockquote>`
}

// Enhance code block rendering
renderer.code = (code, language) => {
  return `<pre><code class="language-${language || 'text'}">${code}</code></pre>`
}

// Apply the custom renderer
marked.use({ renderer })

// Function to enhance AI responses with dialog highlighting
function enhanceAIResponse(content: string): string {
  // Process the content with marked first
  let processedContent = marked.parse(content)
  
  // Apply additional formatting for dialogs (text that looks like dialog)
  processedContent = processedContent.replace(
    /(?:<p>)?["']([^"'\n]+)["'](?:<\/p>)?/g, 
    '<blockquote class="ai-quote">$1</blockquote>'
  )
  
  // Highlight dialog patterns like "Person: Text"
  processedContent = processedContent.replace(
    /(?:<p>)?(\w+):\s+([^<]+)(?:<\/p>)?/g,
    '<p><strong>$1:</strong> <em>$2</em></p>'
  )
  
  // Sanitize the HTML to prevent XSS
  return DOMPurify.sanitize(processedContent)
}

// stream the response and render messages as each chunk is received
// data is sent as newline-delimited JSON
async function onFetchResponse(response: Response): Promise<void> {
  let text = ''
  let decoder = new TextDecoder()
  if (response.ok && response.body) {
    const reader = response.body.getReader()
    while (true) {
      const {done, value} = await reader.read()
      if (done) {
        break
      }
      text += decoder.decode(value)
      addMessages(text)
      if (spinner) spinner.classList.remove('active')
    }
    addMessages(text)
    promptInput.disabled = false
    promptInput.focus()
  } else {
    const text = await response.text()
    console.error(`Unexpected response: ${response.status}`, {response, text})
    throw new Error(`Unexpected response: ${response.status}`)
  }
}

// The format of messages, this matches pydantic-ai both for brevity and understanding
// in production, you might not want to keep this format all the way to the frontend
interface Message {
  role: string
  content: string
  timestamp: string
}

// take raw response text and render messages into the `#conversation` element
// Message timestamp is assumed to be a unique identifier of a message, and is used to deduplicate
// hence you can send data about the same message multiple times, and it will be updated
// instead of creating a new message elements
function addMessages(responseText: string) {
  if (!convElement) return;
  
  const lines = responseText.split('\n')
  const messages: Message[] = lines.filter(line => line.length > 1).map(j => JSON.parse(j))
  for (const message of messages) {
    // we use the timestamp as a crude element id
    const {timestamp, role, content} = message
    const id = `msg-${timestamp}`
    let msgDiv = document.getElementById(id)
    if (!msgDiv) {
      msgDiv = document.createElement('div')
      msgDiv.id = id
      msgDiv.title = `${role} at ${timestamp}`
      msgDiv.classList.add('message', role)
      convElement.appendChild(msgDiv)
    }
    
    // Apply enhanced formatting for AI responses
    if (role === 'model') {
      msgDiv.innerHTML = enhanceAIResponse(content)
    } else {
      msgDiv.innerHTML = DOMPurify.sanitize(marked.parse(content))
    }
  }
  scrollToBottom()
}

function scrollToBottom() {
  if (convElement) {
    convElement.scrollTop = convElement.scrollHeight
  }
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
}

function onError(error: any) {
  console.error(error)
  const errorElement = document.getElementById('error')
  if (errorElement) errorElement.classList.remove('d-none')
  if (spinner) spinner.classList.remove('active')
}

async function onSubmit(e: SubmitEvent): Promise<void> {
  e.preventDefault()
  if (spinner) spinner.classList.add('active')
  const body = new FormData(e.target as HTMLFormElement)

  promptInput.value = ''
  promptInput.disabled = true

  const response = await fetch('/chat/', {method: 'POST', body})
  await onFetchResponse(response)
}

// Reset the chat history
async function resetChat() {
  // Show confirmation dialog
  if (confirm('Are you sure you want to reset the chat? This will clear all messages.')) {
    if (spinner) spinner.classList.add('active')
    
    try {
      // Clear the conversation UI
      if (convElement) convElement.innerHTML = ''
      
      // Make a request to reset the chat on the server
      const response = await fetch('/reset-chat/', {method: 'POST'})
      
      if (!response.ok) {
        // If the server doesn't support reset, just clear the UI
        console.warn('Server does not support chat reset. UI has been cleared, but history may persist on server.')
      }
      
      // Add a welcome message
      const welcomeMessage = {
        role: 'model',
        content: 'Chat has been reset. How can I help you today?',
        timestamp: new Date().toISOString()
      }
      
      addMessages(JSON.stringify([welcomeMessage]))
    } catch (error) {
      console.error('Error resetting chat:', error)
      // Still clear the UI even if server request fails
      const errorMessage = {
        role: 'model',
        content: 'Chat UI has been reset, but there was an error communicating with the server. Some history may persist.',
        timestamp: new Date().toISOString()
      }
      addMessages(JSON.stringify([errorMessage]))
    } finally {
      if (spinner) spinner.classList.remove('active')
    }
  }
}

// call onSubmit when the form is submitted (e.g. user clicks the send button or hits Enter)
const formElement = document.querySelector('form')
if (formElement) {
  formElement.addEventListener('submit', (e) => onSubmit(e).catch(onError))
}

// Add event listener for reset button
if (resetButton) {
  resetButton.addEventListener('click', () => resetChat().catch(onError))
}

// load messages on page load
fetch('/chat/').then(onFetchResponse).catch(onError)