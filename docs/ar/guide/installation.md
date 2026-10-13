# التثبيت

::: info أخبار
🍎 **تم إطلاق إضافة Safari الأصلية!** وهي مجانية بالكامل وتدعم التثبيت بنقرة واحدة.
:::

اختر الطريقة المناسبة لك.

> ⚠️ ملاحظة: مدير المطالبات هو الميزة الوحيدة التي تدعم Gemini™ for Enterprise.

## 1. متاجر الإضافات (موصى به)

أبسط طريقة للبدء. التحديثات تُثبَّت تلقائيًا.

**Chrome / Edge / Brave / Opera / Vivaldi:**

[<img src="https://img.shields.io/badge/Chrome_Web_Store-Download-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="التثبيت من متجر Chrome الإلكتروني" height="40"/>](https://chromewebstore.google.com/detail/iifacdnjakkhjjiengaffnegbndgingi?utm_source=github&utm_medium=docs&utm_campaign=organic_growth&utm_content=ar)

**Microsoft Edge:**

[<img src="https://img.shields.io/badge/Microsoft_Edge-Download-0078D7?style=for-the-badge&logo=microsoft-edge&logoColor=white" alt="التثبيت من إضافات Microsoft Edge" height="40"/>](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne)

> **مستخدمو Edge:** يواصل Voyager صيانة الإضافة ونشرها على [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne)، خاصةً لمن يحتاج إلى Edge على الهاتف أو الجهاز اللوحي. وإذا تأخرت المراجعة، تبقى متاحة نسخة Chrome Web Store وحزم GitHub اليدوية.

**Firefox:**

[<img src="https://img.shields.io/badge/Firefox_Add--ons-Download-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="التثبيت من إضافات Firefox" height="40"/>](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

## 2. التثبيت اليدوي (أحدث الميزات)

قد تكون مراجعة متجر الإضافات بطيئة. إذا أردت الإصدار الأحدث فورًا، فثبّته يدويًا.

**لـ Chrome / Edge / Brave / Opera:**

1. نزّل أحدث ملف `voyager-chrome-vX.Y.Z.zip` من [إصدارات GitHub](https://github.com/voyager-crew/voyager/releases).
2. فكّ ضغط الملف.
3. افتح صفحة الإضافات في متصفحك (`chrome://extensions`).
4. فعّل **وضع المطوّر** (Developer mode) من أعلى الصفحة.
5. انقر على **Load unpacked** (تحميل غير مضغوط) واختر المجلد الذي فككت ضغطه للتو.

**لـ Firefox:**

1. نزّل أحدث ملف `voyager-firefox-vX.Y.Z.xpi` من [الإصدارات](https://github.com/voyager-crew/voyager/releases).
2. افتح مدير الإضافات (`about:addons`).
3. اسحب ملف `.xpi` وأفلته لتثبيته (أو انقر على أيقونة الترس ⚙️ ← **Install Add-on From File**).

> 💡 ملف XPI موقّع رسميًا من Mozilla، ويمكن تثبيته بشكل دائم في جميع إصدارات Firefox.

## 3. Safari (macOS)

أصبح Safari يدعم التوزيع المباشر! نزّل التطبيق الموقّع مسبقًا:

::: warning الترقية من `Gemini Voyager.app`
صار التطبيق الحاوي يحمل اسم `Voyager.app`. ولأن macOS لا يستبدل التطبيقات التي تختلف أسماء ملفاتها، فلا تُبقِ النسختين مثبتتين معًا.

1. في الإضافة القديمة، افتح تبويبات Gemini وAI Studio التي تستخدمها، ثم نفّذ **مزامنة سحابية > رفع إلى السحابة**. وإذا كنت تستخدم مزامنة التمييزات، فَفعّلها قبل الرفع.
2. صدّر مكتبة الموجّهات كملف JSON محلي كنسخة احتياطية مستقلة.
3. أغلق Safari والتطبيق الحاوي.
4. انقل `/Applications/Gemini Voyager.app` إلى سلة المهملات. لا تنقر على زر **إلغاء التثبيت** في Safari، ولا تمسح بيانات إضافات Safari أو بيانات المواقع أو الحاويات.
5. انسخ `Voyager.app` إلى `/Applications`، وافتحه مرة واحدة، ثم فعّل Voyager في Safari إذا طُلب منك ذلك.
6. تحقق من مجلداتك وموجّهاتك وإعداداتك ونجومك المحفوظة. وإذا فُقد شيء، فاستخدم **دمج** أو استورد ملف JSON الخاص بالموجّهات.

يحتفظ Voyager بمعرّفات الحزم الحالية للتطبيق والإضافة، لذلك يواصل macOS وSafari التعرف على الهوية نفسها للمنتج. وخطوات النسخ الاحتياطي هذه احتياط للتثبيتات اليدوية القديمة.
:::

1. نزّل <SafariDownloadLink>أحدث إصدار من Safari (.dmg)</SafariDownloadLink>.
2. انقر مرتين لفتح الملف، واتبع التعليمات لإتمام التثبيت.
3. انقر مرتين لتشغيل التطبيق.
4. فعّل الإضافة من **إعدادات Safari > الإضافات**.

> 💡 نسخة Safari موقّعة الآن مباشرةً للتوزيع، ولا تحتاج إلى تحويل بواسطة Xcode!
>
> ✅ **دعم Safari الرسمي**: منذ الإصدار v1.6.0، أصبحت إزالة العلامة المائية وتصدير الصور ومزامنة Google Drive وiCloud وإشعارات اكتمال الرد وتحديثات Sparkle مدعومة.

---

_هل تريد إعداد بيئة التطوير؟ إذا كنت مطوّرًا وتريد المساهمة، فاطّلع على [دليل المساهمة](https://github.com/voyager-crew/voyager/blob/main/.github/CONTRIBUTING.md)._
