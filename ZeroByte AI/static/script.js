console.log("✅ script.js loaded");

// State
let currentLanguage = 'english';
let isProcessing = false;

// --------- Plant Library ---------
function initPlantLibrary() {
    const grid = document.getElementById('plant-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const plants = [
        { id: 1, name: "Tomato",  hindi_name: "टमाटर", type: "Vegetable", hindi_type: "सब्जी", image: "https://cdn.britannica.com/68/185168-050-C00C6AAE/Variety-heirloom-tomatoes.jpg?w=300" },
        { id: 2, name: "Wheat",   hindi_name: "गेहूं",  type: "Grain",     hindi_type: "अनाज", image: "https://cdn.britannica.com/80/157180-050-7B906E02/Heads-wheat-grains.jpg?w=300" },
        { id: 3, name: "Potato",  hindi_name: "आलू",   type: "Tuber",     hindi_type: "कंद",  image: "https://cdn.britannica.com/33/150733-050-363A4598/potatoes.jpg?w=300" },
        { id: 4, name: "Rice",    hindi_name: "चावल",  type: "Grain",     hindi_type: "अनाज", image: "https://cdn.britannica.com/17/176517-050-6F2B774A/Pile-uncooked-rice-grains-Oryza-sativa.jpg?w=300" }
    ];

    plants.forEach(p => {
        const card = document.createElement('div');
        card.className = 'plant-card';
        card.innerHTML = `
        <div class="plant-image" style="background-image:url('${p.image}')"></div>
        <div class="plant-info">
        <div class="plant-name">${p.name} / ${p.hindi_name}</div>
        <div class="plant-type">${p.type} / ${p.hindi_type}</div>
        </div>`;
        card.addEventListener('click', () => {
            sendQuickQuestion(currentLanguage === 'hindi'
            ? `${p.hindi_name} के बारे में जानकारी दें`
            : `Tell me about growing ${p.name}`);
        });
        grid.appendChild(card);
    });
}

// --------- Language Toggle ---------
const hindiBtn = document.getElementById('hindi-btn');
if (hindiBtn) {
    hindiBtn.addEventListener('click', () => {
        currentLanguage = 'hindi';
        hindiBtn.classList.add('active');
        const ebtn = document.getElementById('english-btn');
        if (ebtn) ebtn.classList.remove('active');
        updateUIForLanguage();
    });
}
const englishBtn = document.getElementById('english-btn');
if (englishBtn) {
    englishBtn.addEventListener('click', () => {
        currentLanguage = 'english';
        englishBtn.classList.add('active');
        const hbtn = document.getElementById('hindi-btn');
        if (hbtn) hbtn.classList.remove('active');
        updateUIForLanguage();
    });
}

function updateUIForLanguage() {
    const input = document.getElementById('user-input');
    if (input) {
        input.placeholder = currentLanguage === 'hindi'
        ? "कृषि के बारे में कुछ भी पूछें..."
        : "Ask me anything about agriculture...";
    }
    const title = document.getElementById('plant-library-title');
    if (title) title.textContent = currentLanguage === 'hindi' ? "पौधों का पुस्तकालय" : "Plant Library";
}

// --------- Speech Recognition ---------
let recognition;
try {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.onresult = e => {
        const transcript = e.results[0][0].transcript;
        const input = document.getElementById('user-input');
        if (input) input.value = transcript;
    };
        recognition.onerror = () => showAlert(currentLanguage === 'hindi'
        ? "ध्वनि पहचान में त्रुटि हुई" : "Speech recognition error", 'error');
} catch (e) {
    console.warn('Speech recognition not supported');
}

// --------- Audio ---------
const audioPlayer = new Audio();
function playAudioResponse(url) {
    audioPlayer.src = url;
    audioPlayer.play().catch(() => showAlert("⚠️ Audio failed", 'error'));
}

// --------- Alerts ---------
function showAlert(message, type = 'info') {
    const alertBox = document.createElement('div');
    alertBox.className = `alert ${type}`;
    alertBox.textContent = message;
    document.body.appendChild(alertBox);
    setTimeout(() => alertBox.remove(), 2500);
}

