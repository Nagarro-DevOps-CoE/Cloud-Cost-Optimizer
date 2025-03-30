<template>
  <div :class="['chat-container', isDarkMode ? 'dark-mode' : 'light-mode']">
    <div class="theme-toggle" @click="toggleDarkMode">
      <span v-if="isDarkMode">☀️</span>
      <span v-else>🌙</span>
    </div>

    <!-- Sidebar for Chat History -->
    <div class="sidebar">
      <h2>Chat History</h2>
      <button class="clear-all-button" @click="clearChatHistory">Clear All</button>
      <div class="history-list">
        <div v-for="(history, index) in chatHistory" :key="index" class="history-item" @click="loadHistory(index)">
          <div class="history-summary">{{ history.summary }}</div>
          <div class="history-date">{{ history.date }}</div>
        </div>
      </div>
    </div>

    <!-- Main Chat Area -->
    <div class="main-chat">
      <h1>🤖 ⛅ Cloud Cost Optimizer</h1>

      <div class="chat-box">
        <div v-for="(message, index) in messages" :key="index" :class="['message', message.role]">
          <div v-if="message.role === 'bot'" v-html="renderMarkdown(message.text)"></div>
          <div v-else>{{ message.text }}</div>
        </div>
        <!-- Show "Generating..." message when loading -->
        <div v-if="loading" class="message bot generating">
          Generating<span class="blinking-dots">...</span>
        </div>
      </div>

      <div class="input-box">
        <input v-model="userInput" placeholder="Ask me about your Cloud costs..." @keyup.enter="sendMessage" />
        <button @click="sendMessage">Send</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted } from "vue";
import axios from "axios";
import { marked } from "marked";

const messages = ref([{ role: "bot", text: "Hi there! Need help optimizing your cloud costs? Ask me anything" }]);
const userInput = ref("");
const isDarkMode = ref(false);
const chatHistory = ref([]);
const loading = ref(false); // Add loading state
const MAX_HISTORY_ITEMS = 8; // Maximum number of chat history items to keep

// Load chat history from local storage on component mount
onMounted(() => {
  const savedHistory = localStorage.getItem("chatHistory");
  if (savedHistory) {
    chatHistory.value = JSON.parse(savedHistory);
  }
});

const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value;
};

const renderMarkdown = (text) => {
  return marked(text); // Convert markdown to HTML
};

const sendMessage = async () => {
  if (!userInput.value) return;

  // Save user message
  const userMessage = { role: "user", text: userInput.value };
  messages.value.push(userMessage);

  // Save the input text
  const inputText = userInput.value;
  userInput.value = "";

  await nextTick();
  scrollToBottom();

  // Set loading to true
  loading.value = true;

  try {
    // Get bot response
    const response = await axios.get(`/api/chat?q=${encodeURIComponent(inputText)}`);
    const botMessage = { role: "bot", text: response.data.response };
    messages.value.push(botMessage);

    // Save the conversation to chat history
    const newHistoryItem = {
      summary: inputText, // Use the user's message as the summary
      date: new Date().toLocaleDateString(), // Add the current date
      messages: [userMessage, botMessage] // Save the full conversation
    };

    // Add new history item and limit the history to MAX_HISTORY_ITEMS
    chatHistory.value.push(newHistoryItem);
    if (chatHistory.value.length > MAX_HISTORY_ITEMS) {
      chatHistory.value.shift(); // Remove the oldest item
    }

    // Save to local storage
    localStorage.setItem("chatHistory", JSON.stringify(chatHistory.value));
  } catch {
    messages.value.push({ role: "bot", text: "Sorry, something went wrong." });
  } finally {
    // Set loading to false
    loading.value = false;
  }

  userInput.value = "";
  await nextTick();
  scrollToBottom();
};

const scrollToBottom = () => {
  const chatBox = document.querySelector(".chat-box");
  chatBox.scrollTop = chatBox.scrollHeight;
};

// Load chat history when a history item is clicked
const loadHistory = (index) => {
  messages.value = chatHistory.value[index].messages;
};

// Clear all chat history
const clearChatHistory = () => {
  chatHistory.value = []; // Clear the chat history array
  localStorage.removeItem("chatHistory"); // Remove from local storage
};
</script>

<style>
body, html {
  margin: 0;
  padding: 0;
  font-family: Arial, sans-serif;
}

.chat-container {
  display: flex;
  height: 100vh;
  width: 100vw;
}

.light-mode {
  background: #f4f4f4;
  color: black;
}

.dark-mode {
  background: #121212;
  color: white;
}

.theme-toggle {
  position: absolute;
  top: 20px;
  right: 20px;
  font-size: 24px;
  cursor: pointer;
}

/* Sidebar Styles */
.sidebar {
  width: 250px;
  background: #2c3e50;
  color: white;
  padding: 20px;
  overflow-y: auto;
}

.sidebar h2 {
  font-size: 24px;
  margin-bottom: 20px;
}

.clear-all-button {
  width: 100%;
  padding: 10px;
  background: #e74c3c;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 16px;
  margin-bottom: 20px;
}

.clear-all-button:hover {
  background: #c0392b;
}

.history-list {
  display: flex;
  flex-direction: column;
}

.history-item {
  padding: 10px;
  margin: 5px 0;
  background: #34495e;
  border-radius: 5px;
  cursor: pointer;
}

.history-item:hover {
  background: #3b4f63;
}

.history-summary {
  font-size: 16px;
  font-weight: bold;
}

.history-date {
  font-size: 14px;
  color: #bdc3c7;
}

/* Main Chat Area Styles */
.main-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
}

h1 {
  margin-bottom: 20px;
  font-size: 32px;
  color: black;
}

.chat-box {
  width: 90%;
  height: 70vh;
  background: white;
  border-radius: 10px;
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
}

.dark-mode .chat-box {
  background: #1e1e1e;
  color: white;
}

.message {
  max-width: 80%;
  padding: 15px;
  border-radius: 10px;
  margin: 10px;
  font-size: 18px;
}

.user {
  align-self: flex-end;
  background: #007bff;
  color: white;
}

.bot {
  align-self: flex-start;
  background: #f1f1f1;
  color: black;
}

.dark-mode .bot {
  background: #333;
  color: white;
}

.generating {
  opacity: 0.8;
}

.blinking-dots {
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

.input-box {
  width: 90%;
  display: flex;
  margin-top: 20px;
}

input {
  flex: 1;
  padding: 15px;
  border: 1px solid #ccc;
  border-radius: 25px;
  outline: none;
  font-size: 18px;
}

button {
  padding: 15px 20px;
  margin-left: 10px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 25px;
  cursor: pointer;
  font-size: 18px;
}

button:hover {
  background: #0056b3;
}
</style>