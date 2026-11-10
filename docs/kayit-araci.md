# Kayıt aracı: girişten sonraki ekranları yakalama

Araç senin bilgisayarındaki Google Chrome'u ayrı bir profille açar. Sen giriş yaparsın,
araç girişten sonraki her ekranı (hesap/workspace seçimi, consent, izin ayarları) otomatik
yakalar. **Approve'a asla basmaz**, hiçbir uygulamaya gerçekten yetki verilmez.

## Kurulum (bir kez)

```bash
git clone https://github.com/enesozturk/mcp-consents && cd mcp-consents && npm install
```

Google Chrome yüklü olmalı. Sonra kayıt profilinde Google'a giriş yap:

```bash
npm run record -- --setup
```

Açılan Chrome'da Google hesabına gir, sonra Chrome'dan çık (Cmd+Q). Oturum
`~/.mcp-gateways/chrome-profile` içinde kalır. Ayrı bir Google hesabı kullanman önerilir.

## Kayıt

```bash
npm run record
```

Varsayılan sıra "Google ile giriş" grubu. Diğerleri:
`--group email`, `--group microsoft`, `--group workspace`, `--group gated`, `--group all`,
`--group consent` (girişten önce kendi consent ekranını gösterenler, ör. Linear, Sentry, Square:
burada Approve'a basman gerekir, giriş ve workspace seçimi ondan sonra gelir; token hiç alınmaz),
ya da belirli servisler: `--only notion,stripe`.

Her servis için:

1. Tarayıcıda gateway açılır, "Continue with Google"a tıkla, onboarding varsa geç.
2. Her yeni ekran otomatik kaydedilir (terminalde `● 02 ...` satırları).
   Google'ın kendi giriş ekranları kişisel bilgi içerdiği için kaydedilmez (`--keep-google` ile açılır).
3. Consent/izin ekranına gelince dur, **Approve'a basma**.
4. Enter'dan sonra üç kısa soru gelir (sıralama için `data/raw/ratings.json`'a yazılır, sonradan
   elle de düzenlenebilir):
   - onboarding'den sonra MCP gateway'e geri döndün mü? (`y` / `n` / onboarding yoksa Enter)
   - arayüz puanı 1-5 (Enter ile geç)
   - serbest not
5. Terminalde tuşlar:
   - `Enter`: bu servisi bitir, istersen kısa bir not yaz
   - `c`: şu anki ekranı elle yakala
   - `v`: video kaydını başlat / durdur
   - `r`: yeni bir linkle baştan başlat
   - `s`: atla
   - `q`: kaydet ve çık

**Video.** Animasyonlu bir ekranı video olarak kaydetmek için ekran o haldeyken `v`'ye bas, 5-10 saniye
sonra tekrar `v`'ye bas. O ekranın görüntüsü de alınır ve videonun kapağı olur. Mac'te kayıt macOS'un
kendi ekran kaydıyla yapılır: yalnızca sayfa alanı, Retina'da 2880×1800. İlk seferde terminal için
System Settings → Privacy & Security → Screen Recording izni ister. Kayıt sırasında pencerenin önüne
başka bir şey gelmesin; imleç de videoya girer. Mac dışında Chrome'un 1× ekran akışı kullanılır,
`ffmpeg` gerekir. Sitede video sessiz ve döngüde oynar; her karesi ekran görüntüleri gibi maskelenir.

**Pencereyi elle büyütme.** Araç her serviste pencereyi sayfa alanı 1440×900 olacak şekilde
kendisi ayarlar (ilk taramayla aynı boyut). Sayfa ekrana sığmıyorsa normal görüntünün yanında
sayfanın tamamını da yakalar (`02-full.webp`). Sadece kendi içinde kayan bir panel varsa
kaydırıp `c`'ye bas.

Yarıda bırakırsan bir sonraki `npm run record` kaldığı yerden devam eder.
Bir servisi yeniden çekmek için: `npm run record -- --only notion --redo`.

## Yayınlama

Yakalanan ekranlar (ve videolar) `data/raw/auth-scans/<servis>/` altında kalır; bu klasör git'e
girmez, yedeğini kendin al. Maskeleyip yayınlamak için `npm run prepare-data` çalıştır (Tesseract ve
ffmpeg gerekir); sitede yalnızca maskelenmiş kopyalar (`public/auth/`) yayınlanır, onları commit'le.

## Gönderdikten sonra

Hiçbir ekran silinmez. Her adım gözden geçirilip bir türle etiketlenir
(`npm run classify-flows`, istisnalar `data/flow-kind-overrides.json` içinde):

- `gateway`: consent, izin/scope ekranları, hesap/workspace/kaynak seçimi, gateway hataları
- `login`: giriş/kayıt sayfaları, hesap seçiciler, doğrulama, giriş hataları
- `onboarding`: kayıt formları, profil/workspace kurulumu, anketler, terms
- `upsell`: deneme, plan teklifleri, uygulama indirme
- `redirect`: sağlayıcıdan çıkıldıktan sonraki sayfalar
- `noise`: boş sayfa, spinner, tekrar (repoda kalır, sitede gösterilmez)

Sitede "Gateway" sekmesi varsayılan olarak açılır; "Full journey" login dahil tüm adımları
türleriyle gösterir; "Before sign-in" ilk taramanın ekranlarıdır. Ana sayfadaki kartta da
varsa gateway ekranı gösterilir.

Bir servis bir kez denendiyse (sonucu ne olursa olsun) bir daha sıraya girmez. Tekrar çekmek
için: `npm run record -- --only <servis> --redo`. Yeniden çekildiğinde eski deneme silinmez,
`data/raw/auth-history/<servis>/` altına taşınır.

Kişisel bilgi: yayınlanan her ekran OCR ile taranır; `data/raw/personal-terms.json` içindeki isimler,
kişisel e-postalar ve hesap adları ilk birkaç harfi kalacak şekilde pikselleştirilir
(`scripts/mask-personal.cjs`). Telefon numaraları `data/flow-masks.json` içindeki alanlarla
tamamen maskelenir; maskesi olmayan telefonlu ekran yayınlanmaz.

Gateway'e ulaşamayan servisler (work email, ücretli plan, masaüstü uygulaması, hata, atlananlar)
ana sayfada listelenmez; en alttaki "Show N gateways that could not be recorded" bağlantısıyla
görülür. Tamamen kaldırılacak kayıtlar `data/hidden.json`, kayıt sırasına bir daha girmeyecekler
`data/record-skip.json` içindedir.

## Geri bildirim

`npm run dev` ile siteyi açtığında her detay sayfasında bir "Your feedback" kutusu çıkar.
Yazdığın her şey otomatik olarak `data/raw/feedback.json` dosyasına kaydedilir (yayındaki sitede bu
kutu yoktur). Bu dosya da git'e girmez.
