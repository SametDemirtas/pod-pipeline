import { z } from 'zod';
import { fields } from '../fields.js';

export const listDesignsRequest = z
  .object({
    familyId: fields.familyId.optional(),
    search: fields.search.optional(),
    limit: fields.limit.optional(),
    cursor: fields.cursor.optional(),
  })
  .strict();
export type ListDesignsRequest = z.infer<typeof listDesignsRequest>;

export const designIdRequest = z.object({ id: fields.designId }).strict();
export type DesignIdRequest = z.infer<typeof designIdRequest>;

export const familyIdRequest = z.object({ familyId: fields.familyId }).strict();
export type FamilyIdRequest = z.infer<typeof familyIdRequest>;

export const printRequest = z
  .object({
    designId: fields.designId,
    variantId: fields.variantId.optional(),
    printArea: fields.printArea.optional(),
    fit: fields.fit,
  })
  .strict();
export type PrintRequest = z.infer<typeof printRequest>;

export const previewImportRequest = z.object({ rootPath: fields.folder }).strict();
export type PreviewImportRequest = z.infer<typeof previewImportRequest>;

export const runImportRequest = z
  .object({ rootPath: fields.folder, fingerprint: fields.fingerprint })
  .strict();
export type RunImportRequest = z.infer<typeof runImportRequest>;

export const removeImportFolderRequest = z.object({ folder: fields.folder }).strict();
export type RemoveImportFolderRequest = z.infer<typeof removeImportFolderRequest>;
