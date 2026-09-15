# پنل نمایندگی XUI

پنل نمایندگی مستقل برای مدیریت نماینده‌ها و کاربران پنل **3x-ui / X-UI**. این پروژه با React، Node.js، Express، tRPC، Drizzle ORM و MySQL ساخته شده و رابط کاربری آن فارسی و راست‌چین است.

> **وضعیت فعلی:** این مخزن یک MVP قابل اجراست. مدیریت نماینده، کد پسوند یکتا، مالکیت کاربر، سهمیه، اعتبار و گزارش فعالیت پیاده‌سازی شده است. اتصال واقعی به API پنل 3x-ui برای ساخت و مدیریت Clientها باید در مرحله بعد اضافه شود؛ در نسخه فعلی نباید ساخت موفق کاربر در دیتابیس را معادل ساخت واقعی Client داخل 3x-ui در نظر گرفت.

## کاربرد پروژه

این پنل برای سناریویی طراحی شده است که مدیر اصلی بتواند چند نماینده تعریف کند و هر نماینده فقط کاربران متعلق به خودش را بسازد و مدیریت کند.

قابلیت‌های اصلی عبارت‌اند از:

- تعریف نماینده توسط Admin؛
- اختصاص یک کد پسوند یکتا به هر نماینده، مانند `AR-07`؛
- تولید نام نهایی کاربر مانند `sara-AR-07`؛
- جلوگیری از تداخل نام بین نماینده‌ها با محدودیت Unique در دیتابیس؛
- جداسازی کاربران بر اساس مالک نماینده؛
- تعیین اعتبار، سقف حجم هر کاربر، حداکثر روز اعتبار و IP Limit؛
- کاهش اعتبار نماینده هنگام ساخت کاربر در یک تراکنش دیتابیس؛
- ثبت لاگ عملیات مهم؛
- داشبورد فارسی و واکنش‌گرا برای دسکتاپ و موبایل؛
- تست‌های خودکار برای منطق ساخت نام کاربر و احراز هویت خروج.

## معماری پیشنهادی

برای استفاده عملی، معماری زیر پیشنهاد می‌شود:

```text
                    HTTPS
                      │
              Nginx یا Caddy
                      │
        ┌─────────────┴─────────────┐
        │                           │
 reseller.example.com        panel.example.com
        │                           │
 پنل نمایندگی Node.js             3x-ui
        │                           │
        └──────────────┬────────────┘
                       │
                 MySQL / MariaDB
```

برای شروع می‌توان پنل نمایندگی و 3x-ui را روی یک VPS نصب کرد. برای محیط حساس یا پرترافیک، جداسازی آن‌ها روی دو VPS امنیت و کنترل دسترسی بهتری ایجاد می‌کند.

## پیش‌نیازها

حداقل پیش‌نیازهای پیشنهادی برای VPS:

- Ubuntu 22.04 یا 24.04؛
- Node.js نسخه 20 یا بالاتر؛
- pnpm؛
- MySQL 8 یا MariaDB؛
- Nginx یا Caddy؛
- دامنه یا زیردامنه؛
- حداقل 1GB RAM برای نصب آزمایشی؛
- دسترسی SSH با کاربر غیر root و دسترسی sudo.

### آیا روی هاست اشتراکی نصب می‌شود؟

اگر هاست فقط PHP و MySQL ارائه می‌دهد، این پروژه به‌صورت مستقیم قابل اجرا نیست؛ چون Backend آن Node.js است.

هاست فقط در صورتی مناسب است که این امکانات را ارائه کند:

- اجرای Node.js نسخه 20 یا بالاتر؛
- اجرای دائمی برنامه Node.js یا Node Application؛
- MySQL/MariaDB؛
- تنظیم Environment Variables؛
- دسترسی SSH یا ابزار Deploy از Git؛
- امکان تنظیم دامنه و SSL؛
- امکان اتصال Backend به API پنل 3x-ui.

در غیر این صورت، استفاده از VPS توصیه می‌شود.

## نصب روی VPS

### 1. ورود به سرور و نصب ابزارها

```bash
ssh user@SERVER_IP
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl nginx mysql-server
```

نصب Node.js با NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pnpm
node --version
pnpm --version
```

### 2. ساخت دیتابیس

وارد MySQL شوید:

```bash
sudo mysql
```

سپس یک دیتابیس و کاربر اختصاصی بسازید. رمز نمونه را حتماً با رمز قوی جایگزین کنید:

```sql
CREATE DATABASE xui_reseller CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'xui_reseller_app'@'localhost' IDENTIFIED BY 'CHANGE_THIS_WITH_A_LONG_RANDOM_PASSWORD';
GRANT ALL PRIVILEGES ON xui_reseller.* TO 'xui_reseller_app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 3. دریافت پروژه از GitHub

