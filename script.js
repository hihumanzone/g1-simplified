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

document.getElementById("saveApiKey").addEventListener("click", () => {
  const apiKey = document.getElementById("apiKeyInput").value;
  if (apiKey) {
    apiKeyManager.save(apiKey);
    alert('API key saved!');
  } else {
    alert('Please enter a valid API key.');
  }
});

document.getElementById("saveBaseUrl").addEventListener("click", () => {
  const baseUrl = document.getElementById("baseUrlInput").value;
  if (baseUrl) {
    baseUrlManager.save(baseUrl);
    alert('Base URL saved!');
  } else {
    alert('Please enter a valid Base URL.');
  }
});

document.getElementById("saveModel").addEventListener("click", () => {
  const model = document.getElementById("modelInput").value;
  if (model) {
    modelManager.save(model);
    alert('Model saved!');
  } else {
    alert('Please enter a valid model.');
  }
});

document.getElementById("saveRetryAttempts").addEventListener("click", () => {
  const retryAttempts = document.getElementById("retryAttemptsInput").value;
  if (retryAttempts && !isNaN(retryAttempts) && retryAttempts > 0) {
    retryAttemptsManager.save(retryAttempts);
    alert('Retry attempts saved!');
  } else {
    alert('Please enter a valid number greater than 0 for retry attempts.');
  }
});

document.getElementById("saveRetryDelay").addEventListener("click", () => {
  const retryDelay = document.getElementById("retryDelayInput").value;
  if (retryDelay && !isNaN(retryDelay) && retryDelay >= 0) {
    retryDelayManager.save(retryDelay);
    alert('Retry delay saved!');
  } else {
    alert('Please enter a valid number (0 or greater) for retry delay.');
  }
});

document.getElementById("toggleSettings").addEventListener("click", () => {
  const settingsDiv = document.getElementById("settings");
  const isHidden = settingsDiv.classList.contains("hidden");
  settingsDiv.classList.toggle("hidden", !isHidden);
  document.getElementById("toggleSettings").textContent = isHidden ? "Show Settings" : "Hide Settings";
});

document.getElementById("toggleActivityLog").addEventListener("click", () => {
  const logContent = document.getElementById("activityLogContent");
  const button = document.getElementById("toggleActivityLog");
  
  if (logContent.style.display === "none") {
    logContent.style.display = "block";
    button.textContent = "Hide Log";
  } else {
    logContent.style.display = "none";
    button.textContent = "Show Log";
  }
});

window.addEventListener('load', () => {
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
  
  // Initialize log manager
  logManager.init();
});

import 'https://cdn.jsdelivr.net/npm/markdown-it/dist/markdown-it.min.js';
const md = new markdownit();
const { OpenAI } = await import("https://esm.run/openai");

