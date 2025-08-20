from flask import Flask, request, jsonify, render_template, send_file
import json, os, requests
from datetime import datetime
from functools import lru_cache
from io import BytesIO
import gtts

# ------------------- Config -------------------
# Your Groq API Key
GROQ_API_KEY = "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"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

app = Flask(__name__, static_folder="static", template_folder="templates")

# ------------------- Knowledge Base -------------------
@lru_cache(maxsize=1)
def load_kb():
    path = "agriculture_knowledge.json"
    if not os.path.exists(path):
        return {"plants": [], "introduction": {"basic_qa": []}}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

# ------------------- Core Bot -------------------
class AgriBot:
    def __init__(self):
        kb = load_kb()
        self.plants = kb.get("plants", [])
        self.basic_qa = kb.get("introduction", {}).get("basic_qa", [])

    def can_answer_from_json(self, question: str, language: str):
        """Check agriculture knowledge base"""
        ql = question.lower()
        for qa in self.basic_qa:
            en_q = (qa.get("question") or "").lower()
            hi_q = (qa.get("hindi_question") or "").lower()
            if en_q and en_q in ql:
                return {
                    "answer": qa.get("answer", ""),
                    "hindi_answer": qa.get("hindi_answer") or qa.get("answer"),
                    "source": "json",
                }
            if language == "hindi" and hi_q and hi_q in ql:
                return {
                    "answer": qa.get("hindi_answer") or qa.get("answer", ""),
                    "hindi_answer": qa.get("hindi_answer") or qa.get("answer"),
                    "source": "json",
                }

        # Plant lookup
        for p in self.plants:
            if (p.get("name") or "").lower() in ql or (p.get("hindi_name") or "").lower() in ql:
                eng = p.get("description", "")
                hin = p.get("hindi_description", "")
                return {"answer": eng, "hindi_answer": hin, "source": "json"}
        return None

    def ask_groq(self, question: str, language: str):
        """Ask Groq API and force response in the selected language"""
        try:
            headers = {
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            }
            system_prompt = (
                "You are a helpful assistant. "
                "If the user selects English, reply only in English. "
                "If the user selects Hindi, reply only in Hindi. "
                "If the user asks for code, return it in clean code blocks using triple backticks."
            )
            payload = {
                "model": "llama3-8b-8192",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"[{language.upper()} MODE] {question}"}
                ]
            }
            r = requests.post(GROQ_URL, headers=headers, json=payload, timeout=60)
            data = r.json()

            if "choices" not in data:
                return {"answer": "Error: No response from Groq", "hindi_answer": None, "source": "groq"}

            answer = data["choices"][0]["message"]["content"]

            if language == "hindi":
                return {"answer": None, "hindi_answer": answer, "source": "groq"}
            else:
                return {"answer": answer, "hindi_answer": None, "source": "groq"}
        except Exception as e:
            return {"answer": f"Groq API error: {e}", "hindi_answer": None, "source": "error"}

bot = AgriBot()

# ------------------- Routes -------------------
@app.route("/")
def home():
    return render_template("index.html")

@app.route("/api/chat", methods=["POST"])
def chat_router():
    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()
    language = (data.get("language") or "english").strip().lower()

    if not question:
        return jsonify({"error": "No question provided"}), 400

    # 1) Agriculture JSON
    json_ans = bot.can_answer_from_json(question, language)
    if json_ans:
        speak_text = json_ans.get("hindi_answer") if language == "hindi" else json_ans.get("answer")
        json_ans["audio_url"] = f"/api/audio?text={requests.utils.quote(speak_text)}&lang={language}"
        log_interaction(question, json_ans["answer"] or json_ans["hindi_answer"], language, json_ans["source"])
        return jsonify({"mode": "json", "result": json_ans})

    # 2) Else use Groq
    ai_ans = bot.ask_groq(question, language)
    speak_text = ai_ans.get("hindi_answer") if language == "hindi" else ai_ans["answer"]
    ai_ans["audio_url"] = f"/api/audio?text={requests.utils.quote(speak_text)}&lang={language}"
    log_interaction(question, speak_text, language, ai_ans["source"])
    return jsonify({"mode": "json", "result": ai_ans})

@app.route("/api/audio")
def text_to_speech():
    text = request.args.get("text", "")
    lang = request.args.get("lang", "english").lower()
    if not text:
        return jsonify({"error": "No text provided"}), 400
    try:
        tts = gtts.gTTS(text=text, lang="hi" if lang == "hindi" else "en")
        buf = BytesIO()
        tts.write_to_fp(buf)
        buf.seek(0)
        return send_file(buf, mimetype="audio/mpeg", as_attachment=False, download_name="response.mp3")
    except Exception as e:
        return jsonify({"error": f"TTS failed: {e}"}), 500

# ------------------- Logging -------------------
def log_interaction(question, answer, language, source):
    try:
        path = "chat_logs.json"
        logs = []
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                try: logs = json.load(f)
                except: logs = []
        logs.append({
            "timestamp": datetime.now().isoformat(),
            "question": question,
            "answer": answer,
            "language": language,
            "source": source
        })
        with open(path, "w", encoding="utf-8") as f:
            json.dump(logs, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print("Log error:", e)

if __name__ == "__main__":
    os.makedirs("templates", exist_ok=True)
    os.makedirs("static", exist_ok=True)
    app.run(host="0.0.0.0", port=5000, debug=True)
