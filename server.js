const express = require('express');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;
const ASTRIA_API_KEY = process.env.ASTRIA_API_KEY;

// Лимиты для больших фото
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

const upload = multer({ storage: multer.memoryStorage() });

app.get('/', (req, res) => {
    const fileInPublic = path.join(__dirname, 'public', 'index.html');
    const fileInRoot = path.join(__dirname, 'index.html');
    res.sendFile(fileInPublic, (err) => { if (err) res.sendFile(fileInRoot); });
});

// --- ОБУЧЕНИЕ ---
app.post('/api/train', upload.array('photos', 20), async (req, res) => {
    if (!ASTRIA_API_KEY) return res.status(500).json({ error: 'Нет ключа API' });
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Нет фото' });

    try {
        const form = new FormData();
        form.append('tune[title]', req.body.modelName || 'User Model');
        form.append('tune[name]', 'person');
        form.append('tune[branch]', 'flux1');
        form.append('tune[token]', 'ohwx');
        form.append('tune[model_type]', 'lora');
        form.append('tune[preset]', 'flux-lora-portrait');
        
        req.files.forEach(file => {
            form.append('tune[images][]', file.buffer, file.originalname);
        });

        const response = await axios.post('https://api.astria.ai/tunes', form, {
            headers: { 'Authorization': `Bearer ${ASTRIA_API_KEY}`, ...form.getHeaders() },
            maxBodyLength: Infinity
        });

        res.json({ success: true, tune_id: response.data.id });
    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({ error: 'Ошибка обучения', details: error.response?.data });
    }
});

// --- ГЕНЕРАЦИЯ (ОБНОВЛЕННАЯ) ---
app.post('/api/generate', async (req, res) => {
    // Получаем ширину и высоту от сайта
    const { prompt, tune_id, w, h } = req.body;

    if (!ASTRIA_API_KEY) return res.status(500).json({ error: 'Нет ключа API' });
    if (!prompt || !tune_id) return res.status(400).json({ error: 'ID модели не найден' });

    try {
        console.log(`Gen: ${prompt} | Size: ${w}x${h}`);
        
        const createRes = await axios.post(
            `https://api.astria.ai/tunes/${tune_id}/prompts`,
            {
                prompt: {
                    text: prompt,
                    super_resolution: true,
                    face_correct: true,
                    // Передаем размеры во Flux
                    w: parseInt(w) || 1024,
                    h: parseInt(h) || 1024,
                    num_images: 1
                }
            },
            { headers: { 'Authorization': `Bearer ${ASTRIA_API_KEY}` } }
        );

        const promptId = createRes.data.uid || createRes.data.id;
        
        // Ждем результат
        let attempts = 0;
        while (attempts < 40) { // Ждем до 80 сек
            await new Promise(r => setTimeout(r, 2000));
            const checkRes = await axios.get(
                `https://api.astria.ai/tunes/${tune_id}/prompts/${promptId}`,
                { headers: { 'Authorization': `Bearer ${ASTRIA_API_KEY}` } }
            );

            if (checkRes.data.images && checkRes.data.images.length > 0) {
                return res.json({ success: true, image: checkRes.data.images[0] });
            }
            if (checkRes.data.status === 'failed') {
                return res.status(500).json({ error: 'Astria: Генерация не удалась' });
            }
            attempts++;
        }
        res.status(408).json({ error: 'Таймаут. Попробуйте позже.' });

    } catch (error) {
        console.error(error.response?.data || error.message);
        res.status(500).json({ error: 'Ошибка сервера генерации' });
    }
});

app.listen(PORT, () => { console.log(`Server: ${PORT}`); });