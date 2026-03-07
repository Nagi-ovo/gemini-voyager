const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'src', 'locales');
const enMessagesPath = path.join(localesDir, 'en', 'messages.json');
const enMessages = JSON.parse(fs.readFileSync(enMessagesPath, 'utf8'));

const languages = fs.readdirSync(localesDir).filter(lang => lang !== 'en' && fs.statSync(path.join(localesDir, lang)).isDirectory());

languages.forEach(lang => {
    const langFilePath = path.join(localesDir, lang, 'messages.json');
    if (fs.existsSync(langFilePath)) {
        const langMessages = JSON.parse(fs.readFileSync(langFilePath, 'utf8'));
        let updated = false;

        Object.keys(enMessages).forEach(key => {
            if (!langMessages[key]) {
                langMessages[key] = enMessages[key];
                updated = true;
            }
        });

        if (updated) {
            fs.writeFileSync(langFilePath, JSON.stringify(langMessages, null, 2), 'utf8');
            console.log(`Updated ${lang}/messages.json`);
        }
    }
});
console.log('Locale synchronization complete.');
