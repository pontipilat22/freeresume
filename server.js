const express = require('express');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;
const ASTRIA_API_KEY = process.env.ASTRIA_API_KEY;

// Увеличиваем лимиты, чтобы фото точно загрузились
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage() });

// --- ЛОГИКА ОТКРЫТИЯ САЙТА ---
// Проверяем и папку public, и корень, чтобы сайт открылся в любом случае
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    const fileInPublic = path.join(__dirname, 'public', 'index.html');
    const fileInRoot = path.join(__dirname, 'index.html');
    
    res.sendFile(fileInPublic, (err) => {
        if (err) res.sendFile(fileInRoot);
    });
});

// --- API 1: ОБУЧЕНИЕ (TRAIN) ---
app.post('/api/train', upload.array('photos', 20), async (req, res) => {
    if (!ASTRIA_API_KEY) return res.status(500).json({ error: 'Нет ASTRIA_API_KEY в Railway' });
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Нет фото' });

    try {
        console.log(`Начинаем загрузку ${req.files.length} фото...`);

        const form = new FormData();
        // Настройки для Flux LoRA (согласно документации)
        form.append('tune[title]', req.body.modelName || 'Flux User Model');
        form.append('tune[name]', 'person');
        form.append('tune[branch]', 'flux1');      // Flux
        form.append('tune[token]', 'ohwx');        // Триггер
        form.append('tune[model_type]', 'lora');
        form.append('tune[preset]', 'flux-lora-portrait'); // Улучшение лиц
        
        req.files.forEach(file => {
            form.append('tune[images][]', file.buffer, file.originalname);
        });

        const response = await axios.post('https://api.astria.ai/tunes', form, {
            headers: {
                'Authorization': `Bearer ${ASTRIA_API_KEY}`,
                ...form.getHeaders()
            },
            maxBodyLength: Infinity
        });

        res.json({ success: true, tune_id: response.data.id });

    } catch (error) {
        console.error('Ошибка обучения:', error.response?.data || error.message);
        res.status(500).json({ error: 'Ошибка Astria при загрузке', details: error.response?.data });
    }
});

// --- API 2: ГЕНЕРАЦИЯ (GENERATE) ---
app.post('/api/generate', async (req, res) => {
    const { prompt, tune_id } = req.body;

    if (!ASTRIA_API_KEY) return res.status(500).json({ error: 'Нет API ключа' });
    if (!prompt || !tune_id) return res.status(400).json({ error: 'Нужен ID модели и промпт' });

    try {
        console.log(`Генерация для модели ${tune_id}: ${prompt}`);
        
        // 1. Создаем задачу генерации
        const createRes = await axios.post(
            `https://api.astria.ai/tunes/${tune_id}/prompts`,
            {
                prompt: {
                    text: prompt,
                    super_resolution: true,
                    face_correct: true,
                    film_grain: false
                }
            },
            { headers: { 'Authorization': `Bearer ${ASTRIA_API_KEY}` } }
        );

        const promptId = createRes.data.uid || createRes.data.id;
        
        // 2. Ждем результат (до 60 сек)
        let attempts = 0;
        while (attempts < 30) {
            await new Promise(r => setTimeout(r, 2000)); // Ждем 2 сек
            
            const checkRes = await axios.get(
                `https://api.astria.ai/tunes/${tune_id}/prompts/${promptId}`,
                { headers: { 'Authorization': `Bearer ${ASTRIA_API_KEY}` } }
            );

            // Если есть картинки - возвращаем
            if (checkRes.data.images && checkRes.data.images.length > 0) {
                return res.json({ success: true, image: checkRes.data.images[0] });
            }
            // Если статус 'failed' - ошибка
            if (checkRes.data.status === 'failed') {
                return res.status(500).json({ error: 'Astria не смогла сгенерировать изображение' });
            }

            attempts++;
        }
        
        res.status(408).json({ error: 'Время ожидания истекло. Попробуйте позже.' });

    } catch (error) {
        console.error('Ошибка генерации:', error.response?.data || error.message);
        res.status(500).json({ error: 'Ошибка генерации (проверьте правильность ID модели)' });
    }
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});