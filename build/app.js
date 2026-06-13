// Compiler
const express = require('express');
const app = express();
const path = require('path');
const ejs = require('ejs');
const fs = require('fs');
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
function renderPage(file, data) {
    const html = fs.readFileSync(__dirname + '/views/' + file, 'utf8');
    return ejs.render(html, data);
}
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
app.use(cookieParser());
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");
const requestCounts = {};
const RATE_LIMIT = 30;
const RATE_WINDOW = 60 * 1000;

setInterval(() => {
    for (let ip in requestCounts) {
        requestCounts[ip] = 0;
    }
}, RATE_WINDOW);

function rateLimiter(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    if (!requestCounts[ip]) requestCounts[ip] = 0;
    requestCounts[ip]++;

    if (requestCounts[ip] > RATE_LIMIT) {
        return res.status(429).json({ error: "Слишком много запросов. Подождите минуту." });
    }
    next();
}
app.use(rateLimiter);
const JWT_SECRET = "super-secret-key-2026";
const DATA_DIR = __dirname + "/data";
const UPLOADS_DIR = __dirname + "/public/uploads";
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
const ZAY_FILE = DATA_DIR + "/zay.json";
const MAT_FILE = DATA_DIR + "/materials.json";
const SRV_FILE = DATA_DIR + "/services.json";
const PHOTOS_FILE = DATA_DIR + "/photos.json";
if (!fs.existsSync(ZAY_FILE)) fs.writeFileSync(ZAY_FILE, "[]");
if (!fs.existsSync(MAT_FILE)) fs.writeFileSync(MAT_FILE, "[]");
if (!fs.existsSync(SRV_FILE)) fs.writeFileSync(SRV_FILE, "[]");
if (!fs.existsSync(PHOTOS_FILE)) fs.writeFileSync(PHOTOS_FILE, "[]");

let storage = multer.diskStorage({
    destination: function(req, file, cb) {
        const dir = UPLOADS_DIR;
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: function(req, file, cb) {
        const ext = path.extname(file.originalname);
        const filename = Date.now() + '-' + Math.round(Math.random() * 10000) + ext;
        cb(null, filename);
    }
});
let upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: function(req, file, cb) {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Только изображения!'), false);
        }
    }
});

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/views/index.html");
});

app.get("/onas", (req, res) => {
    res.sendFile(__dirname + "/views/onas.html");
})

app.post("/api/zay", (req, res) => {
    let zayData = req.body;
    zayData.id = Date.now();
    zayData.createdAt = new Date().toISOString();
    let zayList = JSON.parse(fs.readFileSync(ZAY_FILE, "utf8"));
    zayList.push(zayData);
    fs.writeFileSync(ZAY_FILE, JSON.stringify(zayList, null, 2));
    res.json({ success: true, message: "Заявка принята!" });
});

app.get("/api/zay", (req, res) => {
    let token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ error: "Не авторизован" });
    }
    try {
        jwt.verify(token, JWT_SECRET);
        let zayList = JSON.parse(fs.readFileSync(ZAY_FILE, "utf8"));
        res.json(zayList);
    } catch (err) {
        res.status(401).json({ error: "Токен истёк" });
    }
});

app.delete("/api/zay/:id", (req, res) => {
    let token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ error: "Не авторизован" });
    }
    try {
        jwt.verify(token, JWT_SECRET);
        let id = parseInt(req.params.id);
        let zayList = JSON.parse(fs.readFileSync(ZAY_FILE, "utf8"));
        let filtered = zayList.filter(function(z) { return z.id !== id; });
        fs.writeFileSync(ZAY_FILE, JSON.stringify(filtered, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(401).json({ error: "Токен истёк" });
    }
});

app.get("/api/materials", (req, res) => {
    try {
        let list = JSON.parse(fs.readFileSync(MAT_FILE, "utf8"));
        res.json(list);
    } catch (err) {
        res.json([]);
    }
});

app.post("/api/materials", (req, res) => {
    let token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ error: "Не авторизован" });
    }
    try {
        jwt.verify(token, JWT_SECRET);
        let list = JSON.parse(fs.readFileSync(MAT_FILE, "utf8"));
        let item = req.body;
        item.id = Date.now();
        item.createdAt = new Date().toISOString();
        list.push(item);
        fs.writeFileSync(MAT_FILE, JSON.stringify(list, null, 2));
        res.json({ success: true, item: item });
    } catch (err) {
        res.status(401).json({ error: "Токен истёк" });
    }
});

app.delete("/api/materials/:id", (req, res) => {
    let token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ error: "Не авторизован" });
    }
    try {
        jwt.verify(token, JWT_SECRET);
        let id = parseInt(req.params.id);
        let list = JSON.parse(fs.readFileSync(MAT_FILE, "utf8"));
        let filtered = list.filter(function(m) { return m.id !== id; });
        fs.writeFileSync(MAT_FILE, JSON.stringify(filtered, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(401).json({ error: "Токен истёк" });
    }
});

// ========== УСЛУГИ ==========
app.get("/api/services", (req, res) => {
    try {
        let list = JSON.parse(fs.readFileSync(SRV_FILE, "utf8"));
        res.json(list);
    } catch (err) {
        res.json([]);
    }
});

