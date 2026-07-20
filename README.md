# LexiVault AI

An AI-powered vocabulary learning assistant for uploaded PDFs. It uses a locally running Ollama model for explanations and MongoDB Atlas for persistent user vocabulary.

## Run locally

1. In `Backend`, copy `.env.example` to `.env`, add your MongoDB Atlas URI and a JWT secret.
2. Install backend packages: `python -m pip install -r requirements.txt`.
3. Start Ollama and run `ollama pull qwen2.5:3b`.
4. Start the API: `uvicorn main:app --reload --port 8000`.
5. In `Frontend`, run `npm install` then `npm run dev`.
