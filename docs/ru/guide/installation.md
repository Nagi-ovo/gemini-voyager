# Установка

Выберите свой путь.

> ⚠️ Примечание: Менеджер промптов — единственная функция, поддерживающая Gemini для Enterprise.

## 1. Магазины расширений (Рекомендуется)

Самый простой способ начать. Обновления происходят автоматически.

**Chrome / Brave / Opera / Vivaldi:**

[<img src="https://img.shields.io/badge/Chrome_Web_Store-Download-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Установить из Chrome Web Store" height="40"/>](https://chromewebstore.google.com/detail/kjdpnimcnfinmilocccippmododhceol)

**Microsoft Edge:**

[<img src="https://img.shields.io/badge/Microsoft_Edge-Download-0078D7?style=for-the-badge&logo=microsoft-edge&logoColor=white" alt="Установить из Microsoft Edge Add-ons" height="40"/>](https://microsoftedge.microsoft.com/addons/detail/gemini-voyager/gibmkggjijalcjinbdhcpklodjkhhlne)

**Firefox:**

[<img src="https://img.shields.io/badge/Firefox_Add--ons-Download-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="Установить из Firefox Add-ons" height="40"/>](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

## 2. Ручной способ (Новейшие функции)

Процесс проверки в Web Store может быть медленным. Если вы хотите получить самую свежую версию немедленно, установите её вручную.

**Для Chrome / Edge / Brave / Opera:**

1. Скачайте последний `gemini-voyager-chrome-vX.Y.Z.zip` из [GitHub Releases](https://github.com/Nagi-ovo/gemini-voyager/releases).
2. Распакуйте файл.
3. Откройте страницу Расширений вашего браузера (`chrome://extensions`).
4. Включите **Режим разработчика** (вверху справа).
5. Нажмите **Загрузить распакованное расширение** и выберите папку, которую вы только что распаковали.

**Для Firefox:**

1. Скачайте последний `gemini-voyager-firefox-vX.Y.Z.xpi` из [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases).
2. Откройте Менеджер дополнений (`about:addons`).
3. Перетащите файл `.xpi` для установки (или нажмите значок шестеренки ⚙️ -> **Установить дополнение из файла**).

> 💡 Файл XPI официально подписан Mozilla и может быть постоянно установлен во всех версиях Firefox.

## 3. Safari (macOS)

1. Скачайте `gemini-voyager-safari-vX.Y.Z.zip` из [Releases](https://github.com/Nagi-ovo/gemini-voyager/releases).
2. Распакуйте файл.
3. Выполните следующую команду в Терминале для конвертации (требуется Xcode):
   ```bash
   xcrun safari-web-extension-converter dist_safari --macos-only --app-name "Gemini Voyager"
   ```
4. Запустите приложение в Xcode для установки.
5. Включите в Настройки Safari > Расширения.

---

_Настройка для разработки? Если вы разработчик и хотите внести свой вклад, ознакомьтесь с нашим [Руководством по участию](https://github.com/Nagi-ovo/gemini-voyager/blob/main/.github/CONTRIBUTING.md)._
