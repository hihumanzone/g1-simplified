// Lazy load dependencies - will be initialized when needed
let md = null;
let OpenAI = null;

async function loadDependencies() {
  if (md && OpenAI) return true;
  
  try {
    // Load markdown-it
    await import('https://cdn.jsdelivr.net/npm/markdown-it/dist/markdown-it.min.js');
    md = new markdownit();
    
    // Load OpenAI
    const openaiModule = await import("https://esm.run/openai");
    OpenAI = openaiModule.OpenAI;
    
    return true;
  } catch (error) {
    console.error('Failed to load dependencies:', error);
    return false;
  }
}

// Storage managers
const apiKeyManager = {
  get: () => localStorage.getItem('groqApiKey'),
  save: (apiKey) => localStorage.setItem('groqApiKey', apiKey)
};

const baseUrlManager = {
  get: () => localStorage.getItem('groqBaseUrl') || 'https://api.groq.com/openai/v1',
  save: (baseUrl) => localStorage.setItem('groqBaseUrl', baseUrl)
};

const modelManager = {
  get: () => localStorage.getItem('groqModel') || 'llama-3.1-70b-versatile',
  save: (model) => localStorage.setItem('groqModel', model)
};

const retryAttemptsManager = {
  get: () => parseInt(localStorage.getItem('retryAttempts')) || 3,
  save: (attempts) => localStorage.setItem('retryAttempts', attempts)
};

const retryDelayManager = {
  get: () => parseInt(localStorage.getItem('retryDelay')) || 30,
  save: (delay) => localStorage.setItem('retryDelay', delay)
};

// Conversation history manager
const conversationManager = {
  history: [],
  
  clear() {
    this.history = [];
  },
  
  addUserMessage(content) {
    this.history.push({ role: 'user', content });
  },
  
  addAssistantMessage(content) {
    this.history.push({ role: 'assistant', content });
  },
  
  getHistory() {
    return [...this.history];
  }
};

// Activity logging functions
const logManager = {
  container: null,
  
  init() {
    this.container = document.getElementById('activityLogContent');
    this.clearLogs();
  },
  
  clearLogs() {
    if (this.container) {
      this.container.innerHTML = '';
    }
  },
  
  log(message, type = 'info') {
    console.log(message);
    this._appendToLog(message, type);
  },
  
  error(message) {
    console.error(message);
    this._appendToLog(message, 'error');
  },
  
  warn(message) {
    console.warn(message);
    this._appendToLog(message, 'warning');
  },
  
  _appendToLog(message, type) {
    if (!this.container) return;
    
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    this.container.appendChild(logEntry);
    this.container.scrollTop = this.container.scrollHeight;
  },
  
  startCountdown(seconds, onComplete) {
    const countdownId = Date.now();
    const countdownElement = document.createElement('div');
    countdownElement.className = 'log-entry log-warning';
    countdownElement.innerHTML = `[${new Date().toLocaleTimeString()}] Retrying in <span class="countdown" id="countdown-${countdownId}">${seconds}</span> seconds...`;
    this.container.appendChild(countdownElement);
    
    let remainingSeconds = seconds;
    const intervalId = setInterval(() => {
      remainingSeconds--;
      const countdownSpan = document.getElementById(`countdown-${countdownId}`);
      if (countdownSpan) {
        countdownSpan.textContent = remainingSeconds;
      }
      
      if (remainingSeconds <= 0) {
        clearInterval(intervalId);
        this.log("Retrying now...");
        if (onComplete) onComplete();
      }
    }, 1000);
    
    return intervalId;
  }
};

