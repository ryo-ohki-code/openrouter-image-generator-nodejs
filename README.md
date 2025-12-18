# openrouter-image-generator-nodejs
If you want to try Flux 2 using OpenRouter, the Chat option is limited. This simple server helps you generate images and navigate through the history. All OpenRouter image models are supported with reference images and aspect ratios.

## Features:

- Simple web interface with two pages: /generate and /history
- Upload reference image(s)
- Choose from predefined aspect ratios
- Prompt input
- Generate button sends request to OpenRouter API
- Images are saved server-side in an images/ directory (with generation metadata)
- History page shows previously generated images

## Required packages:

You'll need to install:
```bash
npm install express multer axios sharp
```

## Usage

Make sure to create the necessary directories:
```bash
mkdir uploads images
```

### Option 1: Using environment variable

```bash
OPENROUTER_API_KEY=sk-or-v1-YourApiKeyHere node server.js
# Replace YourApiKeyHere with your actual OpenRouter API key.
```

### Option 2: Hardcoding in server.js
In `server.js` line 117, replace `process.env.OPENROUTER_API_KEY` with your actual OpenRouter API key.
```javascript
Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
```

Then run
```bash
node server.js
```