// --------- Chat UI Helpers ---------
function addUserMessage(text) {
    const chat = document.getElementById('chat-messages');
    if (!chat) return;
    const div = document.createElement('div');
    div.className = 'message user-message';
    div.textContent = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function addBotMessage(text, imageUrl = null, source = "json") {
    const chat = document.getElementById('chat-messages');
    if (!chat) return;
    const wrap = document.createElement('div');
    wrap.className = 'message bot-message';

    let label = "💬 Response";
    if (source === "json") label = "🌱 Agriculture Answer";
    else if (source === "ollama") label = "🤖 AI Answer (Ollama)";
    else if (source === "typing") label = "✍️ Bot is typing...";
    else if (source === "error") label = "⚠️ Error";

    const header = document.createElement('strong');
    header.textContent = label;
    wrap.appendChild(header);

    if (imageUrl) {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.style.maxWidth = '200px';
        img.style.borderRadius = '8px';
        img.style.display = 'block';
        img.style.margin = '8px 0';
        wrap.appendChild(img);
    }

    const textDiv = document.createElement('div');
    textDiv.textContent = text;
    wrap.appendChild(textDiv);

    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;

    return { wrap, textDiv };
}

// --------- Send Message (Router -> Stream if needed) ---------
async function sendMessage() {
    if (isProcessing) return;
    const input = document.getElementById('user-input');
    const btn = document.getElementById('send-button');
    if (!input || !btn) return;

    const message = input.value.trim();
    if (!message) return;

    isProcessing = true;
    addUserMessage(message);
    input.value = '';
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        // 1) Ask router if JSON can answer
        const routerRes = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: message, language: currentLanguage })
        });

        if (!routerRes.ok) throw new Error(`HTTP ${routerRes.status}`);
        const routerData = await routerRes.json();

        if (routerData.mode === 'json') {
            // Instant JSON answer
            const r = routerData.result;
            addBotMessage(r.answer, r.image_url || null, r.source || "json");
            if (r.audio_url) playAudioResponse(r.audio_url);
        } else if (routerData.mode === 'stream') {
            // 2) Stream from Ollama
            const { textDiv } = addBotMessage("", null, "ollama"); // build container
            const streamRes = await fetch('/api/chat_stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: message, language: currentLanguage })
            });
            if (!streamRes.ok || !streamRes.body) throw new Error("Stream failed");

            const reader = streamRes.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                chunk.split("\n\n").forEach(line => {
                    if (line.startsWith("data: ")) {
                        const text = line.substring(6);
                        if (text === "[DONE]") return;
                        if (text.startsWith("[ERROR]")) {
                            textDiv.textContent += "\n⚠️ " + text.replace("[ERROR]", "").trim();
                        } else {
                            textDiv.textContent += text;
                        }
                    }
                });
            }
            // Optional: auto TTS of the streamed message (grab final text)
            // playAudioResponse(`/api/audio?text=${encodeURIComponent(textDiv.textContent)}&lang=${currentLanguage}`);
        } else {
            addBotMessage("Unexpected server response.", null, "error");
        }
    } catch (e) {
        console.error(e);
        addBotMessage(
            currentLanguage === 'hindi' ? "त्रुटि: प्रतिक्रिया प्राप्त करने में विफल" : "Error: Failed to get response",
            null, "error"
        );
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i>';
        isProcessing = false;
    }
}

function sendQuickQuestion(q) {
    const input = document.getElementById('user-input');
    if (!input) return;
    input.value = q;
    sendMessage();
}

// --------- Buttons / Events ---------
const sendBtn = document.getElementById('send-button');
if (sendBtn) sendBtn.addEventListener('click', sendMessage);

const speakBtn = document.getElementById('speak-button');
if (speakBtn) speakBtn.addEventListener('click', () => {
    if (isProcessing || !recognition) return;
                                        recognition.lang = currentLanguage === 'hindi' ? 'hi-IN' : 'en-US';
    recognition.start();
});

const clearBtn = document.getElementById('clear-chat');
if (clearBtn) clearBtn.addEventListener('click', () => {
    const chat = document.getElementById('chat-messages');
    if (chat) chat.innerHTML = '';
});

// --------- Init ---------
window.onload = () => {
    initPlantLibrary();
    updateUIForLanguage();
    addBotMessage(
        currentLanguage === 'hindi'
        ? "नमस्ते! मैं AgriBot हूँ, आपका कृषि सहायक। कैसे मदद करूँ?"
        : "Hello! I'm AgriBot, your agricultural assistant. How can I help?"
    );
};