// UI Manager
const uiManager = {
  chatMessages: null,
  userQuery: null,
  submitBtn: null,
  timeContainer: null,
  isProcessing: false,
  
  init() {
    this.chatMessages = document.getElementById('chatMessages');
    this.userQuery = document.getElementById('userQuery');
    this.submitBtn = document.getElementById('submitQuery');
    this.timeContainer = document.getElementById('timeContainer');
    
    // Auto-resize textarea
    this.userQuery.addEventListener('input', () => {
      this.userQuery.style.height = 'auto';
      this.userQuery.style.height = Math.min(this.userQuery.scrollHeight, 150) + 'px';
    });
  },
  
  setProcessing(processing) {
    this.isProcessing = processing;
    this.submitBtn.disabled = processing;
  },
  
  clearWelcome() {
    const welcome = this.chatMessages.querySelector('.welcome-message');
    if (welcome) {
      welcome.remove();
    }
  },
  
  addUserMessage(content) {
    this.clearWelcome();
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user';
    messageDiv.innerHTML = `
      <div class="message-content">${this.escapeHtml(content)}</div>
      <div class="message-time">${new Date().toLocaleTimeString()}</div>
    `;
    this.chatMessages.appendChild(messageDiv);
    this.scrollToBottom();
  },
  
  createThinkingIndicator() {
    this.clearWelcome();
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    messageDiv.id = 'current-thinking';
    messageDiv.innerHTML = `
      <div class="message-content">
        <div class="thinking-container">
          <div class="thinking-header">
            <span class="thinking-icon">🧠</span>
            <span>Thinking...</span>
          </div>
        </div>
      </div>
    `;
    this.chatMessages.appendChild(messageDiv);
    this.scrollToBottom();
    return messageDiv;
  },
  
  appendStepToThinking(step) {
    const thinkingDiv = document.querySelector('#current-thinking .thinking-container');
    if (thinkingDiv) {
      const header = thinkingDiv.querySelector('.thinking-header');
      if (header && step.title !== 'Thinking...') {
        header.remove();
      }
      this.appendStep(thinkingDiv, step, false);
      this.scrollToBottom();
    }
  },
  
  finalizeThinking(finalStep, thinkingTime) {
    const thinkingMessage = document.getElementById('current-thinking');
    if (thinkingMessage) {
      const thinkingContainer = thinkingMessage.querySelector('.thinking-container');
      this.appendStep(thinkingContainer, finalStep, true);
      
      const timeDiv = document.createElement('div');
      timeDiv.className = 'message-time';
      timeDiv.textContent = `${new Date().toLocaleTimeString()} · ${thinkingTime.toFixed(2)}s thinking`;
      thinkingMessage.appendChild(timeDiv);
      
      thinkingMessage.removeAttribute('id');
      this.scrollToBottom();
    }
  },
  
  appendStep(container, step, isFinal) {
    const stepDiv = document.createElement('div');
    stepDiv.className = isFinal ? 'step final-answer' : 'step';
    
    const titleWrapper = document.createElement('div');
    titleWrapper.className = 'titleWrapper';
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'step-title';
    titleSpan.textContent = step.title;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'step-content';
    contentDiv.innerHTML = md ? md.render(step.content) : step.content;
    
    const codeBlocks = contentDiv.querySelectorAll('pre');
    codeBlocks.forEach(pre => {
      const button = document.createElement('button');
      button.className = 'copy-button';
      button.textContent = 'Copy';
      button.addEventListener('click', () => {
        const code = pre.querySelector('code')?.innerText || pre.innerText;
        navigator.clipboard.writeText(code).then(() => {
          button.textContent = 'Copied!';
          setTimeout(() => button.textContent = 'Copy', 2000);
        }).catch(() => {
          button.textContent = 'Error';
          setTimeout(() => button.textContent = 'Copy', 2000);
        });
      });
      pre.appendChild(button);
    });
    
    titleWrapper.appendChild(titleSpan);
    
    if (!isFinal) {
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'toggleButton';
      toggleBtn.textContent = 'Show';
      contentDiv.style.display = 'none';
      
      toggleBtn.addEventListener('click', () => {
        if (contentDiv.style.display === 'none') {
          contentDiv.style.display = 'block';
          toggleBtn.textContent = 'Hide';
        } else {
          contentDiv.style.display = 'none';
          toggleBtn.textContent = 'Show';
        }
      });
      
      titleWrapper.appendChild(toggleBtn);
    }
    
    stepDiv.appendChild(titleWrapper);
    stepDiv.appendChild(contentDiv);
    container.appendChild(stepDiv);
  },
  
  scrollToBottom() {
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  },
  
  clearInput() {
    this.userQuery.value = '';
    this.userQuery.style.height = 'auto';
  },
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },
  
  updateTimeInfo(text) {
    this.timeContainer.innerHTML = text;
  }
};

