# آموزش تصویری نصب سریع

این راهنما مسیر نصب را به‌صورت تصویری نشان می‌دهد. برای نصب معمولی، فقط بخش **Quick Install** لازم است.

نسخه تصویری یک‌تکه: [دانلود پوستر نصب](visual-installation-guide.png)

## تصویر کلی معماری

```mermaid
flowchart LR
    U[کاربر / نماینده] --> D[reseller.example.com]
    D --> N[Nginx + HTTPS]
    N --> A[Node.js XUI Reseller]
    A --> DB[(MySQL)]
    A -. مرحله بعد .-> X[3x-ui API]
    M[مدیر VPS] --> S[systemd]
    S --> A
```

## Quick Install در ۵ مرحله

```mermaid
flowchart TD
    A[۱. VPS تازه Ubuntu/Debian] --> B[۲. clone مخزن خصوصی]
    B --> C[۳. اجرای scripts/install.sh]
    C --> D[۴. ساخت دیتابیس و .env]
    D --> E[۵. install + test + migrate + build]
    E --> F[۶. systemd + Nginx + Certbot]
    F --> G[پنل آماده روی HTTPS]
```

### مرحله ۱: آماده‌کردن VPS

تصویر ذهنی صفحه SSH:

```text
┌──────────────────────────────────────────────┐
│ ubuntu@server:~$                            │
│ sudo apt update && sudo apt install ...     │
│                                              │
│ [########################] Done              │
└──────────────────────────────────────────────┘
```

دستور:

```bash
sudo apt update && sudo apt install -y curl git
```

### مرحله ۲: دریافت پروژه

```bash
git clone https://github.com/deragon02/xui-reseller-panel-pro.git
cd xui-reseller-panel-pro
```

اگر مخزن Private است، از Deploy Key یا Credential کم‌دسترسی استفاده کنید. Token را داخل URL یا فایل پروژه ننویسید.

### مرحله ۳: اجرای Quick Installer

```bash
sudo bash scripts/install.sh
```

نصب‌کننده مراحل زیر را خودش انجام می‌دهد:

```mermaid
sequenceDiagram
    participant I as install.sh
    participant OS as Ubuntu
    participant DB as MySQL
    participant APP as App
    participant WEB as Nginx/Certbot
    I->>OS: install Node.js, pnpm, MySQL, Nginx
    I->>DB: create database and least-privilege user
    I->>APP: write protected .env
    I->>APP: pnpm install / check / test / migrate / build
    I->>OS: create and enable systemd service
    I->>WEB: configure domain and issue HTTPS
```

در صورت داشتن دامنه، هنگام اجرا وارد کنید:

```text
Domain: reseller.example.com
Manus OAuth App ID: ********
```

یا به‌صورت غیرتعاملی:

```bash
sudo DOMAIN=reseller.example.com \
  VITE_APP_ID=YOUR_MANUS_APP_ID \
  bash scripts/install.sh
```

### مرحله ۴: بررسی سرویس

```bash
sudo systemctl status xui-reseller
```

نمایش سالم باید شبیه این باشد:

```text
● xui-reseller.service - XUI Reseller Panel
   Loaded: loaded (...; enabled)
   Active: active (running)
```

برای لاگ زنده:

```bash
sudo journalctl -u xui-reseller -f
```

### مرحله ۵: بررسی HTTPS

اگر DNS دامنه به VPS اشاره کند، نصب‌کننده Nginx و Certbot را تنظیم می‌کند:

```text
https://reseller.example.com
          │
          ▼
   ┌─────────────┐
   │ HTTPS / SSL │
   └──────┬──────┘
          ▼
   127.0.0.1:3000
```

اگر گواهی صادر نشد، معمولاً DNS هنوز آماده نیست یا پورت 80/443 بسته است. بعد از اصلاح DNS و Firewall اجرا کنید:

```bash
sudo certbot --nginx -d reseller.example.com
sudo certbot renew --dry-run
```

## مسیر استفاده داخل پنل

```mermaid
flowchart TD
    L[ورود با OAuth] --> R{نقش کاربر}
    R -->|Admin| A[ساخت نماینده]
    A --> S[اختصاص suffix مثل AR-07]
    S --> Q[تعیین اعتبار و قوانین]
    R -->|Reseller| C[ساخت کاربر]
    C --> N[نام پایه مثل sara]
    N --> F[sara-AR-07]
    F --> O[مالکیت و اعتبارسنجی Backend]
```

نمونه:

```text
نام پایه:       sara
کد نماینده:     AR-07
نام نهایی:      sara-AR-07
```

## به‌روزرسانی تصویری

```mermaid
flowchart LR
    B[Backup .env + DB] --> P[git pull --ff-only]
    P --> T[check + test]
    T --> M[migrate]
    M --> C[build]
    C --> R[restart systemd]
    R --> H[health check]
    H -->|موفق| OK[نسخه جدید فعال]
    H -->|شکست| RB[rollback به commit قبلی]
```

دستور:

```bash
sudo mysqldump --single-transaction xui_reseller \
  | gzip | sudo tee /var/backups/xui-reseller-db.sql.gz >/dev/null

cd /opt/xui-reseller-panel
sudo APP_DIR=/opt/xui-reseller-panel \
  SERVICE_NAME=xui-reseller bash scripts/update.sh
```

## عیب‌یابی سریع

| نشانه | بررسی |
|---|---|
| سرویس `failed` است | `sudo journalctl -u xui-reseller -n 100 --no-pager` |
| صفحه باز نمی‌شود | `sudo systemctl status nginx` و `sudo nginx -t` |
| SSL صادر نمی‌شود | DNS دامنه، پورت 80 و پورت 443 را بررسی کنید |
| OAuth کار نمی‌کند | `VITE_APP_ID` و URLهای OAuth در `.env` را بررسی کنید |
| خطای دیتابیس | `DATABASE_URL`، رمز کاربر MySQL و وضعیت `mysql.service` را بررسی کنید |
| Update شکست خورد | commit قبلی و لاگ اسکریپت را بررسی کنید؛ اسکریپت rollback دارد |

## هشدار مهم

این MVP هنوز اتصال واقعی ساخت Client در 3x-ui را فعال نکرده است. نصب موفق پنل به‌معنای نصب یا تغییر پنل 3x-ui نیست. برای اتصال مرحله بعد باید API Docs نسخه دقیق 3x-ui، Tokenهای scoped، TLS و سیاست مالکیت بررسی و تست شوند.
