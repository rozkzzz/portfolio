# 0DAY.PORTFOLIO

เว็บ portfolio ส่วนตัวสไตล์ **0day.today** (ธีมดำ-เขียว terminal/exploit-database)

- **Hosting (ที่เก็บเว็บ):** GitHub Pages *หรือ* Vercel — เลือกอย่างเดียว ฟรีทั้งคู่
- **Database (ที่เก็บข้อมูล):** Firebase Firestore — ฟรีบน Spark plan ไม่ต้องผูกบัตร

```
public/            <- ตัวเว็บ (static, ไม่มี build step)  = สิ่งที่ถูก deploy
  index.html
  css/style.css
  js/app.js              logic + โหลดข้อมูลจาก Firestore
  js/firebase-config.js  <- ใส่ค่า config ตรงนี้
  js/sample.js           <- ข้อมูลตัวอย่าง (แก้เป็นของตัวเองได้)
  .nojekyll              (บอก GitHub Pages ไม่ต้องประมวลผลไฟล์)
seed/seed.mjs      <- สคริปต์อัปข้อมูลขึ้น Firestore ครั้งเดียว
.github/workflows/deploy.yml  <- auto-deploy ขึ้น GitHub Pages เมื่อ push
vercel.json        <- ตั้งค่าเผื่ออยากใช้ Vercel แทน
firestore.rules    <- อ่านได้ทุกคน / เขียนไม่ได้จาก client
```

> **แนวคิดง่าย ๆ:** เว็บ (ไฟล์ใน `public/`) ไปอยู่บน GitHub Pages หรือ Vercel
> ส่วน "ข้อมูล" (โปรไฟล์ + รายการผลงาน) ไปอยู่บน Firestore แล้วเว็บดึงมาแสดง

---

## เปิดดูในเครื่องทันที (ยังไม่ต้องตั้งอะไรเลย)

เว็บมีข้อมูลตัวอย่างในตัว เปิดดูได้เลย:

```bash
npx serve public
# หรือ
python -m http.server 5000 --directory public
```

เปิด URL ที่ขึ้นมา — จะเห็นเว็บพร้อมข้อมูลตัวอย่าง (แหล่งข้อมูลขึ้นว่า `local sample`)

---

## แก้ให้เป็นข้อมูลของตัวเอง

แก้ไฟล์ `public/js/sample.js`:
- `sampleProfile` = ชื่อ / role / bio / ลิงก์ / **รูปโปรไฟล์** ของคุณ
- `sampleEntries` = รายการผลงาน แต่ละอันมี field:

**รูปโปรไฟล์:** เอารูปตัวเองไปวางที่ `public/img/profile.jpg` แล้วตั้งใน `sampleProfile`:
`photo: "./img/profile.jpg"` — หรือจะใส่เป็น URL รูปก็ได้ (เช่นลิงก์จากอินเทอร์เน็ต)
ถ้าเว้นว่าง `photo: ""` จะโชว์ avatar เริ่มต้น (รูป terminal สีเขียว)

**Timeline:** บนหัวตารางมีปุ่มสลับ `[#] TABLE` / `[~] TIMELINE`
โหมด TIMELINE จะจัดผลงานเป็นเส้นเวลาตามปี (2019, 2020, ...) อัตโนมัติจาก field `date`

**Skills:** แก้ `skills` ใน `sampleProfile` แสดงเป็น chip เล็ก ๆ จัดกลุ่มตาม `category`
มี level ก็ได้ (0-100 = สีเขียวที่เติมใน chip) ไม่มีก็ได้ ถ้า skill เยอะ (เช่น 100 อัน)
รายการจะ scroll อยู่ในกรอบ ไม่ยืดยาวรกหน้าเว็บ
```js
skills: [
  { name: "HTML / CSS", level: 90, category: "Frontend" },
  { name: "Laravel / PHP", level: 80, category: "Backend" },
  { name: "MySQL", level: 68, category: "Database" },
  { name: "Docker", category: "Tools" },   // ไม่มี level ก็ได้
  "Git",                                    // ใส่ชื่อเฉย ๆ ก็ได้ -> อยู่กลุ่ม "other"
],
```


