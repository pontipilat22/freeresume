const express = require('express');
const axios = require('axios');
const app = express();

// Railway автоматически выдаст порт, либо будет 3000
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(express.json());

// Настройки берутся из переменных окружения Railway (СЕКРЕТНО)
const ASTRIA_API_KEY = process.env.ASTRIA_API_KEY;
const TUNE_ID = process.env.ASTRIA_TUNE_ID; 

app.post('/api/generate', async (req, res) => {
    const { prompt } = req.body;

    if (!ASTRIA_API_KEY || !TUNE_ID) {
        return res.status(500).json({ error: 'Ошибка конфигурации сервера (нет ключей)' });
    }

    try {
        console.log('Отправка запроса в Astria...');
        
        // 1. Создаем задачу генерации (Flux LoRA)
        const createRes = await axios.post(
            `https://api.astria.ai/tunes/${TUNE_ID}/prompts`,
            {
                prompt: {
                    text: prompt,
                    // Можно добавить super_resolution: true и другие параметры
                }
            },
            {
                headers: { 'Authorization': `Bearer ${ASTRIA_API_KEY}` }
            }
        );

        // Получаем ID задачи, чтобы проверять статус
        // В разных версиях API Astria это может быть uid или id
        const promptId = createRes.data.uid || createRes.data.id;
        
        // 2. Ждем результат (Polling)
        // Railway имеет таймауты, поэтому мы ждем максимум 60 сек
        let imageUrl = null;
        let attempts = 0;
        
        while (attempts < 30) {
            await new Promise(r => setTimeout(r, 2000)); // ждать 2 сек
            
            const checkRes = await axios.get(
                `https://api.astria.ai/tunes/${TUNE_ID}/prompts/${promptId}`,
                { headers: { 'Authorization': `Bearer ${ASTRIA_API_KEY}` } }
            );

            if (checkRes.data.images && checkRes.data.images.length > 0) {
                imageUrl = checkRes.data.images[0]; // Берем первое фото
                break;
            }
            attempts++;
        }

        if (imageUrl) {
            res.json({ success: true, image: imageUrl });
        } else {
            res.status(408).json({ error: 'Генерация заняла слишком много времени. Попробуйте обновить галерею позже.' });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Ошибка при общении с Astria AI' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});