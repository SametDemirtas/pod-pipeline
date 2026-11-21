import {
  isPinState,
  type DesignId,
  type MockupId,
  type Pin,
  type PinId,
  type PinRepository,
  type PinState,
} from '@pod/core';
import type { SqliteDatabase } from './database.js';
import { lockedGate, type Gate } from './gates.js';
import { date, integer, optionalText, text, toImageAsset, type Row } from './rows.js';

export class SqlitePinRepository implements PinRepository {
  private readonly gate: Gate;

  constructor(private readonly db: SqliteDatabase) {
    this.gate = lockedGate(db);
  }

  save(pin: Pin): Promise<void> {
    return this.gate(() => {
      this.db
        .prepare(
          `INSERT INTO pins (
             id, design_id, mockup_id, title, description, alt_text, headline, board_id, link,
             sha256, storage_key, mime_type, width, height, byte_size, ai_modified, publish_at,
             state, published_id, failure, failure_code, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             mockup_id = excluded.mockup_id,
             title = excluded.title,
             description = excluded.description,
             alt_text = excluded.alt_text,
             headline = excluded.headline,
             board_id = excluded.board_id,
             link = excluded.link,
             sha256 = excluded.sha256,
             storage_key = excluded.storage_key,
             mime_type = excluded.mime_type,
             width = excluded.width,
             height = excluded.height,
             byte_size = excluded.byte_size,
             ai_modified = excluded.ai_modified,
             publish_at = excluded.publish_at,
             state = excluded.state,
             published_id = excluded.published_id,
             failure = excluded.failure,
             failure_code = excluded.failure_code`,
        )
        .run(
          pin.id,
          pin.designId,
          pin.mockupId,
          pin.text.title,
          pin.text.description,
          pin.text.altText,
          pin.headline,
          pin.boardId,
          pin.link,
          pin.image.sha256,
          pin.image.storageKey,
          pin.image.mimeType,
          pin.image.width,
          pin.image.height,
          pin.image.byteSize,
          pin.aiModified ? 1 : 0,
          pin.publishAt.toISOString(),
          pin.state,
          pin.publishedId,
          pin.failure,
          pin.failureCode,
          pin.createdAt.toISOString(),
        );
    });
  }

  get(id: PinId): Promise<Pin | undefined> {
    return this.gate(() => {
      const row = this.db.prepare('SELECT * FROM pins WHERE id = ?').get(id);
      return row ? toPin(row) : undefined;
    });
  }

  listForDesign(designId: DesignId): Promise<readonly Pin[]> {
    return this.gate(() =>
      this.db
        .prepare('SELECT * FROM pins WHERE design_id = ? ORDER BY publish_at, rowid')
        .all(designId)
        .map(toPin),
    );
  }

  listDue(now: Date): Promise<readonly Pin[]> {
    return this.gate(() =>
      this.db
        .prepare(
          `SELECT * FROM pins WHERE state = 'planned' AND publish_at <= ?
           ORDER BY publish_at, rowid`,
        )
        .all(now.toISOString())
        .map(toPin),
    );
  }

  listByState(state: PinState): Promise<readonly Pin[]> {
    return this.gate(() =>
      this.db
        .prepare('SELECT * FROM pins WHERE state = ? ORDER BY publish_at, rowid')
        .all(state)
        .map(toPin),
    );
  }

  remove(id: PinId): Promise<void> {
    return this.gate(() => {
      this.db.prepare('DELETE FROM pins WHERE id = ?').run(id);
    });
  }
}

function toPin(row: Row): Pin {
  const state = text(row, 'state');
  if (!isPinState(state)) throw new Error(`Unknown pin state ${state}`);
  return {
    id: text(row, 'id') as PinId,
    designId: text(row, 'design_id') as DesignId,
    mockupId: text(row, 'mockup_id') as MockupId,
    text: {
      title: text(row, 'title'),
      description: text(row, 'description'),
      altText: text(row, 'alt_text'),
    },
    headline: text(row, 'headline'),
    boardId: text(row, 'board_id'),
    link: optionalText(row, 'link'),
    image: toImageAsset(row),
    aiModified: integer(row, 'ai_modified') === 1,
    publishAt: date(row, 'publish_at'),
    state,
    publishedId: optionalText(row, 'published_id'),
    failure: optionalText(row, 'failure'),
    failureCode: optionalText(row, 'failure_code'),
    createdAt: date(row, 'created_at'),
  };
}