// System prompt for conversation support
function getSystemPrompt(isFollowUp) {
  const basePrompt = `You are G1, a helpful AI assistant that thinks step-by-step before responding. You engage in natural conversation and can answer follow-up questions while maintaining context from the conversation.

Your thinking process is divided into steps. Each thinking step should contain your thoughts, followed by a JSON block with 'title' (a brief title for the step) and 'next_action' (either 'continue' or 'final_answer').

Guidelines:
- Use as many reasoning steps as needed to thoroughly address the query
- Explore alternative methods and verify your conclusions
- Re-examine your steps to catch and correct any errors
- Be conversational and helpful while maintaining accuracy
- For follow-up questions, refer to previous context when relevant
- Use \`"next_action": "final_answer"\` when ready to provide your final response

Example thinking step format:
"Let me analyze this problem by first identifying the key components...

{
"title": "Problem Analysis",
"next_action": "continue"
}"`;

  if (isFollowUp) {
    return basePrompt + `

IMPORTANT: This is a follow-up question in an ongoing conversation. Consider the previous messages for context and provide a coherent response that builds on the conversation.`;
  }
  
  return basePrompt;
}

// API call functions
async function makeApiCall(messages, apiKey, baseUrl, model) {
  const openai = new OpenAI({ baseURL: baseUrl, apiKey, dangerouslyAllowBrowser: true });

  logManager.log(`Sending request to ${baseUrl} for model ${model}`);
  const response = await openai.chat.completions.create({
    model: model,
    messages,
    temperature: 0.2,
  });

  return response.choices[0].message.content;
}

function extractJsonFromResponse(responseContent) {
  const jsonMatches = [...responseContent.matchAll(/\{[\s\S]*?\}/g)];

  if (jsonMatches.length === 0) {
    return { title: "Processing", content: responseContent, next_action: "final_answer" };
  }

  const lastJsonMatch = jsonMatches[jsonMatches.length - 1];
  const jsonString = lastJsonMatch[0];

  let parsedJson;
  try {
    parsedJson = JSON.parse(jsonString);
  } catch (error) {
    return { title: "Processing", content: responseContent, next_action: "final_answer" };
  }

  const content = responseContent.slice(0, lastJsonMatch.index).trim();

  return {
    content,
    ...parsedJson
  };
}

// Example prompt handlers
function attachExampleHandlers() {
  document.querySelectorAll('.example-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('userQuery').value = btn.textContent;
      document.getElementById('submitQuery').click();
    });
  });
}

