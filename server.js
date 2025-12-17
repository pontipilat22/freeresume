const express = require('express');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const app = express();

const PORT = process.env.PORT || 3000;
const ASTRIA_API_KEY = process.env.ASTRIA_API_KEY;

// Настройка Multer (храним файлы в оперативной памяти временно)
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.static('public'));

// Эндпоинт для запуска тренировки
// upload.array('photos', 20) означает, что принимаем до 20 файлов в поле 'photos'
app.post('/api/train', upload.array('photos', 20), async (req, res) => {
    
    // Проверка ключа
    if (!ASTRIA_API_KEY) return res.status(500).json({ error: 'Нет API ключа на сервере' });
    
    // Проверка файлов
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Загрузите хотя бы 4 фото.' });
    }

    const { email, modelName } = req.body; // Получаем имя и почту (если нужно)

    try {
        console.log(`Начинаю загрузку ${req.files.length} фото для модели: ${modelName}`);

        // 1. Формируем данные для Astria
        // Astria требует multipart/form-data
        const form = new FormData();
        
        // Обязательные настройки для Flux
        form.append('tune[title]', modelName || 'My Flux Model');
        form.append('tune[name]', 'person'); // Class name
        form.append('tune[branch]', 'flux1'); // ВАЖНО: выбираем Flux
        form.append('tune[token]', 'ohwx');   // Триггер слово (обычно ohwx для Astria)
        form.append('tune[model_type]', 'lora');
        
        // Добавляем сами картинки
        req.files.forEach(file => {
            form.append('tune[images][]', file.buffer, file.originalname);
        });

        // 2. Отправляем в Astria
        const response = await axios.post('https://api.astria.ai/tunes', form, {
            headers: {
                'Authorization': `Bearer ${ASTRIA_API_KEY}`,
                ...form.getHeaders() // Заголовки формы (границы файлов)
            },
            maxBodyLength: Infinity, // Разрешаем большие загрузки
            maxContentLength: Infinity
        });

        // Успех!
        console.log('Ответ Astria:', response.data);
        
        // Возвращаем клиенту ID новой модели
        res.json({ 
            success: true, 
            tune_id: response.data.id, 
            message: 'Обучение запущено! Это займет 20-40 минут.' 
        });

    } catch (error) {
        console.error('Ошибка Astria:', error.response ? error.response.data : error.message);
        res.status(500).json({ 
            error: 'Ошибка при запуске обучения. Проверьте фото или баланс.',
            details: error.response ? error.response.data : null
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});