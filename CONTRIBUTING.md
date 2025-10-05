# Contributing

Thanks for your interest in contributing! A few quick guidelines:

- Use Node 20+ and bun 10+.
- Before sending a PR, run:
  - `bun run lint`
  - `bun run typecheck`
  - `bun run build`
- Keep changes focused and small. Explain the user impact in the PR description.
- Match the existing code style. Prefer readable names and early returns.

## Development

- Install deps: `bun ci`
- Dev build (Chrome): `bun run dev`
- Production build (Chrome): `bun run build`

## Project scope

This extension adds a timeline UI to Gemini conversations. Out of scope: site scraping, network interception, account automation.

## License

By contributing, you agree your contributions are licensed under the MIT license of this repo.
