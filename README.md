# son24saat.com

> **"Burası arşiv değil, an."**

Geçici sosyal duvar platformu. Subdomain bazlı, anonim, TTL-temelli içerik paylaşımı.

## 🚀 Hızlı Deploy (Vercel + Neon)

### 1. GitHub'a Push
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/username/son24saat.git
git push -u origin main
```

### 2. Neon Database Oluştur
1. [neon.tech](https://neon.tech) → Sign Up (GitHub ile)
2. "Create Project" → Region: EU veya US
3. Connection string'i kopyala

### 3. Vercel'e Deploy
1. [vercel.com](https://vercel.com) → Import Git Repository
2. **Environment Variables** ekle:
   - `DATABASE_URL` = Neon connection string
   - `FINGERPRINT_SALT` = rastgele bir string
   - `CRON_SECRET` = başka bir rastgele string
3. Deploy!

### 4. Database Migration
Neon SQL Editor'da `migrations/001_initial_schema.sql` içeriğini çalıştır.

### 5. Domain Ayarları (Opsiyonel)
Vercel'de custom domain ekle: `son24saat.com`
Wildcard için: `*.son24saat.com`

## 📡 API Endpoints

### Space (Alan)
| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/api/space` | Mevcut alan bilgisi |
| POST | `/api/space` | Yeni alan oluştur |
| GET | `/api/space/check/:slug` | Slug kontrolü |

### Posts (İçerikler)
| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/api/posts` | Feed (kronolojik) |
| GET | `/api/posts/:id` | Tek post + yanıtlar |
| POST | `/api/posts` | Yeni post |
| POST | `/api/posts/:id/reactions` | Tepki ekle/güncelle |
| POST | `/api/posts/:id/flags` | İçerik bildir |
| POST | `/api/posts/:id/replies` | Yanıt ekle |

### System
| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/api/health` | Sağlık kontrolü |
| GET | `/api/config` | Public config |

## 🔧 Development

### Local Subdomain Testing
```bash
# X-Space-Slug header ile test
curl -H "X-Space-Slug: test" http://localhost:3000/api/posts

# Post oluştur
curl -X POST http://localhost:3000/api/posts \
  -H "X-Space-Slug: test" \
  -H "Content-Type: application/json" \
  -d '{"content": "Test mesajı"}'
```

### Manual Cleanup
```bash
# Preview
npm run cleanup

# Force
npm run cleanup -- --force
```

## ⚙️ Konfigürasyon

### TTL Ayarları
- `TTL_DEFAULT`: Varsayılan içerik ömrü (saat)
- `TTL_CLEANUP_INTERVAL`: Temizleme aralığı (dakika)

### Premium TTL Seçenekleri (İleri aşama)
- 24 saat (free)
- 48 saat (premium)
- 72 saat (enterprise)

## 🛡️ Moderasyon

### Otomatik
- Küfür / tehdit / hedef gösterme tespiti
- Spam pattern kontrolü

### Topluluk
- "Sınırı aşıyor" tepkisi
- Belirli eşik sonrası içerik griye düşer

### İlke
- Silmek yerine görünürlüğü azalt
- Sansür hissini minimumda tut

## 📊 Metrikler (Öncelik #3)

Her space için:
1. Posts per day
2. Reactions per post
3. Median time-to-first-reply
4. Flags per 1k posts
5. Repeat poster rate

→ **Space Health Score** türetimi

## 🔮 Yol Haritası

### MVP (Phase 1) ✅
- [x] Subdomain bazlı space routing
- [x] Post oluşturma (text)
- [x] 24 saat TTL silme
- [x] Reaksiyon sistemi
- [x] Flag & karartma
- [x] Soft identity

### Phase 2
- [ ] Image upload
- [ ] Admin dashboard
- [ ] Space analytics
- [ ] Premium TTL

### Phase 3
- [ ] Event mode
- [ ] Custom domain
- [ ] Moderation threshold ayarları

## 📝 Notlar

- **Export/Arşiv YOK**: Bilinçli tasarım kararı
- **Profil/DM/Takip YOK**: Minimalist yaklaşım
- **Bildirim/Arama YOK**: MVP scope dışı

---

**son24saat.com** - *Burası arşiv değil, an.*
