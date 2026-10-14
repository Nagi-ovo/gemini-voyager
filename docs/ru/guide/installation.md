# Установка

::: info Новости
🍎 **Нативное расширение для Safari уже вышло!** Оно совершенно бесплатно и поддерживает установку в один клик.
:::

Выберите способ установки.

> ⚠️ Примечание: Менеджер промптов — единственная функция, поддерживающая Gemini™ для Enterprise.

## 1. Магазины расширений (Рекомендуется)

Самый простой способ начать. Обновления происходят автоматически.

**Chrome / Edge / Brave / Opera / Vivaldi:**

[<img src="https://img.shields.io/badge/Chrome_Web_Store-Download-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Установить из Chrome Web Store" height="40"/>](https://chromewebstore.google.com/detail/iifacdnjakkhjjiengaffnegbndgingi?utm_source=github&utm_medium=docs&utm_campaign=organic_growth&utm_content=ru)

**Microsoft Edge:**

[<img src="https://img.shields.io/badge/Microsoft_Edge-Download-0078D7?style=for-the-badge&logo=microsoft-edge&logoColor=white" alt="Установить из Microsoft Edge Add-ons" height="40"/>](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne)

> **Пользователям Edge:** Voyager продолжит поддерживать и публиковать версию [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne) для тех, кому нужен Edge на телефоне или планшете. Если проверка задержится, остаются Chrome Web Store и ручные пакеты GitHub.

**Firefox:**

[<img src="https://img.shields.io/badge/Firefox_Add--ons-Download-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="Установить из Firefox Add-ons" height="40"/>](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

## 2. Ручной способ (Новейшие функции)

Процесс проверки в Web Store может быть медленным. Если вы хотите получить самую свежую версию немедленно, установите её вручную.

**Для Chrome / Edge / Brave / Opera:**

1. Скачайте последний `voyager-chrome-vX.Y.Z.zip` из [GitHub Releases](https://github.com/voyager-crew/voyager/releases).
2. Распакуйте файл.
3. Откройте страницу Расширений вашего браузера (`chrome://extensions`).
4. Включите **Режим разработчика** (вверху справа).
5. Нажмите **Загрузить распакованное расширение** и выберите папку, которую вы только что распаковали.

**Для Firefox:**

1. Скачайте последний `voyager-firefox-vX.Y.Z.xpi` из [Releases](https://github.com/voyager-crew/voyager/releases).
2. Откройте Менеджер дополнений (`about:addons`).
3. Перетащите файл `.xpi` для установки (или нажмите значок шестеренки ⚙️ -> **Установить дополнение из файла**).

> 💡 Файл XPI официально подписан Mozilla и может быть постоянно установлен во всех версиях Firefox.

## 3. Safari (macOS)

Safari теперь поддерживает прямое распространение! Скачайте предварительно подписанное приложение:

::: warning Обновление с `Gemini Voyager.app`
Основное приложение теперь называется `Voyager.app`. Поскольку macOS не заменяет приложения с другими именами файлов, не оставляйте установленными обе копии.

1. В старом расширении откройте вкладки Gemini и AI Studio, которыми пользуетесь, и выполните **Облачная синхронизация > Загрузить в облако**. Если вы используете синхронизацию выделений, включите её перед загрузкой.
2. Экспортируйте библиотеку промптов в локальный JSON-файл как независимую резервную копию.
3. Закройте Safari и основное приложение.
4. Переместите `/Applications/Gemini Voyager.app` в корзину. Не нажимайте кнопку Safari **Uninstall**, а также не очищайте данные расширений Safari, данные веб-сайтов и контейнеры.
5. Скопируйте `Voyager.app` в `/Applications`, один раз откройте его и, если Safari попросит, включите Voyager.
6. Проверьте папки, промпты, настройки и избранное. Если чего-то не хватает, используйте **Синхронизация** или импортируйте JSON с промптами.

Voyager сохраняет прежние идентификаторы приложения и пакета расширения, поэтому macOS и Safari по-прежнему распознают тот же продукт. Шаги резервного копирования нужны как мера предосторожности для старых ручных установок.
:::

1. Скачайте <SafariDownloadLink>последнюю версию Safari (.dmg)</SafariDownloadLink>.
2. Откройте файл и следуйте инструкциям по установке.
3. Дважды кликните для запуска приложения.
4. Включите расширение в **Настройки Safari > Расширения**.

> 💡 Версия Safari теперь непосредственно подписана для распространения — конвертация в Xcode не требуется!
>
> ✅ **Официальная поддержка Safari**: начиная с v1.6.0 поддерживаются удаление водяных знаков, экспорт изображений, синхронизация Google Drive/iCloud, уведомления о завершении ответа и обновления Sparkle.

---

_Настройка для разработки? Если вы разработчик и хотите внести свой вклад, ознакомьтесь с нашим [Руководством по участию](https://github.com/voyager-crew/voyager/blob/main/.github/CONTRIBUTING.md)._
