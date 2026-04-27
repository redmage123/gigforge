import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createAlertConfig,
  deleteAlertConfig,
  listAlertConfigs,
  type AlertConfigEntry,
  type CreateAlertInput,
} from '../api/cms/userState'
import { useCmsApi } from '../api/cms/client'

const KEY = ['cms', 'alertConfigs'] as const

export function usePersistedAlerts() {
  const cmsAvailable = useCmsApi()
  return useQuery<AlertConfigEntry[]>({
    queryKey: KEY,
    queryFn: () => listAlertConfigs(),
    enabled: cmsAvailable,
    staleTime: 30_000,
  })
}

export function useCreateAlert() {
  const qc = useQueryClient()
  return useMutation<AlertConfigEntry, Error, CreateAlertInput>({
    mutationFn: (input) => createAlertConfig(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
    },
  })
}

export function useDeleteAlert() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteAlertConfig(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
    },
  })
}