```bash
cd /opt
sudo git clone https://github.com/deragon02/xui-reseller-panel-pro.git xui-reseller-panel
sudo chown -R $USER:$USER /opt/xui-reseller-panel
cd /opt/xui-reseller-panel
```

اگر مخزن Private است، روی VPS باید با SSH key یا GitHub token دسترسی Clone داشته باشید. توکن را داخل URL یا فایل commit نکنید.

### 4. نصب وابستگی‌ها و ساخت پروژه

```bash
pnpm install --frozen-lockfile=false
pnpm check
pnpm test
pnpm build
```

### 5. تنظیم متغیرهای محیطی

فایل نمونه را کپی کنید:

```bash
cp .env.example .env
nano .env
```

حداقل متغیرهای مورد نیاز:

```env
DATABASE_URL=mysql://xui_reseller_app:YOUR_DATABASE_PASSWORD@127.0.0.1:3306/xui_reseller
JWT_SECRET=GENERATE_A_LONG_RANDOM_SECRET
VITE_APP_ID=YOUR_MANUS_OAUTH_APP_ID
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://auth.manus.im
```

برای ساخت Secret تصادفی:

```bash
openssl rand -base64 48
```

> فایل `.env` نباید به GitHub push شود. این مخزن `.env` و فایل‌های محیطی واقعی را در `.gitignore` نادیده می‌گیرد.

### 6. اجرای migration دیتابیس

```bash
pnpm drizzle-kit migrate
```

اگر محیط شما از migration خودکار استفاده نمی‌کند، فایل‌های موجود در `drizzle/` را فقط پس از بررسی روی دیتابیس اجرا کنید. از اجرای کورکورانه `DROP TABLE` یا دستورات مخرب خودداری کنید.

### 7. اجرای آزمایشی

```bash
pnpm dev
```

پنل به‌صورت پیش‌فرض روی پورت 3000 اجرا می‌شود:

```text
http://SERVER_IP:3000
```

برای توقف اجرای آزمایشی، `Ctrl+C` بزنید.

## اجرای دائمی با systemd

فایل سرویس را بسازید:

```bash
sudo nano /etc/systemd/system/xui-reseller.service
```

محتوا:

```ini
[Unit]
Description=XUI Reseller Panel
After=network.target mysql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/xui-reseller-panel
EnvironmentFile=/opt/xui-reseller-panel/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node /opt/xui-reseller-panel/dist/index.js
Restart=always
RestartSec=5

# Hardening پایه
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/opt/xui-reseller-panel

[Install]
WantedBy=multi-user.target
```

سپس دسترسی و سرویس را فعال کنید:

```bash
sudo chown -R www-data:www-data /opt/xui-reseller-panel
sudo systemctl daemon-reload
sudo systemctl enable --now xui-reseller
sudo systemctl status xui-reseller
```

مشاهده لاگ‌ها:

```bash
sudo journalctl -u xui-reseller -f
```

بعد از هر به‌روزرسانی:

```bash
cd /opt/xui-reseller-panel
sudo -u www-data git pull origin main
sudo -u www-data pnpm install --frozen-lockfile=false
sudo -u www-data pnpm check
sudo -u www-data pnpm test
sudo -u www-data pnpm build
sudo systemctl restart xui-reseller
```

## تنظیم Nginx و HTTPS

یک زیردامنه مانند `reseller.example.com` به IP سرور اشاره دهید، سپس فایل زیر را بسازید:

```bash
sudo nano /etc/nginx/sites-available/xui-reseller
```

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name reseller.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

فعال‌سازی:

```bash
sudo ln -s /etc/nginx/sites-available/xui-reseller /etc/nginx/sites-enabled/xui-reseller
sudo nginx -t
sudo systemctl reload nginx
```

