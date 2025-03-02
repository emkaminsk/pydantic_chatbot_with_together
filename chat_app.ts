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
const modelSelector = document.getElementById('model-selector') as HTMLSelectElement
const threadList = document.getElementById('thread-list')

let selectedModel: string = ''
let currentThreadId: number | null = null

// Load available models when the page loads
async function loadModels() {
  try {
    const response = await fetch('/models/')
    const data = await response.json()
    if (data.models && Array.isArray(data.models)) {
      modelSelector.innerHTML = data.models
        .map(model => `<option value="${model}">${model}</option>`)
        .join('')
      selectedModel = data.models[0] // Set the first model as default
    }
  } catch (error) {
    console.error('Error loading models:', error)
  }
}

// Update selected model when changed
modelSelector.addEventListener('change', (e) => {
  selectedModel = (e.target as HTMLSelectElement).value
})

// Call loadModels when the page loads
loadModels()

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
    formData.append('model', selectedModel) // Add selected model to form data
    
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
  if (!content) return ''
  
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
  if (!convElement || !responseText) return;
  
  const lines = responseText.split('\n')
  const messages: Message[] = lines
    .filter(line => line.length > 1)
    .map(j => {
      try {
        return JSON.parse(j)
      } catch (e) {
        console.error('Error parsing message:', e)
        return null
      }
    })
    .filter((m): m is Message => m !== null)

  for (const message of messages) {
    // we use the timestamp as a crude element id
    const {timestamp, role, content} = message
    if (!timestamp || !role || !content) continue

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
          if (msgDiv && !msgDiv.classList.contains('editing')) {
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
        contentDiv.innerHTML = content ? DOMPurify.sanitize(marked.parse(content)) : ''
      }
    }
  }
  scrollToBottom()
}

function scrollToBottom() {
  if (convElement) {
    convElement.scrollTop = convElement.scrollHeight
  }
}

function onError(error: any) {
  console.error('Error:', error)
  const msgDiv = document.createElement('div')
  msgDiv.className = 'message model'
  msgDiv.textContent = `Error: ${error.message || error}`
  if (convElement) {
    convElement.appendChild(msgDiv)
    scrollToBottom()
  }
}

async function onSubmit(e: SubmitEvent): Promise<void> {
  e.preventDefault()
  if (!promptInput?.value.trim()) return
  
  const formData = new FormData()
  formData.append('prompt', promptInput.value)
  formData.append('model', selectedModel) // Add selected model to form data
  
  if (spinner) spinner.classList.add('active')
  promptInput.value = ''
  autoResizeTextarea(promptInput)
  
  try {
    const response = await fetch('/chat/', {
      method: 'POST',
      body: formData
    })
    await onFetchResponse(response)
  } catch (error) {
    onError(error)
  } finally {
    if (spinner) spinner.classList.remove('active')
  }
}

// Load conversation threads
async function loadThreads() {
  try {
    const response = await fetch('/threads/')
    const data = await response.json()
    if (data.threads && Array.isArray(data.threads)) {
      renderThreads(data.threads)
    }
  } catch (error) {
    console.error('Error loading threads:', error)
  }
}

// Render threads in the sidebar
function renderThreads(threads: Array<{id: number, title: string, timestamp: string}>) {
  if (!threadList) return
  
  threadList.innerHTML = ''
  for (const thread of threads) {
    const threadDiv = document.createElement('div')
    threadDiv.className = 'thread-item'
    if (thread.id === currentThreadId) {
      threadDiv.classList.add('active')
    }
    
    const title = document.createElement('div')
    title.className = 'thread-title'
    title.textContent = thread.title
    
    const timestamp = document.createElement('div')
    timestamp.className = 'thread-timestamp'
    timestamp.textContent = new Date(thread.timestamp).toLocaleString()
    
    threadDiv.appendChild(title)
    threadDiv.appendChild(timestamp)
    
    threadDiv.addEventListener('click', () => loadThread(thread.id))
    threadList.appendChild(threadDiv)
  }
}

// Load a specific thread
async function loadThread(threadId: number) {
  if (spinner) spinner.classList.add('active')
  currentThreadId = threadId
  
  try {
    if (convElement) convElement.innerHTML = ''
    const response = await fetch(`/chat/?thread_id=${threadId}`)
    await onFetchResponse(response)
    loadThreads() // Refresh thread list to update active state
  } catch (error) {
    console.error('Error loading thread:', error)
    onError(error)
  } finally {
    if (spinner) spinner.classList.remove('active')
  }
}

// Modify resetChat to also refresh threads
async function resetChat() {
  if (confirm('Are you sure you want to reset the chat? This will clear all messages.')) {
    if (spinner) spinner.classList.add('active')
    
    try {
      if (convElement) convElement.innerHTML = ''
      
      const response = await fetch('/reset-chat/', {method: 'POST'})
      
      if (!response.ok) {
        console.warn('Server does not support chat reset. UI has been cleared, but history may persist on server.')
      }
      
      currentThreadId = null
      await loadThreads() // Refresh thread list
      
      const welcomeMessage = {
        role: 'model',
        content: 'Chat has been reset. How can I help you today?',
        timestamp: new Date().toISOString()
      }
      
      addMessages(JSON.stringify([welcomeMessage]))
    } catch (error) {
      console.error('Error resetting chat:', error)
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

// Load threads when the page loads
loadThreads()