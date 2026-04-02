import apiClient from './client';
import { ApiResponse, Tag } from '../types';

export async function getTags(): Promise<Tag[]> {
  const res = await apiClient.get<ApiResponse<Tag[]>>('/tags');
  return res.data.data!;
}

export async function createTag(name: string, colour?: string): Promise<Tag> {
  const res = await apiClient.post<ApiResponse<Tag>>('/tags', { name, colour });
  return res.data.data!;
}

export async function deleteTag(id: string): Promise<void> {
  await apiClient.delete(`/tags/${id}`);
}
