# ymproje1
MVP/Demo Kur Takip

## Hızlı Kurulum ve Çalıştırma
1) `git clone` yap veya GitHub üzerinden klasörü indir
2) Proje klasörüne gir
3) Bağımlılıkları yükle: `npm install`
4) Eğer `.env.example` varsa `.env` olarak kopyala ve gerekli değişkenleri doldur
5) Uygulamayı çalıştır: `node app.js`

## Yerel Makinede Scrape Test Etme
1) Projenin root klasöründe ol veya 2. adımı kendine göre ayarla.
2) `cd automation/scrape-pages/` yap
3) Bağımlılıkları yükle: `npm install`
4) `npm run scrape` yap
5) `automation/scrape-pages/.generated/site` yolunda `index.html`'i aç (Live server ile açmalısın! VSC eklentisi: [VSC Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) ) 