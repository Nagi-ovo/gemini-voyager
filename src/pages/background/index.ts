import semver from 'semver';

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install' || details.reason === 'update') {
    await checkVersion();
  }
});

chrome.alarms.create('versionCheck', {
  periodInMinutes: 60,
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'versionCheck') {
    await checkVersion();
  }
});

async function checkVersion() {
  const currentVersion = chrome.runtime.getManifest().version;
  const response = await fetch('https://raw.githubusercontent.com/Nagi-ovo/gemini-voyager/main/manifest.json');
  const remoteManifest = await response.json();
  const remoteVersion = remoteManifest.version;

  if (semver.gt(remoteVersion, currentVersion)) {
    const releaseNotes = await fetchReleaseNotes(remoteVersion);
    chrome.notifications.create('update', {
      type: 'basic',
      iconUrl: 'icon-128.png',
      title: 'New Version Available!',
      message: `A new version (${remoteVersion}) of Gemini Voyager is available. ${releaseNotes ? `\n\nChanges:\n${releaseNotes}` : ''}`,
      buttons: [
        {
          title: 'Go to GitHub',
        },
      ],
    });
  }
}

async function fetchReleaseNotes(version: string) {
  try {
    const response = await fetch(`https://api.github.com/repos/Nagi-ovo/gemini-voyager/releases/tags/v${version}`);
    if (response.ok) {
      const release = await response.json();
      return release.body;
    }
  } catch (error) {
    console.error('Error fetching release notes:', error);
  }
  return null;
}

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationId === 'update' && buttonIndex === 0) {
    chrome.tabs.create({
      url: 'https://github.com/Nagi-ovo/gemini-voyager/releases',
    });
  }
});