| field | ความหมาย |
|-------|----------|
| `date` | วันที่ (`YYYY-MM-DD`) ใช้เรียงลำดับ |
| `title` / `description` | หัวข้อ + คำอธิบายสั้น |
| `category` | `project` / `experience` / `research` / `certificate` |
| `stack` | array ของเทคโนโลยี เช่น `["React","Node"]` |
| `risk` | `high` = 0DAY (แดง), `med` = MEDIUM (เหลือง), `low` = PATCHED (เขียว) |
| `views` | ตัวเลข |
| `body` | เนื้อหาเต็ม (โชว์ตอนคลิกเปิด) |
| `link` | ลิงก์ผลงาน (ไม่มีก็เว้นว่าง) |

> อยากได้เว็บแบบไม่ต้องมี database เลยก็ได้ — แค่แก้ `sample.js` แล้วข้ามหัวข้อ "Firebase"
> ไป deploy เลย (`ENABLED` คงไว้ `false`) เว็บจะใช้ข้อมูลจากไฟล์นี้ตรง ๆ

---

## ส่วนที่ 1 — ต่อ Firebase เป็น database (ถ้าอยากแก้ข้อมูลผ่านหน้าเว็บ console ได้)

### 1) สร้างโปรเจกต์
1. เข้า https://console.firebase.google.com → **Add project** (เลือก Spark plan ฟรี)
2. **Build → Firestore Database → Create database** → เลือก *production mode*
3. **Project settings (⚙️) → Your apps → Web `</>`** → คัดลอกค่า config

### 2) ใส่ config
เปิด `public/js/firebase-config.js` วางค่าที่คัดลอกมา แล้วเปลี่ยน:
```js
export const ENABLED = true;   // เดิมเป็น false
```

### 3) ตั้ง security rules
Firebase Console → **Firestore → Rules** → วางเนื้อหาจากไฟล์ `firestore.rules`
(อ่านได้ทุกคน เขียนไม่ได้จาก client) → **Publish**

### 4) ใส่ข้อมูลลง Firestore — เลือกทางใดทางหนึ่ง

**ทาง A — พิมพ์มือใน Console (ง่ายสุด ไม่ต้องรันอะไร):**
Firestore → สร้าง collection ชื่อ `entries` เพิ่ม document ตาม field ในตารางข้างบน
และสร้าง collection `profile` มี document id = `main` ใส่ชื่อ/role/bio

**ทาง B — รันสคริปต์ seed อัปข้อมูลตัวอย่างทีเดียว:**
1. **Project settings → Service accounts → Generate new private key**
   → เซฟเป็น `seed/serviceAccount.json` (gitignore ไว้แล้ว **ห้าม commit**)
2. รัน:
   ```bash
   cd seed
   npm install
   node seed.mjs
   ```

---

## ส่วนที่ 2 — เอาเว็บขึ้นออนไลน์ (เลือกอย่างเดียว)

### ตัวเลือก A: GitHub Pages  ← แนะนำ ง่ายสุด

1. สร้าง repo ใหม่บน GitHub แล้ว push โค้ดทั้งหมดนี้ขึ้นไป (branch ชื่อ `main`):
   ```bash
   git init
   git add .
   git commit -m "0day portfolio"
   git branch -M main
   git remote add origin https://github.com/<username>/<repo>.git
   git push -u origin main
   ```
2. บน GitHub: **Settings → Pages → Build and deployment → Source = GitHub Actions**
3. เสร็จ! ทุกครั้งที่ `git push` ไฟล์ `.github/workflows/deploy.yml` จะ deploy ให้อัตโนมัติ
   URL จะเป็น `https://<username>.github.io/<repo>/`
   (ดูสถานะได้ที่แท็บ **Actions** ของ repo)

### ตัวเลือก B: Vercel

1. push โค้ดขึ้น GitHub เหมือนข้างบน
2. เข้า https://vercel.com → **Add New → Project** → เลือก repo
3. Vercel อ่าน `vercel.json` แล้ว deploy โฟลเดอร์ `public/` ให้เอง → กด **Deploy**
   (ไม่ต้องตั้ง build command อะไร มันเป็น static)

> อย่าทำทั้ง A และ B พร้อมกัน เลือกที่เดียวพอ ถ้าจะย้ายทีหลังก็แค่เปลี่ยนที่ deploy

---

## หมายเหตุความปลอดภัย
- `firestore.rules` = **อ่านได้ทุกคน เขียนไม่ได้จาก client** เหมาะกับ portfolio สาธารณะ
- ค่าใน `firebaseConfig` เป็นข้อมูล public ปกติ เปิดเผยได้ (โผล่ใน GitHub ได้ ไม่เป็นไร)
- สิ่งที่ **ห้ามเปิดเผย/ห้าม commit** คือ `seed/serviceAccount.json` เท่านั้น (gitignore ไว้แล้ว)
