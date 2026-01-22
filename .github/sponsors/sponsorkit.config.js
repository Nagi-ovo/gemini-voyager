import { readFileSync } from 'node:fs'

export default {
  github: {
    login: 'Nagi-ovo',
  },

  outputDir: '../../docs/public/assets',

  formats: ['svg'],

  onSponsorsAllFetched: async (sponsors) => {
    try {
      const items = JSON.parse(readFileSync('./sponsors.json', 'utf-8'))
      const manualSponsors = items.map(item => {
        const name = typeof item === 'string' ? item : item.name
        const amount = typeof item === 'string' ? 0 : item.amount

        return {
          sponsor: {
            type: 'User',
            login: name,
            name: name,
            avatarUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', // Empty transparent pixel
          },
          monthlyDollars: amount,
          provider: 'manual',
        }
      })
      return [...sponsors, ...manualSponsors]
    }
    catch (e) {
      return sponsors
    }
  },

  tiers: [
    // GitHub Sponsors (with avatars) - shown at the top
    {
      title: 'GitHub Sponsors',
      monthlyDollars: -1, // Any amount from GitHub Sponsors
      preset: 'medium', // Uses built-in avatar rendering
      // Only include sponsors from GitHub (not manual)
      includes: sponsor => sponsor.provider !== 'manual',
    },
    // Tipping Friends (manual sponsors, text only)
    {
      title: 'Tipping Friends',
      monthlyDollars: 0,
      compose: (composer, sponsors, config) => {
        // Only show manual sponsors in this tier
        const manualSponsors = sponsors.filter(s => s.provider === 'manual')
        if (manualSponsors.length === 0) return

        const count = manualSponsors.length
        composer.addTitle(`${count} Tipping Friends`).addSpan(20)

        const width = config.width || 800
        const perLine = 6
        const boxWidth = width / perLine
        const fontSize = 14

        for (let i = 0; i < Math.ceil(manualSponsors.length / perLine); i++) {
          const row = manualSponsors.slice(i * perLine, (i + 1) * perLine)
          row.forEach((s, j) => {
            const x = j * boxWidth + boxWidth / 2
            const y = composer.height
            const name = s.sponsor.name || s.sponsor.login
            composer.addRaw(`<text x="${x}" y="${y}" text-anchor="middle" class="sponsorkit-name" font-size="${fontSize}">${name}</text>`)
          })
          composer.addSpan(25)
        }
      },
    },
  ],
}