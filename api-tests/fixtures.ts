import { test as base, type APIRequestContext } from '@playwright/test';
import { apiClient, sessionToken } from './client';
import { ProjectList } from './schemas';
import { cfg } from '../support/env';

type Fixtures = { api: APIRequestContext; anon: APIRequestContext; projectId: number };

export const test = base.extend<Fixtures>({
  api: async ({}, use) => {
    const client = await apiClient(await sessionToken());
    await use(client);
    await client.dispose();
  },
  anon: async ({}, use) => {
    const client = await apiClient();
    await use(client);
    await client.dispose();
  },
  // Looked up by name so the suite works for anyone who builds their own drift-qa project.
  projectId: async ({ api }, use) => {
    const list = ProjectList.parse(await (await api.get('/api/dataset/projects/all')).json());
    const project = list.items.find((p) => p.name === cfg.projectName);
    if (!project) throw new Error(`project "${cfg.projectName}" not found`);
    await use(project.id);
  },
});

export { expect } from '@playwright/test';