document.getElementById("submitQuery").addEventListener("click", async () => {
  const apiKey = apiKeyManager.get();
  const baseUrl = baseUrlManager.get();
  const model = modelManager.get();
  const maxRetries = retryAttemptsManager.get();
  const retryDelay = retryDelayManager.get() * 1000;

  if (!apiKey) {
    alert('Please save your API key first.');
    return;
  }

  const userQuery = document.getElementById("userQuery").value;
  if (!userQuery) return;

  const responseContainer = document.getElementById("responseContainer");
  const timeContainer = document.getElementById("timeContainer");
  responseContainer.innerHTML = '<div class="generating">Generating response...</div>';
  timeContainer.innerHTML = "";
  
  // Clear logs on new query
  logManager.clearLogs();
  logManager.log(`Starting new query: "${userQuery.substring(0, 50)}${userQuery.length > 50 ? '...' : ''}"`, 'info');
  logManager.log(`Using model: ${model}`, 'info');

  const messages = [
    { role: "system", content: `You are G1, a model designed to spend some time thinking before you respond, much like a person would. Throughout your initial state processing, you are supposed to learn how to refine your thinking process, try different strategies, and recognize any mistakes you might have made in previous thinking steps.

Your thinking process will be divided into steps. You are supposed to only process one step of your thinking process per request. If that thinking process continues, you will be asked again to continue with what you were doing in a new request, starting fresh to reflect upon previous steps and build upon them. Each thinking step should contain three segments: the first is the thinking content, followed by a title that represents that particular step, and finally, a decision on whether to continue thinking or conclude that you are ready to provide the final response. Use normal text for your thoughts, and at the end of the thinking step, include some JSON-formatted information with the keys 'title' (provide a brief title for the step) and 'next_action' (either 'continue' or 'final_answer').

Use as many reasoning steps as you can, and ensure you cover everything provided in the query. Pay close attention to the main parts and tasks, planning what to do, how to do it, and do it. Essentially, prepare notes, proofs and a roadmap for the final response. Make sure to cover everything, genuinely implementing various methods and strategies, writing detailed solutions, and putting them into practice. Recheck your work, recognize any mistakes from earlier thinking steps, and ensure everything is relevant and connected.

Always explore and use alternative methods for solving the problem. As an LLM, it's possible that you made an error in any of the previous steps. Recheck each thinking step after major steps as part of the process of reflection. It’s normal to make mistakes, so carefully examine where you might have gone wrong and correct yourself. You should also apply different strategies and methods to verify your conclusions. Genuinely and seriously re-examine your steps, using at least three methods or strategies, and apply the best possible approaches to achieve the intended goal.

Use \`"next_action": "final_answer"\` when you believe you are ready to provide a final response after all the detailed thinking. Make sure you have gathered sufficient information and notes about what the final response should be like. Aim to be as helpful, accurate, and informative to the user as possible.

Example of a valid thinking step:
“To begin solving this problem, we need to carefully examine the given information and identify the crucial elements that will guide our solution process. This involves...

{
"title": "Identifying Key Information",
"next_action": "continue"
}“` },
    { role: "user", content: userQuery },
    { role: "assistant", content: "Thank you. I will now think step by step, following my instructions, starting by planning and breaking down everything." }
    ];

  const steps = [];
  let totalThinkingTime = 0;
  let stepCount = 1;

  async function makeApiCallWithRetry(messages, isFinalAnswer, apiKey, baseUrl, model, retriesRemaining = maxRetries) {
    try {
      logManager.log(`Making API call (${isFinalAnswer ? 'final answer' : 'step ' + stepCount})...`);
      const result = await makeApiCall(messages, isFinalAnswer, apiKey, baseUrl, model);
      logManager.log('API call successful', 'info');
      return result;
    } catch (error) {
      logManager.error(`API call failed: ${error.message || 'Unknown error'}`);
      
      if (retriesRemaining > 0) {
        const delayInSeconds = retryDelay / 1000;
        logManager.warn(`Retrying in ${delayInSeconds} seconds. ${retriesRemaining} ${retriesRemaining === 1 ? 'retry' : 'retries'} remaining.`);
        
        return new Promise(resolve => {
          logManager.startCountdown(delayInSeconds, () => {
            resolve(makeApiCallWithRetry(messages, isFinalAnswer, apiKey, baseUrl, model, retriesRemaining - 1));
          });
        });
      } else {
        logManager.error("API call failed after multiple retries");
        return 'An error occurred while generating the response after multiple retries.\\n{ "title": "Error", "next_action": "final_answer" }';
      }
    }
  }

  while (true) {
    const startTime = Date.now();
    const stepRaw = await makeApiCallWithRetry(messages, false, apiKey, baseUrl, model);
    const stepData = extractJsonFromResponse(stepRaw);
    const thinkingTime = (Date.now() - startTime) / 1000;
    totalThinkingTime += thinkingTime;

    steps.push({ title: `Step ${stepCount}: ${stepData.title}`, content: stepData.content, thinkingTime });
    logManager.log(`Completed step ${stepCount}: ${stepData.title} in ${thinkingTime.toFixed(2)}s`, 'info');

    appendStep(responseContainer, steps[steps.length - 1]);

    messages.push({ role: "assistant", content: stepRaw });

    if (stepData.next_action === 'final_answer' || stepCount > 25) {
      if (stepCount > 25) {
        logManager.warn("Reached maximum step count (25). Stopping thinking process.");
      } else {
        logManager.log("Thinking process complete. Generating final answer.", 'info');
      }
      break;
    } else {
      messages.push({ role: "user", content: "Please continue with your thought process. Make sure to re-examine your previous steps and focus on your target. Implement the strategies and methods by writing them down, rather than just imagining them and their outcomes." });
      logManager.log("Continuing to next thinking step...");
    }
    stepCount++;
  }

  timeContainer.innerHTML = `<strong>Total thinking time: ${totalThinkingTime.toFixed(2)} seconds</strong>`;
  messages.push({ role: "user", content: "Looks like you are finally done thinking! Please provide your final answer to the user based on the reasoning above." });
  
  logManager.log("Requesting final answer...");
  const finalData = await makeApiCallWithRetry(messages, true, apiKey, baseUrl, model);
  logManager.log("Final answer received", 'info');

  steps.push({ title: "Final Answer", content: finalData });
  displaySteps(responseContainer, steps);
});

