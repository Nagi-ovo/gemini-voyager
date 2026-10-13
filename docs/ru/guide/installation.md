# Установка

::: info Новости
🍎 **Нативное расширение для Safari уже вышло!** Оно совершенно бесплатно и поддерживает установку в один клик.
:::

Выберите способ установки.

> ⚠️ Примечание: Менеджер промптов — единственная функция, которая поддерживает Gemini™ для Enterprise.

## 1. Магазины расширений (рекомендуется)

Самый простой способ начать. Обновления устанавливаются автоматически.

**Chrome / Edge / Brave / Opera / Vivaldi:**

[<img src="https://img.shields.io/badge/Chrome_Web_Store-Download-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Установить из Chrome Web Store" height="40"/>](https://chromewebstore.google.com/detail/iifacdnjakkhjjiengaffnegbndgingi?utm_source=github&utm_medium=docs&utm_campaign=organic_growth&utm_content=ru)

**Microsoft Edge:**

[<img src="https://img.shields.io/badge/Microsoft_Edge-Download-0078D7?style=for-the-badge&logo=microsoft-edge&logoColor=white" alt="Установить из Microsoft Edge Add-ons" height="40"/>](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne)

> **Пользователям Edge:** Voyager по-прежнему поддерживается в [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/voyager/gibmkggjijalcjinbdhcpklodjkhhlne), особенно для тех, кому нужен Edge на телефоне или планшете. Если проверка задерживается, Chrome Web Store и ручные пакеты с GitHub остаются доступны.

**Firefox:**

[<img src="https://img.shields.io/badge/Firefox_Add--ons-Download-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="Установить из Firefox Add-ons" height="40"/>](https://addons.mozilla.org/firefox/addon/gemini-voyager/)

## 2. Ручная установка (новейшие функции)

Проверка в Web Store может занимать время. Если вам нужна самая свежая версия прямо сейчас, установите её вручную.

**Для Chrome / Edge / Brave / Opera:**

1. Скачайте последний `voyager-chrome-vX.Y.Z.zip` из [GitHub Releases](https://github.com/voyager-crew/voyager/releases).
2. Распакуйте архив.
3. Откройте страницу расширений браузера (`chrome://extensions`).
4. Включите **Режим разработчика** (вверху справа).
5. Нажмите **Загрузить распакованное расширение** и выберите распакованную папку.

**Для Firefox:**

1. Скачайте последний `voyager-firefox-vX.Y.Z.xpi` из [Releases](https://github.com/voyager-crew/voyager/releases).
2. Откройте менеджер дополнений (`about:addons`).
3. Перетащите файл `.xpi` для установки (или нажмите значок шестерёнки ⚙️ → **Установить дополнение из файла**).

> 💡 Файл XPI официально подписан Mozilla и может быть установлен постоянно во всех версиях Firefox.

## 3. Safari (macOS)

Теперь Safari поддерживает прямое распространение! Скачайте предварительно подписанное приложение:

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
2. Дважды щёлкните, чтобы открыть файл, и следуйте инструкциям по установке.
3. Дважды щёлкните, чтобы запустить приложение.
4. Включите расширение в **Настройки Safari > Расширения**.

> 💡 Сборка для Safari теперь подписана напрямую для распространения — конвертация через Xcode не нужна!
>
> ✅ **Официальная поддержка Safari**: начиная с v1.6.0 доступны удаление водяных знаков, экспорт изображений, синхронизация через Google Диск и iCloud, уведомления о завершении ответа и обновления через Sparkle.

---

_Настраиваете среду для разработки? Если вы разработчик и хотите внести вклад, ознакомьтесь с [Руководством по участию](https://github.com/voyager-crew/voyager/blob/main/.github/CONTRIBUTING.md)._
