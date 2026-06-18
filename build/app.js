const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

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
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Rate Limiting
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

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = Date.now() + '-' + Math.round(Math.random() * 10000) + ext;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Только изображения!'), false);
  }
});

// Auth middleware
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

// ====================== API ======================

// Заявки
app.post("/api/zay", async (req, res) => {
  try {
    const { name, phone, message } = req.body;
    const zay = await prisma.zayavka.create({ data: { name, phone, message: message || null } });
    res.json({ success: true, message: "Заявка принята!", data: zay });
  } catch (e) {
    res.status(500).json({ error: "Ошибка при создании заявки" });
  }
});

app.get("/api/zay", async (req, res) => {
  if (!verifyToken(req, res)) return;
  const zays = await prisma.zayavka.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(zays);
});

app.delete("/api/zay/:id", async (req, res) => {
  if (!verifyToken(req, res)) return;
  await prisma.zayavka.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

// Материалы
app.get("/api/materials", async (req, res) => res.json(await prisma.material.findMany({ orderBy: { createdAt: 'desc' } })));

app.post("/api/materials", async (req, res) => {
  if (!verifyToken(req, res)) return;
  const item = await prisma.material.create({ data: req.body });
  res.json({ success: true, item });
});

app.delete("/api/materials/:id", async (req, res) => {
  if (!verifyToken(req, res)) return;
  await prisma.material.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

// Услуги
app.get("/api/services", async (req, res) => res.json(await prisma.service.findMany({ orderBy: { createdAt: 'desc' } })));

app.post("/api/services", async (req, res) => {
  if (!verifyToken(req, res)) return;
  const item = await prisma.service.create({ data: req.body });
  res.json({ success: true, item });
});

app.delete("/api/services/:id", async (req, res) => {
  if (!verifyToken(req, res)) return;
  await prisma.service.delete({ where: { id: parseInt(req.params.id) } });
  res.json({ success: true });
});

// Фото
app.post("/api/upload", upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл не загружен" });
  if (!verifyToken(req, res)) {
    fs.unlinkSync(req.file.path);
    return;
  }
  try {
    const url = "/uploads/" + req.file.filename;
    const photo = await prisma.photo.create({
      data: { url, originalName: req.file.originalname }
    });
    res.json({ success: true, url, id: photo.id });
  } catch (e) {
    res.status(500).json({ error: "Ошибка загрузки" });
  }
});

app.get("/api/photos", async (req, res) => res.json(await prisma.photo.findMany({ orderBy: { createdAt: 'desc' } })));

app.delete("/api/photos/:id", async (req, res) => {
  if (!verifyToken(req, res)) return;
  try {
    const photo = await prisma.photo.findUnique({ where: { id: parseInt(req.params.id) } });
    if (photo) {
      const filepath = path.join(__dirname, 'public', photo.url);
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
      await prisma.photo.delete({ where: { id: photo.id } });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Ошибка удаления" });
  }
});

// ====================== СТРАНИЦЫ ======================
app.get("/", (req, res) => res.sendFile(__dirname + "/views/index.html"));
app.get("/onas", (req, res) => res.sendFile(__dirname + "/views/onas.html"));
app.get("/login", (req, res) => res.sendFile(__dirname + "/views/login.html"));

// ====================== АВТОРИЗАЦИЯ ======================
app.get("/worker/:username/:password", (req, res) => {
  if (req.params.username === "admin" && req.params.password === "plitka2026") {
    const token = jwt.sign({ username: "admin", role: "admin" }, JWT_SECRET, { expiresIn: "24h" });
    res.cookie("token", token, { httpOnly: true, maxAge: 86400000 });
    res.redirect("/admin");
  } else {
    res.status(401).send("Неверный логин или пароль");
  }
});

app.get("/admin", (req, res) => {
  if (!verifyToken(req, res)) return res.redirect("/login");
  res.sendFile(__dirname + "/views/admin.html");
});

app.post("/login", (req, res) => {
  if (req.body.username === "admin" && req.body.password === "plitka2026") {
    const token = jwt.sign({ username: "admin", role: "admin" }, JWT_SECRET, { expiresIn: "24h" });
    res.cookie("token", token, { httpOnly: true, maxAge: 86400000 });
    res.redirect("/admin");
  } else {
    res.send('<p style="color:red;text-align:center;margin-top:50px;font-family:sans-serif;">Неверный логин или пароль. <a href="/login">Попробовать снова</a></p>');
  }
});

const https = require('https');
const http = require('http');

const options = {
  key: fs.readFileSync('/etc/letsencrypt/live/tratuar.ru/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/tratuar.ru/fullchain.pem')
};

http.createServer((req, res) => {
  res.writeHead(301, { 'Location': 'https://' + req.headers.host + req.url });
  res.end();
}).listen(80);

https.createServer(options, app).listen(443, () => {
  logger.info('🚀 СЕРВЕР ЗАПУЩЕН НА Prisma + HTTPS');
  logger.info('\x1b[32m 🔒 HTTPS на порту 443 \x1b[0m');
  logger.info('\x1b[34m https://tratuar.ru \x1b[0m');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  console.log('Prisma disconnected. Server stopped.');
  process.exit(0);
});