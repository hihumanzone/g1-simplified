// Configuration managers
const config = {
  apiKey: {
    get: () => localStorage.getItem('groqApiKey'),
    save: (value) => localStorage.setItem('groqApiKey', value)
  },
  baseUrl: {
    get: () => localStorage.getItem('groqBaseUrl') || 'https://api.groq.com/openai/v1',
    save: (value) => localStorage.setItem('groqBaseUrl', value)
  },
  model: {
    get: () => localStorage.getItem('groqModel') || 'llama-3.1-70b-versatile',
    save: (value) => localStorage.setItem('groqModel', value)
  },
  retryAttempts: {
    get: () => parseInt(localStorage.getItem('retryAttempts')) || 3,
    save: (value) => localStorage.setItem('retryAttempts', value)
  },
  retryDelay: {
    get: () => parseInt(localStorage.getItem('retryDelay')) || 30,
    save: (value) => localStorage.setItem('retryDelay', value)
  }
};

// System prompt constant
const SYSTEM_PROMPT = `You are G1, a model designed to spend some time thinking before you respond, much like a person would. Throughout your initial state processing, you are supposed to learn how to refine your thinking process, try different strategies, and recognize any mistakes you might have made in previous thinking steps.

Your thinking process will be divided into steps. You are supposed to only process one step of your thinking process per request. If that thinking process continues, you will be asked again to continue with what you were doing in a new request, starting fresh to reflect upon previous steps and build upon them. Each thinking step should contain three segments: the first is the thinking content, followed by a title that represents that particular step, and finally, a decision on whether to continue thinking or conclude that you are ready to provide the final response. Use normal text for your thoughts, and at the end of the thinking step, include some JSON-formatted information with the keys 'title' (provide a brief title for the step) and 'next_action' (either 'continue' or 'final_answer').

Use as many reasoning steps as you can, and ensure you cover everything provided in the query. Pay close attention to the main parts and tasks, planning what to do, how to do it, and do it. Essentially, prepare notes, proofs and a roadmap for the final response. Make sure to cover everything, genuinely implementing various methods and strategies, writing detailed solutions, and putting them into practice. Recheck your work, recognize any mistakes from earlier thinking steps, and ensure everything is relevant and connected.

Always explore and use alternative methods for solving the problem. As an LLM, it's possible that you made an error in any of the previous steps. Recheck each thinking step after major steps as part of the process of reflection. It's normal to make mistakes, so carefully examine where you might have gone wrong and correct yourself. You should also apply different strategies and methods to verify your conclusions. Genuinely and seriously re-examine your steps, using at least three methods or strategies, and apply the best possible approaches to achieve the intended goal.

Use \`"next_action": "final_answer"\` when you believe you are ready to provide a final response after all the detailed thinking. Make sure you have gathered sufficient information and notes about what the final response should be like. Aim to be as helpful, accurate, and informative to the user as possible.

Example of a valid thinking step:
"To begin solving this problem, we need to carefully examine the given information and identify the crucial elements that will guide our solution process. This involves...

{
"title": "Identifying Key Information",
"next_action": "continue"
}"`;

const INITIAL_ASSISTANT_MESSAGE = "Thank you. I will now think step by step, following my instructions, starting by planning and breaking down everything.";
const FOLLOWUP_ASSISTANT_MESSAGE = "Thank you for your follow-up question. I will now think step by step, following my instructions, building upon the previous context.";
const CONTINUE_PROMPT = "Please continue with your thought process. Make sure to re-examine your previous steps and focus on your target. Implement the strategies and methods by writing them down, rather than just imagining them and their outcomes.";
const FINAL_PROMPT = "Looks like you are finally done thinking! Please provide your final answer to the user based on the reasoning above.";
const MAX_STEPS = 25;

// Conversation state manager
const conversation = {
  messages: [],
  steps: [],
  isActive: false,
  currentQuery: '',

  reset() {
    this.messages = [];
    this.steps = [];
    this.isActive = false;
    this.currentQuery = '';
  },

  initialize(query) {
    this.messages = [{ role: "system", content: SYSTEM_PROMPT }];
    this.steps = [];
    this.isActive = true;
    this.currentQuery = query;
    this.addMessage("user", query);
    this.addMessage("assistant", INITIAL_ASSISTANT_MESSAGE);
  },

  addFollowUp(query) {
    this.currentQuery = query;
    this.addMessage("user", query);
    this.addMessage("assistant", FOLLOWUP_ASSISTANT_MESSAGE);
  },

  addMessage(role, content) {
    this.messages.push({ role, content });
  },

  addStep(step) {
    this.steps.push(step);
  }
};

