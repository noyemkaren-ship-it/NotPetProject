const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const app = express();


app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

const pino = require('pino');
const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

const JWT_SECRET = "super-secret-key-2026";
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

[DATA_DIR, UPLOADS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const requestCounts = {};
const RATE_LIMIT = 30;
const RATE_WINDOW = 60 * 1000;

setInterval(() => {
    Object.keys(requestCounts).forEach(ip => requestCounts[ip] = 0);
}, RATE_WINDOW);

app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    requestCounts[ip] = (requestCounts[ip] || 0) + 1;
    if (requestCounts[ip] > RATE_LIMIT) {
        return res.status(429).json({ error: "Слишком много запросов. Подождите минуту." });
    }
    next();
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_DIR);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const filename = Date.now() + '-' + Math.round(Math.random() * 10000) + ext;
        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Только изображения!'), false);
        }
    }
});

const files = {
    zay: path.join(DATA_DIR, 'zay.json'),
    materials: path.join(DATA_DIR, 'materials.json'),
    services: path.join(DATA_DIR, 'services.json'),
    photos: path.join(DATA_DIR, 'photos.json')
};

Object.values(files).forEach(file => {
    if (!fs.existsSync(file)) fs.writeFileSync(file, '[]');
});

const readData = (filePath) => {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        return [];
    }
};

const writeData = (filePath, data) => {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

const verifyToken = (req, res) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Не авторизован" });
    try {
        jwt.verify(token, JWT_SECRET);
        return true;
    } catch (err) {
        return res.status(401).json({ error: "Токен истёк" });
    }
};

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/views/index.html");
    logger.info("[LOG] -> ГЛАВНАЯ СТРАНИЦА");
});

app.get("/onas", (req, res) => {
    res.sendFile(__dirname + "/views/onas.html");
    logger.info("[LOG] -> СТРАНИЦА ОНАС");
});

app.get("/login", (req, res) => {
    res.sendFile(__dirname + "/views/login.html");
    logger.info("[LOG] -> LOGIN GET");
});

// ====================== API ======================

// Заявки
app.post("/api/zay", (req, res) => {
    let zayData = req.body;
    zayData.id = Date.now();
    zayData.createdAt = new Date().toISOString();
    let zayList = readData(files.zay);
    zayList.push(zayData);
    writeData(files.zay, zayList);
    res.json({ success: true, message: "Заявка принята!" });
    logger.info("[LOG] -> /api/zay");
});

app.get("/api/zay", (req, res) => {
    if (!verifyToken(req, res)) return;
    let zayList = readData(files.zay);
    res.json(zayList);
    logger.info("[LOG] -> GET /api/zay");
});

app.delete("/api/zay/:id", (req, res) => {
    if (!verifyToken(req, res)) return;
    let id = parseInt(req.params.id);
    let zayList = readData(files.zay);
    let filtered = zayList.filter(z => z.id !== id);
    writeData(files.zay, filtered);
    res.json({ success: true });
});

// Материалы
app.get("/api/materials", (req, res) => res.json(readData(files.materials)));

app.post("/api/materials", (req, res) => {
    if (!verifyToken(req, res)) return;
    let item = req.body;
    item.id = Date.now();
    item.createdAt = new Date().toISOString();
    let list = readData(files.materials);
    list.push(item);
    writeData(files.materials, list);
    res.json({ success: true, item });
});

app.delete("/api/materials/:id", (req, res) => {
    if (!verifyToken(req, res)) return;
    let id = parseInt(req.params.id);
    let list = readData(files.materials);
    let filtered = list.filter(m => m.id !== id);
    writeData(files.materials, filtered);
    res.json({ success: true });
});

// Услуги
app.get("/api/services", (req, res) => res.json(readData(files.services)));

app.post("/api/services", (req, res) => {
    if (!verifyToken(req, res)) return;
    let item = req.body;
    item.id = Date.now();
    item.createdAt = new Date().toISOString();
    let list = readData(files.services);
    list.push(item);
    writeData(files.services, list);
    res.json({ success: true, item });
});

app.delete("/api/services/:id", (req, res) => {
    if (!verifyToken(req, res)) return;
    let id = parseInt(req.params.id);
    let list = readData(files.services);
    let filtered = list.filter(s => s.id !== id);
    writeData(files.services, filtered);
    res.json({ success: true });
});

// Фото
app.post("/api/upload", upload.single("photo"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Файл не загружен" });

    if (!verifyToken(req, res)) {
        if (req.file) fs.unlinkSync(req.file.path);
        return;
    }

    const url = "/uploads/" + req.file.filename;
    let photos = readData(files.photos);
    photos.push({
        id: Date.now(),
        url: url,
        originalName: req.file.originalname,
        createdAt: new Date().toISOString()
    });
    writeData(files.photos, photos);

    res.json({ success: true, url: url, id: Date.now() });
});

app.get("/api/photos", (req, res) => res.json(readData(files.photos)));

app.delete("/api/photos/:id", (req, res) => {
    if (!verifyToken(req, res)) return;
    let id = parseInt(req.params.id);
    let photos = readData(files.photos);
    let photo = photos.find(p => p.id === id);
    
    if (photo) {
        const filepath = path.join(__dirname, 'public', photo.url);
        if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    }

    let filtered = photos.filter(p => p.id !== id);
    writeData(files.photos, filtered);
    res.json({ success: true });
});

// ====================== АВТОРИЗАЦИЯ ======================
app.get("/worker/:username/:password", (req, res) => {
    if (req.params.username === "admin" && req.params.password === "plitka2026") {
        let token = jwt.sign({ username: "admin", role: "admin" }, JWT_SECRET, { expiresIn: "24h" });
        res.cookie("token", token, { httpOnly: true, maxAge: 86400000 });
        res.redirect("/admin");
    } else {
        res.status(401).send("Неверный логин или пароль");
    }
    logger.info("[LOG] -> AUTHORIZATION");
});

app.get("/admin", (req, res) => {
    if (!verifyToken(req, res)) return res.redirect("/login");
    res.sendFile(__dirname + "/views/admin.html");
    logger.info("[LOG] -> ADMIN");
});

app.post("/login", (req, res) => {
    if (req.body.username === "admin" && req.body.password === "plitka2026") {
        let token = jwt.sign({ username: "admin", role: "admin" }, JWT_SECRET, { expiresIn: "24h" });
        res.cookie("token", token, { httpOnly: true, maxAge: 86400000 });
        res.redirect("/admin");
    } else {
        res.send('<p style="color:red;text-align:center;margin-top:50px;font-family:sans-serif;">Неверный логин или пароль. <a href="/login">Попробовать снова</a></p>');
    }
});

// ====================== HTTPS ======================
const https = require('https');
const http = require('http');

const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/tratuar.ru/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/tratuar.ru/fullchain.pem')
};

http.createServer((req, res) => {
    res.writeHead(301, { 'Location': 'https://' + req.headers.host + req.url });
    res.end();
}).listen(80, () => logger.info('🔁 HTTP редирект на порту 80'));

https.createServer(options, app).listen(443, () => {
    logger.info('🚀 ЗАПУСК СЕРВЕРА 🚀');
    logger.info('\x1b[32m 🔒 HTTPS на порту 443 \x1b[0m');
    logger.info('\x1b[34m Можно найти по ссылке -> https://tratuar.ru \x1b[0m');
    logger.info('\x1b[33m Лимит запросов: ' + RATE_LIMIT + ' в минуту \x1b[0m');
});