// app.js
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import axios from 'axios';

const app = express();
const PORT = 3000;

// Setup static files and multer for file uploads
app.use(express.static('public'));
app.use('/images', express.static('images'));

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, 'uploads/');
	},
	filename: (req, file, cb) => {
		cb(null, Date.now() + '-' + file.originalname);
	}
});
const upload = multer({ storage });

// Ensure directories exist
await fs.mkdir('uploads', { recursive: true });
await fs.mkdir('images', { recursive: true });

// --- Helper: Encode image as base64 with resizing
async function encodeImageToBase64(imagePath, maxSize = 1024) {
	const resizedImage = await sharp(imagePath)
		.resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
		.png()
		.toBuffer();
	return resizedImage.toString('base64');
}

const OPENROUTER_IMAGE_MODELS = {
	'flux.2-pro': 'black-forest-labs/flux.2-pro',
	'flux.2-flex': 'black-forest-labs/flux.2-flex',
	'gemini-2.5-flash-image': 'google/gemini-2.5-flash-image',
	'gemini-3-pro-image-preview': 'google/gemini-3-pro-image-preview',
	'gpt-5-image-mini': 'openai/gpt-5-image-mini',
	'gpt-5-image': 'openai/gpt-5-image'
};

const ASPECT_RATIO_MAP = {
	"1:1": "1024x1024",
	"2:3": "832x1248",
	"3:2": "1248x832",
	"3:4": "864x1184",
	"4:3": "1184x896",
	"4:5": "896x1152",
	"5:4": "1152x896",
	"9:16": "768x1344",
	"16:9": "1344x768",
	"21:9": "1536x672"
};

// --- Route to handle generation
app.post('/generate', upload.array('referenceImages'), async (req, res) => {
	const { prompt, ratio, model } = req.body;
	const uploadedFiles = req.files || [];

	const referencePaths = uploadedFiles.map(f => f.path);

	const selectedModel = OPENROUTER_IMAGE_MODELS[model] || OPENROUTER_IMAGE_MODELS['flux.2-pro'];
	const seed = Math.floor(Math.random() * 1000000);

	const configContent = {
		prompt,
		seed,
		referenceImages: referencePaths,
		imageRatio: ratio,
		model: selectedModel
	};

	const userMessageContent = [
		{
			role: 'user',
			content: [{ type: 'text', text: prompt }]
		}
	];

	const imageRatioApi = ratio in ASPECT_RATIO_MAP ? ratio : '16:9';

	try {
		if (referencePaths.length > 0) {
			for (const imagePath of referencePaths) {
				const imageData = await encodeImageToBase64(imagePath, 1024);
				userMessageContent[0].content.push({
					type: "image_url",
					image_url: {
						url: `data:image/png;base64,${imageData}`
					}
				});
			}
		}

		const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
			model: selectedModel,
			messages: userMessageContent,
			seed: seed,
			modalities: ['image', 'text'],
			image_config: {
				aspect_ratio: imageRatioApi
			},
			stream: false
		}, {
			headers: {
				Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
				'Content-Type': 'application/json'
			}
		});

		const result = response.data;

		if (result.choices && result.choices[0].message.images?.length > 0) {
			const timestamp = Date.now();
			const urls = result.choices[0].message.images.map(img => img.image_url.url);

			for (let i = 0; i < urls.length; i++) {
				const imageUrl = urls[i];
				const arrayBuffer = (await axios.get(imageUrl, { responseType: 'arraybuffer' })).data;
				const buffer = Buffer.from(arrayBuffer);
				const filename = path.join('images', `${timestamp}_image_${i + 1}.png`);
				await fs.writeFile(filename, buffer);
			}

			// Save config
			const configFile = path.join('images', `${timestamp}_config.txt`);
			await fs.writeFile(configFile, JSON.stringify(configContent, null, 2), 'utf8');

			// Clean up uploaded files
			uploadedFiles.forEach(file => fs.unlink(file.path));

			res.json({ success: true, message: 'Generated successfully!', urls });
		} else {
			res.status(500).json({ error: "No images returned from API." });
		}
	} catch (error) {
		console.error(error);
		res.status(500).json({ error: "Failed to generate image", details: error.message });
	}
});

// GET route to retrieve image history
app.get('/api/history', async (req, res) => {
	try {
		const files = await fs.readdir(path.resolve('./images'));
		const images = files.filter(f => f.endsWith('.png')).sort((a, b) => parseInt(b.split('_')[0]) - parseInt(a.split('_')[0]));

		const history = images.map(img => {
			const ts = parseInt(img.split('_')[0]);
			const configPath = path.join('./images', `${ts}_config.txt`);
			return {
				image: `/images/${img}`,
				timestamp: ts,
				configExists: fs.access(configPath).then(() => true).catch(() => false)
			};
		});

		// Check if config exists for each one (awaiting promises inside map)
		for (const item of history) {
			item.configExists = await item.configExists;
		}

		res.json(history);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Start the server
app.listen(PORT, () => {
	console.log(`🖼️ Image Generator started on http://localhost:${PORT}`);
});