// Activity logger
const logger = {
  container: null,

  init() {
    this.container = document.getElementById('activityLogContent');
    this.clear();
  },

  clear() {
    if (this.container) this.container.innerHTML = '';
  },

  log(message, type = 'info') {
    console.log(message);
    this._append(message, type);
  },

  error(message) {
    console.error(message);
    this._append(message, 'error');
  },

  warn(message) {
    console.warn(message);
    this._append(message, 'warning');
  },

  _append(message, type) {
    if (!this.container) return;
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    this.container.appendChild(entry);
    this.container.scrollTop = this.container.scrollHeight;
  },

  countdown(seconds, onComplete) {
    const id = Date.now();
    const entry = document.createElement('div');
    entry.className = 'log-entry log-warning';
    entry.innerHTML = `[${new Date().toLocaleTimeString()}] Retrying in <span id="cd-${id}">${seconds}</span>s...`;
    this.container.appendChild(entry);

    let remaining = seconds;
    const interval = setInterval(() => {
      remaining--;
      const span = document.getElementById(`cd-${id}`);
      if (span) span.textContent = remaining;
      if (remaining <= 0) {
        clearInterval(interval);
        this.log("Retrying now...");
        onComplete?.();
      }
    }, 1000);
    return interval;
  }
};

// UI helpers
const ui = {
  elements: {},

  init() {
    this.elements = {
      submitBtn: document.getElementById('submitQuery'),
      newConvoBtn: document.getElementById('newConversation'),
      queryInput: document.getElementById('userQuery'),
      responseContainer: document.getElementById('responseContainer'),
      timeContainer: document.getElementById('timeContainer'),
      settingsPanel: document.getElementById('settings'),
      settingsToggle: document.getElementById('toggleSettings')
    };
  },

  setLoading(isLoading) {
    const btn = this.elements.submitBtn;
    btn.disabled = isLoading;
    btn.querySelector('.btn-text').classList.toggle('hidden', isLoading);
    btn.querySelector('.btn-loading').classList.toggle('hidden', !isLoading);
    this.elements.queryInput.disabled = isLoading;
  },

  showNewConversationBtn() {
    this.elements.newConvoBtn.classList.remove('hidden');
  },

  hideNewConversationBtn() {
    this.elements.newConvoBtn.classList.add('hidden');
  },

  updatePlaceholder(isFollowUp) {
    this.elements.queryInput.placeholder = isFollowUp 
      ? "Ask a follow-up question..." 
      : "e.g., How many 'r's are in the word strawberry?";
  },

  clearQuery() {
    this.elements.queryInput.value = '';
  },

  showGenerating() {
    this.elements.responseContainer.innerHTML = `
      <div class="generating">
        <div class="spinner-large"></div>
        <p>Thinking through this step by step...</p>
      </div>
    `;
  },

  clearResponse() {
    this.elements.responseContainer.innerHTML = '';
  },

  displayUserQuery(query) {
    const div = document.createElement('div');
    div.className = 'user-query-display';
    div.innerHTML = `
      <div class="label">Your Question</div>
      <div class="query-text">${this.escapeHtml(query)}</div>
    `;
    this.elements.responseContainer.appendChild(div);
  },

  appendFollowUpDivider() {
    const divider = document.createElement('div');
    divider.className = 'follow-up-divider';
    divider.innerHTML = '<span>Follow-up</span>';
    this.elements.responseContainer.appendChild(divider);
  },

  updateTime(seconds) {
    this.elements.timeContainer.innerHTML = `<strong>Total thinking time: ${seconds.toFixed(2)} seconds</strong>`;
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// Import dependencies
import 'https://cdn.jsdelivr.net/npm/markdown-it/dist/markdown-it.min.js';
const md = new markdownit();
const { OpenAI } = await import("https://esm.run/openai");

// API call function
async function makeApiCall(messages) {
  const openai = new OpenAI({
    baseURL: config.baseUrl.get(),
    apiKey: config.apiKey.get(),
    dangerouslyAllowBrowser: true
  });

  logger.log(`Sending request to ${config.baseUrl.get()}`);
  const response = await openai.chat.completions.create({
    model: config.model.get(),
    messages,
    temperature: 0.2,
  });

  return response.choices[0].message.content;
}

// API call with retry logic
async function makeApiCallWithRetry(messages, stepInfo, retriesRemaining = null) {
  if (retriesRemaining === null) retriesRemaining = config.retryAttempts.get();
  
  try {
    logger.log(`Making API call (${stepInfo})...`);
    const result = await makeApiCall(messages);
    logger.log('API call successful', 'info');
    return result;
  } catch (error) {
    logger.error(`API call failed: ${error.message || 'Unknown error'}`);

    if (retriesRemaining > 0) {
      const delay = config.retryDelay.get();
      logger.warn(`Retrying in ${delay}s. ${retriesRemaining} ${retriesRemaining === 1 ? 'retry' : 'retries'} remaining.`);

      return new Promise(resolve => {
        logger.countdown(delay, () => {
          resolve(makeApiCallWithRetry(messages, stepInfo, retriesRemaining - 1));
        });
      });
    } else {
      logger.error("API call failed after multiple retries");
      return `An error occurred while generating the response after multiple retries.\n${JSON.stringify({ title: "Error", next_action: "final_answer" })}`;
    }
  }
}

// Extract JSON from response
function extractJsonFromResponse(content) {
  const matches = [...content.matchAll(/\{[\s\S]*?\}/g)];
  
  if (matches.length === 0) {
    return { title: "Error", content: "An error occurred while generating the response.", next_action: "final_answer" };
  }

  const lastMatch = matches[matches.length - 1];
  let parsed;
  
  try {
    parsed = JSON.parse(lastMatch[0]);
  } catch {
    return { title: "Error", content: "An error occurred while generating the response.", next_action: "final_answer" };
  }

  return {
    content: content.slice(0, lastMatch.index).trim(),
    ...parsed
  };
}

// Append step to UI
function appendStep(container, step, isFinalAnswer = false) {
  const stepDiv = document.createElement("div");
  stepDiv.className = isFinalAnswer ? "step final-answer" : "step";

  const titleWrapper = document.createElement("div");
  titleWrapper.className = "titleWrapper";

  const titleEl = document.createElement("title");
  titleEl.textContent = step.title;

  const contentDiv = document.createElement("div");
  contentDiv.innerHTML = md.render(step.content);

  // Add copy buttons to code blocks
  contentDiv.querySelectorAll('pre').forEach(pre => {
    const btn = document.createElement('button');
    btn.className = 'copy-button';
    btn.textContent = 'Copy';
    btn.addEventListener('click', async () => {
      const code = pre.querySelector('code')?.innerText || pre.innerText;
      try {
        await navigator.clipboard.writeText(code);
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 2000);
      } catch {
        btn.textContent = 'Error';
        setTimeout(() => btn.textContent = 'Copy', 2000);
      }
    });
    pre.appendChild(btn);
  });

  if (!isFinalAnswer) {
    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "Show";
    toggleBtn.className = "toggleButton";
    contentDiv.style.display = "none";

    toggleBtn.addEventListener("click", () => {
      const isHidden = contentDiv.style.display === "none";
      contentDiv.style.display = isHidden ? "block" : "none";
      toggleBtn.textContent = isHidden ? "Hide" : "Show";
    });

    titleWrapper.appendChild(titleEl);
    titleWrapper.appendChild(toggleBtn);
  } else {
    contentDiv.style.display = "block";
    titleWrapper.appendChild(titleEl);
  }

  stepDiv.appendChild(titleWrapper);
  stepDiv.appendChild(contentDiv);
  container.appendChild(stepDiv);
}

// Main submit handler
async function handleSubmit() {
  const query = ui.elements.queryInput.value.trim();
  if (!query) {
    showToast('Please enter a question.', 'error');
    return;
  }

  if (!config.apiKey.get()) {
    showToast('Please save your API key first in Settings.', 'error');
    document.getElementById('settings').classList.remove('hidden');
    document.getElementById('apiKeyInput').focus();
    return;
  }

  const isFollowUp = conversation.isActive;
  
  logger.clear();
  ui.setLoading(true);
  ui.clearQuery();
  ui.updatePlaceholder(true);
  ui.showNewConversationBtn();

  try {
    if (isFollowUp) {
      logger.log(`Follow-up: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`, 'info');
      ui.appendFollowUpDivider();
      ui.displayUserQuery(query);
      conversation.addFollowUp(query);
    } else {
      logger.log(`New query: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`, 'info');
      ui.showGenerating();
      conversation.initialize(query);
      // Clear generating message and show user query
      ui.clearResponse();
      ui.displayUserQuery(query);
    }

    logger.log(`Using model: ${config.model.get()}`, 'info');

    let totalThinkingTime = 0;
    let stepCount = 1;

    // Thinking loop
    while (true) {
      const startTime = Date.now();
      const rawResponse = await makeApiCallWithRetry(conversation.messages, `step ${stepCount}`);
      const stepData = extractJsonFromResponse(rawResponse);
      const thinkingTime = (Date.now() - startTime) / 1000;
      totalThinkingTime += thinkingTime;

      const step = {
        title: `Step ${stepCount}: ${stepData.title}`,
        content: stepData.content,
        thinkingTime
      };

      conversation.addStep(step);
      conversation.addMessage("assistant", rawResponse);
      logger.log(`Step ${stepCount}: ${stepData.title} (${thinkingTime.toFixed(2)}s)`, 'info');
      
      appendStep(ui.elements.responseContainer, step);

      if (stepData.next_action === 'final_answer' || stepCount >= MAX_STEPS) {
        if (stepCount >= MAX_STEPS) {
          logger.warn(`Maximum steps (${MAX_STEPS}) reached.`);
        } else {
          logger.log("Thinking complete. Generating final answer.", 'info');
        }
        break;
      }

      conversation.addMessage("user", CONTINUE_PROMPT);
      stepCount++;
    }

    // Get final answer
    conversation.addMessage("user", FINAL_PROMPT);
    logger.log("Requesting final answer...");
    
    const finalResponse = await makeApiCallWithRetry(conversation.messages, "final answer");
    conversation.addMessage("assistant", finalResponse);
    logger.log("Final answer received", 'info');

    const finalStep = { title: "Final Answer", content: finalResponse };
    conversation.addStep(finalStep);
    appendStep(ui.elements.responseContainer, finalStep, true);

    ui.updateTime(totalThinkingTime);

  } catch (error) {
    logger.error(`Unexpected error: ${error.message}`);
    ui.elements.responseContainer.innerHTML = `<div class="step"><div class="titleWrapper"><title>Error</title></div><div>An unexpected error occurred. Please try again.</div></div>`;
  } finally {
    ui.setLoading(false);
  }
}

// Handle new conversation
function handleNewConversation() {
  conversation.reset();
  ui.clearResponse();
  ui.elements.timeContainer.innerHTML = '';
  ui.clearQuery();
  ui.updatePlaceholder(false);
  ui.hideNewConversationBtn();
  logger.clear();
  logger.log("Started new conversation", 'info');
}

// Settings save handlers
function setupSettingsHandlers() {
  const settings = [
    { id: 'saveApiKey', inputId: 'apiKeyInput', configKey: 'apiKey', name: 'API key' },
    { id: 'saveBaseUrl', inputId: 'baseUrlInput', configKey: 'baseUrl', name: 'Base URL' },
    { id: 'saveModel', inputId: 'modelInput', configKey: 'model', name: 'Model' },
    { id: 'saveRetryAttempts', inputId: 'retryAttemptsInput', configKey: 'retryAttempts', name: 'Retry attempts', validate: v => !isNaN(v) && v > 0 },
    { id: 'saveRetryDelay', inputId: 'retryDelayInput', configKey: 'retryDelay', name: 'Retry delay', validate: v => !isNaN(v) && v >= 0 }
  ];

  settings.forEach(({ id, inputId, configKey, name, validate }) => {
    document.getElementById(id).addEventListener('click', () => {
      const value = document.getElementById(inputId).value;
      if (value && (!validate || validate(value))) {
        config[configKey].save(value);
        showToast(`${name} saved!`, 'success');
      } else {
        showToast(`Please enter a valid ${name.toLowerCase()}.`, 'error');
      }
    });
  });

  // Settings toggle
  document.getElementById('toggleSettings').addEventListener('click', () => {
    const panel = document.getElementById('settings');
    panel.classList.toggle('hidden');
  });

  // Close settings button
  document.getElementById('closeSettings').addEventListener('click', () => {
    document.getElementById('settings').classList.add('hidden');
  });

  // API key visibility toggle
  document.getElementById('toggleApiKeyVisibility').addEventListener('click', () => {
    const input = document.getElementById('apiKeyInput');
    const btn = document.getElementById('toggleApiKeyVisibility');
    if (input.type === 'password') {
      input.type = 'text';
      btn.textContent = '🙈';
    } else {
      input.type = 'password';
      btn.textContent = '👁️';
    }
  });
}

// Toast notification
function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('show'));
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Load saved settings
function loadSettings() {
  const savedApiKey = config.apiKey.get();
  const savedBaseUrl = config.baseUrl.get();
  const savedModel = config.model.get();

  if (savedApiKey) document.getElementById('apiKeyInput').value = savedApiKey;
  if (savedBaseUrl) document.getElementById('baseUrlInput').value = savedBaseUrl;
  if (savedModel) document.getElementById('modelInput').value = savedModel;
  document.getElementById('retryAttemptsInput').value = config.retryAttempts.get();
  document.getElementById('retryDelayInput').value = config.retryDelay.get();
}

// Initialize app
function init() {
  ui.init();
  logger.init();
  loadSettings();
  setupSettingsHandlers();

  // Event listeners
  document.getElementById('submitQuery').addEventListener('click', handleSubmit);
  document.getElementById('newConversation').addEventListener('click', handleNewConversation);

  // Keyboard shortcut: Ctrl/Cmd + Enter to submit
  document.getElementById('userQuery').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  });
}

// Start app when DOM is ready
document.readyState !== 'loading' ? init() : document.addEventListener('DOMContentLoaded', init);
