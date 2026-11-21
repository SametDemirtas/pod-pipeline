import type { z } from 'zod';
import type { SignInService } from '@pod/contracts';
import { parseJson } from '@pod/core';
import type { SecretName, SecretStore } from './secret-store.js';
import type { UnsavedSignIns } from './unsaved-sign-ins.js';

/** One service's stored secret; a malformed entry reads as not connected. */
export class SecretSlot<T> {
  constructor(
    protected readonly file: Pick<SecretStore, 'get' | 'update' | 'edit'>,
    protected readonly name: SecretName,
    protected readonly schema: z.ZodType<T>,
    /** Secrets that only one of may be stored, e.g. the two file hosts. */
    private readonly replaces: readonly SecretName[] = [],
  ) {}

  async get(): Promise<T | undefined> {
    const text = await this.file.get(this.name);
    if (text === undefined) return undefined;
    const parsed = this.schema.safeParse(parseJson(text));
    return parsed.success ? parsed.data : undefined;
  }

  save(value: T): Promise<void> {
    return this.file.update({ set: { [this.name]: JSON.stringify(value) }, remove: this.replaces });
  }

  forget(): Promise<void> {
    return this.file.update({ remove: [this.name] });
  }
}

/** A sign-in whose refresh token the service replaces; the old one stops working. */
export class RotatingSecretSlot<T extends { readonly refreshToken: string }> extends SecretSlot<T> {
  constructor(
    file: Pick<SecretStore, 'get' | 'update' | 'edit'>,
    protected override readonly name: SignInService,
    schema: z.ZodType<T>,
    /** Signing in again, or disconnecting, settles a renewed sign-in that was not stored. */
    private readonly unsaved: Pick<UnsavedSignIns, 'settled'>,
  ) {
    super(file, name, schema);
  }

  override async save(value: T): Promise<void> {
    await super.save(value);
    this.unsaved.settled(this.name);
  }

  override async forget(): Promise<void> {
    await super.forget();
    this.unsaved.settled(this.name);
  }

  /** Changes only the sign-in the token was refreshed from, never a newer one. */
  async rotateRefreshToken(previous: string, next: string): Promise<void> {
    await this.file.edit(this.name, (text) => {
      const current = text === undefined ? undefined : this.schema.safeParse(parseJson(text));
      if (!current?.success || current.data.refreshToken !== previous) return undefined;
      return JSON.stringify({ ...current.data, refreshToken: next });
    });
  }
}
