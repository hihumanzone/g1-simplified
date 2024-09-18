const apiKeyManager = {
  get: () => localStorage.getItem('groqApiKey'),
  save: (apiKey) => localStorage.setItem('groqApiKey', apiKey)
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

window.addEventListener('load', () => {
  const savedApiKey = apiKeyManager.get();
  if (savedApiKey) {
    document.getElementById('apiKeyInput').value = savedApiKey;
  }
});

const { Groq } = await import("https://esm.run/groq-sdk");

document.getElementById("submitQuery").addEventListener("click", async () => {
  const apiKey = apiKeyManager.get();
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

  const messages = [
    { role: "system", content: `You are an expert AI assistant that explains your reasoning step by step. For each step, provide a title that describes what you're doing in that step, along with the content. Decide if you need another step or if you're ready to give the final answer. Respond in JSON format with 'title', 'content', and 'next_action' (either 'continue' or 'final_answer') keys. USE AS MANY REASONING STEPS AS POSSIBLE. AT LEAST 3. BE AWARE OF YOUR LIMITATIONS AS AN LLM AND WHAT YOU CAN AND CANNOT DO. IN YOUR REASONING, INCLUDE EXPLORATION OF ALTERNATIVE ANSWERS. CONSIDER YOU MAY BE WRONG, AND IF YOU ARE WRONG IN YOUR REASONING, WHERE IT WOULD BE. FULLY TEST ALL OTHER POSSIBILITIES. YOU CAN BE WRONG. WHEN YOU SAY YOU ARE RE-EXAMINING, ACTUALLY RE-EXAMINE, AND USE ANOTHER APPROACH TO DO SO. DO NOT JUST SAY YOU ARE RE-EXAMINING. USE AT LEAST 3 METHODS TO DERIVE THE ANSWER. USE BEST PRACTICES.

Example of a valid JSON response:
{
  "title": "Identifying Key Information",
  "content": "To begin solving this problem, we need to carefully examine the given information and identify the crucial elements that will guide our solution process. This involves...",
  "next_action": "continue"
}` },
    { role: "user", content: userQuery },
    { role: "assistant", content: "Thank you! I will now think step by step following my instructions, starting at the beginning after decomposing the problem." }
  ];

  const steps = [];
  let totalThinkingTime = 0;
  let stepCount = 1;

  while (true) {
    const startTime = Date.now();
    const stepData = await makeApiCall(messages, false, apiKey);
    const thinkingTime = (Date.now() - startTime) / 1000;
    totalThinkingTime += thinkingTime;

    steps.push({ title: `Step ${stepCount}: ${stepData.title}`, content: stepData.content, thinkingTime });

    appendStep(responseContainer, steps[steps.length - 1]);

    messages.push({ role: "assistant", content: JSON.stringify(stepData) });

    if (stepData.next_action === 'final_answer' || stepCount > 25) break;
    stepCount++;
  }

  timeContainer.innerHTML = `<strong>Total thinking time: ${totalThinkingTime.toFixed(2)} seconds</strong>`;
  messages.push({ role: "user", content: "Please provide the final answer based on your reasoning above." });
  const finalData = await makeApiCall(messages, true, apiKey);

  steps.push({ title: "Final Answer", content: finalData.content });
  displaySteps(responseContainer, steps);
});

async function makeApiCall(messages, isFinalAnswer, apiKey) {
  try {
    const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });

    const response = await groq.chat.completions.create({
      model: "llama-3.1-70b-versatile",
      messages,
      max_tokens: isFinalAnswer ? 200 : 300,
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error("Error making API call:", error);
    return { title: "Error", content: "An error occurred while generating the response.", next_action: "final_answer" };
  }
}

function appendStep(container, step, isFinal = false) {
  const stepDiv = document.createElement("div");
  stepDiv.className = "step";

  const stepTitle = document.createElement("strong");
  stepTitle.textContent = step.title;

  const stepContent = document.createElement("p");
  stepContent.textContent = step.content;

  if (!isFinal) {
    stepContent.style.display = "none";

    const toggleButton = document.createElement("button");
    toggleButton.textContent = "Show";
    toggleButton.className = "toggle-button";
    toggleButton.style.marginLeft = "10px";

    toggleButton.addEventListener("click", () => {
      if (stepContent.style.display === "none") {
        stepContent.style.display = "block";
        toggleButton.textContent = "Hide";
      } else {
        stepContent.style.display = "none";
        toggleButton.textContent = "Show";
      }
    });

    stepDiv.appendChild(stepTitle);
    stepDiv.appendChild(toggleButton);
  } else {
    stepDiv.appendChild(stepTitle);
  }

  stepDiv.appendChild(stepContent);

  container.appendChild(stepDiv);
}

function displaySteps(container, steps) {
  container.innerHTML = "";
  steps.forEach((step, index) => {
    const isFinal = index === steps.length - 1;
    appendStep(container, step, isFinal);
  });
}