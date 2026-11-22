# Changelog

All notable changes are listed here. The project follows [Semantic Versioning](https://semver.org).

## [Unreleased]

### Changed

- Research reports, also as the MCP server returns them, name the share of top sellers
  `topSellerShare`, a listing's top-seller mark `isTopSeller` and the marketplace's pick badge
  `marketPick`; research runs saved before are converted when the app opens its catalog.
- Pins, as the MCP tools `list_pins` and `propose_pin` return them, give the published pin's link
  as `publishedUrl` instead of `pinterestUrl`.
- `get_listing_photos` returns the listing's photos as `marketplace` and the print provider's
  pictures as `print`, instead of `etsy` and `printful`.
- The app's local API, which the MCP server calls, names the operation that lists boards
  `listBoards` instead of `listPinterestBoards`; the MCP tool keeps its name
  `list_pinterest_boards`.
- The local API's version is 2, so an MCP server from 0.1.0 refuses to talk to this app, and the
  other way round, instead of failing on the renamed fields; update the app and the MCP server
  together.

### Fixed

- The MCP server works on Windows. It used to end as soon as it started there.

## [0.1.0] - 2026-11-19

First release.

### Added

- Catalog: import artwork from concept folders, eleven product families, readable design codes,
  revision history, search and paging.
- Samsung phone cases (Printful 686) made from the same artwork as iPhone cases, each brand with
  its own design and Etsy listing, which never names the other brand; a setting turns making them
  from iPhone case files off.
- Sizes per product for prepared listings, such as two blanket sizes in one listing, each with an
  optional price of its own; blankets are printed edge to edge on every size's own print area.
- Print check against Printful print areas, with resolution, placement and cropping.
- Turn to fit: artwork that is tall on a wide print area, or the other way round, is turned a
  quarter to fill the area, kept as the design's next revision; the checking AI looks at the
  artwork first and picks the way to turn it, or advises leaving it as it is.
- Artwork of the other orientation is printed upright on the print area turned a quarter when
  Printful takes that area turned, using the revision from before any turn.
- Upscaling of low-resolution artwork, four times larger on the seller's computer with Real-ESRGAN,
  then scaled to what the listed sizes need and kept as the design's next revision with the
  imported file before it; a choice of illustration or photo model, and an optional first step
  when preparing listings.
- Thumbnails of very large PNG artwork decoded a few lines at a time in a worker thread, so they
  do not hold up the window.
- Printful mockups for every variant and print area, shared through Dropbox or an S3-compatible
  store for as long as Printful needs them.
- AI services of the seller's choice, each with their own API key: Claude, ChatGPT, DeepSeek, Kimi
  or Gemini for text, and Gemini or ChatGPT for scene photos, with model choice.
- Scene photos made around a Printful photo, with the product described once for the scene model
  and print checks by the text AI; optionally two at once, keeping the better.
- An optional look for scenes: shape, shot size, camera height, lighting, time of day, season,
  backdrop, blur, color grade and props, each on Auto unless chosen, with a preview of what it adds.
- Listing text written and translated by the text AI.
- Etsy keyword research as a signed-out buyer: phrases, suggestions, prices and badges.
- Etsy drafts with variations, size prices, photos and translations; the Printful link; publishing
  after confirmation; reading the listing's state back from Etsy.
- Preparing listings for many designs at once: print check, Printful mockups, keywords, translated
  listing text and unpublished Etsy drafts, after an estimate the seller confirms; stored step by
  step, so it resumes after a restart, with cancel and retry. The keyword step uses saved research
  and imported eRank or Marmalead lists that fit the concept and product, and never searches Etsy.
- Update photos on Etsy: the photos of an Etsy draft are replaced by the ones chosen, in the
  chosen order.
- What Etsy and Printful have now: reads the photos a listing shows on Etsy and the pictures
  Printful keeps of the linked print file, without changing anything.
- Mockups and scene photos open at full size and can be saved at full size.
- A warning when the Printful store is not connected to an Etsy shop, or does not look like the
  one synced with the connected Etsy shop, shown in the settings and when Printful has not
  picked up a listing.
- Photos with transparent areas are laid on white before they are uploaded to Etsy.
- A setting for designs made with AI tools, which adds Etsy's required disclosure to every
  description in its language, and per-product prices and Etsy shipping profiles for drafts.
- Pinterest pins: a 1000 × 1500 pin image from a photo, scheduled publishing while the app runs,
  approval of pins an AI assistant proposed. A planned pin is checked again when it goes out and
  held back when its photo was removed, shows an older version of the artwork or is a scene whose
  print is no longer confirmed.
- AI requests that find the service busy (429, 503 or 529) wait and try again. A request that
  broke off after the service may already have done it, such as a scene, is not sent again, so it
  is never billed twice; the app says it may still have been done and charged, to check before
  trying again.
- Uploads to Dropbox that are sent again after a dropped connection replace what the unanswered
  attempt stored instead of failing.
- An Etsy sign-in that cannot be renewed while a draft is made is reported as a sign-in problem,
  since nothing reached Etsy, not as a draft that may exist.
- Etsy's trademark notice in Settings, Connections, in English next to its translation.
- MCP server for AI assistants, shipped with the app, started as the app with `--mcp-server` and
  set up from the settings, with a warning on macOS to move the app to the Applications folder
  first.
- Installers for macOS, Windows and Linux. Packaged builds turn off running as plain Node
  (`RunAsNode`), `NODE_OPTIONS` and inspector arguments, and check the integrity of the app archive.
- A View menu with zoom and full screen, without developer tools, and on macOS a File menu that
  closes the window with Cmd+W.
- Interface in English, Turkish and German.

[Unreleased]: https://github.com/SametDemirtas/pod-pipeline/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/SametDemirtas/pod-pipeline/releases/tag/v0.1.0
