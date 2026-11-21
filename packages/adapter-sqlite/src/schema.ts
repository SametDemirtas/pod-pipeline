import type { Migration } from './migrations.js';

export const CATALOG_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'catalog',
    sql: `
      CREATE TABLE concepts (
        id         TEXT PRIMARY KEY,
        key        TEXT NOT NULL UNIQUE,
        name       TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE designs (
        id          TEXT    PRIMARY KEY,
        design_key  TEXT    NOT NULL UNIQUE,
        concept_id  TEXT    NOT NULL REFERENCES concepts (id),
        family_id   TEXT    NOT NULL,
        revision    INTEGER NOT NULL CHECK (revision >= 1),
        sha256      TEXT    NOT NULL,
        storage_key TEXT    NOT NULL,
        mime_type   TEXT    NOT NULL,
        width       INTEGER NOT NULL CHECK (width > 0),
        height      INTEGER NOT NULL CHECK (height > 0),
        byte_size   INTEGER NOT NULL CHECK (byte_size >= 0),
        source_path TEXT    NOT NULL,
        created_at  TEXT    NOT NULL,
        updated_at  TEXT    NOT NULL
      );

      -- Catalog order: concept number, then design key (see compareDesignKeys).
      CREATE INDEX designs_order ON designs (CAST(design_key AS INTEGER), design_key);
      CREATE INDEX designs_family_order
        ON designs (family_id, CAST(design_key AS INTEGER), design_key);
      CREATE INDEX designs_concept ON designs (concept_id);

      CREATE TABLE design_revisions (
        design_id   TEXT    NOT NULL REFERENCES designs (id),
        revision    INTEGER NOT NULL,
        concept_id  TEXT    NOT NULL REFERENCES concepts (id),
        family_id   TEXT    NOT NULL,
        sha256      TEXT    NOT NULL,
        storage_key TEXT    NOT NULL,
        mime_type   TEXT    NOT NULL,
        width       INTEGER NOT NULL,
        height      INTEGER NOT NULL,
        byte_size   INTEGER NOT NULL,
        source_path TEXT    NOT NULL,
        recorded_at TEXT    NOT NULL,
        PRIMARY KEY (design_id, revision)
      );
    `,
  },
  {
    version: 2,
    name: 'readable design keys',
    // Letter codes such as `01B` become concept key and family id, `01-mug`.
    sql: `
      UPDATE designs
      SET design_key = (SELECT key FROM concepts WHERE id = designs.concept_id) || '-' || family_id
      WHERE design_key NOT LIKE '%-%';
    `,
  },
  {
    version: 3,
    name: 'mockups',
    sql: `
      CREATE TABLE mockups (
        id              TEXT    PRIMARY KEY,
        design_id       TEXT    NOT NULL REFERENCES designs (id),
        design_revision INTEGER NOT NULL CHECK (design_revision >= 1),
        variant_id      TEXT    NOT NULL,
        view            TEXT    NOT NULL,
        -- Photos stored together share a batch; a design's newer batches have higher numbers.
        batch           INTEGER NOT NULL,
        position        INTEGER NOT NULL,
        sha256          TEXT    NOT NULL,
        storage_key     TEXT    NOT NULL,
        mime_type       TEXT    NOT NULL,
        width           INTEGER NOT NULL CHECK (width > 0),
        height          INTEGER NOT NULL CHECK (height > 0),
        byte_size       INTEGER NOT NULL CHECK (byte_size >= 0),
        created_at      TEXT    NOT NULL
      );

      CREATE INDEX mockups_design ON mockups (design_id, batch DESC, position);
    `,
  },
  {
    version: 4,
    name: 'mockup print areas',
    sql: `
      -- Photos made before print areas were chosen all show the product's main area.
      ALTER TABLE mockups ADD COLUMN print_area TEXT NOT NULL DEFAULT 'default';
    `,
  },
  {
    version: 5,
    name: 'shop listings',
    sql: `
      CREATE TABLE listings (
        id              TEXT    PRIMARY KEY,
        design_id       TEXT    NOT NULL UNIQUE REFERENCES designs (id),
        design_revision INTEGER NOT NULL CHECK (design_revision >= 1),
        marketplace_id  TEXT    NOT NULL,
        state           TEXT    NOT NULL CHECK (state IN ('draft', 'active')),
        print_area      TEXT    NOT NULL,
        fit             TEXT    NOT NULL CHECK (fit IN ('contain', 'cover')),
        linked_at       TEXT,
        created_at      TEXT    NOT NULL,
        published_at    TEXT
      );

      CREATE TABLE listing_products (
        listing_id TEXT    NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
        position   INTEGER NOT NULL,
        sku        TEXT    NOT NULL,
        product_id TEXT    NOT NULL,
        variant_id TEXT    NOT NULL,
        PRIMARY KEY (listing_id, position)
      );
    `,
  },
  {
    version: 6,
    name: 'one design per marketplace listing',
    sql: `
      CREATE UNIQUE INDEX listings_marketplace ON listings (marketplace_id);
    `,
  },
  {
    version: 7,
    name: 'inactive listings',
    // SQLite cannot change a CHECK constraint, so both tables are rebuilt; the
    // products move first, so dropping the old listings cascades to nothing.
    sql: `
      CREATE TABLE listings_new (
        id              TEXT    PRIMARY KEY,
        design_id       TEXT    NOT NULL UNIQUE REFERENCES designs (id),
        design_revision INTEGER NOT NULL CHECK (design_revision >= 1),
        marketplace_id  TEXT    NOT NULL,
        state           TEXT    NOT NULL CHECK (state IN ('draft', 'active', 'inactive')),
        print_area      TEXT    NOT NULL,
        fit             TEXT    NOT NULL CHECK (fit IN ('contain', 'cover')),
        linked_at       TEXT,
        created_at      TEXT    NOT NULL,
        published_at    TEXT
      );
      INSERT INTO listings_new SELECT * FROM listings;

      CREATE TABLE listing_products_new (
        listing_id TEXT    NOT NULL REFERENCES listings_new (id) ON DELETE CASCADE,
        position   INTEGER NOT NULL,
        sku        TEXT    NOT NULL,
        product_id TEXT    NOT NULL,
        variant_id TEXT    NOT NULL,
        PRIMARY KEY (listing_id, position)
      );
      INSERT INTO listing_products_new SELECT * FROM listing_products;

      DROP TABLE listing_products;
      DROP TABLE listings;
      ALTER TABLE listings_new RENAME TO listings;
      ALTER TABLE listing_products_new RENAME TO listing_products;
      CREATE UNIQUE INDEX listings_marketplace ON listings (marketplace_id);
    `,
  },
  {
    version: 8,
    name: 'scene mockups',
    sql: `
      -- Scenes are generated from the print provider's photos; theirs keep a null prompt.
      ALTER TABLE mockups ADD COLUMN scene_prompt TEXT;
    `,
  },
  {
    version: 9,
    name: 'research runs',
    sql: `
      -- The report is kept whole as JSON; it is only ever read back in one piece.
      CREATE TABLE research_runs (
        id          TEXT PRIMARY KEY,
        query       TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        report_json TEXT NOT NULL
      );

      CREATE INDEX research_runs_created ON research_runs (created_at DESC);
    `,
  },
  {
    version: 10,
    name: 'pins',
    sql: `
      CREATE TABLE pins (
        id           TEXT    PRIMARY KEY,
        design_id    TEXT    NOT NULL REFERENCES designs (id),
        mockup_id    TEXT    NOT NULL,
        title        TEXT    NOT NULL,
        description  TEXT    NOT NULL,
        alt_text     TEXT    NOT NULL,
        headline     TEXT    NOT NULL,
        board_id     TEXT    NOT NULL,
        link         TEXT,
        sha256       TEXT    NOT NULL,
        storage_key  TEXT    NOT NULL,
        mime_type    TEXT    NOT NULL,
        width        INTEGER NOT NULL CHECK (width > 0),
        height       INTEGER NOT NULL CHECK (height > 0),
        byte_size    INTEGER NOT NULL CHECK (byte_size >= 0),
        ai_modified  INTEGER NOT NULL CHECK (ai_modified IN (0, 1)),
        publish_at   TEXT    NOT NULL,
        state        TEXT    NOT NULL CHECK (state IN ('proposed', 'planned', 'published', 'failed')),
        pinterest_id TEXT,
        failure      TEXT,
        created_at   TEXT    NOT NULL
      );

      CREATE INDEX pins_due ON pins (state, publish_at);
      CREATE INDEX pins_design ON pins (design_id, publish_at);
    `,
  },
  {
    version: 11,
    name: 'pin publishing state and failure code',
    // SQLite cannot change a CHECK constraint, so the table is rebuilt.
    sql: `
      CREATE TABLE pins_next (
        id           TEXT    PRIMARY KEY,
        design_id    TEXT    NOT NULL REFERENCES designs (id),
        mockup_id    TEXT    NOT NULL,
        title        TEXT    NOT NULL,
        description  TEXT    NOT NULL,
        alt_text     TEXT    NOT NULL,
        headline     TEXT    NOT NULL,
        board_id     TEXT    NOT NULL,
        link         TEXT,
        sha256       TEXT    NOT NULL,
        storage_key  TEXT    NOT NULL,
        mime_type    TEXT    NOT NULL,
        width        INTEGER NOT NULL CHECK (width > 0),
        height       INTEGER NOT NULL CHECK (height > 0),
        byte_size    INTEGER NOT NULL CHECK (byte_size >= 0),
        ai_modified  INTEGER NOT NULL CHECK (ai_modified IN (0, 1)),
        publish_at   TEXT    NOT NULL,
        state        TEXT    NOT NULL
                     CHECK (state IN ('proposed', 'planned', 'publishing', 'published', 'failed')),
        pinterest_id TEXT,
        failure      TEXT,
        failure_code TEXT,
        created_at   TEXT    NOT NULL
      );

      INSERT INTO pins_next (
        id, design_id, mockup_id, title, description, alt_text, headline, board_id, link,
        sha256, storage_key, mime_type, width, height, byte_size, ai_modified, publish_at,
        state, pinterest_id, failure, created_at
      )
      SELECT
        id, design_id, mockup_id, title, description, alt_text, headline, board_id, link,
        sha256, storage_key, mime_type, width, height, byte_size, ai_modified, publish_at,
        state, pinterest_id, failure, created_at
      FROM pins;

      DROP TABLE pins;
      ALTER TABLE pins_next RENAME TO pins;
      CREATE INDEX pins_due ON pins (state, publish_at);
      CREATE INDEX pins_design ON pins (design_id, publish_at);
    `,
  },
  {
    version: 12,
    name: 'research markets and keyword lists',
    sql: `
      -- Runs from before markets counted titles instead of shops; they are dropped.
      DELETE FROM research_runs;
      ALTER TABLE research_runs ADD COLUMN market TEXT NOT NULL DEFAULT 'US';

      -- The keywords are kept whole as JSON; they are only ever read back in one piece.
      CREATE TABLE keyword_lists (
        id            TEXT PRIMARY KEY,
        file_name     TEXT NOT NULL,
        market        TEXT NOT NULL,
        imported_at   TEXT NOT NULL,
        keywords_json TEXT NOT NULL
      );

      CREATE INDEX keyword_lists_imported ON keyword_lists (imported_at DESC);
    `,
  },
  {
    version: 13,
    name: 'scene checks',
    sql: `
      -- The comparison is kept whole as JSON; null while a scene was not checked.
      ALTER TABLE mockups ADD COLUMN scene_check_json TEXT;
      ALTER TABLE mockups ADD COLUMN print_confirmed INTEGER NOT NULL DEFAULT 0
        CHECK (print_confirmed IN (0, 1));
      -- The photo a scene was made from, so it can be checked again after that photo is replaced.
      ALTER TABLE mockups ADD COLUMN source_sha256 TEXT;
      ALTER TABLE mockups ADD COLUMN source_storage_key TEXT;
      ALTER TABLE mockups ADD COLUMN source_mime_type TEXT;
      ALTER TABLE mockups ADD COLUMN source_width INTEGER;
      ALTER TABLE mockups ADD COLUMN source_height INTEGER;
      ALTER TABLE mockups ADD COLUMN source_byte_size INTEGER;
    `,
  },
  {
    version: 14,
    name: 'unnamed concepts',
    // SQLite cannot drop a NOT NULL constraint, so the table designs refer to is rebuilt.
    // Flat files used to name a concept after its key; those become unnamed.
    foreignKeysOff: true,
    sql: `
      CREATE TABLE concepts_next (
        id         TEXT PRIMARY KEY,
        key        TEXT NOT NULL UNIQUE,
        name       TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO concepts_next (id, key, name, created_at)
      SELECT id, key, name, created_at FROM concepts;

      DROP TABLE concepts;
      ALTER TABLE concepts_next RENAME TO concepts;
      UPDATE concepts SET name = NULL WHERE name = key;
    `,
  },
  {
    version: 15,
    name: 'product details',
    sql: `
      -- What the product in a print provider's photo looks like, read once for all its scenes.
      ALTER TABLE mockups ADD COLUMN product_details_json TEXT;
    `,
  },
  {
    version: 16,
    name: 'scene looks',
    sql: `
      -- The shape and look options a scene was made with; null for provider photos and older scenes.
      ALTER TABLE mockups ADD COLUMN scene_look_json TEXT;
    `,
  },
  {
    version: 17,
    name: 'batch jobs',
    sql: `
      -- Only the latest job is kept; what each design got to is read back with it.
      CREATE TABLE batch_jobs (
        id          TEXT PRIMARY KEY,
        state       TEXT NOT NULL CHECK (state IN ('running', 'paused', 'cancelled', 'finished')),
        steps_json  TEXT NOT NULL,
        market      TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        finished_at TEXT
      );

      -- The design key and revision are kept as the job saw them. Step states, the failure, why
      -- a draft may be on Etsy, research words and written text are kept whole as JSON; they are
      -- read back in one piece.
      CREATE TABLE batch_items (
        job_id          TEXT    NOT NULL REFERENCES batch_jobs (id) ON DELETE CASCADE,
        position        INTEGER NOT NULL,
        design_id       TEXT    NOT NULL,
        design_key      TEXT    NOT NULL,
        design_revision INTEGER NOT NULL CHECK (design_revision > 0),
        steps_json      TEXT    NOT NULL,
        failure_json    TEXT,
        draft_check_json TEXT,
        keywords_json   TEXT,
        text_json       TEXT,
        PRIMARY KEY (job_id, design_id)
      );

      CREATE UNIQUE INDEX batch_items_order ON batch_items (job_id, position);

      -- Designs whose draft may be on Etsy, kept apart from jobs until the seller checked.
      CREATE TABLE batch_draft_checks (
        design_id    TEXT PRIMARY KEY REFERENCES designs (id) ON DELETE CASCADE,
        failure_json TEXT NOT NULL
      );
    `,
  },
  {
    version: 18,
    name: 'upscaled designs',
    sql: `
      -- Set on a revision made larger from the imported artwork: what it was treated as, and
      -- the imported file's hash, so importing that file again is not taken for a change.
      ALTER TABLE designs ADD COLUMN upscale_model TEXT;
      ALTER TABLE designs ADD COLUMN upscale_from_sha256 TEXT;
      ALTER TABLE design_revisions ADD COLUMN upscale_model TEXT;
      ALTER TABLE design_revisions ADD COLUMN upscale_from_sha256 TEXT;
    `,
  },
  {
    version: 19,
    name: 'turned designs',
    sql: `
      -- Set on a revision turned to fit a print area of the other orientation: the degrees it
      -- was turned clockwise, the imported file's hash and why the model chose that way.
      ALTER TABLE designs ADD COLUMN rotation INTEGER CHECK (rotation IN (90, 270));
      ALTER TABLE designs ADD COLUMN rotation_from_sha256 TEXT;
      ALTER TABLE designs ADD COLUMN rotation_reason TEXT;
      ALTER TABLE design_revisions ADD COLUMN rotation INTEGER CHECK (rotation IN (90, 270));
      ALTER TABLE design_revisions ADD COLUMN rotation_from_sha256 TEXT;
      ALTER TABLE design_revisions ADD COLUMN rotation_reason TEXT;
    `,
  },
  {
    version: 20,
    name: 'artwork left unturned',
    sql: `
      -- Set on a design once the checking model advised leaving its artwork unturned: the
      -- imported file's hash it was asked about and its reason, so it is not asked again.
      -- Only on the design, as the advice holds for later revisions of the same file.
      ALTER TABLE designs ADD COLUMN orientation_kept_sha256 TEXT;
      ALTER TABLE designs ADD COLUMN orientation_kept_reason TEXT;
    `,
  },
  {
    version: 21,
    name: 'service-neutral names',
    sql: `
      -- A published pin's id, whatever service it went to.
      ALTER TABLE pins RENAME COLUMN pinterest_id TO published_id;

      -- A draft the marketplace did not confirm was once coded after Etsy.
      UPDATE batch_items
         SET failure_json = json_set(failure_json, '$.code', 'DRAFT_UNCONFIRMED')
       WHERE json_extract(failure_json, '$.code') = 'ETSY_DRAFT_UNCONFIRMED';
      UPDATE batch_items
         SET draft_check_json = json_set(draft_check_json, '$.code', 'DRAFT_UNCONFIRMED')
       WHERE json_extract(draft_check_json, '$.code') = 'ETSY_DRAFT_UNCONFIRMED';
      UPDATE batch_draft_checks
         SET failure_json = json_set(failure_json, '$.code', 'DRAFT_UNCONFIRMED')
       WHERE json_extract(failure_json, '$.code') = 'ETSY_DRAFT_UNCONFIRMED';
    `,
  },
  {
    version: 22,
    name: 'badge codes',
    sql: `
      -- Research runs once kept the badges of listings by their English names on the page.
      UPDATE research_runs
         SET report_json = json_set(report_json, '$.listings', json((
               SELECT json_group_array(json(json_set(listing.value, '$.badges', json((
                        SELECT json_group_array(
                                 CASE badge.value
                                   WHEN 'Bestseller' THEN 'bestseller'
                                   WHEN 'Etsy’s Pick' THEN 'etsysPick'
                                   WHEN 'Etsy''s Pick' THEN 'etsysPick'
                                   WHEN 'Popular now' THEN 'popularNow'
                                   ELSE badge.value
                                 END ORDER BY badge.key)
                          FROM json_each(listing.value, '$.badges') AS badge)))) ORDER BY listing.key)
                 FROM json_each(report_json, '$.listings') AS listing)))
       WHERE json_type(report_json, '$.listings') = 'array';
    `,
  },
  {
    version: 23,
    name: 'marketplace-neutral research fields',
    sql: `
      -- Research runs once named the top-seller mark and the marketplace's pick after Etsy.
      UPDATE research_runs
         SET report_json = json_remove(
               json_set(report_json, '$.topSellerShare', json(report_json -> '$.starSellerShare')),
               '$.starSellerShare')
       WHERE json_type(report_json, '$.starSellerShare') IS NOT NULL;
      UPDATE research_runs
         SET report_json = json_set(report_json, '$.listings', json((
               SELECT json_group_array(json(json_set(
                        CASE WHEN json_type(listing.value, '$.isStarSeller') IS NULL
                             THEN listing.value
                             ELSE json_remove(
                                    json_set(listing.value, '$.isTopSeller',
                                             json(listing.value -> '$.isStarSeller')),
                                    '$.isStarSeller')
                        END,
                        '$.badges', json((
                          SELECT json_group_array(
                                   CASE badge.value WHEN 'etsysPick' THEN 'marketPick'
                                                    ELSE badge.value END ORDER BY badge.key)
                            FROM json_each(listing.value, '$.badges') AS badge)))) ORDER BY listing.key)
                 FROM json_each(report_json, '$.listings') AS listing)))
       WHERE json_type(report_json, '$.listings') = 'array';
    `,
  },
];
