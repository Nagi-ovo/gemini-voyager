import { readFileSync } from 'node:fs'
import { defineConfig, tierPresets } from 'sponsorkit'

export default defineConfig({
  github: {
    login: 'Nagi-ovo',
  },

  onSponsorsAllFetched: async (sponsors) => {
    try {
      const names = JSON.parse(readFileSync('./sponsors.json', 'utf-8')) as string[]
      const manualSponsors = names.map(name => ({
        sponsor: {
          type: 'User' as const,
          login: name,
          name: name,
          avatarUrl: '', // Names-only grid doesn't need avatar
        },
        monthlyDollars: 0,
        provider: 'manual',
      }))
      return [...sponsors, ...manualSponsors] as any[]
    }
    catch (e) {
      return sponsors
    }
  },

  tiers: [
    {
      title: 'GitHub Sponsors',
      monthlyDollars: 1,
      preset: tierPresets.base,
      composeAfter: (composer, sponsors) => {
        if (sponsors.length > 0) {
          composer.addSpan(20)
        }
      }
    },
    {
      title: 'Tipping Friends',
      monthlyDollars: 0, // Using 0 for manual sponsors from sponsors.json
      // Custom composer for names-only grid
      compose: (composer, sponsors, config) => {
        if (sponsors.length === 0) return

        const count = sponsors.length
        composer.addTitle(`${count} Tipping Friends`).addSpan(20)

        const width = config.width || 800
        const perLine = 6
        const boxWidth = width / perLine
        const fontSize = 14
        
        for (let i = 0; i < Math.ceil(sponsors.length / perLine); i++) {
          const row = sponsors.slice(i * perLine, (i + 1) * perLine)
          row.forEach((s, j) => {
            const x = j * boxWidth + boxWidth / 2
            const y = composer.height
            const name = s.sponsor.name || s.sponsor.login
            composer.addRaw(`<text x="${x}" y="${y}" text-anchor="middle" class="sponsorkit-name" font-size="${fontSize}">${name}</text>`)
          })
          composer.addSpan(25) // Row height
        }
      }
    },
  ],
})
