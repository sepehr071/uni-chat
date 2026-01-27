# Uni-Chat

A full-stack AI chat application with customizable AI assistants, real-time streaming, image generation, workflow editor, and arena mode for comparing models side-by-side.

## Features

- **Custom AI Assistants** - Create personalized assistants with custom system prompts and model configurations
- **Real-time Streaming** - Live message streaming for responsive AI interactions
- **Image Generation** - Text-to-image and image-to-image with Seedream and Flux models
- **Workflow Editor** - Visual canvas for building image generation pipelines
- **Arena Mode** - Compare 2-4 AI models side-by-side
- **Conversation Management** - Folders, search, archive, and history
- **Multi-Model Support** - Access GPT-4, Claude, Gemini, and more via OpenRouter

## Quick Start

### Requirements

- Python 3.11+
- Node.js 18+
- MongoDB
- [OpenRouter API key](https://openrouter.ai)

### Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env  # Edit with your keys
python run.py
```

Server runs on http://localhost:5000

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs on http://localhost:3000

### Environment Variables

Create `backend/.env` with:

```
SECRET_KEY=your-secret-key
JWT_SECRET_KEY=your-jwt-secret
MONGO_URI=mongodb://localhost:27017/unichat
OPENROUTER_API_KEY=your-openrouter-key
```

## License

MIT
