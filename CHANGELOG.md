# Changelog

## [1.1.2](https://github.com/chrischall/myersparkathleticzone-mcp/compare/v1.1.1...v1.1.2) (2026-09-23)


### Bug Fixes

* **schedule:** report event start times in true UTC plus local kickoff time ([#60](https://github.com/chrischall/myersparkathleticzone-mcp/issues/60)) ([42f2fe1](https://github.com/chrischall/myersparkathleticzone-mcp/commit/42f2fe1d53ac8a5ec81b50796585585430fae44d))

## [1.1.1](https://github.com/chrischall/myersparkathleticzone-mcp/compare/v1.1.0...v1.1.1) (2026-09-23)


### Bug Fixes

* **deps:** require zod ^4.6.5 to match @chrischall/mcp-utils 2.4.0 ([#59](https://github.com/chrischall/myersparkathleticzone-mcp/issues/59)) ([0d2fa29](https://github.com/chrischall/myersparkathleticzone-mcp/commit/0d2fa2913ed5e6dd8a12e206be20526eea9ab12f))
* **deps:** upgrade @chrischall/mcp-utils to 2.4.0 and @fetchproxy/* to 3.2.0 ([#57](https://github.com/chrischall/myersparkathleticzone-mcp/issues/57)) ([8593ae3](https://github.com/chrischall/myersparkathleticzone-mcp/commit/8593ae346ede0e1335e582f36d8f6ae40ef02e10))

## [1.1.0](https://github.com/chrischall/myersparkathleticzone-mcp/compare/v1.0.0...v1.1.0) (2026-09-19)


### Features

* **deps:** take mcp-utils 1.0.0 for the 2026-era stdio entry ([#55](https://github.com/chrischall/myersparkathleticzone-mcp/issues/55)) ([24c9408](https://github.com/chrischall/myersparkathleticzone-mcp/commit/24c9408fc3af5ebf0abc3d6f396005da84680b64))

## [1.0.0](https://github.com/chrischall/myersparkathleticzone-mcp/compare/v0.3.1...v1.0.0) (2026-09-19)


### ⚠ BREAKING CHANGES

* **mcp:** migrate server to SDK v2 ([#48](https://github.com/chrischall/myersparkathleticzone-mcp/issues/48))

### Features

* **mcp:** migrate server to SDK v2 ([#48](https://github.com/chrischall/myersparkathleticzone-mcp/issues/48)) ([e02ebdd](https://github.com/chrischall/myersparkathleticzone-mcp/commit/e02ebdd669a7e635394ddfc33f11e86589ba5764))

## [0.3.1](https://github.com/chrischall/myersparkathleticzone-mcp/compare/v0.3.0...v0.3.1) (2026-09-10)


### Bug Fixes

* **deps:** @chrischall/mcp-utils 0.26.1 ([#43](https://github.com/chrischall/myersparkathleticzone-mcp/issues/43)) ([0e89e60](https://github.com/chrischall/myersparkathleticzone-mcp/commit/0e89e60ca61ab65979c8a5247b2fa4524b4a8907))
* **deps:** bump hono from 4.13.1 to 4.13.7 ([#41](https://github.com/chrischall/myersparkathleticzone-mcp/issues/41)) ([0e36052](https://github.com/chrischall/myersparkathleticzone-mcp/commit/0e36052bb7689a78ad2d5debd9e7da1f589c9e6c))
* **deps:** declare the peer floors mcp-utils 0.26.1 requires ([#45](https://github.com/chrischall/myersparkathleticzone-mcp/issues/45)) ([f9ec8ac](https://github.com/chrischall/myersparkathleticzone-mcp/commit/f9ec8ac00bb24e1cabd59d2c2879a2885af1bfb7)), closes [#44](https://github.com/chrischall/myersparkathleticzone-mcp/issues/44)

## [0.3.0](https://github.com/chrischall/myersparkathleticzone-mcp/compare/v0.2.0...v0.3.0) (2026-09-04)


### Features

* **tools:** minify every response — no formatting whitespace on any payload ([#30](https://github.com/chrischall/myersparkathleticzone-mcp/issues/30)) ([a242332](https://github.com/chrischall/myersparkathleticzone-mcp/commit/a242332292dedda6ad01863d0b0d5a8158b60661))


### Bug Fixes

* **build:** restore the literal em dash in the package description ([#33](https://github.com/chrischall/myersparkathleticzone-mcp/issues/33)) ([ab81ae5](https://github.com/chrischall/myersparkathleticzone-mcp/commit/ab81ae5cb258349ffbaf5f3d5e02c98917ff104a))


### Refactor

* **tools:** drop the unwired view.ts scaffold ([#34](https://github.com/chrischall/myersparkathleticzone-mcp/issues/34)) ([9ad4b18](https://github.com/chrischall/myersparkathleticzone-mcp/commit/9ad4b189ab91faec6cbae09a44a7be8723c0e1cf))

## [0.2.0](https://github.com/chrischall/myersparkathleticzone-mcp/compare/v0.1.0...v0.2.0) (2026-08-01)


### Features

* real game results and past-season access ([#2](https://github.com/chrischall/myersparkathleticzone-mcp/issues/2)) ([6d80764](https://github.com/chrischall/myersparkathleticzone-mcp/commit/6d807646e7be6282847f6d8fe47117e3c3ca5094))


### Bug Fixes

* resolve home/away from awayTeam when homeTeam is missing ([#5](https://github.com/chrischall/myersparkathleticzone-mcp/issues/5)) ([0892d52](https://github.com/chrischall/myersparkathleticzone-mcp/commit/0892d523f234015e688ae9d8dc414c1d1cb1cd05)), closes [#3](https://github.com/chrischall/myersparkathleticzone-mcp/issues/3)


### Documentation

* describe the real home/away resolution order ([#7](https://github.com/chrischall/myersparkathleticzone-mcp/issues/7)) ([da37a5f](https://github.com/chrischall/myersparkathleticzone-mcp/commit/da37a5f7801c1c724af39448158e3540894a2f2a)), closes [#6](https://github.com/chrischall/myersparkathleticzone-mcp/issues/6)

## 0.1.0 (2026-08-01)


### Features

* Myers Park Athletic Zone MCP server ([96dd221](https://github.com/chrischall/myersparkathleticzone-mcp/commit/96dd221807239448a47592a8b6d36e4600a7f8ff))
