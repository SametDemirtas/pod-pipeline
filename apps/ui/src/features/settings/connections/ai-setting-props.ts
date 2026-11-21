import type { AiCatalogDto, ConnectionsDto, SettingsDto } from '@pod/contracts/client';

/** What each AI setting reads: the saved settings, the services offered and their keys. */
export interface AiSettingProps {
  readonly settings: SettingsDto;
  readonly catalog: AiCatalogDto;
  readonly connections: ConnectionsDto;
}
