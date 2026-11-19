# CMA CGM VGM erişim talebi — taslak

Neden: CBI'ın VGM bildirimleri bugün Mac'teki bir Chrome eklentisiyle CMA eBusiness formuna giriliyor. CMA, sunucudan yapılan erişimi bot korumasıyla (DataDome) engelliyor ve bu korumayı aşmaya çalışmıyoruz. Mac'e bağımlılığı kaldırmanın meşru yolu CMA'nın resmî VGM entegrasyonu: VERMAS EDI ya da API.

Gönderen: CBI Transport operasyon yetkilisi. Alıcı: CMA CGM Türkiye müşteri hizmetleri / eBusiness; e-posta adresini CMA temsilcinizden teyit edin. Köşeli parantezli alanları doldurun.

---

**Subject:** VGM submission by system integration (VERMAS EDI or API) — CBI Transport

Dear CMA CGM eBusiness team,

CBI Transport ([CMA customer / partner code]) submits Verified Gross Mass declarations to CMA CGM for our export bookings from Türkiye. We currently enter each VGM manually in the eBusiness portal and would like to send them directly from our operations system instead.

Could you tell us which of the following CMA CGM offers to a forwarder of our size, and what is needed to start:

1. **VGM by EDI** — VERMAS (UN/EDIFACT D.16A or the version you use): message implementation guide, transport (SFTP/AS2), test and production endpoints, and the partner set-up form.
2. **VGM by API** — access through the CMA CGM API portal (client credentials, sandbox), if a VGM declaration API is available for customers.

Our expected volume is about [number] VGM declarations per month, mostly for [ports]. The responsible party / signatory on the declarations is [name, title]. Method of weighing: [Method 1 / Method 2].

Technical contact: [name, e-mail, phone].

Thank you in advance for your guidance.

Kind regards,
[Name]
[Title] — CBI Transport
[Phone] · [E-mail]

---

Yanıt geldiğinde: EDI seçilirse VERMAS mesajını uygulamanın VGM kayıtlarından üretip VDS geçidinden (SFTP/AS2) gönderen bir modül; API seçilirse VDS geçidinde ya da doğrudan Worker'da çalışan bir istemci eklenir. İki durumda da CMA eklentisi ve Mac devreden çıkar.
