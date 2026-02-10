# التثبيت

::: info أخبار
🍎 **إضافة Safari الأصلية قادمة قريباً!** ستكون مجانية بالكامل وتدعم التثبيت بنقرة واحدة. ابقوا على اطلاع!
:::

اختر طريقك.

> ⚠️ ملاحظة: مدير المطالبات هو الميزة الوحيدة التي تدعم Gemini للمؤسسات.

## 1. متاجر الإضافات (موصى به)

أبسط طريقة للبدء. التحديثات تلقائية.

**Chrome / Brave / Opera / Vivaldi:**

[<img src="https://img.shields.io/badge/Chrome_Web_Store-Download-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="التثبيت من سوق Chrome الإلكتروني" height="40"/>](https://chromewebstore.google.com/detail/kjdpnimcnfinmilocccippmododhceol?utm_source=github&utm_medium=docs&utm_campaign=organic_growth&utm_content=ar)

**Microsoft Edge:**

[<img src="https://img.shields.io/badge/Microsoft_Edge-Download-0078D7?style=for-the-badge&logo=microsoft-edge&logoColor=white" alt="التثبيت من وظائف Microsoft Edge الإضافية" height="40"/>](https://microsoftedge.microsoft.com/addons/detail/gemini-voyager/gibmkggjijalcjinbdhcpklodjkhhlne)

**Firefox:**

[<img src="https://img.shields.io/badge/Firefox_Add--ons-Download-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="التثبيت من إضافات Firefox" height="40"/>](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

## 2. الطريقة اليدوية (أحدث الميزات)

يمكن أن تكون عملية مراجعة متجر الويب بطيئة. إذا كنت تريد أحدث إصدار فوراً، فقم بالتثبيت يدوياً.

**لـ Chrome / Edge / Brave / Opera:**

1. قم بتنزيل أحدث `gemini-voyager-chrome-vX.Y.Z.zip` من [إصدارات GitHub](https://github.com/Nagi-ovo/gemini-voyager/releases).
2. قم بفك ضغط الملف.
3. افتح صفحة الإضافات في متصفحك (`chrome://extensions`).
4. قم بتمكين **وضع المطور** (أعلى اليسار أو اليمين حسب اللغة).
5. انقر فوق **تحميل إضافات غير حزمة** وحدد المجلد الذي قمت بفك ضغطه للتو.

**لـ Firefox:**

1. قم بتنزيل أحدث `gemini-voyager-firefox-vX.Y.Z.xpi` من [الإصدارات](https://github.com/Nagi-ovo/gemini-voyager/releases).
2. افتح مدير الإضافات (`about:addons`).
3. اسحب ملف `.xpi` وأفلته للتثبيت (أو انقر فوق أيقونة الترس ⚙️ -> **تثبيت إضافة من ملف**).

> 💡 ملف XPI موقع رسمياً من Mozilla ويمكن تثبيته بشكل دائم في جميع إصدارات Firefox.

## 3. Safari (macOS)

1. قم بتنزيل `gemini-voyager-safari-vX.Y.Z.zip` من [الإصدارات](https://github.com/Nagi-ovo/gemini-voyager/releases).
2. قم بفك ضغط الملف.
3. قم بتشغيل الأمر التالي في Terminal لتحويله (يتطلب Xcode):
   ```bash
   xcrun safari-web-extension-converter dist_safari --macos-only --app-name "Gemini Voyager"
   ```
4. قم بتشغيل التطبيق في Xcode للتثبيت.
5. قم بالتمكين في إعدادات Safari > الإضافات.

---

_إعداد التطوير؟ إذا كنت مطوراً وتتطلع للمساهمة، تحقق من [دليل المساهمة](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/CONTRIBUTING.md) الخاص بنا._