app.post("/api/services", (req, res) => {
    let token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ error: "Не авторизован" });
    }
    try {
        jwt.verify(token, JWT_SECRET);
        let list = JSON.parse(fs.readFileSync(SRV_FILE, "utf8"));
        let item = req.body;
        item.id = Date.now();
        item.createdAt = new Date().toISOString();
        list.push(item);
        fs.writeFileSync(SRV_FILE, JSON.stringify(list, null, 2));
        res.json({ success: true, item: item });
    } catch (err) {
        res.status(401).json({ error: "Токен истёк" });
    }
});

app.delete("/api/services/:id", (req, res) => {
    let token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ error: "Не авторизован" });
    }
    try {
        jwt.verify(token, JWT_SECRET);
        let id = parseInt(req.params.id);
        let list = JSON.parse(fs.readFileSync(SRV_FILE, "utf8"));
        let filtered = list.filter(function(s) { return s.id !== id; });
        fs.writeFileSync(SRV_FILE, JSON.stringify(filtered, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(401).json({ error: "Токен истёк" });
    }
});

app.post("/api/upload", (req, res) => {
    upload.single("photo")(req, res, function(err) {
        if (err) {
            return res.status(400).json({ error: "Ошибка загрузки: " + err.message });
        }
        let token = req.cookies.token;
        if (!token) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(401).json({ error: "Не авторизован" });
        }
        try {
            jwt.verify(token, JWT_SECRET);
            const url = "/uploads/" + req.file.filename;
            
            let photos = JSON.parse(fs.readFileSync(PHOTOS_FILE, "utf8"));
            photos.push({
                id: Date.now(),
                url: url,
                originalName: req.file.originalname,
                createdAt: new Date().toISOString()
            });
            fs.writeFileSync(PHOTOS_FILE, JSON.stringify(photos, null, 2));
            
            res.json({ success: true, url: url, id: Date.now() });
        } catch (err) {
            if (req.file) fs.unlinkSync(req.file.path);
            res.status(401).json({ error: "Токен истёк" });
        }
    });
});

app.get("/api/photos", (req, res) => {
    try {
        let photos = JSON.parse(fs.readFileSync(PHOTOS_FILE, "utf8"));
        res.json(photos);
    } catch (err) {
        res.json([]);
    }
});

app.delete("/api/photos/:id", (req, res) => {
    let token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ error: "Не авторизован" });
    }
    try {
        jwt.verify(token, JWT_SECRET);
        let id = parseInt(req.params.id);
        let photos = JSON.parse(fs.readFileSync(PHOTOS_FILE, "utf8"));
        let photo = photos.find(function(p) { return p.id === id; });
        if (photo) {
            const filepath = __dirname + "/public" + photo.url;
            if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
        }
        let filtered = photos.filter(function(p) { return p.id !== id; });
        fs.writeFileSync(PHOTOS_FILE, JSON.stringify(filtered, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(401).json({ error: "Токен истёк" });
    }
});

app.get("/worker/:username/:password", (req, res) => {
    if (req.params.username === "admin" && req.params.password === "plitka2026") {
        let token = jwt.sign({ username: "admin", role: "admin" }, JWT_SECRET, { expiresIn: "24h" });
        res.cookie("token", token, { httpOnly: true, maxAge: 86400000 });
        res.redirect("/admin");
    } else {
        res.status(401).send("Неверный логин или пароль");
    }
    console.log("[LOG] -> AUTHARIZATION");
});

app.get("/admin", (req, res) => {
    let token = req.cookies.token;
    if (!token) {
        console.log("[LOG] FAILED ADMIN");
        return res.redirect("/login");
    }
    try {
        jwt.verify(token, JWT_SECRET);
        res.sendFile(__dirname + "/views/admin.html");
    } catch (err) {
        res.redirect("/login");
    }
    console.log("[LOG] -> ADMIN");

});

app.get("/login", (req, res) => {
    res.sendFile(__dirname + "/views/login.html");
    console.log("[LOG] -> LOGIN GET");
});

app.post("/login", (req, res) => {
    if (req.body.username === "admin" && req.body.password === "plitka2026") {
        let token = jwt.sign({ username: "admin", role: "admin" }, JWT_SECRET, { expiresIn: "24h" });
        res.cookie("token", token, { httpOnly: true, maxAge: 86400000 });
        res.redirect("/admin");
    } else {
        res.send('<p style="color:red;text-align:center;margin-top:50px;font-family:sans-serif;">Неверный логин или пароль. <a href="/login">Попробовать снова</a></p>');
    }
    console.log("[LOG] -> LOGIN POST");
});

app.listen(3000, () => {
  console.log('🚀 ЗАПУСК СЕРВЕРА 🚀');
  console.log('\x1b[34m Сервер запущен на порту -> 3000 \x1b[0m');
  console.log('\x1b[34m Можно найти по ссылке -> http://localhost:3000 \x1b[0m');
  console.log('\x1b[33m Лимит запросов: ' + RATE_LIMIT + ' в минуту \x1b[0m');
});