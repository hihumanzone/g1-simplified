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

import 'https://cdn.jsdelivr.net/npm/markdown-it/dist/markdown-it.min.js';
const md = new markdownit();
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
    { role: "system", content: `You are G1, a model designed to spend some time thinking before you respond, much like a person would. Throughout your initial state processing, you are supposed to learn how to refine your thinking process, try different strategies, and recognize any mistakes you might have made in previous thinking steps.

Your thinking process will be divided into steps. You are only supposed to provide one step of your thinking process per request. If that particular thinking process continues, you will be asked again to continue with what you were doing in a new request, starting fresh to reflect upon previous steps and build upon them. Each thinking step should contain three segments: the first is the thinking content, followed by a title that represents that particular step, and finally, a decision on whether to continue thinking or conclude that you are ready to provide the final response. Use normal text for your thoughts, and at the end of the thinking step, include some JSON-formatted information with the keys 'title' (provide a brief title for the step) and 'next_action' (either 'continue' or 'final_answer').

Use as many reasoning steps as you can, and ensure you cover everything provided in the query. Pay close attention to the main parts and tasks, planning what to do, how to do it, and doing it. Essentially, prepare notes, proofs and a roadmap for the final response. Make sure to cover everything, genuinely solve the issues, write it down, and implement it using various methods and strategies. Recheck your work, recognize any mistakes from earlier thinking steps, and ensure everything is relevant and connected.

Always explore and use alternative methods for solving the problem. As an LLM, it's possible that you could have made an error in any of the previous steps. Recheck each thinking step after major steps as part of the process of reflection. It’s normal to make mistakes, so carefully examine where you might have gone wrong and correct yourself. You should also apply different strategies and methods to verify your conclusions. Genuinely and seriously re-examine your steps, using at least three methods or strategies, and apply the best possible approaches to achieve the intended goal.

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

  while (true) {
    const startTime = Date.now();
    const stepData = await makeApiCall(messages, false, apiKey);
    const thinkingTime = (Date.now() - startTime) / 1000;
    totalThinkingTime += thinkingTime;

    steps.push({ title: `Step ${stepCount}: ${stepData.title}`, content: stepData.content, thinkingTime });

    appendStep(responseContainer, steps[steps.length - 1]);

    messages.push({ role: "assistant", content: JSON.stringify(stepData) });
    messages.push({ role: "user", content: "Please continue thinking." });

    if (stepData.next_action === 'final_answer' || stepCount > 25) break;
    stepCount++;
  }

  timeContainer.innerHTML = `<strong>Total thinking time: ${totalThinkingTime.toFixed(2)} seconds</strong>`;
  messages.push({ role: "user", content: "Please provide the final answer based on your reasoning above." });
  const finalData = await makeApiCall(messages, true, apiKey);

  steps.push({ title: "Final Answer", content: finalData });
  displaySteps(responseContainer, steps);
});

async function makeApiCall(messages, isFinalAnswer, apiKey) {
  try {
    const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });

    const response = await groq.chat.completions.create({
      model: "llama-3.1-70b-versatile",
      messages,
      temperature: 0.2,
    });

    const responseContent = response.choices[0].message.content;

    if (isFinalAnswer) {
      return responseContent;
    }

    const jsonMatches = [...responseContent.matchAll(/\{[\s\S]*?\}/g)];

    if (jsonMatches.length === 0) {
      throw new Error("No valid JSON found in the response content.");
    }

    const lastJsonMatch = jsonMatches[jsonMatches.length - 1];
    const jsonString = lastJsonMatch[0];
    const parsedJson = JSON.parse(jsonString);

    const content = responseContent.slice(0, lastJsonMatch.index).trim();

    return {
      content,
      ...parsedJson
    };

  } catch (error) {
    console.error("Error making API call:", error);
    return { title: "Error", content: "An error occurred while generating the response.", next_action: "final_answer" };
  }
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
    const isFinal = index === steps.length - 1;
    appendStep(container, step, isFinal);
  });
}
