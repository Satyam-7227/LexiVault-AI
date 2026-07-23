# LexiVault AI 📖✨

LexiVault AI is a powerful, locally-hosted platform that turns every PDF into a vocabulary advantage. It combines a premium document reader with an AI-powered word assistant, spaced repetition learning (FSRS algorithm), and comprehensive reading analytics.

---

## 🌟 Key Features

*   **Premium PDF Reader**: Virtualized, infinite-scroll PDF reader that automatically saves your progress.
*   **AI Word Assistant**: Integrated slide-in panel to define words, find synonyms, and explain meanings in simple terms using local AI (Ollama).
*   **Smart Vocabulary Notebook**: Save words directly from PDFs. Group, filter (Easy/Medium/Hard/Favorites), and tag your vocabulary.
*   **Spaced Repetition (FSRS)**: Scientifically proven memory scheduling ensures you review words right before you forget them.
*   **Quiz Room**: Test your knowledge and track your accuracy over time.
*   **Rich Analytics**: GitHub-style activity heatmaps, reading progress charts, and weakness tracking.
*   **Dark/Light Mode**: Beautiful, responsive, premium UI.

---

## 📸 Screenshots

*(Add your screenshots to a folder named `assets/` in your repository and uncomment the lines below)*

<!--
![Dashboard Preview](assets/dashboard.png)
![PDF Reader & AI Assistant](assets/reader.png)
![Vocabulary Notebook](assets/vocabulary.png)
![Analytics Page](assets/analytics.png)
-->

---

## 🛠️ Technology Stack

*   **Frontend**: React 18, TypeScript, Vite, React Router, React-PDF, Recharts, Framer Motion.
*   **Backend**: Python, FastAPI, Motor (Async MongoDB), PyMuPDF (PDF extraction), PyFSRS.
*   **AI Engine**: Ollama (Running locally for privacy).
*   **Database**: MongoDB (Atlas or local).

---

## 🚀 Getting Started (Local Development)

Follow these steps to set up LexiVault AI on your local machine. 

### Prerequisites
1. **Node.js** (v18+)
2. **Python** (3.10+)
3. **MongoDB** (A free MongoDB Atlas cluster or local MongoDB instance)
4. **Ollama** (For AI explanations)

### 1. Clone the Repository
```bash
git clone https://github.com/Satyam-7227/LexiVault-AI.git
cd "LexiVault AI"
```

### 2. Backend Setup
The backend is a modular FastAPI application.

```bash
cd Backend

# Create a virtual environment
python -m venv .venv

# Activate the virtual environment (Windows)
.\.venv\Scripts\activate
# For Mac/Linux use: source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

**Configure Backend Environment Variables:**
Create a `.env` file inside the `Backend/` directory with the following variables:
```env
# Example .env file
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200
```

**Start the Backend Server:**
```bash
uvicorn main:app --reload
```
*The API will be available at `http://localhost:8000`*

### 3. Frontend Setup
The frontend is built with React and Vite.

Open a **new terminal window**:
```bash
cd "LexiVault AI/Frontend"

# Install Node dependencies
npm install

# Start the development server
npm run dev
```
*The web application will be available at `http://localhost:5173`*

### 4. Start the AI Engine (Ollama)
To power the AI Word Assistant, ensure Ollama is installed and running on your machine.
```bash
ollama serve
```
*(LexiVault expects Ollama to be available locally at `http://127.0.0.1:11434`)*

---

## 📁 Project Structure

```text
LexiVault AI/
├── Backend/                 # FastAPI Python Backend
│   ├── routers/             # Modular API endpoints (auth, docs, vocab, quiz, etc.)
│   ├── config.py            # Environment configuration
│   ├── database.py          # MongoDB connection
│   ├── deps.py              # Authentication dependencies
│   ├── models.py            # Pydantic schemas
│   └── main.py              # Application factory
│
└── Frontend/                # React Vite Frontend
    ├── src/
    │   ├── components/      # Reusable UI elements (Shell, etc.)
    │   ├── context/         # React Context (ThemeContext)
    │   ├── pages/           # Pages (Dashboard, Reader, Library, Analytics, etc.)
    │   ├── api.ts           # Type-safe API client
    │   └── styles.css       # Premium CSS design system (Vanilla CSS)
    └── index.html           # Entry point
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! 
1. Fork the project.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'feat: add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

### License
This project is for educational and personal use.
