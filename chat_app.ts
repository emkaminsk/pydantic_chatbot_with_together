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

// Keep track of the currently edited message
let currentEditId: string | null = null

// Function to auto-resize textarea
function autoResizeTextarea(textarea: HTMLTextAreaElement) {
  // Reset height to allow shrinking
  textarea.style.height = 'auto'
  // Set new height based on scroll height
  const newHeight = Math.min(textarea.scrollHeight, 200) // Max height of 200px
  textarea.style.height = `${newHeight}px`
}

// Function to create edit form for a message
function createEditForm(content: string): HTMLFormElement {
  const form = document.createElement('form')
  form.className = 'edit-form'
  
  const textarea = document.createElement('textarea')
  textarea.className = 'edit-textarea'
  textarea.value = content
  
  const actions = document.createElement('div')
  actions.className = 'edit-actions'
  
  const saveButton = document.createElement('button')
  saveButton.className = 'btn-save-edit'
  saveButton.textContent = 'Save'
  saveButton.type = 'submit'
  
  const cancelButton = document.createElement('button')
  cancelButton.className = 'btn-cancel-edit'
  cancelButton.textContent = 'Cancel'
  cancelButton.type = 'button'
  
  actions.appendChild(cancelButton)
  actions.appendChild(saveButton)
  form.appendChild(textarea)
  form.appendChild(actions)
  
  return form
}

// Function to handle message editing
function startEditing(msgDiv: HTMLElement, content: string) {
  if (currentEditId) {
    // Cancel any existing edit
    cancelEditing()
  }
  
  currentEditId = msgDiv.id
  msgDiv.classList.add('editing')
  
  // Create and add edit form
  const editForm = createEditForm(content)
  msgDiv.appendChild(editForm)
  
  // Focus the textarea
  const textarea = editForm.querySelector('textarea')
  if (textarea) {
    textarea.focus()
    autoResizeTextarea(textarea)
    textarea.addEventListener('input', () => autoResizeTextarea(textarea))
  }
  
  // Handle cancel button
  const cancelButton = editForm.querySelector('.btn-cancel-edit')
  if (cancelButton) {
    cancelButton.addEventListener('click', () => cancelEditing())
  }
  
  // Handle form submission
  editForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const textarea = editForm.querySelector('textarea')
    if (textarea) {
      await submitEdit(msgDiv, textarea.value)
    }
  })
  
  // Fade out subsequent messages
  let nextElement = msgDiv.nextElementSibling
  while (nextElement) {
    nextElement.classList.add('faded')
    nextElement = nextElement.nextElementSibling
  }
}

// Function to cancel editing
function cancelEditing() {
  if (currentEditId) {
    const msgDiv = document.getElementById(currentEditId)
    if (msgDiv) {
      msgDiv.classList.remove('editing')
      const editForm = msgDiv.querySelector('.edit-form')
      if (editForm) {
        editForm.remove()
      }
      
      // Remove faded class from subsequent messages
      let nextElement = msgDiv.nextElementSibling
      while (nextElement) {
        nextElement.classList.remove('faded')
        nextElement = nextElement.nextElementSibling
      }
    }
    currentEditId = null
  }
}

// Function to submit edited message
async function submitEdit(msgDiv: HTMLElement, newContent: string) {
  if (spinner) spinner.classList.add('active')
  
  try {
    // Remove subsequent messages from the UI
    let nextElement = msgDiv.nextElementSibling
    while (nextElement) {
      const temp = nextElement.nextElementSibling
      nextElement.remove()
      nextElement = temp
    }
    
    // Create form data for the edit
    const formData = new FormData()
    formData.append('prompt', newContent)
    formData.append('edit_timestamp', msgDiv.id.replace('msg-', ''))
    
    // Send the edited message
    const response = await fetch('/chat/', {
      method: 'POST',
      body: formData
    })
    
    await onFetchResponse(response)
    
    // Clean up editing state
    msgDiv.classList.remove('editing')
    const editForm = msgDiv.querySelector('.edit-form')
    if (editForm) {
      editForm.remove()
    }
    
    // Update the message content
    const contentDiv = msgDiv.querySelector('.message-content')
    if (contentDiv) {
      contentDiv.innerHTML = DOMPurify.sanitize(marked.parse(newContent))
    }
    
    currentEditId = null
  } catch (error) {
    console.error('Error submitting edit:', error)
    onError(error)
  } finally {
    if (spinner) spinner.classList.remove('active')
  }
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
      
      // Add click handler for user messages
      if (role === 'user') {
        msgDiv.addEventListener('click', () => {
          if (!msgDiv.classList.contains('editing')) {
            startEditing(msgDiv, content)
          }
        })
      }
      
      // Create content div
      const contentDiv = document.createElement('div')
      contentDiv.className = 'message-content'
      msgDiv.appendChild(contentDiv)
      
      convElement.appendChild(msgDiv)
    }
    
    // Update content
    const contentDiv = msgDiv.querySelector('.message-content')
    if (contentDiv) {
      if (role === 'model') {
        contentDiv.innerHTML = enhanceAIResponse(content)
      } else {
        contentDiv.innerHTML = DOMPurify.sanitize(marked.parse(content))
      }
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