گرفتن SSL رایگان با Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d reseller.example.com
```

بعد از فعال‌شدن SSL، فقط نسخه HTTPS را در اختیار کاربران قرار دهید.

## کاربرد پنل برای مدیر و نماینده

### مدیر سیستم

مدیر می‌تواند:

1. کاربر احراز هویت‌شده را به‌عنوان نماینده انتخاب کند؛
2. نام نماینده و کد پسوند یکتا تعریف کند؛
3. اعتبار اولیه و سقف مصرف را تعیین کند؛
4. حداکثر روز اعتبار و IP Limit را مشخص کند؛
5. نمایندگان و قوانین مالکیت را مشاهده کند.

### نماینده

نماینده می‌تواند:

1. داشبورد مصرف و اعتبار خود را ببیند؛
2. کاربر جدید بسازد؛
3. نام پایه مانند `sara` را وارد کند؛
4. نام نهایی مانند `sara-AR-07` را قبل از ثبت مشاهده کند؛
5. کاربران متعلق به خودش و وضعیت آن‌ها را ببیند؛
6. حجم، تعداد IP و مدت اعتبار مجاز را رعایت کند.

نماینده به کاربران نماینده‌های دیگر دسترسی ندارد؛ این محدودیت باید هم در رابط کاربری و هم در Backend رعایت شود.

## منطق کد پسوند و جلوگیری از تداخل

هر نماینده یک `suffixCode` دارد که در دیتابیس Unique است. هنگام ساخت کاربر:

```text
نام پایه: sara
کد نماینده: AR-07
نام نهایی: sara-AR-07
```

اگر نماینده دیگری همین نام پایه را بسازد ولی کد او `BX-02` باشد، نتیجه متفاوت خواهد بود:

```text
sara-BX-02
```

علاوه بر کنترل Backend، ستون `clients.username` نیز Unique است تا در صورت خطای کلاینت یا درخواست هم‌زمان، دیتابیس مانع ثبت نام تکراری شود.

## اتصال به 3x-ui

نسخه فعلی منطق پنل نمایندگی و دیتابیس را دارد، اما اتصال عملی به API پنل 3x-ui هنوز باید اضافه شود. برای اتصال واقعی باید این لایه‌ها پیاده‌سازی و تست شوند:

- ثبت امن مشخصات Node یا پنل 3x-ui؛
- ذخیره رمزها و Tokenها فقط به‌صورت رمزنگاری‌شده یا در Secret Manager؛
- اعتبارسنجی TLS و جلوگیری از درخواست به مقصد ناشناس؛
- ساخت Client در Inbound انتخاب‌شده؛
- تمدید، غیرفعال‌سازی و حذف Client؛
- همگام‌سازی وضعیت و مصرف؛
- Idempotency برای جلوگیری از ساخت دوباره در retry؛
- لاگ بدون افشای Token، رمز عبور یا لینک خصوصی اشتراک.

تا قبل از پیاده‌سازی این لایه، هر نتیجه دیتابیس را نباید به‌عنوان تأیید ساخت Client واقعی در 3x-ui تلقی کرد.

## امنیت و توصیه‌های عملیاتی

- از رمز عبور قوی برای MySQL استفاده کنید.
- پورت MySQL را روی اینترنت عمومی باز نکنید.
- پورت 3000 را عمومی نکنید و فقط Nginx به آن متصل شود.
- ورود SSH با root و Password را غیرفعال کنید و از SSH key استفاده کنید.
- `.env`، Token API، رمز پنل و لینک‌های اشتراک را در GitHub قرار ندهید.
- قبل از هر Deploy، `pnpm check` و `pnpm test` را اجرا کنید.
- برای VPS از Firewall مانند UFW استفاده کنید:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

- از دیتابیس به‌صورت روزانه Backup بگیرید و Backup را روی همان سرور نگه ندارید.
- لاگ‌ها را دوره‌ای بررسی و دسترسی SSH و GitHub را بازبینی کنید.
- در محیط تولید از Secretهای جداگانه برای staging و production استفاده کنید.

## توسعه محلی

```bash
git clone https://github.com/deragon02/xui-reseller-panel-pro.git
cd xui-reseller-panel-pro
pnpm install
cp .env.example .env
pnpm check
pnpm test
pnpm dev
```

اسکریپت‌های مهم:

| دستور | کاربرد |
|---|---|
| `pnpm dev` | اجرای محیط توسعه |
| `pnpm check` | بررسی TypeScript |
| `pnpm test` | اجرای تست‌ها |
| `pnpm build` | ساخت نسخه Production |
| `pnpm drizzle-kit generate` | تولید migration از Schema |
| `pnpm drizzle-kit migrate` | اعمال migration روی دیتابیس |

## ساختار مهم فایل‌ها

```text
client/src/pages/Home.tsx       رابط داشبورد فارسی و RTL
server/routers.ts               رویه‌های tRPC و کنترل دسترسی
drizzle/schema.ts               جداول کاربران، نماینده‌ها، Clientها و لاگ‌ها
server/db.ts                    منطق مالکیت، پسوند و اعتبار
server/*.test.ts                تست‌های Backend
.env.example                    نمونه تنظیمات محیطی
```

## وضعیت انتشار

- GitHub: `https://github.com/deragon02/xui-reseller-panel-pro`
- نوع مخزن: Private
- شاخه اصلی: `main`
- محیط Preview: مناسب تست و بررسی اولیه، نه استفاده تجاری دائمی
- محیط پیشنهادی Production: VPS با Node.js، MySQL، systemd، Nginx و HTTPS

## مجوز و مسئولیت استفاده

این پروژه برای استفاده مدیریتی روی سرورهای تحت اختیار شما طراحی شده است. قبل از استفاده تجاری، کنترل دسترسی، Backup، HTTPS، قوانین ارائه‌دهنده VPS و نحوه استفاده از API پنل 3x-ui را بررسی کنید.
