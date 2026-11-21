import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AiProvider } from '@pod/contracts/client';
import { scopedApi } from '../api/api-context.js';
import { queryKeys } from '../api/query-keys.js';
import { useSettings } from './use-settings.js';
import { useConnections } from './use-connections.js';

const useAiApi = scopedApi<'getAiCatalog'>();

/** What each AI service can do and its suggested models; it changes only with the app. */
export function useAiCatalog() {
  const api = useAiApi();
  return useQuery({
    queryKey: queryKeys.aiCatalog,
    queryFn: () => api.getAiCatalog(),
    staleTime: Infinity,
  });
}

export interface ChosenAi {
  /** The service's name, or a general word for AI while the settings load. */
  readonly service: string;
  /** Whether its key is saved. */
  readonly connected: boolean;
}

interface ChosenAis {
  /** Writes and translates listing text and looks at photos. */
  readonly text: ChosenAi;
  /** Makes scene photos. */
  readonly scenes: ChosenAi;
  /** Whether the settings, services and connections behind them have loaded. */
  readonly loaded: boolean;
}

/** The AI services chosen in the settings, by the names the seller knows them by. */
export function useChosenAi(): ChosenAis {
  const { t } = useTranslation();
  const settings = useSettings();
  const catalog = useAiCatalog();
  const connections = useConnections();
  const chosen = (provider: AiProvider | undefined): ChosenAi => ({
    service: (provider && catalog.data?.[provider].service) ?? t('common.ai'),
    connected: provider !== undefined && connections.data?.ai[provider] === true,
  });
  return {
    text: chosen(settings.data?.textProvider),
    scenes: chosen(settings.data?.sceneProvider),
    loaded: Boolean(settings.data && catalog.data && connections.data),
  };
}