async function makeApiCall(messages, isFinalAnswer, apiKey, baseUrl, model) {
  try {
    const openai = new OpenAI({ baseURL: baseUrl, apiKey, dangerouslyAllowBrowser: true });

    logManager.log(`Sending request to ${baseUrl} for model ${model}`);
    const response = await openai.chat.completions.create({
      model: model,
      messages,
      temperature: 0.2,
    });

    const responseContent = response.choices[0].message.content;
    return responseContent;

  } catch (error) {
    logManager.error(`Error details: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
    throw error;
  }
}

function extractJsonFromResponse(responseContent) {
  const jsonMatches = [...responseContent.matchAll(/\{[\s\S]*?\}/g)];

  if (jsonMatches.length === 0) {
    return { title: "Error", content: "An error occurred while generating the response.", next_action: "final_answer" };
  }

  const lastJsonMatch = jsonMatches[jsonMatches.length - 1];
  const jsonString = lastJsonMatch[0];

  let parsedJson;
  try {
    parsedJson = JSON.parse(jsonString);
  } catch (error) {
    return { title: "Error", content: "An error occurred while generating the response.", next_action: "final_answer" };
  }

  const content = responseContent.slice(0, lastJsonMatch.index).trim();

  return {
    content,
    ...parsedJson
  };
}

function appendStep(container, step) {
  const stepDiv = document.createElement("div");
  stepDiv.className = "step";

  const titleWrapper = document.createElement("div");
  titleWrapper.className = "titleWrapper";

  const titleDiv = document.createElement("title");
  titleDiv.textContent = step.title;

  const contentP = document.createElement("div");
  contentP.innerHTML = md.render(step.content);

  const codeBlocks = contentP.querySelectorAll('pre');
  codeBlocks.forEach(pre => {
    const button = document.createElement('button');
    button.className = 'copy-button';
    button.textContent = 'Copy';

    button.addEventListener('click', () => {
      const code = pre.querySelector('code').innerText;
      navigator.clipboard.writeText(code).then(() => {
        button.textContent = 'Copied!';
        setTimeout(() => {
          button.textContent = 'Copy';
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy:', err);
        button.textContent = 'Error';
        setTimeout(() => {
          button.textContent = 'Copy';
        }, 2000);
      });
    });

    pre.appendChild(button);
  });

  if (step.title !== "Final Answer") {
    const toggleButton = document.createElement("button");
    toggleButton.textContent = "Show Content";
    toggleButton.className = "toggleButton";

    contentP.style.display = "none";

    toggleButton.addEventListener("click", () => {
      if (contentP.style.display === "none") {
        contentP.style.display = "block";
        toggleButton.textContent = "Hide Content";
      } else {
        contentP.style.display = "none";
        toggleButton.textContent = "Show Content";
      }
    });

    titleWrapper.appendChild(titleDiv);
    titleWrapper.appendChild(toggleButton);
  } else {
    contentP.style.display = "block";
    titleWrapper.appendChild(titleDiv);
  }

  stepDiv.appendChild(titleWrapper);
  stepDiv.appendChild(contentP);
  container.appendChild(stepDiv);
}

function displaySteps(container, steps) {
  container.innerHTML = "";
  steps.forEach((step, index) => {
    appendStep(container, step);
  });
  logManager.log(`Displayed ${steps.length} steps`, 'info');
}