// Main query handler
async function handleQuery() {
  if (uiManager.isProcessing) return;
  
  // Ensure dependencies are loaded
  const depsLoaded = await loadDependencies();
  if (!depsLoaded) {
    alert('Failed to load required dependencies. Please check your internet connection and try again.');
    return;
  }
  
  const apiKey = apiKeyManager.get();
  const baseUrl = baseUrlManager.get();
  const model = modelManager.get();
  const maxRetries = retryAttemptsManager.get();
  const retryDelay = retryDelayManager.get() * 1000;

  if (!apiKey) {
    alert('Please save your API key first in Settings.');
    document.getElementById('settings').classList.remove('hidden');
    return;
  }

  const userQuery = document.getElementById("userQuery").value.trim();
  if (!userQuery) return;

  uiManager.setProcessing(true);
  uiManager.addUserMessage(userQuery);
  uiManager.clearInput();
  uiManager.createThinkingIndicator();
  uiManager.updateTimeInfo('');

  const isFollowUp = conversationManager.history.length > 0;
  conversationManager.addUserMessage(userQuery);
  
  logManager.log(`${isFollowUp ? 'Follow-up' : 'New'} query: "${userQuery.substring(0, 50)}${userQuery.length > 50 ? '...' : ''}"`, 'info');
  logManager.log(`Using model: ${model}`, 'info');

  const messages = [
    { role: "system", content: getSystemPrompt(isFollowUp) }
  ];
  
  const recentHistory = conversationManager.getHistory().slice(-20);
  messages.push(...recentHistory);
  
  messages.push({ 
    role: "assistant", 
    content: "I'll think through this step by step, considering the context of our conversation." 
  });

  const steps = [];
  let totalThinkingTime = 0;
  let stepCount = 1;

  async function makeApiCallWithRetry(msgs, isFinalAnswer, retriesRemaining = maxRetries) {
    try {
      logManager.log(`Making API call (${isFinalAnswer ? 'final answer' : 'step ' + stepCount})...`);
      const result = await makeApiCall(msgs, apiKey, baseUrl, model);
      logManager.log('API call successful', 'info');
      return result;
    } catch (error) {
      logManager.error(`API call failed: ${error.message || 'Unknown error'}`);
      
      if (retriesRemaining > 0) {
        const delayInSeconds = retryDelay / 1000;
        logManager.warn(`Retrying in ${delayInSeconds} seconds. ${retriesRemaining} ${retriesRemaining === 1 ? 'retry' : 'retries'} remaining.`);
        
        return new Promise(resolve => {
          logManager.startCountdown(delayInSeconds, () => {
            resolve(makeApiCallWithRetry(msgs, isFinalAnswer, retriesRemaining - 1));
          });
        });
      } else {
        logManager.error("API call failed after multiple retries");
        return 'I apologize, but I encountered an error while processing your request. Please try again.\n{ "title": "Error", "next_action": "final_answer" }';
      }
    }
  }

  try {
    while (true) {
      const startTime = Date.now();
      const stepRaw = await makeApiCallWithRetry(messages, false);
      const stepData = extractJsonFromResponse(stepRaw);
      const thinkingTime = (Date.now() - startTime) / 1000;
      totalThinkingTime += thinkingTime;

      steps.push({ title: `Step ${stepCount}: ${stepData.title}`, content: stepData.content, thinkingTime });
      logManager.log(`Completed step ${stepCount}: ${stepData.title} in ${thinkingTime.toFixed(2)}s`, 'info');

      uiManager.appendStepToThinking(steps[steps.length - 1]);

      messages.push({ role: "assistant", content: stepRaw });

      if (stepData.next_action === 'final_answer' || stepCount > 25) {
        if (stepCount > 25) {
          logManager.warn("Reached maximum step count (25). Generating final answer.");
        } else {
          logManager.log("Thinking complete. Generating final answer.", 'info');
        }
        break;
      } else {
        messages.push({ role: "user", content: "Continue with your thought process. Re-examine previous steps and focus on the goal." });
        logManager.log("Continuing to next thinking step...");
      }
      stepCount++;
    }

    messages.push({ role: "user", content: "Now provide your final answer based on your reasoning above." });
    
    logManager.log("Requesting final answer...");
    const finalData = await makeApiCallWithRetry(messages, true);
    logManager.log("Final answer received", 'info');

    const finalStep = { title: "Answer", content: finalData };
    uiManager.finalizeThinking(finalStep, totalThinkingTime);
    
    conversationManager.addAssistantMessage(finalData);
    
    uiManager.updateTimeInfo(`Total thinking time: ${totalThinkingTime.toFixed(2)}s`);
  } catch (error) {
    logManager.error(`Error during processing: ${error.message}`);
    uiManager.finalizeThinking({ title: "Error", content: "An error occurred while processing your request. Please try again." }, totalThinkingTime);
  }
  
  uiManager.setProcessing(false);
}

// Initialize everything when DOM is ready
function initializeApp() {
  // Load saved settings
  const savedApiKey = apiKeyManager.get();
  const savedBaseUrl = baseUrlManager.get();
  const savedModel = modelManager.get();
  const savedRetryAttempts = retryAttemptsManager.get();
  const savedRetryDelay = retryDelayManager.get();

  if (savedApiKey) {
    document.getElementById('apiKeyInput').value = savedApiKey;
  }
  if (savedBaseUrl) {
    document.getElementById('baseUrlInput').value = savedBaseUrl;
  }
  if (savedModel) {
    document.getElementById('modelInput').value = savedModel;
  }
  document.getElementById('retryAttemptsInput').value = savedRetryAttempts;
  document.getElementById('retryDelayInput').value = savedRetryDelay;
  
  // Initialize managers
  logManager.init();
  uiManager.init();
  attachExampleHandlers();
  
  // Settings save button
  document.getElementById("saveSettings").addEventListener("click", () => {
    const apiKey = document.getElementById("apiKeyInput").value;
    const baseUrl = document.getElementById("baseUrlInput").value;
    const model = document.getElementById("modelInput").value;
    const retryAttempts = document.getElementById("retryAttemptsInput").value;
    const retryDelay = document.getElementById("retryDelayInput").value;
    
    if (apiKey) apiKeyManager.save(apiKey);
    if (baseUrl) baseUrlManager.save(baseUrl);
    if (model) modelManager.save(model);
    if (retryAttempts && !isNaN(retryAttempts) && retryAttempts > 0) {
      retryAttemptsManager.save(retryAttempts);
    }
    if (retryDelay && !isNaN(retryDelay) && retryDelay >= 0) {
      retryDelayManager.save(retryDelay);
    }
    
    document.getElementById("settings").classList.add("hidden");
    alert('Settings saved!');
  });

  // Toggle settings panel
  document.getElementById("toggleSettings").addEventListener("click", () => {
    const settingsDiv = document.getElementById("settings");
    const activityDiv = document.getElementById("activityLog");
    settingsDiv.classList.toggle("hidden");
    if (!settingsDiv.classList.contains("hidden")) {
      activityDiv.classList.add("hidden");
    }
  });

  // Toggle activity log
  document.getElementById("toggleActivityLog").addEventListener("click", () => {
    const activityDiv = document.getElementById("activityLog");
    const settingsDiv = document.getElementById("settings");
    activityDiv.classList.toggle("hidden");
    if (!activityDiv.classList.contains("hidden")) {
      settingsDiv.classList.add("hidden");
    }
  });

  // Close activity log
  document.getElementById("closeActivityLog").addEventListener("click", () => {
    document.getElementById("activityLog").classList.add("hidden");
  });

  // New chat button
  document.getElementById("newChatBtn").addEventListener("click", () => {
    conversationManager.clear();
    logManager.clearLogs();
    document.getElementById('chatMessages').innerHTML = `
      <div class="welcome-message">
        <div class="welcome-icon">🧠</div>
        <h2>Welcome to g1 Chat</h2>
        <p>I'm an AI assistant that thinks step-by-step before answering. Ask me anything and I'll show you my reasoning process!</p>
        <div class="example-prompts">
          <button class="example-btn">How many 'r's are in strawberry?</button>
          <button class="example-btn">Explain quantum entanglement simply</button>
          <button class="example-btn">What's the best approach to learn a new language?</button>
        </div>
      </div>
    `;
    attachExampleHandlers();
    uiManager.updateTimeInfo('');
  });

  // Submit query
  document.getElementById("submitQuery").addEventListener("click", handleQuery);

  // Handle Enter key to submit
  document.getElementById('userQuery').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('submitQuery').click();
    }
  });
}

// Run initialization
initializeApp();
